# Ingestion d'un DAO éclaté en plusieurs fichiers

Date : 2026-09-28
Statut : approuvé par l'utilisateur.

## Contexte

Priorité P1 de la feuille de route stratégique (artefact "Le Cap
NoubinAO", backlog ajouté le 2026-09-21 suite à une question de Sorel sur
le repérage du fichier déterminant dans un dossier multi-fichiers).
Aucun cas bloquant identifié dans l'usage actuel — priorité "nice to
have" plutôt qu'urgence, à traiter avec un périmètre volontairement
serré.

NoubinAO suppose aujourd'hui qu'un DAO tient dans un seul fichier :
`televerserDao` (`lib/appels-offres/actions.ts`) accepte un unique champ
`fichier` (`lib/appels-offres/schema.ts:televerserDaoSchema`), l'écrit
dans `appel_offres.fichier_dao_path`/`fichier_dao_nom_original` (colonnes
uniques), met en file un seul traitement QStash avec un seul `mimeType`
(`file-attente.ts:mettreEnFileTraitementDao`), que `traiterDao`
(`traitement.ts`) télécharge, normalise via `normaliserDao` (un seul
buffer) et découpe en sections avec `decouperParSection`
(`normalisation/markdown.ts`).

**Contrainte structurelle découverte en explorant le code, qui gouverne
toute la conception ci-dessous** : `extraireInformationsAo`
(`normalisation/extraire.ts:construireContenuPertinent`) ne traite pas le
Markdown comme un sac de sections indépendantes — il calcule des **index
de position** (`indexBorneFin`, `indexInstructions`, `indexDpao`) et
exclut la **plage** `[indexInstructions, indexDpao)`, en supposant que le
document suit l'ordre AAO → Instructions → DPAO → Critères →
Formulaires de soumission. Cette logique a été durement stabilisée sur
des DAO réels (voir les commentaires de `markdown.ts` et `extraire.ts`
datés du 2026-09-03/04 — plusieurs régressions déjà rencontrées et
corrigées). Casser cet ordre casserait l'extraction. Toute la conception
multi-fichiers tourne donc autour d'un principe : **reconstituer un
document unique, dans le bon ordre, avant que l'extraction existante ne
le voie** — jamais adapter l'extraction elle-même à plusieurs documents.

Certains acheteurs livrent plusieurs fichiers séparés (AAO/IS/DPAO/CCAG/
CCAP/BPU). Décision de principe déjà actée avec Sorel avant ce
brainstorming : classification par **contenu** (mots-clés sur le texte
extrait, même patron que `identifierFormulaireStandard`
(`formulaires-standards.ts`)), jamais par nom de fichier (jugé non
fiable — dépend du portail qui a généré le fichier).

## Décisions validées avec l'utilisateur

- **Upload : sélection multiple en un seul geste.** Un unique champ
  `<input type="file" multiple>`, un seul appel serveur pour tous les
  fichiers d'un même DAO — pas de flux "ajouter un fichier après coup"
  séparé à maintenir.
- **Combinaison : classer puis concaténer en ordre canonique**, jamais
  extraire fichier par fichier puis fusionner. Chaque fichier est
  normalisé séparément (pipeline `normaliserDao` inchangé), puis classé
  par contenu dans une catégorie (`aao`, `is`, `dpao`, `ccag`, `ccap`,
  `bpu`, `non_classe`), puis les Markdown des catégories `aao` à `ccap`
  sont concaténés dans **cet ordre fixe** en un seul `dao_markdown`.
  `decouperParSection` et `extraireInformationsAo` restent **strictement
  inchangés** — ils ne voient jamais la différence entre 1 fichier et 5.
- **Fichiers `bpu`/`non_classe` : exclus de `dao_markdown`.**
  `extraireInformationsAo` n'utilise aujourd'hui aucun contenu de
  bordereau de prix (le BPU est saisi à la main dans l'onglet BPU
  existant, jamais extrait du DAO) — les concaténer gonflerait le
  contexte envoyé à Claude sans aucun bénéfice. Ces fichiers restent
  stockés et téléchargeables, simplement absents de `dao_markdown`.
