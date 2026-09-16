# BPU détaillé (bordereau des prix unitaires)

Date : 2026-09-16
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Quatrième des cinq lacunes identifiées en comparant NoubinAO à un guide de
référence générique sur la réponse aux appels d'offres (checklist finale
de soumission, matrice Go/No-Go et rétroplanning déjà livrés). L'ebook
décrit la construction du prix de vente comme une pyramide : Déboursé Sec
(main-d'œuvre directe + fournitures + matériel) + Frais d'Études et de
Structure = Coût de Revient Total, puis + Marge Bénéficiaire & Provision
pour Risques = Prix de Vente HT. NoubinAO n'a aujourd'hui aucun objet pour
l'offre financière elle-même.

Le chiffrage complet (bordereau détaillé **et** pyramide de coût par
ligne) s'est avéré trop large pour un seul sous-projet — proche d'un
mini-ERP de chiffrage plutôt que d'un accélérateur de dossier. Décision
prise avec l'utilisateur : garder l'ambition complète mais la découper en
deux sous-projets séquentiels :

- **Sous-projet A (ce document)** — le bordereau lui-même : sections,
  lignes, quantités, prix unitaires, montants, totaux. Valeur immédiate
  même seul : un BPU structuré par AO, ce qui manque aujourd'hui
  entièrement.
- **Sous-projet B (futur, brainstorming séparé)** — la pyramide de coût
  par ligne (déboursé sec / frais de structure / marge) qui détermine ou
  justifie le prix unitaire de chaque ligne du bordereau. Dépend de A :
  les lignes doivent exister avant d'avoir une décomposition de coût.

## Décisions validées avec l'utilisateur

- **Saisie manuelle des lignes, pas d'extraction automatique depuis le
  DAO.** Les deux cas réels existent (bordereau imposé par le DAO à
  compléter, ou bordereau construit par l'entreprise) — ce sous-projet
  couvre les deux via une saisie libre. L'extraction automatique d'un
  bordereau depuis le `dao_markdown` resterait un sous-projet distinct,
  hors périmètre ici.
- **Regroupement par section/lot dès le départ.** Chaque ligne appartient
  à une section nommée (ex. « Lot 1 — Terrassement »), avec un total par
  section et un total général — plus proche de la réalité des DAO
  BTP/ingénierie qu'une liste plate, choisi explicitement par l'utilisateur
  au lieu de l'option plus simple (liste plate sans section).
- **Champ code/référence article optionnel**, en plus de désignation/
  unité/quantité/prix unitaire — utile quand le DAO impose une
  numérotation de poste (ex. « 1.1.3 ») distincte de l'ordre d'affichage.
- **Prix unitaire optionnel à la création d'une ligne.** Désignation/
  unité/quantité obligatoires, prix unitaire nullable — cohérent avec le
  flux réel (structurer le bordereau depuis le DAO d'abord, chiffrer
  ensuite). Totaux et montant de ligne ignorent les lignes non chiffrées ;
  un indicateur affiche leur nombre.
- **Onglet dédié sur la page de détail AO.** La page passe à 2 onglets :
  « Vue d'ensemble » (tout l'existant — formulaire, Go/No-Go,
  rétroplanning, exigences, fil de suivi, rédaction, checklist —
  regroupé tel quel, inchangé) et « BPU » (nouveau). Changement minimal :
  pas de refonte complète en un onglet par section, qui toucherait et
  re-testerait tout ce qui a déjà été livré — hors périmètre de ce
  sous-projet.
- **Réordonnancement par boutons monter/descendre**, pour les sections et
  pour les lignes — pas de glisser-déposer (composant supplémentaire,
  accessibilité clavier plus complexe pour un gain marginal ici).
- **Jamais bloquant**, comme tous les sous-projets précédents du Module 7 :
  le BPU est disponible dès l'ouverture de la page, sans dépendre du
  traitement du DAO (`statut_traitement === "termine"`) — cohérent avec
  Go/No-Go et rétroplanning, qui ne dépendent pas non plus de
  l'extraction.

## Modèle de données

```sql
-- BPU détaillé (Module 7, sous-projet 4a). Bordereau des prix unitaires
-- organisé en sections (lots), chacune avec ses lignes chiffrées. CRUD
-- complet comme jalon_retroplanning (contrairement à evaluation_go_no_go,
-- 1:1, et à checklist_item_dossier, insert/delete seul) : ajout,
-- modification, réordonnancement et suppression de sections et de lignes.
create table section_bpu (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  titre text not null,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index section_bpu_appel_offres_id_idx on section_bpu(appel_offres_id);

create table ligne_bpu (
  id uuid primary key default gen_random_uuid(),
  section_bpu_id uuid not null references section_bpu(id) on delete cascade,
  code_article text,
  designation text not null,
  unite text not null,
  quantite numeric not null,
  -- Nullable : une ligne peut être structurée avant d'être chiffrée (le
  -- bordereau peut provenir du DAO avec désignation/unité/quantité déjà
  -- fixées, prix à déterminer ensuite) — voir décisions validées.
  prix_unitaire numeric,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ligne_bpu_section_bpu_id_idx on ligne_bpu(section_bpu_id);

alter table section_bpu enable row level security;
alter table ligne_bpu enable row level security;

create policy "section_bpu_select_membres" on section_bpu
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "section_bpu_insert_membres" on section_bpu
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, comme
-- jalon_retroplanning_update_membres : n'importe quel membre doit pouvoir
-- renommer/réordonner une section créée par un collègue.
create policy "section_bpu_update_membres" on section_bpu
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "section_bpu_delete_membres" on section_bpu
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_select_membres" on ligne_bpu
  for select using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_insert_membres" on ligne_bpu
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, même
-- raisonnement que section_bpu_update_membres : n'importe quel membre
-- doit pouvoir corriger le prix saisi par un collègue.
create policy "ligne_bpu_update_membres" on ligne_bpu
  for update
  using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_delete_membres" on ligne_bpu
  for delete using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );
```

`ligne_bpu.section_bpu_id` a `on delete cascade` : supprimer une section
supprime automatiquement ses lignes, pas de suppression manuelle en deux
temps côté application.

Nouveaux types dans `lib/appels-offres/types.ts` (ajouter à la fin du
fichier) :

```ts
export interface SectionBpu {
  id: string;
  appel_offres_id: string;
  titre: string;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

export interface LigneBpu {
  id: string;
  section_bpu_id: string;
  code_article: string | null;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}
```

## Calculs (fonctions pures)

Nouveau fichier `lib/appels-offres/bpu.ts` :

```ts
import type { LigneBpu } from "./types";

type LigneAvecMontant = Pick<LigneBpu, "quantite" | "prix_unitaire">;

export function calculerMontantLigne(ligne: LigneAvecMontant): number | null {
  if (ligne.prix_unitaire === null) return null;
  return ligne.quantite * ligne.prix_unitaire;
}

export function sommerMontants(lignes: LigneAvecMontant[]): number {
  return lignes.reduce((total, ligne) => {
    const montant = calculerMontantLigne(ligne);
    return montant === null ? total : total + montant;
  }, 0);
}

export function compterLignesNonChiffrees(lignes: LigneAvecMontant[]): number {
  return lignes.filter((ligne) => ligne.prix_unitaire === null).length;
}
```

`sommerMontants` sert à la fois pour le total d'une section (appelé avec
les lignes de cette section) et pour le total général (appelé avec
toutes les lignes de l'AO à plat) — pas de fonction séparée, la même
logique s'applique aux deux niveaux.

Point d'attention explicite pour l'implémentation et la revue : un
`prix_unitaire` de `0` est un prix valide (prestation à titre gracieux,
compris dans un forfait, etc.), pas une absence de prix — seule la
valeur `null` compte comme « non chiffrée ». `0` est falsy en JavaScript
mais `ligne.prix_unitaire === null` teste l'égalité stricte, pas la
véracité, donc ce cas est déjà géré correctement par le code ci-dessus.

## Lecture

Dans `lib/appels-offres/queries.ts`, l'import de types actuel :

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

devient :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  SectionBpu,
  SectionDossier,
} from "./types";
```

Puis ajouter à la fin du fichier :

```ts
export async function listerBpu(appelOffresId: string): Promise<{
  sections: SectionBpu[];
  lignesParSection: Record<string, LigneBpu[]>;
}> {
  const supabase = await createClient();

  const { data: sections, error: erreurSections } = await supabase
    .from("section_bpu")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurSections) throw erreurSections;

  const sectionsTypees = (sections ?? []) as SectionBpu[];
  const lignesParSection: Record<string, LigneBpu[]> = {};

  for (const section of sectionsTypees) {
    lignesParSection[section.id] = [];
  }

  if (sectionsTypees.length > 0) {
    const { data: lignes, error: erreurLignes } = await supabase
      .from("ligne_bpu")
      .select("*")
      .in(
        "section_bpu_id",
        sectionsTypees.map((s) => s.id),
      )
      .order("ordre", { ascending: true });

    if (erreurLignes) throw erreurLignes;

    for (const ligne of (lignes ?? []) as LigneBpu[]) {
      lignesParSection[ligne.section_bpu_id].push(ligne);
    }
  }

  return { sections: sectionsTypees, lignesParSection };
}
```

Même structure de regroupement par id parent que
`documentsParExigence`/`documentsParSection` déjà dans ce fichier.

## Validation (Zod)

Dans `lib/appels-offres/schema.ts`, ajouter à la fin du fichier :

```ts
export const creerSectionBpuSchema = z.object({
  titre: z
    .string()
    .trim()
    .min(1, "Le titre est requis")
    .max(200, "Titre trop long (200 caractères maximum)"),
});

