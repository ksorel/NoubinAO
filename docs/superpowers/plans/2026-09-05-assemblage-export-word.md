# Assemblage mécanique + export Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'exporter le dossier de réponse d'un AO en `.docx` téléchargeable — page de garde, sommaire attendu, pièces requises avec leurs documents associés (nom + type, sans fusion binaire), critères d'évaluation — Module 4, sous-projet 3 de NoubinAO.

**Architecture:** Une migration ajoutant la policy RLS `UPDATE` manquante sur `dossier_reponse`, un module `lib/appels-offres/export/` séparant la préparation pure des données (`plan.ts`, testable) de la génération OOXML via le paquet npm `docx` (`docx.ts`, non testée unitairement), une nouvelle Server Action `exporterDossierReponse` qui orchestre lecture → génération → upload Storage → mise à jour `dossier_reponse` → URL signée, et un bouton dans la page de détail existante.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres RLS, Storage), TypeScript, Vitest, paquet npm `docx` (OOXML), next-intl (FR/EN).

## Global Constraints

- Aucune fusion du contenu binaire des documents sources (PDF/DOCX/images) dans le `.docx` généré — seulement nom + type par document associé.
- Aucun lien hypertexte vers les documents dans le `.docx` (URLs signées trop courtes pour un usage différé) — nom + type texte seulement.
- Une exigence "pièce requise" sans document associé n'est jamais bloquante : le `.docx` affiche "Aucun document associé — à compléter" et l'export réussit quand même.
- Le bouton d'export n'est visible que quand `appelOffres.statut_traitement === 'termine'`.
- Chaque export réussi écrase le `.docx` précédent (chemin de stockage déterministe, `upsert: true`) et fait passer `dossier_reponse.statut_relecture` à `'exporte'`.
- Les libellés de type de document dans le `.docx` sont en français, codés en dur dans `plan.ts` (`LIBELLES_TYPE_DOCUMENT`) — cohérent avec les messages d'erreur déjà tous en français en dur dans `lib/appels-offres/actions.ts` ; ne pas introduire `getTranslations` dans ce module.
- Aucune génération de texte par IA — hors périmètre (sous-projet 4).
- Spec complet : `docs/superpowers/specs/2026-09-05-assemblage-export-word-design.md`.

---

### Task 1: Migration — policy RLS UPDATE sur `dossier_reponse`

**Files:**
- Create: `supabase/migrations/20260905193000_dossier_reponse_update_policy.sql`

**Interfaces:**
- Consumes: table `dossier_reponse` (sous-projet 1, déjà en prod).
- Produces: la policy `dossier_reponse_update_membres` requise par Task 4 (`exporterDossierReponse` doit pouvoir écrire `export_path`/`exporte_le`/`statut_relecture`).

- [ ] **Step 1: Créer la migration**

Créer `supabase/migrations/20260905193000_dossier_reponse_update_policy.sql` :

```sql
-- Politique RLS update sur dossier_reponse (Module 4, sous-projet 3)
-- Manquante depuis le sous-projet 1 (seuls select/insert/delete existaient) —
-- nécessaire pour que l'export puisse écrire export_path/exporte_le/statut_relecture.
-- Même patron que appel_offres_update_membres (20260901190618).

create policy "dossier_reponse_update_membres" on dossier_reponse
  for update using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 2: Appliquer la migration**

Run: `npx supabase db push`

Expected: la migration s'applique sans erreur (le projet Supabase est lié — si `npx supabase db push` échoue avec une erreur de lien de projet, vérifier `npx supabase status` / la configuration existante avant de continuer, ne pas improviser une autre méthode d'application).

- [ ] **Step 3: Vérifier réellement que la policy existe (ne pas se contenter de l'absence d'erreur au push)**

Run: `npx supabase db query --linked "select policyname, cmd from pg_policies where tablename = 'dossier_reponse' order by cmd;"`

Expected : 4 lignes, une par commande (`DELETE`, `INSERT`, `SELECT`, `UPDATE`), avec `dossier_reponse_update_membres` sur la ligne `UPDATE`. Si la commande `npx supabase db query` n'existe pas dans cette version de la CLI, utiliser `npx supabase db query --linked --file <fichier .sql temporaire contenant la même requête>` ou l'équivalent disponible — l'objectif est de lire réellement `pg_policies`, pas de supposer que le push a réussi.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260905193000_dossier_reponse_update_policy.sql
git commit -m "feat: policy RLS update manquante sur dossier_reponse"
```

---

### Task 2: `construirePlanExport` — préparation pure des données d'export

**Files:**
- Create: `lib/appels-offres/export/plan.ts`
- Test: `lib/appels-offres/export/plan.test.ts`