- **Modèle de données : additif, pas de migration des AO existants.**
  `appel_offres.fichier_dao_path`/`fichier_dao_nom_original` restent tels
  quels — toujours le **premier fichier** téléversé, code existant
  (bouton télécharger, `storage-path.ts`, repli de titre de
  `SuggestionPrixBpu`) inchangé pour tout AO à un seul fichier (100 % des
  AO existants, et la majorité des futurs). Nouvelle table
  `fichier_dao_supplementaire` pour les fichiers 2+.
- **Bouton "Télécharger le DAO" → liste dès qu'il y a plus d'un
  fichier**, bouton simple inchangé pour un seul fichier. Pas de zip.
- **Garantie de non-régression explicite pour le cas à 1 fichier** :
  quand un seul fichier est téléversé, la classification est **sautée
  entièrement** — `dao_markdown` reste le Markdown de ce fichier tel
  quel, exactement le comportement actuel. La classification/
  concaténation ne s'active qu'à partir de 2 fichiers. Ce choix élimine
  tout risque qu'un faux négatif de classification (mot-clé absent sur
  un DAO réel au phrasé imprévisible) fasse disparaître du contenu sur
  le cas majoritaire.
- **Erreur sur un fichier = échec de tout le traitement**, comme
  aujourd'hui (pas de traitement partiel best-effort) — cohérent avec le
  modèle "tout ou rien" déjà en place pour `statut_traitement`.
- **Limite de taille connue, non traitée** : la limite de 21 Mo par
  requête Server Action (`next.config.ts:bodySizeLimit`) est aujourd'hui
  partagée par un seul fichier (plafond individuel 20 Mo,
  `TAILLE_MAX_OCTETS` dans `schema.ts`) ; avec plusieurs fichiers, elle
  est partagée par l'ensemble de l'upload. Pas de bascule vers un upload
  direct navigateur→Storage (comme la veille BOMP) pour cette brique
  nice-to-have — un dépassement produit l'erreur générique de Next.js
  sur la taille de requête, pas un message applicatif dédié.

## Modèle de données

Nouvelle migration `supabase/migrations/20260928100000_fichier_dao_supplementaire.sql` :

```sql
-- Ingestion DAO multi-fichiers. appel_offres.fichier_dao_path reste le
-- premier fichier téléversé (inchangé, tout le code existant continue de
-- fonctionner tel quel pour un AO à un seul fichier). Cette table porte
-- les fichiers 2+ d'un même DAO éclaté. type_classifie est nullable :
-- rempli après coup par traiterDao une fois la classification par
-- contenu effectuée (best-effort, pour affichage seulement — jamais relu
-- par le traitement lui-même, qui reçoit ses chemins/mimeTypes via le
-- message QStash, pas via cette table).
--
-- ENUM plutôt que text, cohérent avec statut_traitement_ao
-- (20260831140310_appel_offres.sql) — petit ensemble de valeurs fixes,
-- même patron que STATUTS_TRAITEMENT_AO/StatutTraitementAo côté TS (voir
-- TYPES_FICHIER_DAO dans classification-fichier.ts, changement 1). Type
-- et colonne créés dans la même migration : pas de risque du piège
-- ALTER TYPE (mémoire noubinao_postgres_enum_vs_ts_union), qui ne
-- concerne que l'ajout d'une valeur à un enum déjà en prod.
create type type_fichier_dao as enum (
  'aao', 'is', 'dpao', 'ccag', 'ccap', 'bpu', 'non_classe'
);

create table fichier_dao_supplementaire (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  chemin_stockage text not null,
  nom_original text not null,
  type_mime text not null,
  type_classifie type_fichier_dao,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index fichier_dao_supplementaire_appel_offres_id_idx
  on fichier_dao_supplementaire(appel_offres_id);

alter table fichier_dao_supplementaire enable row level security;

create policy "fichier_dao_supplementaire_select_membres" on fichier_dao_supplementaire
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "fichier_dao_supplementaire_insert_membres" on fichier_dao_supplementaire
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "fichier_dao_supplementaire_delete_membres" on fichier_dao_supplementaire
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );
```

Pas de policy `update` : le seul écrivain de `type_classifie` après
l'insertion initiale est `traiterDao`, appelé exclusivement via
`app/api/dao/traiter/route.ts` avec `createServiceRoleClient()` (bypass
RLS) — même raisonnement que `dao_markdown` sur `appel_offres`, jamais
modifié par un client anonyme.

## Changement 1 — nouveau module pur de classification

`lib/appels-offres/normalisation/classification-fichier.ts` :

