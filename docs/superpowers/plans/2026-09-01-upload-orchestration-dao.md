# Upload et orchestration DAO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relier l'upload utilisateur d'un DAO au pipeline de normalisation/extraction déjà construit : une Server Action stocke le fichier et crée la ligne `appel_offres`, puis un job d'arrière-plan (déclenché par Upstash QStash) normalise, extrait, et sauvegarde les résultats — sans UI, sans édition manuelle.

**Architecture:** Deux temps découplés. Temps rapide (Server Action, session utilisateur, RLS) : upload Storage + insertion `appel_offres` + mise en file QStash. Temps lent (route API `app/api/dao/traiter`, appelée par QStash, client service-role) : orchestration idempotente avec reprise sur erreur, déléguée à une fonction pure `traiterDao` découplée du HTTP.

**Tech Stack:** Next.js Route Handlers, Supabase (Postgres, Storage, service-role client), Upstash QStash, Zod, TypeScript, Vitest.

## Global Constraints

- Client Supabase **service-role** pour le job d'arrière-plan (aucune session utilisateur dans un webhook QStash) — jamais importé depuis du code exposé au navigateur.
- **Aucune politique RLS `update`** ajoutée dans ce sous-projet, ni sur `appel_offres` ni sur `exigence_ao` — le service-role contourne RLS ; ce besoin reste reporté au sous-projet 4 (édition manuelle sous session utilisateur).
- **Reprise depuis la phase échouée** sur retry : si `dao_markdown` est déjà rempli, ne pas rappeler `normaliserDao`.
- **`mimeType` transmis dans le payload QStash**, pas stocké en base (pas de nouvelle colonne sur `appel_offres`).
- **Idempotence** : si `statut_traitement === 'termine'`, le job ne fait rien (gère les livraisons dupliquées de QStash).
- Erreurs jamais avalées silencieusement : toute exception dans `traiterDao` écrit `statut_traitement='erreur'` + `erreur_traitement` en base, **puis relance l'exception** pour que la route HTTP réponde en erreur et déclenche le retry QStash.
- Rollback complet (ligne `appel_offres` + fichier Storage) si la mise en file QStash échoue après une insertion réussie.
- Aucune UI, aucune Server Action d'édition, aucune connexion à un composant React dans ce sous-projet.
- Formats bailleurs (Banque mondiale, BAD) hors périmètre — non applicable à ce sous-projet de toute façon.

---

### Task 1: Refactor `obtenirUtilisateurCourant` vers `lib/utilisateur/` + client Supabase service-role

**Files:**
- Create: `lib/utilisateur/queries.ts`
- Modify: `lib/documents/queries.ts`
- Create: `lib/supabase/service-role.ts`

**Interfaces:**
- Consumes: rien (aucune dépendance sur un autre task de ce plan).
- Produces:
  - `lib/utilisateur/queries.ts` : `export async function obtenirUtilisateurCourant(): Promise<{ id: string; entreprise_id: string; nom: string } | null>` — consommé par Task 5 (`actions.ts`).
  - `lib/supabase/service-role.ts` : `export function createServiceRoleClient(): SupabaseClient` — consommé par Task 6 (`route.ts`).
  - `lib/documents/queries.ts` continue d'exporter `obtenirUtilisateurCourant` (ré-export), aucun appelant existant ne doit changer — vérifié par `app/(app)/bibliotheque/page.tsx`, qui importe `obtenirUtilisateurCourant` depuis `@/lib/documents/queries` et ne doit pas être modifié.

`obtenirUtilisateurCourant` est une fonction générique d'authentification (elle
ne fait rien de spécifique aux documents), déplacée vers un dossier partagé
pour que `lib/appels-offres/` n'ait pas à importer depuis le domaine
`lib/documents/`.

- [ ] **Step 1: Créer `lib/utilisateur/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}
```

- [ ] **Step 2: Remplacer le contenu de `lib/documents/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import type { Document } from "./types";

export { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";

export async function listerDocuments(entrepriseId: string): Promise<Document[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Document[];
}
```

