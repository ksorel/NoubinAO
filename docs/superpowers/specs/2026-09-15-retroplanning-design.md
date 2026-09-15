# Rétroplanning de Bid Management

Date : 2026-09-15
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Troisième des cinq lacunes identifiées en comparant NoubinAO à un guide de
référence générique sur la réponse aux appels d'offres (checklist finale
de soumission et matrice Go/No-Go déjà livrées). L'ebook décrit un
rétroplanning en 5 phases sur une échéance fixe de 14 jours ; NoubinAO
cible le format national ivoirien dont le délai légal minimum est de
30 jours (CLAUDE.md), donc le modèle ne peut pas être calé sur un nombre
de jours fixe — il doit être proportionnel au temps réellement restant
avant `date_limite`.

Ce sous-projet étend le pipeline (Module 5) au-delà de « responsable
unique (`assigne_a`) + échéance globale (`date_limite`) » vers une liste
de jalons datés par AO, cochables, éditable par l'équipe. Contrairement
au Go/No-Go (1 ligne par AO) et à la checklist de soumission (3 clés
fixes en insert/delete), c'est un vrai CRUD de liste — la première
fonctionnalité de ce type dans le Module 7.

## Décisions validées avec l'utilisateur

- **Génération automatique proportionnelle, éditable.** Un modèle par
  défaut de 5 jalons est calculé depuis le temps restant entre
  aujourd'hui et `date_limite` (pas 14 jours fixes) ; l'équipe peut
  ensuite ajouter, cocher/décocher et supprimer des jalons.
- **Déclenchement par bouton explicite, jamais automatique.**
  Contrairement à `dossier_reponse`/`evaluation_go_no_go` (créés
  silencieusement au premier chargement), générer 5 jalons avec des
  dates concrètes est une vraie proposition de planning — cohérent avec
  le principe déjà appliqué ailleurs (mapping documents, rattachement
  email) : jamais d'automatisme silencieux, toujours une action visible
  confirmée par l'humain.
- **Pas d'assignation par jalon.** L'AO a déjà un responsable unique
  (`assigne_a`, Module 5) qui reste la personne de référence ; ajouter
  une assignation par jalon multiplierait la complexité pour un gain
  marginal sur des équipes de 5-20 personnes (cible du produit). Champ
  laissé de côté, réévaluable plus tard si l'usage réel le demande.
- **Jamais bloquant.** Aucune action du produit ne dépend de l'état du
  rétroplanning.