// Réutilisé pour la création ET la modification d'une ligne (même forme
// de saisie dans les deux cas — voir Server Actions).
export const ligneBpuSchema = z.object({
  codeArticle: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 50, {
      message: "Code article trop long (50 caractères maximum)",
    }),
  designation: z
    .string()
    .trim()
    .min(1, "La désignation est requise")
    .max(500, "Désignation trop longue (500 caractères maximum)"),
  unite: z
    .string()
    .trim()
    .min(1, "L'unité est requise")
    .max(20, "Unité trop longue (20 caractères maximum)"),
  // Même garde-fou que montantCaution (modifierAppelOffresSchema) contre
  // les négatifs et la notation scientifique : vérifier le format de la
  // chaîne source avant conversion, pas seulement Number.isFinite après.
  quantite: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Quantité invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "La quantité doit être positive",
    }),
  prixUnitaire: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Prix unitaire invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Prix unitaire invalide",
    }),
});

export type LigneBpuInput = z.infer<typeof ligneBpuSchema>;
```

## Server Actions

Dans `lib/appels-offres/actions.ts`, l'import du schéma actuel :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
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
  creerSectionBpuSchema,
  ligneBpuSchema,
} from "./schema";
```

L'import de types actuel :

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

devient :

```ts
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
  LigneBpu,
  SectionBpu,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
```