- [ ] **Step 3: Créer `lib/supabase/service-role.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec la clé service-role : contourne RLS entièrement.
 * Ne jamais importer depuis du code exposé au navigateur (composants
 * client, Server Actions déclenchées directement par l'utilisateur) —
 * réservé aux contextes serveur sans session utilisateur (jobs
 * d'arrière-plan, webhooks signés).
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

- [ ] **Step 4: Vérifier que rien n'a régressé**

Run: `npx tsc --noEmit && npx vitest run`

Expected: aucune erreur TypeScript, tous les tests existants passent
(aucun test n'existait pour `obtenirUtilisateurCourant`, donc aucun test
ne devrait échouer ni de nouveau test n'apparaît à ce stade).

- [ ] **Step 5: Commit**

```bash
git add lib/utilisateur/queries.ts lib/documents/queries.ts lib/supabase/service-role.ts
git commit -m "refactor: déplacer obtenirUtilisateurCourant vers lib/utilisateur, ajouter client service-role"
```

---

### Task 2: `lib/appels-offres/schema.ts` — validation du fichier uploadé

**Files:**
- Create: `lib/appels-offres/schema.ts`
- Test: `lib/appels-offres/schema.test.ts`

**Interfaces:**
- Consumes: `MIME_PDF`, `MIME_DOCX`, `MIME_TYPES_DAO_SUPPORTES` de `./normalisation/normaliser` (déjà créés au sous-projet 2).
- Produces: `export const televerserDaoSchema`, `export type TeleverserDaoInput` — consommés par Task 5 (`actions.ts`).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/schema.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { televerserDaoSchema } from "./schema";
import { MIME_PDF, MIME_DOCX } from "./normalisation/normaliser";

function creerFichier(taille: number, type: string, nom = "dao.pdf"): File {
  return new File([new Uint8Array(taille)], nom, { type });
}

describe("televerserDaoSchema", () => {
  it("accepte un PDF de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_PDF),
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un DOCX de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, MIME_DOCX, "dao.docx"),
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un fichier de plus de 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(21 * 1024 * 1024, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier vide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(0, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichier: creerFichier(1024, "image/png"),
    });
    expect(resultat.success).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/schema.test.ts`

Expected: FAIL — `./schema` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/schema.ts`**

```ts
import { z } from "zod";
import { MIME_TYPES_DAO_SUPPORTES } from "./normalisation/normaliser";

const TAILLE_MAX_OCTETS = 20 * 1024 * 1024; // 20 Mo

export const televerserDaoSchema = z.object({
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
      message: "Le fichier doit faire moins de 20 Mo",
    })
    .refine(
      (f) => (MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(f.type),
      { message: "Type de fichier non accepté (PDF ou DOCX uniquement)" },
    ),
});

export type TeleverserDaoInput = z.infer<typeof televerserDaoSchema>;
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/schema.test.ts`

Expected: PASS, 5/5.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/schema.test.ts
git commit -m "feat(dao): validation Zod du fichier DAO uploadé"
```

---

### Task 3: `lib/appels-offres/file-attente.ts` — mise en file QStash

**Files:**
- Create: `lib/appels-offres/file-attente.ts`
- Test: `lib/appels-offres/file-attente.test.ts`
- Modify: `package.json` (ajout de la dépendance `@upstash/qstash`)

**Interfaces:**
- Consumes: rien (indépendant des autres tâches).
- Produces: `export async function mettreEnFileTraitementDao(appelOffresId: string, mimeType: string): Promise<void>` — consommé par Task 5 (`actions.ts`).

- [ ] **Step 1: Installer la dépendance**

Run: `npm install @upstash/qstash`

Expected: `@upstash/qstash` ajouté à `dependencies` dans `package.json`.

- [ ] **Step 2: Écrire le test qui échoue**

Créer `lib/appels-offres/file-attente.test.ts` :

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const publishJSONMock = vi.fn();

// Pattern identique à celui validé au sous-projet 2 (ocr.test.ts,
// extraire.test.ts) pour contourner le hoisting de vi.mock : une classe
// avec un getter, plutôt que vi.fn().mockImplementation() qui lirait
// publishJSONMock avant son initialisation.
vi.mock("@upstash/qstash", () => ({
  Client: class {
    get publishJSON() {
      return publishJSONMock;
    }
  },
}));

import { mettreEnFileTraitementDao } from "./file-attente";