```ts
export const TYPES_FICHIER_DAO = [
  "aao",
  "is",
  "dpao",
  "ccag",
  "ccap",
  "bpu",
  "non_classe",
] as const;

export type TypeFichierDao = (typeof TYPES_FICHIER_DAO)[number];

// Ordre canonique de concaténation — extraireInformationsAo suppose cet
// ordre (voir contexte de la spec). "bpu" et "non_classe" en sont
// délibérément absents : jamais concaténés dans dao_markdown.
export const ORDRE_CANONIQUE_CONCATENATION: readonly TypeFichierDao[] = [
  "aao",
  "is",
  "dpao",
  "ccag",
  "ccap",
];

interface MotsClesType {
  type: TypeFichierDao;
  motsCles: string[];
}

// Premier type dont un mot-clé apparaît dans le document qui l'emporte.
// Un DAO à un seul fichier (contenant tous les mots-clés) tombe toujours
// sur "aao" en premier — comportement voulu, mais cette fonction n'est
// appelée qu'à partir de 2 fichiers (voir assemblerDaoMarkdown) : pour un
// seul fichier, la classification est sautée entièrement, sans risque de
// faux négatif sur le cas majoritaire.
const REGISTRE: MotsClesType[] = [
  { type: "aao", motsCles: ["avis d'appel d'offres", "avis d'appel d'offre"] },
  {
    type: "is",
    motsCles: ["instructions aux soumissionnaires", "instructions aux candidats"],
  },
  { type: "dpao", motsCles: ["données particulières de l'appel d'offres", "données particulières"] },
  {
    type: "ccag",
    motsCles: ["cahier des clauses administratives générales"],
  },
  {
    type: "ccap",
    motsCles: ["cahier des clauses administratives particulières"],
  },
  { type: "bpu", motsCles: ["bordereau des prix", "devis quantitatif et estimatif", "devis quantitatif"] },
];

function normaliser(texte: string): string {
  return texte.toLowerCase().replace(/['’‘]/g, "'");
}

export function classifierTypeFichierDao(markdown: string): TypeFichierDao {
  const texteNormalise = normaliser(markdown);
  for (const { type, motsCles } of REGISTRE) {
    if (motsCles.some((mot) => texteNormalise.includes(normaliser(mot)))) {
      return type;
    }
  }
  return "non_classe";
}

export interface FichierClasse {
  type: TypeFichierDao;
  markdown: string;
}

// Regroupe par catégorie canonique (dans ORDRE_CANONIQUE_CONCATENATION),
// concatène les fichiers d'une même catégorie dans leur ordre d'upload
// (deux fichiers classés "dpao" restent tous deux inclus, l'un après
// l'autre — pas de déduplication, pas de détection de contradiction).
// "bpu"/"non_classe" jamais inclus. Séparateur double saut de ligne pour
// ne jamais fusionner la dernière ligne d'un fichier avec la première du
// suivant.
export function assemblerDaoMarkdown(fichiersClasses: FichierClasse[]): string {
  return ORDRE_CANONIQUE_CONCATENATION.map((type) =>
    fichiersClasses
      .filter((f) => f.type === type)
      .map((f) => f.markdown)
      .join("\n\n"),
  )
    .filter((bloc) => bloc.length > 0)
    .join("\n\n");
}
```

## Changement 2 — schéma de validation multi-fichiers

`lib/appels-offres/schema.ts`, le schéma actuel :

```ts
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
```

devient (même validation par fichier, appliquée à un tableau non vide) :

```ts
const fichierDaoUnique = z
  .instanceof(File)
  .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
    message: "Chaque fichier doit faire moins de 20 Mo",
  })
  .refine(
    (f) => (MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(f.type),
    { message: "Type de fichier non accepté (PDF ou DOCX uniquement)" },
  );

export const televerserDaoSchema = z.object({
  fichiers: z.array(fichierDaoUnique).min(1, "Ajoutez au moins un fichier"),
});
```

`TeleverserDaoInput` (déjà exporté via `z.infer`) reflète automatiquement
le nouveau type `{ fichiers: File[] }`.

## Changement 3 — `televerserDao` (`lib/appels-offres/actions.ts`)