**Interfaces:**
- Consumes: `AppelOffres`, `ExigenceAo` (`lib/appels-offres/types.ts`), `Document`, `TypeDocument` (`lib/documents/types.ts`).
- Produces: `export interface PlanExport { ... }` et `export function construirePlanExport(appelOffres: AppelOffres, exigences: ExigenceAo[], documentsParExigence: Record<string, Document[]>, dateExport: Date): PlanExport` — consommée par Task 3 (`genererDocumentWord`) et Task 4 (`exporterDossierReponse`).

- [ ] **Step 1: Écrire le test (TDD)**

Créer `lib/appels-offres/export/plan.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { construirePlanExport } from "./plan";
import type { AppelOffres, ExigenceAo } from "../types";
import type { Document } from "@/lib/documents/types";

function creerAppelOffres(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "BTP",
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: "termine",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: ["Offre technique", "Offre financière"],
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exi-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "IS 4.2",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM K-Nowledge",
    fichier_path: "ent-1/documents/rccm.pdf",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("construirePlanExport", () => {
  it("liste les documents associés à une pièce requise", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence();
    const document = creerDocument();

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      { [exigence.id]: [document] },
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([
      {
        libelle: "RCCM",
        documents: [{ nom: "RCCM K-Nowledge", type: "Pièce administrative" }],
      },
    ]);
  });

  it("laisse la liste de documents vide pour une pièce non mappée", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence({ id: "exi-2", libelle: "Attestation CNPS" });

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      {},
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([{ libelle: "Attestation CNPS", documents: [] }]);
  });

  it("inclut les critères d'évaluation avec leur pondération", () => {
    const appelOffres = creerAppelOffres();
    const critere = creerExigence({
      id: "exi-3",
      type_exigence: "critere_evaluation",
      libelle: "Qualité technique",
      ponderation: 60,
    });

    const plan = construirePlanExport(appelOffres, [critere], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.criteresEvaluation).toEqual([{ libelle: "Qualité technique", ponderation: 60 }]);
  });

  it("renvoie une liste de critères vide si aucun n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.criteresEvaluation).toEqual([]);
  });

  it("conserve sommaire_attendu tel quel quand présent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: ["Section A", "Section B"] });

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toEqual(["Section A", "Section B"]);
  });

  it("renvoie null pour sommaireAttendu quand absent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: null });

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toBeNull();
  });

  it("formate la date d'export en JJ/MM/AAAA (UTC)", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-01-05T23:00:00Z"));

    expect(plan.dateExport).toBe("05/01/2026");
  });

  it("utilise le nom de fichier original comme titre si le titre est absent", () => {
    const appelOffres = creerAppelOffres({ titre: null, fichier_dao_nom_original: "dao-brut.pdf" });

    const plan = construirePlanExport(appelOffres, [], {}, new Date("2026-09-10T12:00:00Z"));

    expect(plan.titre).toBe("dao-brut.pdf");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/export/plan.test.ts`

Expected: FAIL — `plan.ts` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/export/plan.ts`**

```ts
import type { AppelOffres, ExigenceAo } from "../types";
import type { Document, TypeDocument } from "@/lib/documents/types";

const LIBELLES_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence de projet",
  cv: "CV",
  agrement: "Agrément",
};

export interface PlanExport {
  titre: string;
  acheteur: string | null;
  secteur: string | null;
  dateExport: string;
  sommaireAttendu: string[] | null;
  piecesRequises: Array<{
    libelle: string;
    documents: Array<{ nom: string; type: string }>;
  }>;
  criteresEvaluation: Array<{
    libelle: string;
    ponderation: number | null;
  }>;
}

function formaterDate(date: Date): string {
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const annee = date.getUTCFullYear();
  return `${jour}/${mois}/${annee}`;
}