describe("mettreEnFileTraitementDao", () => {
  const urlOriginale = process.env.VERCEL_URL;

  beforeEach(() => {
    publishJSONMock.mockReset();
    publishJSONMock.mockResolvedValue({ messageId: "msg-1" });
  });

  afterEach(() => {
    process.env.VERCEL_URL = urlOriginale;
  });

  it("publie un message QStash avec l'id de l'AO et le mimeType", async () => {
    await mettreEnFileTraitementDao("ao-1", "application/pdf");

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { appelOffresId: "ao-1", mimeType: "application/pdf" },
      }),
    );
  });

  it("cible /api/dao/traiter sur le domaine Vercel quand VERCEL_URL est défini", async () => {
    process.env.VERCEL_URL = "noubinao-exemple.vercel.app";

    await mettreEnFileTraitementDao("ao-1", "application/pdf");

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://noubinao-exemple.vercel.app/api/dao/traiter",
      }),
    );
  });

  it("retombe sur localhost:3000 quand VERCEL_URL est absent", async () => {
    delete process.env.VERCEL_URL;

    await mettreEnFileTraitementDao("ao-1", "application/pdf");

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:3000/api/dao/traiter",
      }),
    );
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/file-attente.test.ts`

Expected: FAIL — `./file-attente` n'existe pas encore.

- [ ] **Step 4: Créer `lib/appels-offres/file-attente.ts`**

```ts
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

function construireUrlCallback(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  return `${base}/api/dao/traiter`;
}

export async function mettreEnFileTraitementDao(
  appelOffresId: string,
  mimeType: string,
): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallback(),
    body: { appelOffresId, mimeType },
  });
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/file-attente.test.ts`

Expected: PASS, 3/3.

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/file-attente.ts lib/appels-offres/file-attente.test.ts package.json package-lock.json
git commit -m "feat(dao): mise en file du traitement via QStash"
```

---

### Task 4: `lib/appels-offres/traitement.ts` — orchestration `traiterDao`

**Files:**
- Create: `lib/appels-offres/traitement.ts`
- Test: `lib/appels-offres/traitement.test.ts`

**Interfaces:**
- Consumes: `normaliserDao` de `./normalisation/normaliser`, `decouperParSection` de `./normalisation/markdown`, `extraireInformationsAo` de `./normalisation/extraire` (tous déjà créés au sous-projet 2) ; `AppelOffres` de `./types` (déjà créé au sous-projet 1).
- Produces: `export async function traiterDao(supabase: SupabaseClient, appelOffresId: string, mimeType: string): Promise<void>` — consommé par Task 6 (`route.ts`).

C'est le cœur de ce sous-projet : idempotence, reprise sur erreur, et
écriture traçable des erreurs, découplé du HTTP et de QStash pour rester
testable avec un client Supabase de test.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/traitement.test.ts` :

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./normalisation/normaliser", () => ({
  normaliserDao: vi.fn(),
}));
vi.mock("./normalisation/extraire", () => ({
  extraireInformationsAo: vi.fn(),
}));

import { traiterDao } from "./traitement";
import { normaliserDao } from "./normalisation/normaliser";
import { extraireInformationsAo } from "./normalisation/extraire";
import type { AppelOffres } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

function creerAppelOffresBase(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: null,
    acheteur: null,
    secteur: null,
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: "en_attente",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: null,
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function creerSupabaseFake(appelOffres: AppelOffres) {
  const misAJour: Record<string, unknown>[] = [];
  const exigencesInserees: Record<string, unknown>[][] = [];

  const appelOffresTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...appelOffres }, error: null }),
      }),
    }),
    update: (valeurs: Record<string, unknown>) => ({
      eq: async () => {
        misAJour.push(valeurs);
        Object.assign(appelOffres, valeurs);
        return { error: null };
      },
    }),
  };

  const exigenceTable = {
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
    insert: async (lignes: Record<string, unknown>[]) => {
      exigencesInserees.push(lignes);
      return { error: null };
    },
  };

  const fake = {
    from: (table: string) => (table === "appel_offres" ? appelOffresTable : exigenceTable),
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new TextEncoder().encode("contenu-pdf").buffer },
          error: null,
        }),
      }),
    },
  };

  return {
    supabase: fake as unknown as SupabaseClient,
    misAJour,
    exigencesInserees,
  };
}

describe("traiterDao", () => {
  beforeEach(() => {
    vi.mocked(normaliserDao).mockReset();
    vi.mocked(extraireInformationsAo).mockReset();
  });

  it("exécute normalisation puis extraction pour un AO en attente, et marque terminé", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour, exigencesInserees } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockResolvedValue({
      markdown: "## AVIS D'APPEL D'OFFRES\nContenu.",
      sections: [{ titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu." }],
    });
    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: "Construction d'un pont",
      acheteur: "Ministère X",
      secteur: "BTP",
      date_limite: "2026-11-03T12:00:00Z",
      montant_caution: 5000000,
      sommaire_attendu: ["Méthodologie"],
      exigences: [
        {
          type_exigence: "piece_requise",
          libelle: "RCCM",
          description: null,
          ponderation: null,
          source_section: "DPAO",
        },
      ],
    });

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(normaliserDao).toHaveBeenCalledTimes(1);
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
    expect(exigencesInserees).toHaveLength(1);
    expect(exigencesInserees[0]).toHaveLength(1);
    expect(misAJour.some((m) => m.statut_traitement === "normalisation")).toBe(true);
    expect(misAJour.some((m) => m.statut_traitement === "extraction")).toBe(true);
    expect(misAJour.at(-1)?.statut_traitement).toBe("termine");
  });

  it("reprend directement à l'extraction si dao_markdown est déjà rempli", async () => {
    const appelOffres = creerAppelOffresBase({
      statut_traitement: "extraction",
      dao_markdown: "## AVIS D'APPEL D'OFFRES\nContenu déjà normalisé.",
    });
    const { supabase } = creerSupabaseFake(appelOffres);

    vi.mocked(extraireInformationsAo).mockResolvedValue({
      titre: null,
      acheteur: null,
      secteur: null,
      date_limite: null,
      montant_caution: null,
      sommaire_attendu: [],
      exigences: [],
    });

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien si le statut est déjà 'termine' (idempotence)", async () => {
    const appelOffres = creerAppelOffresBase({ statut_traitement: "termine" });
    const { supabase } = creerSupabaseFake(appelOffres);

    await traiterDao(supabase, "ao-1", "application/pdf");

    expect(normaliserDao).not.toHaveBeenCalled();
    expect(extraireInformationsAo).not.toHaveBeenCalled();
  });

  it("écrit statut_traitement='erreur' et relance l'exception en cas d'échec", async () => {
    const appelOffres = creerAppelOffresBase();
    const { supabase, misAJour } = creerSupabaseFake(appelOffres);

    vi.mocked(normaliserDao).mockRejectedValue(new Error("échec normalisation"));

    await expect(traiterDao(supabase, "ao-1", "application/pdf")).rejects.toThrow(
      "échec normalisation",
    );

    const derniereMiseAJour = misAJour.at(-1);
    expect(derniereMiseAJour?.statut_traitement).toBe("erreur");
    expect(derniereMiseAJour?.erreur_traitement).toBe("échec normalisation");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/traitement.test.ts`

