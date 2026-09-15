# Rétroplanning de Bid Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une liste de jalons datés par appel d'offres (AO) — générée automatiquement à la demande, proportionnelle au temps restant avant la date limite, éditable (ajout/coché/suppression) — sur la page détail AO, juste après le panneau Go/No-Go.

**Architecture:** Une table `jalon_retroplanning` (CRUD complet, RLS équipe) stocke les jalons. Une fonction pure calcule 5 jalons par défaut proportionnels au temps restant avant `date_limite` (pas un nombre de jours fixe). La génération se déclenche par un bouton explicite, jamais automatiquement. Jamais bloquant pour aucune autre fonctionnalité du produit.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres/RLS, Zod, next-intl, Vitest, shadcn/ui (`Checkbox`, `Input`, `Label`, `Button`).

## Global Constraints

- Jamais bloquant : aucune action du produit ne dépend de l'état du rétroplanning.
- Génération déclenchée uniquement par un clic explicite sur un bouton — jamais automatique/silencieuse.
- Pas d'assignation par jalon, pas d'édition du libellé/de la date d'un jalon existant (supprimer et recréer à la place), pas de réorganisation par glisser-déposer — tri toujours par `date_cible` puis `ordre`.
- La policy RLS `update` sur `jalon_retroplanning` a un `with check` explicite limité à l'appartenance entreprise (PAS de contrainte sur `coche_par`, contrairement à `evaluation_go_no_go`) — n'importe quel membre de l'équipe doit pouvoir cocher/décocher un jalon déjà traité par un collègue.
- La policy RLS `insert` a un `with check` qui exige `created_by = auth.uid()`.
- **La migration SQL ne doit PAS être appliquée à la base Supabase distante par l'implémenteur** (`supabase db push` interdit) — elle sera relue et appliquée séparément par le contrôleur, **avant** le merge sur `main` (leçon des sous-projets précédents : une requête ajoutée sans condition sur une page en production doit avoir sa migration appliquée avant le merge, pas après).
- Aucun `disabled` sur les `Checkbox`/`Input` de la liste pendant une transition de bascule/suppression — seuls les boutons ponctuels "Générer"/"Ajouter" sont désactivés le temps de leur propre requête (leçon des pièges de focus clavier Radix déjà rencontrés deux fois dans ce projet).
- Tout revert d'état optimiste après échec d'une Server Action doit être fonctionnel (opération inverse ou réinsertion précise de l'élément concerné), jamais un instantané global figé — un instantané peut écraser une autre modification concurrente réussie entre-temps.
- Couleur "en retard" via le token shadcn `text-destructive` (déjà configuré dans `tailwind.config.ts`), jamais une classe Tailwind couleur codée en dur.

---

### Task 1: Modèle de données — migration + type

**Files:**
- Create: `supabase/migrations/20260915160000_jalon_retroplanning.sql`
- Modify: `lib/appels-offres/types.ts`

**Interfaces:**
- Produces: `interface JalonRetroplanning { id, appel_offres_id, libelle, date_cible, coche, ordre, coche_par, coche_le, created_by, created_at }` — consommé par les Tasks 3, 4, 5.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260915160000_jalon_retroplanning.sql` :

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

- [ ] **Step 2: Ajouter le type**

À la fin de `lib/appels-offres/types.ts`, ajouter :

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

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: NE PAS exécuter `supabase db push`**

La migration reste locale pour l'instant — elle sera appliquée par le
contrôleur une fois la branche entière revue, avant le merge. N'exécute
aucune commande touchant la base Supabase distante dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260915160000_jalon_retroplanning.sql lib/appels-offres/types.ts
git commit -m "feat: table jalon_retroplanning + type JalonRetroplanning"
```

---

### Task 2: Génération des jalons par défaut (`genererJalonsParDefaut`, TDD)

**Files:**
- Create: `lib/appels-offres/retroplanning.ts`
- Create: `lib/appels-offres/retroplanning.test.ts`

**Interfaces:**
- Consumes: rien (fonction pure autonome, aucune dépendance sur d'autres tâches).
- Produces: `interface JalonGenere { libelle: string; dateCible: string }`, `genererJalonsParDefaut(dateLimite: Date, maintenant?: Date): JalonGenere[]` — consommé par la Task 3 (Server Action `genererJalonsRetroplanning`).

- [ ] **Step 1: Écrire les tests (ils doivent tous échouer, le fichier `retroplanning.ts` n'existe pas encore)**

Créer `lib/appels-offres/retroplanning.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { genererJalonsParDefaut } from "./retroplanning";

describe("genererJalonsParDefaut", () => {
  const MAINTENANT = new Date("2026-01-01T00:00:00.000Z");
  const DATE_LIMITE = new Date("2026-01-31T00:00:00.000Z"); // 30 jours après MAINTENANT

  it("calcule les 5 jalons avec les dates exactes attendues", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);

    expect(jalons).toEqual([
      { libelle: "Analyse du DAO et décision Go/No-Go", dateCible: "2026-01-04" },
      {
        libelle: "Constitution du dossier (pièces, mapping, rédaction)",
        dateCible: "2026-01-13",
      },
      { libelle: "Revue interne de l'offre", dateCible: "2026-01-20" },
      { libelle: "Relecture finale et vérifications", dateCible: "2026-01-26" },
      { libelle: "Dépôt du dossier", dateCible: "2026-01-30" },
    ]);
  });

  it("retourne exactement 5 jalons", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);
    expect(jalons.length).toBe(5);
  });

  it("le dernier jalon (dépôt) est toujours la veille de la date limite, indépendamment des fractions", () => {
    const jalons = genererJalonsParDefaut(DATE_LIMITE, MAINTENANT);
    expect(jalons[4].dateCible).toBe("2026-01-30");
  });

  it("ne lève pas d'exception quand la date limite est très proche de maintenant", () => {
    const dateLimiteProche = new Date("2026-01-03T00:00:00.000Z"); // 2 jours après MAINTENANT
    expect(() => genererJalonsParDefaut(dateLimiteProche, MAINTENANT)).not.toThrow();
    expect(genererJalonsParDefaut(dateLimiteProche, MAINTENANT).length).toBe(5);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/retroplanning.test.ts`
Expected: FAIL — `Cannot find module './retroplanning'` (le fichier n'existe pas encore).

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/appels-offres/retroplanning.ts` :

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

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/retroplanning.test.ts`
Expected: PASS, 4/4 tests verts.

- [ ] **Step 5: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/retroplanning.ts lib/appels-offres/retroplanning.test.ts
git commit -m "feat: genererJalonsParDefaut (TDD)"
```

---

### Task 3: Lecture et génération

**Files:**
- Modify: `lib/appels-offres/queries.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `JalonRetroplanning` depuis `./types` (Task 1) ; `genererJalonsParDefaut` depuis `./retroplanning` (Task 2).
- Produces: `listerJalonsRetroplanning(appelOffresId: string): Promise<JalonRetroplanning[]>`, `genererJalonsRetroplanning(appelOffresId: string): Promise<{ erreur: string } | { succes: true; jalons: JalonRetroplanning[] }>` — consommés par la Task 5 (`page.tsx` et le composant UI).

- [ ] **Step 1: Ajouter `listerJalonsRetroplanning` à `lib/appels-offres/queries.ts`**

L'import de types actuel :

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

- [ ] **Step 2: Ajouter `genererJalonsRetroplanning` à `lib/appels-offres/actions.ts`**

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

Ajouter un nouvel import, à côté de
`import { listerAppelsOffres, obtenirAppelOffres } from "./queries";` :

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
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts (les 4 tests de la Task 2 + tous les tests existants, aucune régression). Aucun nouveau test dans cette tâche — pas de test sur les fonctions Supabase, cohérent avec le reste du projet.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/queries.ts lib/appels-offres/actions.ts
git commit -m "feat: listerJalonsRetroplanning + genererJalonsRetroplanning"
```

---

### Task 4: Gestion manuelle des jalons (ajout, bascule, suppression)

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `JalonRetroplanning` depuis `./types` (Task 1).
- Produces: `creerJalonSchema` (Zod), `creerJalon(appelOffresId: string, input: { libelle: string; dateCible: string }): Promise<{ erreur: string } | { succes: true; jalon: JalonRetroplanning }>`, `basculerJalonCoche(appelOffresId: string, jalonId: string, coche: boolean): Promise<{ erreur: string } | { succes: true }>`, `supprimerJalon(appelOffresId: string, jalonId: string): Promise<{ erreur: string } | { succes: true }>` — consommés par la Task 5 (composant UI).

- [ ] **Step 1: Ajouter `creerJalonSchema` à `lib/appels-offres/schema.ts`**

Ajouter à la fin du fichier :

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

- [ ] **Step 2: Ajouter `creerJalon`, `basculerJalonCoche`, `supprimerJalon` à `lib/appels-offres/actions.ts`**

L'import du schéma actuel (après le Step 2 de la Task 3, il contient
déjà `mettreAJourEvaluationGoNoGoSchema`) :

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

Puis ajouter à la fin du fichier :

```ts
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

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que les tests passent toujours**

Run: `npx vitest run`
Expected: tous les tests verts, aucune régression. Aucun nouveau test dans cette tâche.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/actions.ts
git commit -m "feat: creerJalon + basculerJalonCoche + supprimerJalon"
```

---

### Task 5: Interface — rétroplanning sur la page détail AO

**Files:**
- Create: `app/(app)/appels-offres/[id]/retroplanning.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `genererJalonsRetroplanning`, `creerJalon`, `basculerJalonCoche`, `supprimerJalon` (Tasks 3-4) ; `listerJalonsRetroplanning` (Task 3) ; `JalonRetroplanning` (Task 1).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"goNoGo"` actuel se termine, suivi de `"exigences"` :

```json
        "notePlaceholder": "Note (optionnel)",
        "boutonEnregistrer": "Enregistrer",
        "envoiEnCours": "Enregistrement...",
        "toastEnregistre": "Évaluation enregistrée"
      },
      "exigences": {
```

Remplacer par (ajout du bloc `retroplanning` entre les deux) :

```json
        "notePlaceholder": "Note (optionnel)",
        "boutonEnregistrer": "Enregistrer",
        "envoiEnCours": "Enregistrement...",
        "toastEnregistre": "Évaluation enregistrée"
      },
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
      "exigences": {
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Le bloc `"goNoGo"` actuel se termine :

```json
        "notePlaceholder": "Note (optional)",
        "boutonEnregistrer": "Save",
        "envoiEnCours": "Saving...",
        "toastEnregistre": "Evaluation saved"
      },
      "exigences": {
```

Remplacer par :

```json
        "notePlaceholder": "Note (optional)",
        "boutonEnregistrer": "Save",
        "envoiEnCours": "Saving...",
        "toastEnregistre": "Evaluation saved"
      },
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
      "exigences": {
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/appels-offres/[id]/retroplanning.tsx`**

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

- [ ] **Step 5: Modifier `app/(app)/appels-offres/[id]/page.tsx`**

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

Le rendu de `<AppelOffresDetail>` actuel :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
        emailsLies={emailsLies}
        suggestions={suggestions}
        dossierReponseId={resultat.dossierReponse.id}
        checklistAutomatique={checklistAutomatique}
        checklistManuelle={checklistManuelle}
        evaluationGoNoGo={evaluationGoNoGo}
      />
```

devient :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
        emailsLies={emailsLies}
        suggestions={suggestions}
        dossierReponseId={resultat.dossierReponse.id}
        checklistAutomatique={checklistAutomatique}
        checklistManuelle={checklistManuelle}
        evaluationGoNoGo={evaluationGoNoGo}
        jalons={jalons}
        dateLimiteConnue={resultat.appelOffres.date_limite !== null}
      />
```

- [ ] **Step 6: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

L'import de types actuel :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
} from "@/lib/appels-offres/types";
```

devient :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
} from "@/lib/appels-offres/types";
```

Après l'import de `GoNoGo` (fin du bloc d'imports) :

```tsx
import { GoNoGo } from "./go-no-go";
```

ajouter :

```tsx
import { GoNoGo } from "./go-no-go";
import { Retroplanning } from "./retroplanning";
```

La signature du composant actuelle :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  suggestions,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle,
  evaluationGoNoGo,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
  evaluationGoNoGo: EvaluationGoNoGo;
}) {
```

devient :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  suggestions,
  dossierReponseId,
  checklistAutomatique,
  checklistManuelle,
  evaluationGoNoGo,
  jalons,
  dateLimiteConnue,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
  dossierReponseId: string;
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
  evaluationGoNoGo: EvaluationGoNoGo;
  jalons: JalonRetroplanning[];
  dateLimiteConnue: boolean;
}) {
```

Le bloc actuel :

```tsx
      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      {pret && (
```

devient (insertion du rétroplanning entre le panneau Go/No-Go et le
bloc conditionnel `pret`, donc visible même pendant le traitement du
DAO) :

```tsx
      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      <Retroplanning
        appelOffresId={appelOffres.id}
        dateLimiteConnue={dateLimiteConnue}
        jalonsInitiaux={jalons}
      />

      {pret && (
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`
Expected: tous les tests passent (les 4 tests de la Task 2 + tous les tests existants, aucune régression).

- [ ] **Step 9: Vérifier le build de production**

Run: `npx next build`
Expected: build réussi, aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/appels-offres/[id]/retroplanning.tsx" "app/(app)/appels-offres/[id]/page.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" messages/fr.json messages/en.json
git commit -m "feat: interface rétroplanning de Bid Management"
```

---

## Self-Review Notes

- **Couverture du spec** : modèle de données + type (Task 1), génération
  proportionnelle en TDD (Task 2), lecture + génération (Task 3), CRUD
  manuel — ajout/bascule/suppression (Task 4), interface + i18n
  (Task 5) — chaque section du spec a une tâche correspondante.
- **Cohérence des types** : `JalonRetroplanning` défini une seule fois
  (Task 1), réutilisé sans redéfinition dans `queries.ts`/`actions.ts`
  (Tasks 3-4) et `retroplanning.tsx`/`appel-offres-detail.tsx` (Task 5).
  `JalonGenere`/`genererJalonsParDefaut` définis une seule fois
  (Task 2), consommés tels quels par `genererJalonsRetroplanning`
  (Task 3) — signature à 2 paramètres (`dateLimite`, `maintenant?`)
  respectée au site d'appel (`genererJalonsParDefaut(new
  Date(appelOffres.date_limite))`, `maintenant` omis → `new Date()` par
  défaut, cohérent avec l'intention : générer par rapport à
  l'instant réel de la requête).
- **Task 3 et Task 4 sont découpées différemment de la checklist et du
  Go/No-Go** : ce module a un vrai CRUD de liste (5 actions au total
  contre 1 pour les deux sous-projets précédents), d'où un
  découpage en deux tâches d'actions (lecture+génération, puis
  ajout/bascule/suppression) plutôt qu'une seule — chaque tâche reste
  de taille comparable aux tâches d'action des sous-projets précédents.
- **Aucun placeholder** : chaque étape contient le code exact à écrire
  ou le texte exact à remplacer, y compris les 4 tests complets de la
  Task 2 avec leurs dates calculées à la main et vérifiées
  arithmétiquement (30 jours × 10 %/40 %/65 %/85 % = 3/12/19,5/25,5
  jours après le point de départ, plus le dépôt fixé à `date_limite`
  moins 1 jour).
- **Vérification manuelle en conditions réelles** : ce plan est
  entièrement testable une fois la migration appliquée (par le
  contrôleur, hors de ce plan) sur un AO déjà traité par NoubinAO, avec
  une date limite renseignée — à faire une fois les 5 tâches exécutées,
  avant de proposer le merge.