- **Pas d'édition du libellé/de la date d'un jalon existant** (décidé
  lors de l'écriture de ce spec, pour contenir la taille du
  sous-projet) : supprimer et recréer un jalon mal généré ou mal
  nommé atteint le même résultat avec beaucoup moins de surface UI
  (pas de formulaire d'édition en ligne par jalon). Réévaluable si
  l'usage réel montre que c'est pénible.
- **Pas de réorganisation manuelle (glisser-déposer).** L'affichage est
  toujours trié par date cible puis par ordre de création — modifier la
  date d'un jalon le redéplace naturellement dans la liste.

## Modèle de données

```sql
-- Rétroplanning (Module 7, sous-projet 3). Liste de jalons par AO, CRUD
-- complet (contrairement à evaluation_go_no_go, qui est 1:1, et à
-- checklist_item_dossier, un ensemble fixe de 3 clés en insert/delete)
-- — ce module a besoin d'update (bascule coché) et de delete (retrait
-- d'un jalon), pas seulement d'insert/select.
create table jalon_retroplanning (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  libelle text not null,
  date_cible date not null,
  coche boolean not null default false,
  ordre integer not null default 0,
  coche_par uuid references utilisateur(id) on delete set null,
  coche_le timestamptz,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index jalon_retroplanning_appel_offres_id_idx
  on jalon_retroplanning(appel_offres_id);

alter table jalon_retroplanning enable row level security;

create policy "jalon_retroplanning_select_membres" on jalon_retroplanning
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "jalon_retroplanning_insert_membres" on jalon_retroplanning
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise (pas de
-- contrainte sur coche_par, contrairement à evaluation_go_no_go) : ce
-- n'est pas un enregistrement unique sensible mais une liste
-- collaborative où n'importe quel membre doit pouvoir cocher/décocher
-- un jalon déjà traité par un collègue, sans que la policy ne le
-- bloque à tort en exigeant coche_par = auth.uid() sur une ligne qu'il
-- ne vient pas de cocher lui-même.
create policy "jalon_retroplanning_update_membres" on jalon_retroplanning
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "jalon_retroplanning_delete_membres" on jalon_retroplanning
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );
```

Nouveau type dans `lib/appels-offres/types.ts` :

```ts
export interface JalonRetroplanning {
  id: string;
  appel_offres_id: string;
  libelle: string;
  date_cible: string;
  coche: boolean;
  ordre: number;
  coche_par: string | null;
  coche_le: string | null;
  created_by: string | null;
  created_at: string;
}
```

## Génération des jalons par défaut (fonction pure, jamais persistée telle quelle)

Nouveau fichier `lib/appels-offres/retroplanning.ts` :

```ts
const JOUR_MS = 24 * 60 * 60 * 1000;

export interface JalonGenere {
  libelle: string;
  dateCible: string;
}

const PHASES_PROPORTIONNELLES: { libelle: string; fraction: number }[] = [
  { libelle: "Analyse du DAO et décision Go/No-Go", fraction: 0.1 },
  { libelle: "Constitution du dossier (pièces, mapping, rédaction)", fraction: 0.4 },
  { libelle: "Revue interne de l'offre", fraction: 0.65 },
  { libelle: "Relecture finale et vérifications", fraction: 0.85 },
];

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function genererJalonsParDefaut(
  dateLimite: Date,
  maintenant: Date = new Date(),
): JalonGenere[] {
  const dureeMs = dateLimite.getTime() - maintenant.getTime();

  const jalons = PHASES_PROPORTIONNELLES.map(({ libelle, fraction }) => ({
    libelle,
    dateCible: formatDateISO(new Date(maintenant.getTime() + fraction * dureeMs)),
  }));

  // Jamais le jour même de la date limite — l'ebook insiste sur cette
  // marge de sécurité (« Jour 14, H-24 : dépôt effectif »), un dépôt de
  // dernière minute étant le principal facteur de rejet administratif.
  jalons.push({
    libelle: "Dépôt du dossier",
    dateCible: formatDateISO(new Date(dateLimite.getTime() - JOUR_MS)),
  });

  return jalons;
}
```

Les fractions sont volontairement indépendantes du nombre de jours
total : sur un AO à 30 jours comme sur un AO à 10 jours, les 5 jalons
restent proportionnellement répartis.

## Lecture

Dans `lib/appels-offres/queries.ts`, l'import de types actuel :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  SectionDossier,
} from "./types";
```

devient :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  SectionDossier,
} from "./types";
```

Puis ajouter à la fin du fichier :

```ts
export async function listerJalonsRetroplanning(
  appelOffresId: string,
): Promise<JalonRetroplanning[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("date_cible", { ascending: true })
    .order("ordre", { ascending: true });

  if (error) throw error;
  return (data ?? []) as JalonRetroplanning[];
}
```

## Validation (Zod)

Dans `lib/appels-offres/schema.ts`, ajouter à la fin du fichier :

```ts
export const creerJalonSchema = z.object({
  libelle: z
    .string()
    .trim()
    .min(1, "Le libellé est requis")
    .max(200, "Libellé trop long (200 caractères maximum)"),
  dateCible: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
});
```

## Server Actions

Dans `lib/appels-offres/actions.ts`, l'import du schéma actuel :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
} from "./schema";
```

devient :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
} from "./schema";
```

L'import de types actuel :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

devient :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

Ajouter un nouvel import, avec les autres imports de fonctions internes
au module (à côté de `import { listerAppelsOffres, obtenirAppelOffres } from "./queries";`) :

```ts
import { genererJalonsParDefaut } from "./retroplanning";
```

Puis ajouter à la fin du fichier :

```ts
export async function genererJalonsRetroplanning(
  appelOffresId: string,
): Promise<{ erreur: string } | { succes: true; jalons: JalonRetroplanning[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("date_limite")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(new Date(appelOffres.date_limite));

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .insert(
      jalons.map((j, index) => ({
        appel_offres_id: appelOffresId,
        libelle: j.libelle,
        date_cible: j.dateCible,
        ordre: index,
        created_by: utilisateur.id,
      })),
    )
    .select("*");

  if (error || !data) return { erreur: "Échec de la génération du rétroplanning. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, jalons: data as JalonRetroplanning[] };
}

export async function creerJalon(
  appelOffresId: string,
  input: { libelle: string; dateCible: string },
): Promise<{ erreur: string } | { succes: true; jalon: JalonRetroplanning }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerJalonSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: dernierJalon } = await supabase
    .from("jalon_retroplanning")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = dernierJalon ? dernierJalon.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .insert({
      appel_offres_id: appelOffresId,
      libelle: parsed.data.libelle,
      date_cible: parsed.data.dateCible,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout du jalon. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, jalon: data as JalonRetroplanning };
}

export async function basculerJalonCoche(
  appelOffresId: string,
  jalonId: string,
  coche: boolean,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .update({
      coche,
      coche_par: coche ? utilisateur.id : null,
      coche_le: coche ? new Date().toISOString() : null,
    })
    .eq("id", jalonId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Jalon introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerJalon(
  appelOffresId: string,
  jalonId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .delete()
    .eq("id", jalonId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Jalon introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

`genererJalonsRetroplanning` et `creerJalon` renvoient les lignes créées
(`jalons`/`jalon`) plutôt qu'un simple `{succes: true}` — contrairement
aux mises à jour du Go/No-Go ou de la checklist, le composant client ne
peut pas connaître à l'avance les `id` générés par Postgres, donc il ne
peut pas les ajouter de façon optimiste à son état local sans les
recevoir en retour de l'action elle-même.

## Intégration dans `page.tsx`

L'import actuel :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
} from "@/lib/appels-offres/queries";
```