export function construirePlanExport(
  appelOffres: AppelOffres,
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  dateExport: Date,
): PlanExport {
  const piecesRequises = exigences
    .filter((e) => e.type_exigence === "piece_requise")
    .map((exigence) => ({
      libelle: exigence.libelle,
      documents: (documentsParExigence[exigence.id] ?? []).map((document) => ({
        nom: document.nom,
        type: LIBELLES_TYPE_DOCUMENT[document.type],
      })),
    }));

  const criteresEvaluation = exigences
    .filter((e) => e.type_exigence === "critere_evaluation")
    .map((exigence) => ({
      libelle: exigence.libelle,
      ponderation: exigence.ponderation,
    }));

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original,
    acheteur: appelOffres.acheteur,
    secteur: appelOffres.secteur,
    dateExport: formaterDate(dateExport),
    sommaireAttendu: appelOffres.sommaire_attendu,
    piecesRequises,
    criteresEvaluation,
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/export/plan.test.ts`

Expected: PASS, 8/8.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/export/plan.ts lib/appels-offres/export/plan.test.ts
git commit -m "feat: préparation pure des données d'export (construirePlanExport)"
```

---

### Task 3: `genererDocumentWord` — génération OOXML via le paquet npm `docx`

**Files:**
- Create: `lib/appels-offres/export/docx.ts`
- Modify: `package.json` (nouvelle dépendance `docx`)

**Interfaces:**
- Consumes: `PlanExport` (Task 2).
- Produces: `export async function genererDocumentWord(plan: PlanExport): Promise<Buffer>` — consommée par Task 4 (`exporterDossierReponse`).

**Pas de test unitaire dédié** (cohérent avec le spec — la bibliothèque externe n'est pas retestée, seule la préparation de données l'est). Vérification manuelle par script jetable non commité.

- [ ] **Step 1: Installer la dépendance**

Run: `npm install docx`

Expected: `package.json` gagne une ligne `"docx": "^9.x.x"` dans `dependencies` ; `package-lock.json` mis à jour.

- [ ] **Step 2: Créer `lib/appels-offres/export/docx.ts`**

```ts
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import type { PlanExport } from "./plan";

export async function genererDocumentWord(plan: PlanExport): Promise<Buffer> {
  const enfants: Paragraph[] = [
    new Paragraph({ text: plan.titre, heading: HeadingLevel.TITLE }),
  ];

  if (plan.acheteur) {
    enfants.push(new Paragraph({ text: `Acheteur : ${plan.acheteur}` }));
  }
  if (plan.secteur) {
    enfants.push(new Paragraph({ text: `Secteur : ${plan.secteur}` }));
  }
  enfants.push(new Paragraph({ text: `Exporté le : ${plan.dateExport}` }));

  if (plan.sommaireAttendu && plan.sommaireAttendu.length > 0) {
    enfants.push(
      new Paragraph({ text: "Sommaire attendu", heading: HeadingLevel.HEADING_1 }),
    );
    for (const item of plan.sommaireAttendu) {
      enfants.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
  }

  enfants.push(new Paragraph({ text: "Pièces requises", heading: HeadingLevel.HEADING_1 }));
  if (plan.piecesRequises.length === 0) {
    enfants.push(new Paragraph({ text: "Aucune pièce requise identifiée." }));
  } else {
    for (const piece of plan.piecesRequises) {
      enfants.push(new Paragraph({ text: piece.libelle, heading: HeadingLevel.HEADING_2 }));
      if (piece.documents.length === 0) {
        enfants.push(
          new Paragraph({ text: "Aucun document associé — à compléter", bullet: { level: 0 } }),
        );
      } else {
        for (const document of piece.documents) {
          enfants.push(
            new Paragraph({
              text: `${document.nom} (${document.type})`,
              bullet: { level: 0 },
            }),
          );
        }
      }
    }
  }

  enfants.push(
    new Paragraph({ text: "Critères d'évaluation", heading: HeadingLevel.HEADING_1 }),
  );
  if (plan.criteresEvaluation.length === 0) {
    enfants.push(new Paragraph({ text: "Aucun critère d'évaluation identifié." }));
  } else {
    for (const critere of plan.criteresEvaluation) {
      const suffixe = critere.ponderation !== null ? ` — ${critere.ponderation}%` : "";
      enfants.push(
        new Paragraph({ text: `${critere.libelle}${suffixe}`, bullet: { level: 0 } }),
      );
    }
  }

  const document = new Document({
    sections: [{ children: enfants }],
  });

  return Packer.toBuffer(document);
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Vérification manuelle par script jetable**

Créer un fichier temporaire `verifier-export.ts` à la racine (non commité, à supprimer après vérification) :

```ts
import { genererDocumentWord } from "./lib/appels-offres/export/docx";
import type { PlanExport } from "./lib/appels-offres/export/plan";

const plan: PlanExport = {
  titre: "Test",
  acheteur: "Acheteur Test",
  secteur: "BTP",
  dateExport: "05/09/2026",
  sommaireAttendu: ["Section A"],
  piecesRequises: [
    { libelle: "RCCM", documents: [{ nom: "RCCM.pdf", type: "Pièce administrative" }] },
  ],
  criteresEvaluation: [{ libelle: "Qualité", ponderation: 60 }],
};

const buffer = await genererDocumentWord(plan);
console.log("Taille du buffer :", buffer.length, "octets");
console.log("Signature ZIP (PK) :", buffer.subarray(0, 2).toString() === "PK");
```

Run: `npx tsx verifier-export.ts` (`tsx` s'exécute via `npx` sans installation préalable — vérifier d'abord `npx tsx --version` si la commande échoue de façon inattendue).

Expected: "Taille du buffer" largement supérieur à 0 (quelques milliers d'octets), "Signature ZIP (PK) : true" — un fichier `.docx` est un zip, donc ses deux premiers octets sont toujours `PK`. Cette vérification confirme que la génération produit un fichier structurellement valide, sans avoir besoin d'ouvrir Word.

Supprimer `verifier-export.ts` après vérification :

Run: `rm verifier-export.ts`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/appels-offres/export/docx.ts
git commit -m "feat: génération du document Word d'export (paquet docx)"
```

---

### Task 4: Server Action `exporterDossierReponse`

**Files:**
- Modify: `lib/appels-offres/storage-path.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `construirePlanExport` (Task 2), `genererDocumentWord` (Task 3), `obtenirAppelOffres` (déjà existant, `lib/appels-offres/queries.ts`).
- Produces: `export async function exporterDossierReponse(appelOffresId: string): Promise<{ erreur: string } | { url: string }>` — consommée par Task 5 (bouton UI). `export function construireCheminStockageExport(entrepriseId: string, appelOffresId: string): string` — consommée uniquement par cette tâche.

**Pas de test dédié** (cohérent avec l'absence de test sur les autres Server Actions du fichier).

- [ ] **Step 1: Ajouter `construireCheminStockageExport` à `lib/appels-offres/storage-path.ts`**

Le fichier actuel est :

```ts
export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${nomNettoye}`;
}
```

Ajouter à la fin :

```ts

export function construireCheminStockageExport(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse.docx`;
}
```

- [ ] **Step 2: Étendre les imports de `lib/appels-offres/actions.ts`**

Remplacer les lignes d'import suivantes (en haut du fichier) :

```ts
import { construireCheminStockageDao } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres } from "./queries";
import type { AppelOffres, StatutPipelineAo } from "./types";
```

Par :

```ts
import { construireCheminStockageDao, construireCheminStockageExport } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres } from "./queries";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import type { AppelOffres, StatutPipelineAo } from "./types";
```

- [ ] **Step 3: Ajouter `exporterDossierReponse` à la fin de `lib/appels-offres/actions.ts`**

```ts
export async function exporterDossierReponse(
  appelOffresId: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    new Date(),
  );

  const buffer = await genererDocumentWord(plan);
  const cheminStockage = construireCheminStockageExport(utilisateur.entreprise_id, appelOffresId);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de la génération du dossier. Réessayez." };
  }

  const { error: erreurMiseAJour } = await supabase
    .from("dossier_reponse")
    .update({
      export_path: cheminStockage,
      exporte_le: new Date().toISOString(),
      statut_relecture: "exporte",
    })
    .eq("appel_offres_id", appelOffresId);

  if (erreurMiseAJour) {
    return { erreur: "Échec de la génération du dossier. Réessayez." };
  }

  const { data, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !data) return { erreur: "Impossible de générer le lien." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { url: data.signedUrl };
}
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent (120/120 attendus : 112 existants + 8 de Task 2).

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/storage-path.ts lib/appels-offres/actions.ts
git commit -m "feat: Server Action exporterDossierReponse"
```

---

### Task 5: Bouton "Exporter le dossier" + traductions

**Files:**
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `exporterDossierReponse` (Task 4).
- Produces: rien de consommé par une tâche ultérieure — dernière tâche de ce sous-projet.

- [ ] **Step 1: Ajouter la traduction dans `messages/fr.json`**

La clé `"detail"` commence actuellement par (ligne 113-115) :

```json
    "detail": {
      "boutonTelecharger": "Télécharger le DAO",
      "messageTraitementEnCours": "Le traitement de ce dossier est en cours. Les informations extraites et les exigences apparaîtront ici une fois terminé.",
```

La remplacer par :

```json
    "detail": {
      "boutonTelecharger": "Télécharger le DAO",
      "boutonExporter": "Exporter le dossier",
      "messageTraitementEnCours": "Le traitement de ce dossier est en cours. Les informations extraites et les exigences apparaîtront ici une fois terminé.",
```

- [ ] **Step 2: Ajouter la même traduction dans `messages/en.json`**

La clé `"detail"` commence actuellement par (ligne 113-115) :

```json
    "detail": {
      "boutonTelecharger": "Download the tender document",
      "messageTraitementEnCours": "This file is still being processed. Extracted information and requirements will appear here once done.",
```

La remplacer par :

```json
    "detail": {
      "boutonTelecharger": "Download the tender document",
      "boutonExporter": "Export the response file",
      "messageTraitementEnCours": "This file is still being processed. Extracted information and requirements will appear here once done.",
```

- [ ] **Step 3: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

Ajouter `exporterDossierReponse` à l'import existant (actuellement) :

```ts
import {
  modifierAppelOffres,
  genererUrlTelechargementDao,
} from "@/lib/appels-offres/actions";
```

Remplacer par :

```ts
import {
  modifierAppelOffres,
  genererUrlTelechargementDao,
  exporterDossierReponse,
} from "@/lib/appels-offres/actions";
```

Ajouter un état à côté des deux existants (actuellement) :

```tsx
  const [envoi, setEnvoi] = useState(false);
  const [telechargement, setTelechargement] = useState(false);
```

Remplacer par :

```tsx
  const [envoi, setEnvoi] = useState(false);
  const [telechargement, setTelechargement] = useState(false);
  const [exportation, setExportation] = useState(false);
```

Ajouter la fonction `exporter`, juste après la fonction `telecharger` existante :

```tsx
  async function telecharger() {
    setTelechargement(true);
    const resultat = await genererUrlTelechargementDao(appelOffres.fichier_dao_path);
    setTelechargement(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  async function exporter() {
    setExportation(true);
    const resultat = await exporterDossierReponse(appelOffres.id);
    setExportation(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }
```

Enfin, ajouter le bouton juste après le bloc "Critères d'évaluation", à l'intérieur du fragment `{pret && (<>...</>)}` — c'est-à-dire juste avant la balise fermante `</>` qui clôt ce bloc. Le bloc actuel se termine par :

```tsx
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
            {criteresEvaluation.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("exigences.aucunCritere")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {criteresEvaluation.map((exigence) => (
                  <li
                    key={exigence.id}
                    className="flex items-center justify-between border-b pb-2"
                  >
                    <div>
                      <p className="font-medium">{exigence.libelle}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("exigences.source")} : {exigence.source_section}
                      </p>
                    </div>
                    {exigence.ponderation !== null && (
                      <Badge variant="outline">{exigence.ponderation}%</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
```

Le remplacer par (ajout du bouton d'export avant la fermeture du fragment) :

```tsx
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
            {criteresEvaluation.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("exigences.aucunCritere")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {criteresEvaluation.map((exigence) => (
                  <li
                    key={exigence.id}
                    className="flex items-center justify-between border-b pb-2"
                  >
                    <div>
                      <p className="font-medium">{exigence.libelle}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("exigences.source")} : {exigence.source_section}
                      </p>
                    </div>
                    {exigence.ponderation !== null && (
                      <Badge variant="outline">{exigence.ponderation}%</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button onClick={exporter} disabled={exportation}>
            {t("boutonExporter")}
          </Button>
        </>
      )}
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 120/120 tests passent.

- [ ] **Step 6: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/appels-offres/\[id\]/appel-offres-detail.tsx messages/fr.json messages/en.json
git commit -m "feat: bouton d'export du dossier de réponse"
```

---

## Self-Review Notes

- **Couverture du spec** : les 6 décisions validées (dossier structurant sans fusion binaire, bouton explicite + passage à `'exporte'`, jamais bloquant sur exigence non mappée, pas de lien de téléchargement, critères inclus en lecture seule, paquet npm `docx`) sont chacune couvertes par une tâche. Le point bloquant découvert en brainstorming (policy RLS `UPDATE` manquante) est traité en Task 1, avant toute tâche qui en dépend.
- **Ordre des tâches** : Task 1 (migration) n'a aucune dépendance de code et peut techniquement être faite en parallèle des autres, mais elle est placée en premier car Task 4 échouerait silencieusement (mise à jour RLS-bloquée) sans elle — mieux vaut que la policy existe avant que quiconque teste `exporterDossierReponse` manuellement.
- **Cohérence des types** : `PlanExport` a la même forme partout (Task 2 la définit, Task 3 et Task 4 l'importent sans redéfinition). `construireCheminStockageExport` a la même signature dans `storage-path.ts` (Task 4) que celle annoncée dans le spec.
- **Aucun placeholder** : chaque étape contient le code exact à écrire ou le texte exact à remplacer.
- **Vérification manuelle requise après ce sous-projet** : comme pour les sous-projets précédents, l'ouverture réelle du `.docx` généré dans Word/LibreOffice (mise en page, caractères accentués, structure des titres) n'a pas pu être vérifiée en session — à faire par Sorel via `npm run dev` avant de considérer ce sous-projet définitivement clos, en plus de la vérification de la policy RLS.