Puis ajouter à la fin du fichier :

```ts
export async function creerSectionBpu(
  appelOffresId: string,
  titre: string,
): Promise<{ erreur: string } | { succes: true; section: SectionBpu }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerSectionBpuSchema.safeParse({ titre });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Titre invalide" };
  }

  const supabase = await createClient();

  const { data: derniereSection } = await supabase
    .from("section_bpu")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereSection ? derniereSection.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("section_bpu")
    .insert({
      appel_offres_id: appelOffresId,
      titre: parsed.data.titre,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de la création de la section. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, section: data as SectionBpu };
}

export async function renommerSectionBpu(
  appelOffresId: string,
  sectionId: string,
  titre: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerSectionBpuSchema.safeParse({ titre });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Titre invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_bpu")
    .update({ titre: parsed.data.titre })
    .eq("id", sectionId)
    .select("id");

  if (error) return { erreur: "Échec du renommage. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Section introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Permutation de l'ordre avec la section voisine (précédente si
// sens === "haut", suivante si "bas"). Deux UPDATE séquentiels, pas une
// transaction atomique — limitation mineure acceptée, voir États et
// erreurs (même categorie de compromis que l'absence de garde anti
// double-génération dans le rétroplanning).
export async function deplacerSectionBpu(
  appelOffresId: string,
  sectionId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: sections, error: erreurLecture } = await supabase
    .from("section_bpu")
    .select("id, ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !sections) return { erreur: "Échec du déplacement. Réessayez." };

  const index = sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return { erreur: "Section introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= sections.length) {
    return { succes: true as const };
  }

  const section = sections[index];
  const voisine = sections[indexVoisin];

  const { error: erreurA } = await supabase
    .from("section_bpu")
    .update({ ordre: voisine.ordre })
    .eq("id", section.id);

  const { error: erreurB } = await supabase
    .from("section_bpu")
    .update({ ordre: section.ordre })
    .eq("id", voisine.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerSectionBpu(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_bpu")
    .delete()
    .eq("id", sectionId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Section introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function creerLigneBpu(
  appelOffresId: string,
  sectionId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
  },
): Promise<{ erreur: string } | { succes: true; ligne: LigneBpu }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneBpuSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: derniereLigne } = await supabase
    .from("ligne_bpu")
    .select("ordre")
    .eq("section_bpu_id", sectionId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereLigne ? derniereLigne.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("ligne_bpu")
    .insert({
      section_bpu_id: sectionId,
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de la ligne. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, ligne: data as LigneBpu };
}

export async function modifierLigneBpu(
  appelOffresId: string,
  ligneId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneBpuSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ligne_bpu")
    .update({
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
    })
    .eq("id", ligneId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Ligne introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même mécanique de permutation que deplacerSectionBpu, scopée à la
// section (les lignes ne se déplacent jamais d'une section à l'autre
// dans ce sous-projet).
export async function deplacerLigneBpu(
  appelOffresId: string,
  sectionId: string,
  ligneId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: lignes, error: erreurLecture } = await supabase
    .from("ligne_bpu")
    .select("id, ordre")
    .eq("section_bpu_id", sectionId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !lignes) return { erreur: "Échec du déplacement. Réessayez." };

  const index = lignes.findIndex((l) => l.id === ligneId);
  if (index === -1) return { erreur: "Ligne introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= lignes.length) {
    return { succes: true as const };
  }

  const ligne = lignes[index];
  const voisine = lignes[indexVoisin];

  const { error: erreurA } = await supabase
    .from("ligne_bpu")
    .update({ ordre: voisine.ordre })
    .eq("id", ligne.id);

  const { error: erreurB } = await supabase
    .from("ligne_bpu")
    .update({ ordre: ligne.ordre })
    .eq("id", voisine.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerLigneBpu(
  appelOffresId: string,
  ligneId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ligne_bpu")
    .delete()
    .eq("id", ligneId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Ligne introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

`creerSectionBpu` et `creerLigneBpu` renvoient la ligne créée
(`section`/`ligne`) plutôt qu'un simple `{succes: true}` — même raison
que `genererJalonsRetroplanning`/`creerJalon` : le composant client ne
peut pas connaître à l'avance l'`id` généré par Postgres, donc il ne peut
pas l'ajouter de façon optimiste à son état local sans le recevoir en
retour.

## Intégration dans `page.tsx`

L'import actuel :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
} from "@/lib/appels-offres/queries";
```

