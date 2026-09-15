# Matrice de décision Go/No-Go

Date : 2026-09-15
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Deuxième des cinq lacunes identifiées en comparant NoubinAO à un guide de
référence générique sur la réponse aux appels d'offres (la première,
checklist finale de soumission, est mergée sur `main`). L'ebook décrit un
« arbre de décision Go/No-Go » en 3 filtres en cascade (capacité
juridique/administrative → faisabilité technique/disponibilité →
rentabilité/alignement stratégique), destiné à éviter d'investir du temps
sur un AO qu'on ne devrait pas tenter.

NoubinAO déclenche déjà automatiquement l'extraction du DAO à l'upload
(`mettreEnFileTraitementDao`), donc ce sous-projet ne peut pas gater cette
étape-là — l'AO est déjà traité au moment où l'équipe peut évaluer le
Go/No-Go. La valeur réelle ici est de structurer la décision de continuer
à **investir du temps d'équipe** (mapping, rédaction, dépôt) sur un AO,
pas de bloquer le traitement automatique lui-même.

## Décisions validées avec l'utilisateur

- **Jamais bloquant.** Le panneau Go/No-Go est purement informatif —
  aucune action du produit n'est empêchée tant qu'il n'est pas rempli.
  Même principe que la checklist de soumission (Module 7, sous-projet 1) :
  suggestion/structuration, jamais un automatisme qui empêche une action
  légitime.
- **Nouveau statut pipeline `sans_suite`**, distinct de `perdu`. `perdu`
  signifie qu'on a répondu et perdu face à un concurrent — sémantiquement
  faux pour un AO jamais soumis. Le panneau Go/No-Go ne pousse **jamais**
  ce statut automatiquement (cohérent avec « jamais bloquant ») ; l'équipe
  le change elle-même sur la page Pipeline si elle le souhaite.
- **3 critères explicites**, fidèles à l'ebook, chacun avec une réponse à
  trois états (« à évaluer » / « oui » / « non », jamais un booléen
  nullable — voir Modèle de données pour la justification) + une note
  libre optionnelle : capacité juridique & administrative, faisabilité
  technique & disponibilité, rentabilité & alignement stratégique.
- **Verdict calculé automatiquement**, jamais choisi manuellement — fidèle
  à la logique cascade de l'ebook : un seul critère à « non » suffit à
  donner No-Go ; il faut les 3 à « oui » pour Go ; sinon (au moins un
  encore « à évaluer », aucun « non ») le verdict est « en attente ».
  Le verdict reste un affichage informatif, jamais un blocage.