devient :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
} from "@/lib/appels-offres/queries";
```

Le chargement des données actuel :

```tsx
  const [bibliotheque, emailsLies, suggestions, checklistManuelle, evaluationGoNoGo] =
    await Promise.all([
      listerDocuments(utilisateur.entreprise_id),
      listerEmailsLies(id),
      obtenirSuggestionsEmail(utilisateur.id, {
        titre: resultat.appelOffres.titre,
        acheteur: resultat.appelOffres.acheteur,
        date_limite: resultat.appelOffres.date_limite,
      }),
      listerChecklistManuelle(resultat.dossierReponse.id),
      obtenirEvaluationGoNoGo(id),
    ]);
```

devient :

```tsx
  const [bibliotheque, emailsLies, suggestions, checklistManuelle, evaluationGoNoGo, jalons] =
    await Promise.all([
      listerDocuments(utilisateur.entreprise_id),
      listerEmailsLies(id),
      obtenirSuggestionsEmail(utilisateur.id, {
        titre: resultat.appelOffres.titre,
        acheteur: resultat.appelOffres.acheteur,
        date_limite: resultat.appelOffres.date_limite,
      }),
      listerChecklistManuelle(resultat.dossierReponse.id),
      obtenirEvaluationGoNoGo(id),
      listerJalonsRetroplanning(id),
    ]);