devient :

```tsx
import {
  obtenirAppelOffres,
  listerChecklistManuelle,
  obtenirEvaluationGoNoGo,
  listerJalonsRetroplanning,
  listerBpu,
} from "@/lib/appels-offres/queries";
```

Le chargement des données actuel :

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

devient :

```tsx
  const [bibliotheque, emailsLies, suggestions, checklistManuelle, evaluationGoNoGo, jalons, bpu] =
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
      listerBpu(id),
    ]);
```

Le rendu de `<AppelOffresDetail>` gagne une prop `bpu={bpu}`.

## Interface

### Restructuration en onglets de `appel-offres-detail.tsx`

Import à ajouter :

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bpu } from "./bpu";
```

Type à ajouter dans les imports de types (étendre la ligne existante) :

```tsx
import type {
  AppelOffres,
  CleChecklistManuelle,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  SectionBpu,
} from "@/lib/appels-offres/types";
```

Props du composant : ajouter
`bpu: { sections: SectionBpu[]; lignesParSection: Record<string, LigneBpu[]> };`
au type et à la déstructuration.

Le bloc actuel (tout entre la fin du `!pret` conditionnel et la fin du
composant) :

```tsx
      <form action={onSubmit} className="flex flex-col gap-4">
        {/* ... */}
      </form>

      <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

      <Retroplanning
        appelOffresId={appelOffres.id}
        dateLimiteConnue={dateLimiteConnue}
        jalonsInitiaux={jalons}
      />

      {pret && (
        <>
          {/* sommaire, pièces requises, critères, fil de suivi, rédaction, checklist, export */}
        </>
      )}
    </div>
  );
}
```

devient (le contenu interne de `<form>` et du bloc `{pret && (...)}` ne
change pas, seule leur enveloppe change) :

```tsx
      <Tabs defaultValue="vue-ensemble">
        <TabsList>
          <TabsTrigger value="vue-ensemble">{t("onglets.vueEnsemble")}</TabsTrigger>
          <TabsTrigger value="bpu">{t("onglets.bpu")}</TabsTrigger>
        </TabsList>

        <TabsContent value="vue-ensemble" className="flex flex-col gap-6">
          <form action={onSubmit} className="flex flex-col gap-4">
            {/* ... inchangé ... */}
          </form>

          <GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />

          <Retroplanning
            appelOffresId={appelOffres.id}
            dateLimiteConnue={dateLimiteConnue}
            jalonsInitiaux={jalons}
          />

          {pret && (
            <>
              {/* ... inchangé ... */}
            </>
          )}
        </TabsContent>

        <TabsContent value="bpu">
          <Bpu
            appelOffresId={appelOffres.id}
            sectionsInitiales={bpu.sections}
            lignesParSectionInitiales={bpu.lignesParSection}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Le bandeau de statut (`StatutTraitementBadge` + bouton télécharger) et le
message `{!pret && (...)}` restent au-dessus des `Tabs`, inchangés :
pertinents quel que soit l'onglet actif.

### `lib/appels-offres/bpu.ts` reste le fichier des fonctions pures

(voir section Calculs ci-dessus) — les composants ci-dessous l'importent,
ne recalculent rien eux-mêmes.

### Nouveau composant `app/(app)/appels-offres/[id]/bpu.tsx`

Composant client orchestrateur : gère la liste des sections et la carte
`lignesParSection`, calcule le total général, délègue l'édition de
chaque section à `BpuSection`.

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { creerSectionBpu } from "@/lib/appels-offres/actions";
import { sommerMontants, compterLignesNonChiffrees } from "@/lib/appels-offres/bpu";
import type { SectionBpu, LigneBpu } from "@/lib/appels-offres/types";
import { BpuSection } from "./bpu-section";