- **Emplacement** : en haut de la page détail AO, avant la section
  « Pièces requises » — visible dès l'ouverture de la page, y compris
  pendant que le DAO est encore en cours de traitement (contrairement aux
  sections d'exigences, gardées derrière `pret`), puisque la décision
  Go/No-Go ne dépend pas de l'extraction.

## Modèle de données

```sql
-- Évaluation Go/No-Go (Module 7, sous-projet 2). Relation 1:1 avec
-- appel_offres, créée paresseusement (get-or-create) comme
-- dossier_reponse. Les 3 critères sont NOT NULL avec une valeur par
-- défaut explicite 'a_evaluer' plutôt qu'une colonne nullable : un
-- <Select> shadcn/ui (Radix) interdit un SelectItem à value="" (seul
-- moyen naturel de représenter "pas encore répondu" avec un enum
-- nullable), donc l'état "pas encore répondu" est modélisé comme une
-- vraie 3ème valeur d'enum plutôt que NULL + un contournement de Select.
create table evaluation_go_no_go (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  critere_juridique text not null default 'a_evaluer'
    check (critere_juridique in ('a_evaluer', 'oui', 'non')),
  note_juridique text,
  critere_faisabilite text not null default 'a_evaluer'
    check (critere_faisabilite in ('a_evaluer', 'oui', 'non')),
  note_faisabilite text,
  critere_rentabilite text not null default 'a_evaluer'
    check (critere_rentabilite in ('a_evaluer', 'oui', 'non')),
  note_rentabilite text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now()
);

alter table evaluation_go_no_go enable row level security;

-- Même pattern que dossier_reponse_select_membres.
create policy "evaluation_go_no_go_select_membres" on evaluation_go_no_go
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "evaluation_go_no_go_insert_membres" on evaluation_go_no_go
  for insert with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );

-- UPDATE avec un WITH CHECK explicite — contrairement à checklist_item_dossier
-- (Module 7, sous-projet 1), cette table a besoin d'une policy update
-- puisque chaque ligne est éditée en place, pas insérée/supprimée. Leçon
-- du Module 6 (RLS WITH CHECK gotcha) appliquée dès la conception :
-- appel_offres_id ne doit jamais pouvoir être réécrit vers l'AO d'une
-- autre entreprise, et modifie_par doit être l'appelant lui-même, jamais
-- forgé au nom d'un collègue.
create policy "evaluation_go_no_go_update_membres" on evaluation_go_no_go
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    modifie_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );
```

Nouveau type dans `lib/appels-offres/types.ts`, même convention que
`TYPES_EXIGENCE_AO`/`TypeExigenceAo` :

```ts
export const CRITERES_GO_NO_GO = ["a_evaluer", "oui", "non"] as const;
export type CritereGoNoGo = (typeof CRITERES_GO_NO_GO)[number];

export interface EvaluationGoNoGo {
  id: string;
  appel_offres_id: string;
  critere_juridique: CritereGoNoGo;
  note_juridique: string | null;
  critere_faisabilite: CritereGoNoGo;
  note_faisabilite: string | null;
  critere_rentabilite: CritereGoNoGo;
  note_rentabilite: string | null;
  modifie_par: string | null;
  modifie_le: string;
}
```

## Nouveau statut pipeline `sans_suite`

Dans `lib/appels-offres/types.ts`, `STATUTS_PIPELINE_AO` passe de :
```ts
export const STATUTS_PIPELINE_AO = [
  "identifie",
  "en_preparation",
  "soumis",
  "en_attente",
  "gagne",
  "perdu",
] as const;
```
à :
```ts
export const STATUTS_PIPELINE_AO = [
  "identifie",
  "en_preparation",
  "soumis",
  "en_attente",
  "gagne",
  "perdu",
  "sans_suite",
] as const;
```

Ce changement rend deux `switch`/`Record` exhaustifs incomplets — TypeScript
signalera lui-même les deux endroits à corriger (aucun `default` n'existe
dans ces deux fichiers, donc l'omission d'un cas est une vraie erreur de
compilation, pas un risque silencieux) :

- `lib/appels-offres/statut-pipeline.ts` (`obtenirCouleurStatutPipeline`) :
  ajouter `case "sans_suite": return "identifie";` — réutilise la couleur
  neutre déjà utilisée pour `en_attente`, pas de nouveau token CSS
  nécessaire (YAGNI, pas de nouvelle vérification de contraste à faire).
- `app/(app)/pipeline/statut-pipeline-select.tsx` (`CLES_LIBELLE`) :
  ajouter `sans_suite: "badge.sansSuite"`.

Nouvelle clé i18n dans `messages/fr.json` (bloc `"Pipeline"` →
`"badge"`, juste après `"perdu"`) : `"sansSuite": "Sans suite"`. Dans
`messages/en.json`, même emplacement : `"sansSuite": "No further action"`.

## Calcul du verdict (fonction pure, jamais persisté)

Nouveau fichier `lib/appels-offres/go-no-go.ts` :

```ts
import type { CritereGoNoGo } from "./types";

export type VerdictGoNoGo = "go" | "no_go" | "en_attente";

export function calculerVerdictGoNoGo(
  critereJuridique: CritereGoNoGo,
  critereFaisabilite: CritereGoNoGo,
  critereRentabilite: CritereGoNoGo,
): VerdictGoNoGo {
  if (
    critereJuridique === "non" ||
    critereFaisabilite === "non" ||
    critereRentabilite === "non"
  ) {
    return "no_go";
  }

  if (
    critereJuridique === "oui" &&
    critereFaisabilite === "oui" &&
    critereRentabilite === "oui"
  ) {
    return "go";
  }

  return "en_attente";
}
```

Un « non » l'emporte toujours sur les autres critères, même si eux sont
encore « à évaluer » — fidèle à l'arbre de décision de l'ebook (un filtre
échoué arrête la cascade immédiatement, peu importe l'état des filtres
suivants).

## Lecture (get-or-create)

Nouvelle fonction dans `lib/appels-offres/queries.ts`, même pattern que
`obtenirOuCreerDossierReponse` (y compris la même défense contre une
course avec une insertion concurrente) :

```ts
export async function obtenirEvaluationGoNoGo(
  appelOffresId: string,
): Promise<EvaluationGoNoGo> {
  const supabase = await createClient();

  const { data: existant } = await supabase
    .from("evaluation_go_no_go")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (existant) return existant as EvaluationGoNoGo;

  const { data: cree, error: erreurInsertion } = await supabase
    .from("evaluation_go_no_go")
    .insert({ appel_offres_id: appelOffresId })
    .select("*")
    .maybeSingle();

  if (!erreurInsertion && cree) return cree as EvaluationGoNoGo;

  // Course possible avec une autre requête concurrente (deux onglets
  // ouverts sur le même AO) : la contrainte unique sur appel_offres_id a
  // été violée. Non fatal — la ligne existe forcément à ce stade, on la
  // relit (même filet de sécurité que obtenirOuCreerDossierReponse).
  const { data: relu } = await supabase
    .from("evaluation_go_no_go")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (!relu) {
    throw new Error("Échec de la création de l'évaluation Go/No-Go.");
  }

  return relu as EvaluationGoNoGo;
}
```

## Validation (Zod)

Dans `lib/appels-offres/schema.ts`, ajouter (après l'import existant de
`STATUTS_PIPELINE_AO`, étendre l'import pour inclure `CRITERES_GO_NO_GO`) :

```ts
import { STATUTS_PIPELINE_AO, CRITERES_GO_NO_GO } from "./types";
```

Puis, à la fin du fichier :

```ts
export const mettreAJourEvaluationGoNoGoSchema = z.object({
  critereJuridique: z.enum(CRITERES_GO_NO_GO),
  noteJuridique: champOptionnel,
  critereFaisabilite: z.enum(CRITERES_GO_NO_GO),
  noteFaisabilite: champOptionnel,
  critereRentabilite: z.enum(CRITERES_GO_NO_GO),
  noteRentabilite: champOptionnel,
});
```

`champOptionnel` est déjà défini plus haut dans ce fichier (utilisé par
`modifierAppelOffresSchema`) — pas besoin de le redéfinir.

## Server Action

Dans `lib/appels-offres/actions.ts` :

```ts
export async function mettreAJourEvaluationGoNoGo(
  appelOffresId: string,
  input: {
    critereJuridique: CritereGoNoGo;
    noteJuridique: string | null;
    critereFaisabilite: CritereGoNoGo;
    noteFaisabilite: string | null;
    critereRentabilite: CritereGoNoGo;
    noteRentabilite: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = mettreAJourEvaluationGoNoGoSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("evaluation_go_no_go")
    .update({
      critere_juridique: parsed.data.critereJuridique,
      note_juridique: parsed.data.noteJuridique,
      critere_faisabilite: parsed.data.critereFaisabilite,
      note_faisabilite: parsed.data.noteFaisabilite,
      critere_rentabilite: parsed.data.critereRentabilite,
      note_rentabilite: parsed.data.noteRentabilite,
      modifie_par: utilisateur.id,
      modifie_le: new Date().toISOString(),
    })
    .eq("appel_offres_id", appelOffresId);

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

Reçoit un objet typé plutôt qu'un `FormData` — contrairement à
`modifierAppelOffres`, ce formulaire mélange des `<Select>` shadcn/ui
(qui ne participent pas nativement à `FormData` sans plomberie
supplémentaire) et doit recalculer le verdict en direct côté client à
chaque changement, donc c'est un composant contrôlé (état React) plutôt
qu'un formulaire non-contrôlé — même différence de pattern que
`lierEmailAAppelOffres(appelOffresId, emailId)` (Module 6) vs
`modifierAppelOffres(id, formData)`.

L'UPDATE suppose que la ligne existe déjà (créée par
`obtenirEvaluationGoNoGo` au chargement de la page, avant que
l'utilisateur puisse interagir avec le formulaire) — jamais d'upsert
nécessaire ici.

## Intégration dans `page.tsx`

L'import actuel :

```tsx
import { obtenirAppelOffres, listerChecklistManuelle } from "@/lib/appels-offres/queries";
```

devient :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
} from "@/lib/appels-offres/queries";
```

Le chargement des données actuel :

```tsx
  const [bibliotheque, emailsLies, suggestions, checklistManuelle] = await Promise.all([
    listerDocuments(utilisateur.entreprise_id),
    listerEmailsLies(id),
    obtenirSuggestionsEmail(utilisateur.id, {
      titre: resultat.appelOffres.titre,
      acheteur: resultat.appelOffres.acheteur,
      date_limite: resultat.appelOffres.date_limite,
    }),
    listerChecklistManuelle(resultat.dossierReponse.id),
  ]);
```

devient :

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

Le rendu de `<AppelOffresDetail>` actuel gagne une prop `evaluationGoNoGo={evaluationGoNoGo}`.

**Point de vigilance déploiement (leçon du sous-projet 1, voir
`noubinao_migration_avant_merge` en mémoire)** : `obtenirEvaluationGoNoGo`
est appelée sans condition sur toute la page détail AO. La migration
`evaluation_go_no_go` doit être appliquée à la base distante **avant** le
merge sur `main`, jamais après — sinon la page détail AO tombe en erreur
pour tout le monde dès le déploiement Vercel automatique qui suit le
merge.

## Interface

Nouveau composant `app/(app)/appels-offres/[id]/go-no-go.tsx` (composant
client, contrôlé — pas de `FormData`) :

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { mettreAJourEvaluationGoNoGo } from "@/lib/appels-offres/actions";
import { calculerVerdictGoNoGo } from "@/lib/appels-offres/go-no-go";
import { CRITERES_GO_NO_GO, type CritereGoNoGo, type EvaluationGoNoGo } from "@/lib/appels-offres/types";

const CLES_CRITERE = ["juridique", "faisabilite", "rentabilite"] as const;
type CleCritere = (typeof CLES_CRITERE)[number];

const VARIANT_BADGE = {
  go: "default",
  no_go: "destructive",
  en_attente: "outline",
} as const;

export function GoNoGo({
  appelOffresId,
  evaluation,
}: {
  appelOffresId: string;
  evaluation: EvaluationGoNoGo;
}) {
  const t = useTranslations("AppelsOffres.detail.goNoGo");
  const [criteres, setCriteres] = useState<Record<CleCritere, CritereGoNoGo>>({
    juridique: evaluation.critere_juridique,
    faisabilite: evaluation.critere_faisabilite,
    rentabilite: evaluation.critere_rentabilite,
  });
  const [notes, setNotes] = useState<Record<CleCritere, string>>({
    juridique: evaluation.note_juridique ?? "",
    faisabilite: evaluation.note_faisabilite ?? "",
    rentabilite: evaluation.note_rentabilite ?? "",
  });
  const [envoi, setEnvoi] = useState(false);

  const verdict = calculerVerdictGoNoGo(
    criteres.juridique,
    criteres.faisabilite,
    criteres.rentabilite,
  );

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await mettreAJourEvaluationGoNoGo(appelOffresId, {
      critereJuridique: criteres.juridique,
      noteJuridique: notes.juridique.trim() || null,
      critereFaisabilite: criteres.faisabilite,
      noteFaisabilite: notes.faisabilite.trim() || null,
      critereRentabilite: criteres.rentabilite,
      noteRentabilite: notes.rentabilite.trim() || null,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  return (
    // Comme ChecklistSoumission (Module 7, sous-projet 1), ce composant
    // possède son propre titre plutôt que de laisser le parent le rendre :
    // le badge de verdict doit être aligné sur la même ligne que le titre
    // et dépend de l'état client (criteres), recalculé à chaque
    // changement.
    <div className="flex flex-col gap-3 border rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <Badge variant={VARIANT_BADGE[verdict]}>{t(`verdict.${verdict}`)}</Badge>
      </div>

      {CLES_CRITERE.map((cle) => (
        <div key={cle} className="flex flex-col gap-2">
          <Label htmlFor={`go-no-go-${cle}`}>{t(`criteres.${cle}`)}</Label>
          <Select
            value={criteres[cle]}
            onValueChange={(valeur) =>
              setCriteres((c) => ({ ...c, [cle]: valeur as CritereGoNoGo }))
            }
          >
            <SelectTrigger id={`go-no-go-${cle}`} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITERES_GO_NO_GO.map((valeur) => (
                <SelectItem key={valeur} value={valeur}>
                  {t(`critereValeur.${valeur}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={notes[cle]}
            onChange={(e) => setNotes((n) => ({ ...n, [cle]: e.target.value }))}
            placeholder={t("notePlaceholder")}
            rows={2}
          />
        </div>
      ))}

      <Button onClick={enregistrer} disabled={envoi} className="self-start">
        {envoi ? t("envoiEnCours") : t("boutonEnregistrer")}
      </Button>
    </div>
  );
}
```

Note : ni les `<Select>` ni le `<Textarea>` ne sont désactivés pendant
`envoi` — seul le bouton l'est (même choix que le formulaire principal
d'`AppelOffresDetail`, `disabled={!pret || envoi}` sur le bouton
seulement). Désactiver les contrôles pendant l'envoi réintroduirait la
même classe de bug de perte de focus clavier déjà corrigée deux fois
dans ce projet (voir `noubinao_a11y_radix_pitfalls` en mémoire) — ici
l'enregistrement est un aller-retour ponctuel sur clic, pas une bascule
répétée par contrôle, donc rien ne justifie de désactiver les champs.

### Intégration dans `appel-offres-detail.tsx`

Import à ajouter (avec les autres imports de composants de section) :

```tsx
import { GoNoGo } from "./go-no-go";
```

Type à ajouter dans les imports de types (étendre la ligne
`import type { AppelOffres, CleChecklistManuelle, ExigenceAo } from "@/lib/appels-offres/types";`) :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
} from "@/lib/appels-offres/types";
```

Props du composant : ajouter `evaluationGoNoGo: EvaluationGoNoGo;` au type
et à la déstructuration, aux côtés de `checklistManuelle`.

Le bloc actuel :

```tsx
        <Button type="submit" disabled={!pret || envoi}>
          {envoi ? t("form.envoiEnCours") : t("form.boutonEnregistrer")}
        </Button>
      </form>

      {pret && (
```

devient (insertion du panneau Go/No-Go entre le formulaire principal et
le bloc conditionnel `pret`, donc visible même pendant le traitement) :

```tsx
        <Button type="submit" disabled={!pret || envoi}>
          {envoi ? t("form.envoiEnCours") : t("form.boutonEnregistrer")}
        </Button>
      </form>

      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      {pret && (
```

### Traductions

Dans `messages/fr.json`, bloc `"AppelsOffres.detail"`, ajouter un
nouveau namespace `"goNoGo"` (à un emplacement quelconque du bloc
`"detail"`, par exemple juste après `"form"` et avant `"exigences"`) :

```json
      "goNoGo": {
        "titre": "Décision Go/No-Go",
        "criteres": {
          "juridique": "Capacité juridique & administrative",
          "faisabilite": "Faisabilité technique & disponibilité",
          "rentabilite": "Rentabilité & alignement stratégique"
        },
        "critereValeur": {
          "a_evaluer": "À évaluer",
          "oui": "Oui",
          "non": "Non"
        },
        "verdict": {
          "go": "Go",
          "no_go": "No-Go",
          "en_attente": "En attente"
        },
        "notePlaceholder": "Note (optionnel)",
        "boutonEnregistrer": "Enregistrer",
        "envoiEnCours": "Enregistrement...",
        "toastEnregistre": "Évaluation enregistrée"
      },
```

Dans `messages/en.json`, même structure :

```json
      "goNoGo": {
        "titre": "Go/No-Go decision",
        "criteres": {
          "juridique": "Legal & administrative capacity",
          "faisabilite": "Technical feasibility & availability",
          "rentabilite": "Profitability & strategic fit"
        },
        "critereValeur": {
          "a_evaluer": "To evaluate",
          "oui": "Yes",
          "non": "No"
        },
        "verdict": {
          "go": "Go",
          "no_go": "No-Go",
          "en_attente": "Pending"
        },
        "notePlaceholder": "Note (optional)",
        "boutonEnregistrer": "Save",
        "envoiEnCours": "Saving...",
        "toastEnregistre": "Evaluation saved"
      },
```

Et, comme documenté plus haut, la clé `"sansSuite"` dans le bloc
`"Pipeline"` → `"badge"` des deux fichiers.

## États et erreurs

- Aucun état de chargement particulier au montage : `evaluation` est
  toujours fournie par le serveur (get-or-create), jamais `null`/`undefined`.
- Échec de `mettreAJourEvaluationGoNoGo` (réseau, RLS) : toast d'erreur
  générique, l'état local des champs n'est PAS reverté (contrairement à
  la checklist) — ce sont des champs de formulaire édités activement par
  l'utilisateur, les vider ou les remettre à leur ancienne valeur après
  un échec d'enregistrement serait une perte de saisie surprenante ;
  l'utilisateur corrige et réessaie avec le contenu qu'il a déjà tapé.
- Aucune migration de données nécessaire : un AO existant sans ligne
  `evaluation_go_no_go` obtient une ligne par défaut (3 critères
  `'a_evaluer'`) au premier chargement de sa page détail.

## Tests

Vitest, TDD, sur `calculerVerdictGoNoGo` (nouveau fichier
`lib/appels-offres/go-no-go.test.ts`) :

- Les 3 critères à `"oui"` → `"go"`.
- Un seul critère à `"non"`, les 2 autres à `"oui"` → `"no_go"`.
- Un seul critère à `"non"`, les 2 autres encore à `"a_evaluer"` → `"no_go"`
  (le `"non"` l'emporte même si les autres filtres n'ont pas encore été
  répondus — pas besoin d'aller au bout de la cascade pour conclure).
- Les 3 critères à `"a_evaluer"` → `"en_attente"`.
- Un mélange `"oui"`/`"a_evaluer"` sans aucun `"non"` → `"en_attente"`
  (pas encore assez d'information pour dire "go").

Pas de test sur `obtenirEvaluationGoNoGo`/`mettreAJourEvaluationGoNoGo`
(fonctions Supabase, cohérent avec le reste du projet — pas de mock
Supabase dans ce projet, voir Module 6/7).

## Hors périmètre

- Le panneau Go/No-Go ne pousse jamais automatiquement `statut_pipeline`
  vers `sans_suite` — l'équipe le fait elle-même sur la page Pipeline si
  elle le souhaite (décision explicite, voir « Décisions validées »).
  Un bouton de raccourci « Marquer sans suite » directement depuis le
  panneau pourrait être ajouté plus tard si l'usage réel montre que
  l'aller-retour vers la page Pipeline est pénible — pas nécessaire pour
  cette première version (YAGNI, la page Pipeline gère déjà ce
  changement de statut).
- Pas de blocage d'aucune action du produit (upload, traitement, mapping,
  export) selon le verdict — décision explicite, cohérente avec la
  checklist de soumission.
- Les 3 autres lacunes identifiées (rétroplanning de Bid Management,
  chiffrage, groupement/co-traitance) restent explicitement hors
  périmètre de ce sous-projet — chacune fera l'objet d'un brainstorming
  séparé.