```

Le rendu de `<AppelOffresDetail>` gagne deux props :
`jalons={jalons}` et `dateLimiteConnue={resultat.appelOffres.date_limite !== null}`.

## Interface

Nouveau composant `app/(app)/appels-offres/[id]/retroplanning.tsx`
(composant client, contrôlé) :

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  genererJalonsRetroplanning,
  creerJalon,
  basculerJalonCoche,
  supprimerJalon,
} from "@/lib/appels-offres/actions";
import type { JalonRetroplanning } from "@/lib/appels-offres/types";

function trierJalons(jalons: JalonRetroplanning[]): JalonRetroplanning[] {
  return [...jalons].sort((a, b) => {
    if (a.date_cible !== b.date_cible) return a.date_cible < b.date_cible ? -1 : 1;
    return a.ordre - b.ordre;
  });
}

export function Retroplanning({
  appelOffresId,
  dateLimiteConnue,
  jalonsInitiaux,
}: {
  appelOffresId: string;
  dateLimiteConnue: boolean;
  jalonsInitiaux: JalonRetroplanning[];
}) {
  const t = useTranslations("AppelsOffres.detail.retroplanning");
  const [jalons, setJalons] = useState(jalonsInitiaux);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [nouvelleDate, setNouvelleDate] = useState("");
  const [genereEnCours, setGenereEnCours] = useState(false);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [, startTransition] = useTransition();
  const aujourdHui = new Date().toISOString().slice(0, 10);

  async function generer() {
    setGenereEnCours(true);
    const resultat = await genererJalonsRetroplanning(appelOffresId);
    setGenereEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setJalons(trierJalons(resultat.jalons));
    toast.success(t("toastGenere"));
  }

  async function ajouter() {
    if (nouveauLibelle.trim().length === 0 || nouvelleDate.length === 0) return;

    setAjoutEnCours(true);
    const resultat = await creerJalon(appelOffresId, {
      libelle: nouveauLibelle,
      dateCible: nouvelleDate,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setJalons((liste) => trierJalons([...liste, resultat.jalon]));
    setNouveauLibelle("");
    setNouvelleDate("");
    toast.success(t("toastAjoute"));
  }

  function basculer(jalonId: string, coche: boolean) {
    setJalons((liste) => liste.map((j) => (j.id === jalonId ? { ...j, coche } : j)));

    startTransition(async () => {
      const resultat = await basculerJalonCoche(appelOffresId, jalonId, coche);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setJalons((liste) =>
          liste.map((j) => (j.id === jalonId ? { ...j, coche: !coche } : j)),
        );
      }
    });
  }

  function supprimer(jalonId: string) {
    const jalonSupprime = jalons.find((j) => j.id === jalonId);
    if (!jalonSupprime) return;

    setJalons((liste) => liste.filter((j) => j.id !== jalonId));

    startTransition(async () => {
      const resultat = await supprimerJalon(appelOffresId, jalonId);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setJalons((liste) => trierJalons([...liste, jalonSupprime]));
      }
    });
  }

  const enRetard = (jalon: JalonRetroplanning) => !jalon.coche && jalon.date_cible < aujourdHui;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("titre")}</h2>

      {jalons.length === 0 &&
        (dateLimiteConnue ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t("aucunJalon")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={generer}
              disabled={genereEnCours}
              className="self-start"
            >
              {genereEnCours ? t("generationEnCours") : t("boutonGenerer")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("dateLimiteInconnue")}</p>
        ))}

      {jalons.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {jalons.map((jalon) => (
            <li key={jalon.id} className="flex items-center gap-2">
              <Checkbox
                id={`jalon-${jalon.id}`}
                checked={jalon.coche}
                onCheckedChange={(valeur) => basculer(jalon.id, valeur === true)}
              />
              <Label htmlFor={`jalon-${jalon.id}`} className="flex-1 font-normal">
                <span className={enRetard(jalon) ? "font-medium text-destructive" : undefined}>
                  {jalon.date_cible}
                </span>
                {" — "}
                {jalon.libelle}
                {enRetard(jalon) && (
                  <span className="ml-2 text-xs text-destructive">{t("enRetard")}</span>
                )}
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => supprimer(jalon.id)}>
                {t("supprimer")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-jalon-libelle" className="text-xs text-muted-foreground">
            {t("champLibelle")}
          </Label>
          <Input
            id="nouveau-jalon-libelle"
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            placeholder={t("libellePlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nouveau-jalon-date" className="text-xs text-muted-foreground">
            {t("champDate")}
          </Label>
          <Input
            id="nouveau-jalon-date"
            type="date"
            value={nouvelleDate}
            onChange={(e) => setNouvelleDate(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={ajouter} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouter")}
        </Button>
      </div>
    </div>
  );
}
```

Notes :
- `basculer`/`supprimer` utilisent un revert fonctionnel (opération
  inverse appliquée à l'état courant, ou réinsertion de l'élément
  supprimé précisément), jamais un instantané figé (`const precedent =
  jalons`) — leçon du Module 7 sous-projet 1 (checklist de soumission),
  où un revert par instantané pouvait écraser une bascule concurrente
  réussie sur un autre élément.
- Aucun `disabled` sur les `Checkbox`/`Input` pendant une transition —
  seuls les deux boutons ponctuels (`generer`, `ajouter`) sont
  désactivés le temps de leur propre requête. Éviter de désactiver des
  contrôles Radix pendant une transition (perte de focus clavier) —
  leçon rencontrée deux fois dans ce projet.
- `text-destructive`/`font-medium` (état « en retard ») utilisent le
  token shadcn/ui déjà configuré dans `tailwind.config.ts`
  (`hsl(var(--destructive))`), jamais une classe Tailwind couleur codée
  en dur — leçon du Module 7 sous-projet 1 (contraste WCAG AA).

### Intégration dans `appel-offres-detail.tsx`

Import à ajouter :

```tsx
import { Retroplanning } from "./retroplanning";
```