Expected: FAIL — `./traitement` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/traitement.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliserDao } from "./normalisation/normaliser";
import { decouperParSection } from "./normalisation/markdown";
import { extraireInformationsAo } from "./normalisation/extraire";
import type { AppelOffres } from "./types";

export async function traiterDao(
  supabase: SupabaseClient,
  appelOffresId: string,
  mimeType: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`Appel d'offres introuvable : ${appelOffresId}`);
  }

  const appelOffres = data as AppelOffres;

  if (appelOffres.statut_traitement === "termine") {
    return;
  }

  try {
    let markdown = appelOffres.dao_markdown;

    if (!markdown) {
      await supabase
        .from("appel_offres")
        .update({ statut_traitement: "normalisation" })
        .eq("id", appelOffresId);

      const { data: fichierData, error: erreurTelechargement } = await supabase.storage
        .from("documents")
        .download(appelOffres.fichier_dao_path);

      if (erreurTelechargement || !fichierData) {
        throw new Error("Échec du téléchargement du fichier DAO depuis le stockage.");
      }

      const buffer = Buffer.from(await fichierData.arrayBuffer());
      const resultat = await normaliserDao(buffer, mimeType);
      markdown = resultat.markdown;

      await supabase
        .from("appel_offres")
        .update({ dao_markdown: markdown })
        .eq("id", appelOffresId);
    }

    await supabase
      .from("appel_offres")
      .update({ statut_traitement: "extraction" })
      .eq("id", appelOffresId);

    const sections = decouperParSection(markdown);
    const extraction = await extraireInformationsAo(sections);

    await supabase.from("exigence_ao").delete().eq("appel_offres_id", appelOffresId);

    if (extraction.exigences.length > 0) {
      const { error: erreurInsertion } = await supabase.from("exigence_ao").insert(
        extraction.exigences.map((exigence) => ({
          appel_offres_id: appelOffresId,
          type_exigence: exigence.type_exigence,
          libelle: exigence.libelle,
          description: exigence.description,
          ponderation: exigence.ponderation,
          source_section: exigence.source_section,
        })),
      );

      if (erreurInsertion) {
        throw new Error(`Échec de l'insertion des exigences : ${erreurInsertion.message}`);
      }
    }

    await supabase
      .from("appel_offres")
      .update({
        titre: extraction.titre,
        acheteur: extraction.acheteur,
        secteur: extraction.secteur,
        date_limite: extraction.date_limite,
        montant_caution: extraction.montant_caution,
        sommaire_attendu: extraction.sommaire_attendu,
        statut_traitement: "termine",
      })
      .eq("id", appelOffresId);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("appel_offres")
      .update({ statut_traitement: "erreur", erreur_traitement: message })
      .eq("id", appelOffresId);
    throw erreur;
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/traitement.test.ts`

Expected: PASS, 4/4.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/traitement.ts lib/appels-offres/traitement.test.ts
git commit -m "feat(dao): orchestration traiterDao (idempotence, reprise, erreurs)"
```

---

### Task 5: `lib/appels-offres/actions.ts` — Server Action `televerserDao`

**Files:**
- Create: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (Task 1) ; `televerserDaoSchema` de `./schema` (Task 2) ; `mettreEnFileTraitementDao` de `./file-attente` (Task 3) ; `construireCheminStockageDao` de `./storage-path` (déjà créé au sous-projet 1).
- Produces: `export async function televerserDao(formData: FormData): Promise<{ erreur: string } | { succes: true; appelOffresId: string }>` — consommé par le sous-projet 4 (UI).

Contrairement à `ajouterDocument` (`lib/documents/actions.ts`), cette action
retourne `appelOffresId` en cas de succès : le sous-projet 4 en aura besoin
pour rediriger l'utilisateur vers le suivi du traitement de cet AO
spécifique.

Pas de test automatisé pour ce fichier — même convention que
`lib/documents/actions.ts::ajouterDocument`, jamais testé unitairement
dans ce projet (dépendances réelles Storage/DB trop lourdes à mocker
utilement ici). Vérification manuelle uniquement.

- [ ] **Step 1: Créer `lib/appels-offres/actions.ts`**

```ts
"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { televerserDaoSchema } from "./schema";
import { construireCheminStockageDao } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";

export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const appelOffresId = randomUUID();
  const cheminStockage = construireCheminStockageDao(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminStockage,
    fichier_dao_nom_original: fichier.name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  try {
    await mettreEnFileTraitementDao(appelOffresId, fichier.type);
  } catch {
    await supabase.from("appel_offres").delete().eq("id", appelOffresId);
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  return { succes: true as const, appelOffresId };
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat(dao): Server Action televerserDao (upload + mise en file)"
```

---

### Task 6: `app/api/dao/traiter/route.ts` — route déclenchée par QStash

**Files:**
- Create: `app/api/dao/traiter/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient` de `@/lib/supabase/service-role` (Task 1) ; `traiterDao` de `@/lib/appels-offres/traitement` (Task 4).
- Produces: rien consommé par un sous-projet suivant — point d'entrée HTTP externe (QStash).

Cette route utilise `Receiver` du paquet `@upstash/qstash` (déjà installé
à la Task 3) directement, plutôt que l'intégration `@upstash/qstash/nextjs`
— `Receiver.verify()` est une primitive stable indépendante du framework,
qui évite toute incertitude de compatibilité avec les conventions
spécifiques de Route Handler de la version de Next.js utilisée dans ce
projet (voir l'avertissement en tête de `CLAUDE.md` sur ce point : lire
`node_modules/next/dist/docs/` avant d'écrire du code Next.js si un doute
subsiste sur les conventions de Route Handler).

Pas de test automatisé — comme `actions.ts`, et pour la même raison
documentée dans le spec : un test end-to-end réel nécessiterait une
instance QStash et une URL publique, hors périmètre de ce sous-projet.

- [ ] **Step 1: Créer `app/api/dao/traiter/route.ts`**

```ts
import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterDao } from "@/lib/appels-offres/traitement";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request): Promise<Response> {
  const corpsBrut = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return new Response("Signature manquante", { status: 401 });
  }

  const signatureValide = await receiver.verify({
    signature,
    body: corpsBrut,
  });

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  const { appelOffresId, mimeType } = JSON.parse(corpsBrut) as {
    appelOffresId: string;
    mimeType: string;
  };

  const supabase = createServiceRoleClient();

  try {
    await traiterDao(supabase, appelOffresId, mimeType);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return new Response(`Échec du traitement : ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Vérifier que la suite de tests complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent (ceux des Tasks 1-4 inclus).

- [ ] **Step 4: Commit**

```bash
git add app/api/dao/traiter/route.ts
git commit -m "feat(dao): route de traitement déclenchée par QStash"
```

---