export function Bpu({
  appelOffresId,
  sectionsInitiales,
  lignesParSectionInitiales,
}: {
  appelOffresId: string;
  sectionsInitiales: SectionBpu[];
  lignesParSectionInitiales: Record<string, LigneBpu[]>;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [sections, setSections] = useState(sectionsInitiales);
  const [lignesParSection, setLignesParSection] = useState(lignesParSectionInitiales);
  const [nouveauTitre, setNouveauTitre] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const toutesLesLignes = sections.flatMap((s) => lignesParSection[s.id] ?? []);
  const totalGeneral = sommerMontants(toutesLesLignes);
  const nonChiffrees = compterLignesNonChiffrees(toutesLesLignes);

  async function ajouterSection() {
    if (nouveauTitre.trim().length === 0) return;

    setAjoutEnCours(true);
    const resultat = await creerSectionBpu(appelOffresId, nouveauTitre);
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSections((liste) => [...liste, resultat.section]);
    setLignesParSection((carte) => ({ ...carte, [resultat.section.id]: [] }));
    setNouveauTitre("");
    toast.success(t("toastSectionAjoutee"));
  }

  function retirerSection(sectionId: string) {
    setSections((liste) => liste.filter((s) => s.id !== sectionId));
    setLignesParSection((carte) => {
      const copie = { ...carte };
      delete copie[sectionId];
      return copie;
    });
  }

  const sectionsTriees = sections.slice().sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <div className="text-right text-sm">
          <p className="font-semibold">
            {t("totalGeneral")} : {totalGeneral.toLocaleString("fr-FR")} FCFA
          </p>
          {nonChiffrees > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("lignesNonChiffrees", { count: nonChiffrees })}
            </p>
          )}
        </div>
      </div>

      {sectionsTriees.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("aucuneSection")}</p>
      )}

      {sectionsTriees.map((section, index) => (
        <BpuSection
          key={section.id}
          appelOffresId={appelOffresId}
          section={section}
          lignes={(lignesParSection[section.id] ?? []).slice().sort((a, b) => a.ordre - b.ordre)}
          estPremiere={index === 0}
          estDerniere={index === sectionsTriees.length - 1}
          onSectionModifiee={(sectionModifiee) =>
            setSections((liste) =>
              liste.map((s) => (s.id === sectionModifiee.id ? sectionModifiee : s)),
            )
          }
          onSectionSupprimee={retirerSection}
          onLignesModifiees={(sectionId, updater) =>
            setLignesParSection((carte) => ({
              ...carte,
              [sectionId]: updater(carte[sectionId] ?? []),
            }))
          }
        />
      ))}

      <div className="flex items-end gap-2">
        <Input
          value={nouveauTitre}
          onChange={(e) => setNouveauTitre(e.target.value)}
          placeholder={t("titreSectionPlaceholder")}
        />
        <Button type="button" variant="outline" onClick={ajouterSection} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterSection")}
        </Button>
      </div>
    </div>
  );
}
```

Note sur `onLignesModifiees` : le callback reçoit un **updater
fonctionnel** (`(lignesCourantes: LigneBpu[]) => LigneBpu[]`), jamais un
tableau déjà calculé — application directe de la leçon du Module 7 (voir
mémoire `noubinao_functional_state_updates`) : toute écriture d'état
après un appel serveur doit dériver du state courant au moment où elle
s'applique, jamais d'une valeur capturée plus tôt dans le rendu. C'est
`BpuSection`/`BpuLigneRow` qui construisent cet updater (voir ci-dessous),
`Bpu` se contente de l'appliquer à `lignesParSection`.

### Nouveau composant `app/(app)/appels-offres/[id]/bpu-section.tsx`

Une section : titre éditable, boutons monter/descendre/supprimer, tableau
de ses lignes, total de section, formulaire d'ajout de ligne.

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { toast } from "sonner";
import {
  renommerSectionBpu,
  deplacerSectionBpu,
  supprimerSectionBpu,
  creerLigneBpu,
} from "@/lib/appels-offres/actions";
import { sommerMontants } from "@/lib/appels-offres/bpu";
import type { SectionBpu, LigneBpu } from "@/lib/appels-offres/types";
import { BpuLigneRow } from "./bpu-ligne-row";

export function BpuSection({
  appelOffresId,
  section,
  lignes,
  estPremiere,
  estDerniere,
  onSectionModifiee,
  onSectionSupprimee,
  onLignesModifiees,
}: {
  appelOffresId: string;
  section: SectionBpu;
  lignes: LigneBpu[];
  estPremiere: boolean;
  estDerniere: boolean;
  onSectionModifiee: (section: SectionBpu) => void;
  onSectionSupprimee: (sectionId: string) => void;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [titre, setTitre] = useState(section.titre);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [nouvelleLigne, setNouvelleLigne] = useState({
    codeArticle: "",
    designation: "",
    unite: "",
    quantite: "",
    prixUnitaire: "",
  });

  const totalSection = sommerMontants(lignes);

  async function renommer() {
    const titreTaille = titre.trim();
    if (titreTaille.length === 0 || titreTaille === section.titre) {
      setTitre(section.titre);
      return;
    }

    const resultat = await renommerSectionBpu(appelOffresId, section.id, titre);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      setTitre(section.titre);
      return;
    }
    onSectionModifiee({ ...section, titre: titreTaille });
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerSectionBpu(appelOffresId, section.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    // Le nouvel ordre exact résulte d'une permutation calculée côté
    // serveur avec la section voisine — pas déductible ici sans le
    // relire. Rechargement plutôt qu'un ordre local approximatif : seule
    // action de ce sous-projet qui ne fait pas de mise à jour
    // optimiste, voir États et erreurs.
    window.location.reload();
  }

  async function supprimer() {
    const resultat = await supprimerSectionBpu(appelOffresId, section.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onSectionSupprimee(section.id);
    toast.success(t("toastSectionSupprimee"));
  }

  async function ajouterLigne() {
    if (
      nouvelleLigne.designation.trim().length === 0 ||
      nouvelleLigne.unite.trim().length === 0 ||
      nouvelleLigne.quantite.trim().length === 0
    ) {
      return;
    }

    setAjoutEnCours(true);
    const resultat = await creerLigneBpu(appelOffresId, section.id, {
      codeArticle: nouvelleLigne.codeArticle.trim().length > 0 ? nouvelleLigne.codeArticle : null,
      designation: nouvelleLigne.designation,
      unite: nouvelleLigne.unite,
      quantite: nouvelleLigne.quantite,
      prixUnitaire:
        nouvelleLigne.prixUnitaire.trim().length > 0 ? nouvelleLigne.prixUnitaire : null,
    });
    setAjoutEnCours(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLignesModifiees(section.id, (lignesCourantes) => [...lignesCourantes, resultat.ligne]);
    setNouvelleLigne({ codeArticle: "", designation: "", unite: "", quantite: "", prixUnitaire: "" });
    toast.success(t("toastLigneAjoutee"));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onBlur={renommer}
          className="font-medium"
          aria-label={t("champTitreSection")}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deplacer("haut")}
          disabled={estPremiere}
          aria-label={t("deplacerHaut")}
        >
          {t("fleche.haut")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => deplacer("bas")}
          disabled={estDerniere}
          aria-label={t("deplacerBas")}
        >
          {t("fleche.bas")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
          {t("supprimerSection")}
        </Button>
      </div>

      {lignes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colonneCode")}</TableHead>
              <TableHead>{t("colonneDesignation")}</TableHead>
              <TableHead>{t("colonneUnite")}</TableHead>
              <TableHead>{t("colonneQuantite")}</TableHead>
              <TableHead>{t("colonnePrixUnitaire")}</TableHead>
              <TableHead>{t("colonneMontant")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne, index) => (
              <BpuLigneRow
                key={ligne.id}
                appelOffresId={appelOffresId}
                sectionId={section.id}
                ligne={ligne}
                estPremiere={index === 0}
                estDerniere={index === lignes.length - 1}
                onLignesModifiees={onLignesModifiees}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-right text-sm font-medium">
        {t("totalSection")} : {totalSection.toLocaleString("fr-FR")} FCFA
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          placeholder={t("colonneCode")}
          value={nouvelleLigne.codeArticle}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, codeArticle: e.target.value }))}
          className="w-20"
        />
        <Input
          placeholder={t("colonneDesignation")}
          value={nouvelleLigne.designation}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, designation: e.target.value }))}
        />
        <Input
          placeholder={t("colonneUnite")}
          value={nouvelleLigne.unite}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, unite: e.target.value }))}
          className="w-20"
        />
        <Input
          type="number"
          placeholder={t("colonneQuantite")}
          value={nouvelleLigne.quantite}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, quantite: e.target.value }))}
          className="w-24"
        />
        <Input
          type="number"
          placeholder={t("colonnePrixUnitaire")}
          value={nouvelleLigne.prixUnitaire}
          onChange={(e) => setNouvelleLigne((v) => ({ ...v, prixUnitaire: e.target.value }))}
          className="w-28"
        />
        <Button type="button" variant="outline" onClick={ajouterLigne} disabled={ajoutEnCours}>
          {ajoutEnCours ? t("ajoutEnCours") : t("boutonAjouterLigne")}
        </Button>
      </div>
    </div>
  );
}
```