Le premier fichier suit exactement le chemin actuel
(`appel_offres.fichier_dao_path`/`fichier_dao_nom_original`). Les
fichiers suivants sont uploadés et enregistrés dans
`fichier_dao_supplementaire`. Tous les fichiers sont uploadés **avant**
toute écriture en base (comme aujourd'hui, où l'upload précède
l'insertion de `appel_offres`) — un échec d'upload sur n'importe quel
fichier annule tout sans avoir touché la base.

```ts
export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichiers: formData.getAll("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichiers } = parsed.data;
  const appelOffresId = randomUUID();
  const supabase = await createClient();

  const cheminsUploades: string[] = [];
  const cheminsFichiers = fichiers.map((fichier, index) =>
    construireCheminStockageDao(utilisateur.entreprise_id, appelOffresId, fichier.name, index),
  );

  for (let i = 0; i < fichiers.length; i++) {
    const { error: erreurUpload } = await supabase.storage
      .from("documents")
      .upload(cheminsFichiers[i], fichiers[i], { contentType: fichiers[i].type });

    if (erreurUpload) {
      if (cheminsUploades.length > 0) {
        await supabase.storage.from("documents").remove(cheminsUploades);
      }
      return { erreur: "Échec de l'envoi du fichier. Réessayez." };
    }
    cheminsUploades.push(cheminsFichiers[i]);
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminsFichiers[0],
    fichier_dao_nom_original: fichiers[0].name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("documents").remove(cheminsUploades);
    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  if (fichiers.length > 1) {
    const { error: erreurFichiersSupplementaires } = await supabase
      .from("fichier_dao_supplementaire")
      .insert(
        fichiers.slice(1).map((fichier, index) => ({
          appel_offres_id: appelOffresId,
          chemin_stockage: cheminsFichiers[index + 1],
          nom_original: fichier.name,
          type_mime: fichier.type,
          ordre: index + 1,
          created_by: utilisateur.id,
        })),
      );

    if (erreurFichiersSupplementaires) {
      await supabase.from("appel_offres").delete().eq("id", appelOffresId);
      await supabase.storage.from("documents").remove(cheminsUploades);
      return { erreur: "Échec de l'enregistrement des fichiers du DAO. Réessayez." };
    }
  }

  try {
    await mettreEnFileTraitementDao(
      appelOffresId,
      fichiers.map((fichier, index) => ({
        cheminStockage: cheminsFichiers[index],
        mimeType: fichier.type,
      })),
    );
  } catch {
    await supabase.from("appel_offres").delete().eq("id", appelOffresId);
    await supabase.storage.from("documents").remove(cheminsUploades);
    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId };
}
```

`construireCheminStockageDao` (`storage-path.ts`) gagne un paramètre
`index` pour garantir l'unicité même si deux fichiers ont un nom nettoyé
identique (ex. deux fichiers nommés `Document.pdf` par l'acheteur) :

```ts
export function construireCheminStockageDao(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
  index = 0,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-${index}-${nomNettoye}`;
}
```

`index = 0` par défaut : tout appelant existant (il n'y en a qu'un,
`televerserDao`, réécrit ci-dessus) reste compatible sans modification
de signature ailleurs. Note : ce changement de format de chemin ne
s'applique qu'aux **nouveaux** AO téléversés après ce déploiement — les
AO déjà en base gardent leur `fichier_dao_path` existant (sans le
segment `-index-`), inchangé et toujours valide (le chemin est stocké
tel quel en base, jamais reconstruit).

## Changement 4 — file d'attente (`lib/appels-offres/file-attente.ts`)

```ts
export interface FichierATraiter {
  cheminStockage: string;
  mimeType: string;
}

export async function mettreEnFileTraitementDao(
  appelOffresId: string,
  fichiers: FichierATraiter[],
): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallback(),
    body: { appelOffresId, fichiers },
  });
}
```

Le message QStash porte la liste complète (chemin + type MIME) de tous
les fichiers, premier compris — `traiterDao` n'a plus besoin de relire
`appel_offres.fichier_dao_path` pour connaître le chemin du premier
fichier, il vient du message comme les autres. Ceci simplifie
`traiterDao` (un seul type de source pour tous les fichiers) au prix
d'une petite duplication (le chemin du premier fichier existe à la fois
dans `appel_offres.fichier_dao_path` et dans le message QStash) déjà
présente aujourd'hui pour le seul champ `mimeType`, qui n'a jamais été
persisté en base et n'a toujours vécu que dans le message.

## Changement 5 — `app/api/dao/traiter/route.ts`

Le parsing du corps de la requête change de forme :

```ts
let appelOffresId: string;
let fichiers: { cheminStockage: string; mimeType: string }[];
try {
  ({ appelOffresId, fichiers } = JSON.parse(corpsBrut) as {
    appelOffresId: string;
    fichiers: { cheminStockage: string; mimeType: string }[];
  });
} catch {
  return new Response("Corps de requête invalide", { status: 400 });
}
```

Et l'appel `traiterDao(supabase, appelOffresId, fichiers)` (nouvelle
signature, changement 6). Tout le reste du fichier (vérification de
signature QStash, `maxDuration`) reste inchangé.

## Changement 6 — `traiterDao` (`lib/appels-offres/traitement.ts`)

Remplace uniquement le bloc de normalisation (lignes 28-65 actuelles) —
le reste de la fonction (statut "extraction", `decouperParSection`,
`extraireInformationsAo`, écriture des exigences, mise à jour finale,
`dossier_reponse` best-effort, gestion d'erreur globale) est **inchangé
au caractère près**.

```ts
export async function traiterDao(
  supabase: SupabaseClient,
  appelOffresId: string,
  fichiers: { cheminStockage: string; mimeType: string }[],
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
      if (fichiers.length === 0) {
        throw new Error("Aucun fichier DAO associé à cet appel d'offres.");
      }

      const { error: erreurStatutNormalisation } = await supabase
        .from("appel_offres")
        .update({ statut_traitement: "normalisation" })
        .eq("id", appelOffresId);

      if (erreurStatutNormalisation) {
        throw new Error("Échec de la mise à jour du statut 'normalisation'.");
      }

      const fichiersNormalises: { fichier: FichierATraiter; markdown: string }[] = [];

      for (const fichier of fichiers) {
        const { data: fichierData, error: erreurTelechargement } = await supabase.storage
          .from("documents")
          .download(fichier.cheminStockage);

        if (erreurTelechargement || !fichierData) {
          throw new Error(
            `Échec du téléchargement du fichier DAO depuis le stockage : ${fichier.cheminStockage}.`,
          );
        }

        const buffer = Buffer.from(await fichierData.arrayBuffer());
        const resultat = await normaliserDao(buffer, fichier.mimeType);
        fichiersNormalises.push({ fichier, markdown: resultat.markdown });
      }

      // Un seul fichier : comportement identique à avant l'introduction du
      // multi-fichiers, aucune classification — élimine tout risque qu'un
      // faux négatif de classification supprime du contenu sur le cas
      // majoritaire (voir décisions validées).
      if (fichiersNormalises.length === 1) {
        markdown = fichiersNormalises[0].markdown;
      } else {
        const fichiersClasses = fichiersNormalises.map(({ markdown: md }) => ({
          type: classifierTypeFichierDao(md),
          markdown: md,
        }));
        markdown = assemblerDaoMarkdown(fichiersClasses);

        // Best-effort : affichage seulement, ne doit jamais faire échouer
        // un traitement par ailleurs réussi. Le fichier d'indice 0
        // correspond à appel_offres.fichier_dao_path, jamais à une ligne
        // de fichier_dao_supplementaire — on ne met à jour que les
        // fichiers 2+.
        for (let i = 1; i < fichiersClasses.length; i++) {
          const { error: erreurClassification } = await supabase
            .from("fichier_dao_supplementaire")
            .update({ type_classifie: fichiersClasses[i].type })
            .eq("appel_offres_id", appelOffresId)
            .eq("chemin_stockage", fichiers[i].cheminStockage);

          if (erreurClassification) {
            console.error(
              "Échec de l'enregistrement du type classifié (best-effort) :",
              erreurClassification.message,
            );
          }
        }
      }

      const { error: erreurEnregistrementMarkdown } = await supabase
        .from("appel_offres")
        .update({ dao_markdown: markdown })
        .eq("id", appelOffresId);

      if (erreurEnregistrementMarkdown) {
        throw new Error("Échec de l'enregistrement du markdown normalisé.");
      }
    }

    // ... reste de la fonction inchangé (statut "extraction", decouperParSection,
    // extraireInformationsAo, exigence_ao, mise à jour finale, dossier_reponse) ...
  } catch (erreur) {
    // ... inchangé ...
  }
}
```

Nouveaux imports :
`import { classifierTypeFichierDao, assemblerDaoMarkdown } from "./normalisation/classification-fichier";`
et le type `FichierATraiter` depuis `./file-attente`.

## Changement 7 — lecture de l'AO (`lib/appels-offres/queries.ts`, `obtenirAppelOffres`)

Ajoute une requête pour les fichiers supplémentaires, même patron que
`listerBpu` (requête séparée, pas de jointure imbriquée supabase-js) :

```ts
const { data: fichiersSupplementaires, error: erreurFichiers } = await supabase
  .from("fichier_dao_supplementaire")
  .select("*")
  .eq("appel_offres_id", id)
  .order("ordre", { ascending: true });