Type à ajouter dans les imports de types (étendre la ligne existante) :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
} from "@/lib/appels-offres/types";
```

Props du composant : ajouter `jalons: JalonRetroplanning[];` et
`dateLimiteConnue: boolean;` au type et à la déstructuration.

Le bloc actuel :

```tsx
      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      {pret && (
```

devient (insertion entre le panneau Go/No-Go et le bloc conditionnel
`pret`, donc visible même pendant le traitement du DAO — le
rétroplanning ne dépend que de `date_limite`, renseignable dès le
formulaire principal) :

```tsx
      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      <Retroplanning
        appelOffresId={appelOffres.id}
        dateLimiteConnue={dateLimiteConnue}
        jalonsInitiaux={jalons}
      />

      {pret && (
```

### Traductions

Dans `messages/fr.json`, bloc `"AppelsOffres.detail"`, ajouter un
nouveau namespace `"retroplanning"` juste après `"goNoGo"` et avant
`"exigences"` :

```json
      "retroplanning": {
        "titre": "Rétroplanning",
        "aucunJalon": "Aucun jalon pour l'instant.",
        "boutonGenerer": "Générer le rétroplanning",
        "generationEnCours": "Génération...",
        "dateLimiteInconnue": "Renseignez d'abord la date limite pour générer le rétroplanning.",
        "champLibelle": "Libellé",
        "libellePlaceholder": "Ex. Envoi de l'offre au sous-traitant",
        "champDate": "Date",
        "boutonAjouter": "Ajouter",
        "ajoutEnCours": "Ajout...",
        "supprimer": "Supprimer",
        "enRetard": "En retard",
        "toastGenere": "Rétroplanning généré",
        "toastAjoute": "Jalon ajouté"
      },
```

Dans `messages/en.json`, même structure :

```json
      "retroplanning": {
        "titre": "Timeline",
        "aucunJalon": "No milestones yet.",
        "boutonGenerer": "Generate timeline",
        "generationEnCours": "Generating...",
        "dateLimiteInconnue": "Set the submission deadline first to generate the timeline.",
        "champLibelle": "Label",
        "libellePlaceholder": "E.g. Send offer to subcontractor",
        "champDate": "Date",
        "boutonAjouter": "Add",
        "ajoutEnCours": "Adding...",
        "supprimer": "Delete",
        "enRetard": "Overdue",
        "toastGenere": "Timeline generated",
        "toastAjoute": "Milestone added"
      },
```

## États et erreurs

- Aucun jalon + `date_limite` connue : bouton "Générer le rétroplanning".
- Aucun jalon + `date_limite` inconnue : message explicatif, pas de
  bouton.
- Échec d'une Server Action : toast d'erreur avec le message renvoyé par
  le serveur, revert fonctionnel de l'état optimiste concerné (jamais un
  instantané global).
- Pas de garde applicative contre une double génération (cliquer deux
  fois rapidement sur "Générer" pourrait créer deux jeux de 5 jalons) —
  accepté comme limitation mineure, un jalon en trop se supprime en un
  clic ; le bouton n'est de toute façon affiché que quand la liste est
  vide, donc le scénario réel est rare (double-clic rapide avant le
  premier re-rendu).

## Tests

Vitest, TDD, sur `genererJalonsParDefaut` (nouveau fichier
`lib/appels-offres/retroplanning.test.ts`) :

- Avec `maintenant = 2026-01-01T00:00:00.000Z` et
  `dateLimite = 2026-01-31T00:00:00.000Z` (30 jours exactement),
  vérifier les 5 dates calculées exactement :
  - `"Analyse du DAO et décision Go/No-Go"` → `"2026-01-04"` (10 % de 30 j = 3 j)
  - `"Constitution du dossier (pièces, mapping, rédaction)"` → `"2026-01-13"` (40 % = 12 j)
  - `"Revue interne de l'offre"` → `"2026-01-20"` (65 % = 19,5 j → midi UTC, tronqué à la date)
  - `"Relecture finale et vérifications"` → `"2026-01-26"` (85 % = 25,5 j)
  - `"Dépôt du dossier"` → `"2026-01-30"` (date limite moins 1 jour, toujours, indépendamment des fractions ci-dessus)
- Vérifier que le tableau retourné contient exactement 5 éléments, dans
  cet ordre (les 4 phases proportionnelles d'abord, le dépôt en
  dernier).
- Cas limite : `dateLimite` très proche de `maintenant` (ex. 2 jours) —
  la fonction ne doit pas lever d'exception, même si les jalons
  proportionnels se retrouvent très rapprochés ou dans le passé proche.

Pas de test sur `listerJalonsRetroplanning`/les Server Actions
(fonctions Supabase, cohérent avec le reste du projet).

## Hors périmètre

- Édition du libellé/de la date d'un jalon existant (supprimer et
  recréer à la place) — voir « Décisions validées ».
- Assignation d'un jalon à un membre précis de l'équipe.
- Réorganisation manuelle par glisser-déposer.
- Garde applicative contre une double génération accidentelle.
- Recalcul automatique des jalons si `date_limite` change après
  génération — les jalons restent figés une fois créés, modifiables
  manuellement (ajout/suppression) si besoin, jamais silencieusement
  recalculés (cohérent avec le principe déjà appliqué de ne jamais
  écraser une modification humaine sans action explicite).
- Les deux dernières lacunes identifiées (chiffrage, groupement/
  co-traitance) restent explicitement hors périmètre de ce
  sous-projet — chacune fera l'objet d'un brainstorming séparé.