### Nouveau composant `app/(app)/appels-offres/[id]/bpu-ligne-row.tsx`

Une ligne : champs éditables en ligne (sauvegarde à la perte de focus),
montant calculé, boutons monter/descendre/supprimer.

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne } from "@/lib/appels-offres/bpu";
import type { LigneBpu } from "@/lib/appels-offres/types";

export function BpuLigneRow({
  appelOffresId,
  sectionId,
  ligne,
  estPremiere,
  estDerniere,
  onLignesModifiees,
}: {
  appelOffresId: string;
  sectionId: string;
  ligne: LigneBpu;
  estPremiere: boolean;
  estDerniere: boolean;
  onLignesModifiees: (
    sectionId: string,
    updater: (lignesCourantes: LigneBpu[]) => LigneBpu[],
  ) => void;
}) {
  const t = useTranslations("AppelsOffres.detail.bpu");
  const [codeArticle, setCodeArticle] = useState(ligne.code_article ?? "");
  const [designation, setDesignation] = useState(ligne.designation);
  const [unite, setUnite] = useState(ligne.unite);
  const [quantite, setQuantite] = useState(String(ligne.quantite));
  const [prixUnitaire, setPrixUnitaire] = useState(
    ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire),
  );

  const montant = calculerMontantLigne(ligne);

  function reinitialiser() {
    setCodeArticle(ligne.code_article ?? "");
    setDesignation(ligne.designation);
    setUnite(ligne.unite);
    setQuantite(String(ligne.quantite));
    setPrixUnitaire(ligne.prix_unitaire === null ? "" : String(ligne.prix_unitaire));
  }

  async function enregistrer() {
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixUnitaire.trim().length > 0 ? prixUnitaire : null,
    };

    const resultat = await modifierLigneBpu(appelOffresId, ligne.id, input);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      reinitialiser();
      return;
    }

    onLignesModifiees(sectionId, (lignesCourantes) =>
      lignesCourantes.map((l) =>
        l.id === ligne.id
          ? {
              ...l,
              code_article: input.codeArticle,
              designation: input.designation,
              unite: input.unite,
              quantite: Number(input.quantite),
              prix_unitaire: input.prixUnitaire === null ? null : Number(input.prixUnitaire),
            }
          : l,
      ),
    );
  }

  async function deplacer(sens: "haut" | "bas") {
    const resultat = await deplacerLigneBpu(appelOffresId, sectionId, ligne.id, sens);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.location.reload();
  }

  async function supprimer() {
    const resultat = await supprimerLigneBpu(appelOffresId, ligne.id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    onLignesModifiees(sectionId, (lignesCourantes) =>
      lignesCourantes.filter((l) => l.id !== ligne.id),
    );
    toast.success(t("toastLigneSupprimee"));
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={codeArticle}
          onChange={(e) => setCodeArticle(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneCode")}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneDesignation")}
        />
      </TableCell>
      <TableCell>
        <Input
          value={unite}
          onChange={(e) => setUnite(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneUnite")}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonneQuantite")}
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={prixUnitaire}
          onChange={(e) => setPrixUnitaire(e.target.value)}
          onBlur={enregistrer}
          aria-label={t("colonnePrixUnitaire")}
          className="w-28"
        />
      </TableCell>
      <TableCell className="text-right">
        {montant === null ? t("nonChiffree") : `${montant.toLocaleString("fr-FR")} FCFA`}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("haut")}
            disabled={estPremiere}
            aria-label={t("deplacerHaut")}
          >
            {t("fleche.haut")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deplacer("bas")}
            disabled={estDerniere}
            aria-label={t("deplacerBas")}
          >
            {t("fleche.bas")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={supprimer}>
            {t("supprimer")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

Notes transverses aux trois composants :

- Aucun `disabled` sur les `Input` pendant une sauvegarde individuelle —
  seuls les boutons ponctuels d'ajout (`ajouterSection`, `ajouterLigne`)
  sont désactivés le temps de leur propre requête, cohérent avec la
  pratique déjà établie ailleurs dans ce module.
- Les flèches monter/descendre (`t("fleche.haut")`/`t("fleche.bas")`)
  passent par les traductions plutôt que des caractères Unicode codés en
  dur dans le JSX, pour rester cohérent avec le reste du fichier de
  traductions et permettre un futur remplacement par une icône Lucide
  sans toucher aux composants.
- `toLocaleString("fr-FR")` pour les montants, pas `useLocale()` — même
  choix que `pipeline-table.tsx:118` (`montant_caution`) déjà dans ce
  projet : le séparateur de milliers ne varie pas assez entre FR/EN pour
  justifier une locale dynamique, contrairement aux **dates**
  (`retroplanning.tsx`), où l'ordre jour/mois/année diffère réellement et
  justifie `useLocale()`.

### Traductions

Dans `messages/fr.json`, bloc `"AppelsOffres.detail"`, ajouter deux
nouvelles clés au niveau racine du bloc `"detail"` (avant `"form"`) :

```json
      "onglets": {
        "vueEnsemble": "Vue d'ensemble",
        "bpu": "BPU"
      },
```

Puis un nouveau namespace `"bpu"` juste après `"retroplanning"` et avant
`"exigences"` :

```json
      "bpu": {
        "titre": "Bordereau des prix unitaires",
        "totalGeneral": "Total général",
        "lignesNonChiffrees": "{count, plural, =0 {Toutes les lignes sont chiffrées} one {# ligne à chiffrer} other {# lignes à chiffrer}}",
        "aucuneSection": "Aucune section pour l'instant.",
        "titreSectionPlaceholder": "Titre de la section (ex. Lot 1 — Terrassement)",
        "champTitreSection": "Titre de la section",
        "boutonAjouterSection": "Ajouter une section",
        "ajoutEnCours": "Ajout...",
        "supprimerSection": "Supprimer la section",
        "toastSectionAjoutee": "Section ajoutée",
        "toastSectionSupprimee": "Section supprimée",
        "colonneCode": "Code",
        "colonneDesignation": "Désignation",
        "colonneUnite": "Unité",
        "colonneQuantite": "Quantité",
        "colonnePrixUnitaire": "Prix unitaire (FCFA)",
        "colonneMontant": "Montant",
        "nonChiffree": "—",
        "totalSection": "Total section",
        "boutonAjouterLigne": "Ajouter une ligne",
        "toastLigneAjoutee": "Ligne ajoutée",
        "toastLigneSupprimee": "Ligne supprimée",
        "supprimer": "Supprimer",
        "deplacerHaut": "Déplacer vers le haut",
        "deplacerBas": "Déplacer vers le bas",
        "fleche": {
          "haut": "↑",
          "bas": "↓"
        }
      },
```

Dans `messages/en.json`, mêmes clés à insérer aux mêmes emplacements :

```json
      "onglets": {
        "vueEnsemble": "Overview",
        "bpu": "BPU"
      },
```

```json
      "bpu": {
        "titre": "Bill of quantities",
        "totalGeneral": "Grand total",
        "lignesNonChiffrees": "{count, plural, =0 {All lines are priced} one {# line to price} other {# lines to price}}",
        "aucuneSection": "No sections yet.",
        "titreSectionPlaceholder": "Section title (e.g. Lot 1 — Earthworks)",
        "champTitreSection": "Section title",
        "boutonAjouterSection": "Add section",
        "ajoutEnCours": "Adding...",
        "supprimerSection": "Delete section",
        "toastSectionAjoutee": "Section added",
        "toastSectionSupprimee": "Section deleted",
        "colonneCode": "Code",
        "colonneDesignation": "Description",
        "colonneUnite": "Unit",
        "colonneQuantite": "Quantity",
        "colonnePrixUnitaire": "Unit price (FCFA)",
        "colonneMontant": "Amount",
        "nonChiffree": "—",
        "totalSection": "Section total",
        "boutonAjouterLigne": "Add line",
        "toastLigneAjoutee": "Line added",
        "toastLigneSupprimee": "Line deleted",
        "supprimer": "Delete",
        "deplacerHaut": "Move up",
        "deplacerBas": "Move down",
        "fleche": {
          "haut": "↑",
          "bas": "↓"
        }
      },
```

## États et erreurs

- Aucune section : message explicatif + formulaire d'ajout de section
  visible.
- Section sans ligne : tableau non affiché (juste le total, à 0 FCFA) et
  le formulaire d'ajout de ligne.
- Ligne sans prix unitaire : montant affiché `—`, comptée dans
  l'indicateur « X lignes à chiffrer » du total général. Un
  `prix_unitaire` de `0` est un prix valide et n'est **pas** compté comme
  non chiffré (voir section Calculs).
- Échec d'une Server Action (renommage, ajout, modification,
  suppression) : toast d'erreur avec le message renvoyé par le serveur,
  revert fonctionnel de l'état local optimiste concerné (jamais un
  instantané figé) — même discipline que le reste du Module 7.
- Déplacement (section ou ligne) : pas de mise à jour optimiste — le
  nouvel ordre exact dépend d'une permutation calculée côté serveur avec
  l'élément voisin, que le client ne peut pas prédire sans le relire.
  `window.location.reload()` après un déplacement réussi. Limitation
  mineure acceptée pour ce premier sous-projet plutôt que de complexifier
  le retour de la Server Action pour porter les deux lignes permutées.
- Pas de garde applicative contre une modification concurrente de la
  même ligne par deux utilisateurs en même temps (dernier `onBlur`
  gagne) — accepté comme limitation mineure, cohérent avec la taille des
  équipes ciblées (5-20 personnes, collision rare sur une même ligne de
  BPU).
- Pas de garde applicative contre un double-clic rapide sur « Ajouter »
  (section ou ligne) créant deux entrées identiques — même limitation
  mineure déjà acceptée pour le rétroplanning, une entrée en trop se
  supprime en un clic.

## Tests

Vitest sur `lib/appels-offres/bpu.ts` (nouveau fichier
`lib/appels-offres/bpu.test.ts`) :

- `calculerMontantLigne` : quantité × prix unitaire pour un cas nominal
  (ex. quantité 12, prix 5000 → 60000) ; retourne `null` quand
  `prix_unitaire` est `null` ; retourne `0` (pas `null`) quand
  `prix_unitaire` vaut `0` — cas limite explicitement distingué de
  « non chiffré », voir section Calculs.
- `sommerMontants` : somme correcte sur plusieurs lignes toutes
  chiffrées ; ignore les lignes à `prix_unitaire: null` dans la somme
  (ne les traite pas comme `0` implicitement, ce qui donnerait le même
  résultat numérique dans ce cas précis mais vaut la peine d'être
  vérifié explicitement) ; retourne `0` sur un tableau vide.
- `compterLignesNonChiffrees` : compte correct sur un mélange de lignes
  chiffrées/non chiffrées ; retourne `0` sur un tableau vide ou quand
  toutes les lignes sont chiffrées (y compris à `prix_unitaire: 0`).

Pas de test sur `listerBpu`/les Server Actions (fonctions Supabase,
cohérent avec le reste du projet).

## Hors périmètre

- **Pyramide de coût par ligne** (déboursé sec, frais de structure,
  marge) déterminant ou justifiant le prix unitaire — sous-projet B,
  brainstorming séparé.
- Extraction automatique du BPU depuis le `dao_markdown` — saisie
  manuelle uniquement dans ce sous-projet.
- Export Excel/PDF du BPU — l'export existant
  (`exporterDossierReponse`) n'inclut pas le BPU pour l'instant ; à
  réévaluer une fois le sous-projet B livré, pour ne pas exporter un
  bordereau incomplet (sans justification de prix).
- Garde contre une modification concurrente de la même ligne par deux
  utilisateurs, ou contre un double-ajout accidentel.
- Mise à jour optimiste de l'ordre après un déplacement de section ou de
  ligne (rechargement de page à la place).
- Répartition du reste de la page de détail AO en un onglet par section
  (seuls « Vue d'ensemble » et « BPU » existent) — voir décisions
  validées.
- Déplacement d'une ligne d'une section à une autre.
- La cinquième lacune identifiée (groupement/co-traitance) reste
  explicitement hors périmètre de ce sous-projet — brainstorming séparé,
  après le sous-projet B.