if (erreurFichiers) throw erreurFichiers;
```

Ajouté à l'objet retourné (`fichiersSupplementaires: (fichiersSupplementaires ?? []) as FichierDaoSupplementaire[]`),
nouveau type dans `types.ts` :

```ts
import type { TypeFichierDao } from "./normalisation/classification-fichier";

export interface FichierDaoSupplementaire {
  id: string;
  appel_offres_id: string;
  chemin_stockage: string;
  nom_original: string;
  type_mime: string;
  type_classifie: TypeFichierDao | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}
```

## Changement 8 — Interface

**`televerser-dao-dialog.tsx`** : le champ passe en sélection multiple.

```tsx
<Input
  id="fichier"
  name="fichier"
  type="file"
  accept=".pdf,.docx"
  multiple
  required
  disabled={envoi}
/>
```

`formData.getAll("fichier")` (au lieu de `.get`) est déjà géré côté
serveur par le changement 3 — aucun changement côté client au-delà de
l'attribut `multiple`, le navigateur associe automatiquement tous les
fichiers sélectionnés au même champ `name="fichier"`.

**`appel-offres-detail.tsx`** : le bouton unique devient une liste dès
qu'il y a des fichiers supplémentaires. `telecharger` prend le chemin en
paramètre (au lieu de lire `appelOffres.fichier_dao_path` en dur) pour
être réutilisable par chaque ligne :

```tsx
async function telecharger(cheminStockage: string) {
  setTelechargement(true);
  const resultat = await genererUrlTelechargementDao(cheminStockage);
  setTelechargement(false);

  if ("erreur" in resultat) {
    toast.error(resultat.erreur);
    return;
  }
  window.open(resultat.url, "_blank");
}
```

```tsx
{appelOffres.fichier_dao_path && fichiersSupplementaires.length === 0 && (
  <Button variant="outline" onClick={() => telecharger(appelOffres.fichier_dao_path!)} disabled={telechargement}>
    {t("boutonTelecharger")}
  </Button>
)}
{appelOffres.fichier_dao_path && fichiersSupplementaires.length > 0 && (
  <div className="flex flex-col gap-1">
    <Button
      variant="outline"
      size="sm"
      onClick={() => telecharger(appelOffres.fichier_dao_path!)}
      disabled={telechargement}
    >
      {appelOffres.fichier_dao_nom_original ?? t("boutonTelecharger")}
    </Button>
    {fichiersSupplementaires.map((f) => (
      <Button
        key={f.id}
        variant="outline"
        size="sm"
        onClick={() => telecharger(f.chemin_stockage)}
        disabled={telechargement}
      >
        {f.nom_original}
      </Button>
    ))}
  </div>
)}
```

`fichiersSupplementaires` transmis en prop depuis `page.tsx`, issu du
changement 7 : `obtenirAppelOffres(id, ...)` (déjà appelé dans
`page.tsx:32`, résultat nommé `resultat`) porte désormais aussi
`resultat.fichiersSupplementaires` — pas de nouvel appel de requête dans
`page.tsx`, juste
`<AppelOffresDetail fichiersSupplementaires={resultat.fichiersSupplementaires} ... />`
ajouté aux props déjà passées (ligne 87-107), et `AppelOffresDetail`
gagne la prop correspondante
(`fichiersSupplementaires: FichierDaoSupplementaire[]`).

## Changement 9 — Traductions (`messages/fr.json`, `messages/en.json`)

`AppelsOffres.dialog.champFichier` : `"Fichier (PDF ou DOCX)"` →
`"Fichier(s) (PDF ou DOCX)"` (et l'équivalent anglais
`"File(s) (PDF or DOCX)"`). Aucune autre clé nouvelle — la liste de
téléchargement réutilise les noms de fichiers réels comme libellés de
bouton, pas de nouvelle chaîne à traduire pour ça.

## États et erreurs

- Un seul fichier sélectionné : comportement rigoureusement identique à
  aujourd'hui à chaque étape (upload, chemin de stockage inchangé au
  suffixe `-0-` près, classification sautée, `dao_markdown` = le fichier
  tel quel).
- Deux fichiers ou plus, dont un échoue à l'upload : tous les fichiers
  déjà uploadés sont supprimés du storage, rien n'est écrit en base,
  message d'erreur générique existant.
- Deux fichiers ou plus, aucun ne matche un mot-clé canonique (tous
  `non_classe`/`bpu`) : `dao_markdown` devient une chaîne vide,
  l'extraction ne trouve rien (comportement dégradé mais non bloquant,
  `statut_traitement` atteint quand même `"termine"`) — cas rare, pas de
  filet de sécurité supplémentaire en V1 (voir Hors périmètre).
- Deux fichiers classés dans la même catégorie (ex. DPAO en deux
  parties) : concaténés l'un après l'autre dans leur ordre d'upload,
  aucune déduplication ni détection de contradiction.
- Échec de normalisation sur un seul fichier parmi plusieurs : échec de
  tout `traiterDao`, `statut_traitement` passe à `"erreur"` avec le
  message identifiant le fichier en cause — même modèle "tout ou rien"
  qu'aujourd'hui.
- Dépassement de la limite de 21 Mo cumulée : erreur générique Next.js
  au niveau framework, avant même d'atteindre `televerserDao` — connu,
  non traité spécifiquement (voir Décisions validées).

## Tests

- `classifierTypeFichierDao` (TDD, nouveau fichier
  `lib/appels-offres/normalisation/classification-fichier.test.ts`) :
  - Un texte contenant "Avis d'Appel d'Offres" (et ses variantes
    d'apostrophe) est classé `aao`.
  - Un texte contenant "Instructions aux soumissionnaires" (et sa
    variante "candidats") est classé `is`.
  - Idem pour `dpao`, `ccag`, `ccap`, `bpu` (au moins une variante de
    mot-clé chacun).
  - Un texte contenant tous les mots-clés (cas du fichier unique) est
    classé `aao` (premier du registre) — verrouille le comportement
    voulu pour le repli à 1 fichier, même si cette fonction n'est en
    pratique jamais appelée dans ce cas (changement 6).
  - Un texte sans aucun mot-clé connu est classé `non_classe`.
- `assemblerDaoMarkdown` (même fichier de test) :
  - Fichiers classés dans l'ordre canonique (`aao`, `is`, `dpao`) :
    concaténés dans cet ordre, indépendamment de leur ordre dans le
    tableau d'entrée.
  - Deux fichiers classés `dpao` : tous deux inclus, dans leur ordre
    d'apparition dans le tableau d'entrée.
  - Fichier classé `bpu` ou `non_classe` : absent du résultat.
  - Tableau ne contenant que des fichiers `bpu`/`non_classe` : résultat
    une chaîne vide.
  - Tableau vide : résultat une chaîne vide.
- Aucun test sur `televerserDao`, `traiterDao`, `route.ts` ni les
  composants UI — cohérent avec le reste du projet (Server Actions et
  composants non testés directement).

## Hors périmètre

- Détection/signalement des contradictions entre fichiers (ex. deux DPAO
  avec des critères différents) — concaténation brute, à l'utilisateur
  de relire.
- Filet de sécurité si aucun fichier ne matche un mot-clé canonique
  (repli vers une concaténation de tous les fichiers indépendamment de
  leur classification) — cas rare jugé non prioritaire pour cette
  brique nice-to-have, à reconsidérer si rencontré sur un cas réel.
- Upload direct navigateur→Storage pour contourner la limite de 21 Mo
  (comme la veille BOMP) — cette brique reste sur le flux Server Action
  existant.
- Affichage du type classifié dans l'interface (ex. badge "DPAO" à côté
  du nom de fichier) — la colonne `type_classifie` existe en base pour
  un usage futur, mais la liste de téléchargement de ce sous-projet
  n'affiche que les noms de fichiers.
- Formats bailleurs (Banque mondiale, BAD) — hors V1 du produit entier,
  rappel du garde-fou CLAUDE.md, sans rapport particulier avec ce
  sous-projet mais toujours applicable.
