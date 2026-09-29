# Veille nationale des AO par scraping marchespublics.ci

Date : 2026-09-29 (réécrite le même jour après correction d'une erreur
factuelle — voir ci-dessous).
Statut : décisions validées avec l'utilisateur (section par section).

## Contexte

**Correction importante avant tout le reste** : cette spec a d'abord été
écrite en supposant qu'aucune veille n'existait encore dans le code (sur
la foi de la mémoire `noubinao_veille_sigmap_en_pause`, qui disait « BOMP
jamais implémentée »). **C'était faux.** Vérification directe du dépôt :
la veille BOMP est en réalité **entièrement implémentée et mergée sur
`main`** (19 commits, du 2026-09-23 au 2026-09-25 environ) — pipeline
QStash en deux temps (découpage PDF puis structuration IA par avis),
écran client `/veille` (liste, filtres secteur/type, recherche, import),
écran admin `/admin/veille` (upload BOMP + suivi des éditions), tables
`bomp_numero`/`avis_ao_national`/`avis_ao_national_importation`,
fonction `importer_avis_national`. Données réelles déjà en base au
moment de cette spec : 1 `bomp_numero` traité, 46 `avis_ao_national`
extraits, 0 import. La mémoire du projet sera corrigée après validation
de cette spec — ne pas répéter cette erreur dans une future session.

Priorité #1 de la feuille de route stratégique ("Le Cap NoubinAO"), donc
déjà partiellement construite — mais bloquée par sa dépendance au relais
manuel hebdomadaire d'un client pilote pour obtenir le PDF du BOMP (voir
spec `2026-09-22-veille-bomp-design.md`, section « Pas encore tranché »),
jamais vraiment résolue en pratique.

**Déblocage (2026-09-29)** : `https://marchespublics.ci/appel_offre`
(portail public DGMP — Direction Générale des Marchés Publics, site
legacy PHP/CodeIgniter) expose la liste complète des avis d'appels
d'offres dans une table HTML serveur classique (`DataTable` jQuery
initialisée **sans** `serverSide: true`), **sans authentification, sans
JS nécessaire côté scraper, sans pagination API, sans dépendance à un
client pilote**. Vérifié par `curl` direct : 200, ~1,2 Mo, ~560 lignes de
données, dates jusqu'à fin 2027. `robots.txt` absent (404), aucune CGU
trouvée.

**Colonnes disponibles dans la table source** : Numéro AO, Type de
marché (texte libre : TRAVAUX/FOURNITURE/PRESTATION/...), Objet, Autorité
Contractante (souvent vide dans l'échantillon inspecté), Date de
publication (**champ peu fiable**, ex. `30-11--0001` observé — ne pas
bloquer dessus), Date limite (fiable).

**Piège trouvé à la vérification (ne pas répéter)** : la colonne
« Numéro AO » (→ colonne existante `avis_ao_national.reference`) n'est
**pas unique** dans la source — `T 73/2023` apparaît deux fois avec des
objets complètement différents (vraie collision de numérotation côté
DGMP, pas un doublon d'affichage). La clé de dédoublonnage doit être
composite `(reference, objet)`, jamais `reference` seule.

## Décision de fond : remplacer BOMP, pas ajouter à côté

Discuté avec l'utilisateur une fois l'erreur factuelle ci-dessus
corrigée. Trois options posées : remplacer BOMP, ajouter en parallèle
(deux sources dans la même table), ou séparer complètement (nouvelle
table). **Choix : remplacer.** Le scraping `marchespublics.ci` alimente
désormais la table `avis_ao_national` **existante** à la place du
pipeline BOMP (PDF + IA), qui est **décommissionné** — code mort retiré,
pas laissé de côté « au cas où » (cohérent avec CLAUDE.md, éviter les
implémentations à moitié). Les écrans `/veille` (client) et
`/admin/veille` (admin) sont **conservés**, adaptés plutôt que
reconstruits.

**Pourquoi remplacer plutôt que garder les deux** : le pipeline BOMP
dépend d'un relais manuel hebdomadaire jamais vraiment résolu (voir
Contexte) et coûte un appel Claude par avis (~40/semaine) pour une
structuration que `marchespublics.ci` fournit déjà toute faite en
colonnes. Faire cohabiter deux pipelines pour la même donnée finale
(avis dans `avis_ao_national`) ajoute de la complexité (deux formats de
statut, deux origines à distinguer dans l'UI, deux jobs QStash à
surveiller) sans bénéfice clair une fois la source automatique
disponible.

**Sort des 46 avis déjà en base (issus du seul BOMP traité)** : conservés
tels quels, pas de purge spéciale — ce sont de vrais AO potentiellement
encore ouverts. Le mécanisme de nettoyage par date limite (voir Pipeline,
étape 6) les fera disparaître naturellement à mesure qu'ils expirent,
exactement comme n'importe quelle ligne issue du nouveau scraper. Le
`bomp_numero` associé reste en base pour l'intégrité référentielle
(`avis_ao_national.bomp_numero_id`), simplement plus jamais alimenté.

## Ce qui est décommissionné (à supprimer, pas à garder inactif)

- `lib/veille/chunking.ts` + `chunking.test.ts` — découpage PDF par motif
  `ARTICLE 1`.
- `lib/veille/decoupage.ts` + `decoupage.test.ts` — orchestration du
  découpage d'un `bomp_numero`.
- `lib/veille/structuration-avis.ts` + `structuration-avis.test.ts` —
  appel Claude de structuration par avis.
- `lib/veille/structurer.ts` + `structurer.test.ts` — orchestration de la
  structuration.
- `lib/veille/file-attente.ts` — `mettreEnFileDecoupageBomp`/
  `mettreEnFileStructurationAvis` (QStash), remplacé par le nouveau
  schedule (voir Pipeline).
- `app/api/veille/decouper/route.ts` et `app/api/veille/structurer/route.ts`
  — remplacés par un seul nouvel endpoint (voir Pipeline).
- `app/admin/veille/upload-bomp-form.tsx` — plus de dépôt manuel de PDF.
- Dans `lib/veille/actions.ts` : `demarrerUploadBomp` et
  `confirmerUploadBomp` (garder `importerAvis`, inchangée).
- Dans `lib/veille/schema.ts` : `demarrerUploadBompSchema`,
  `confirmerUploadBompSchema`, `TAILLE_MAX_BOMP_OCTETS`,
  `AvisStructureSchema` (remplacé par un schéma de validation propre au
  scraping, voir Pipeline).
- Dans `lib/veille/types.ts` : `StatutTraitementBomp` (le nouveau
  pipeline n'a pas d'états intermédiaires par avis — un avis scrapé est
  structuré dès son insertion). `BompNumero` et `TYPES_AVIS_AO_NATIONAL`
  restent (le type d'enum `type_avis_ao_national` est réutilisé, voir
  Pipeline).

**Non touché délibérément** : la table `bomp_numero` elle-même (garde
son unique ligne historique), le bucket storage `bomp-national` et ses
policies (fichier déjà traité toujours potentiellement utile à relire,
aucun coût à le laisser), `lib/veille/queries.ts::listerBompNumeros`
(devient inutilisée par l'UI mais inoffensive — décision : la retirer
quand même dans le plan, puisqu'une fonction exportée non appelée nulle
part est un signal trompeur pour un futur lecteur, contrairement à une
table de données historiques).

## Modèle de données

Migration sur les tables **existantes**, pas de nouvelles tables pour le
catalogue d'avis (seule `veille_execution` est nouvelle, pour la
supervision — voir plus bas).

```sql
-- bomp_numero_id n'est plus systématique : un avis scrapé depuis
-- marchespublics.ci n'appartient à aucune édition BOMP.
alter table avis_ao_national alter column bomp_numero_id drop not null;

-- texte_brut portait un fragment du PDF source pour traçabilité — un
-- avis scrapé n'a pas d'équivalent (les champs viennent directement de
-- colonnes HTML structurées, pas d'un bloc de texte à reparser).
alter table avis_ao_national alter column texte_brut drop not null;

-- Dédoublonnage : voir piège documenté en Contexte. Un avis BOMP
-- existant peut en théorie entrer en collision avec un avis scrapé
-- ayant la même (reference, objet) — accepté comme cas limite
-- improbable (formats de référence différents en pratique, "T 1370/2026"
-- côté scraper vs références telles qu'extraites du BOMP), pas guardé
-- spécifiquement.
alter table avis_ao_national add constraint avis_ao_national_reference_objet_key
  unique (reference, objet);

create type statut_execution_veille as enum ('succes', 'erreur');

create table veille_execution (
  id uuid primary key default gen_random_uuid(),
  execute_le timestamptz not null default now(),
  statut statut_execution_veille not null,
  nombre_ao_trouves integer,
  nombre_nouveaux_ao integer,
  erreur_message text
);

alter table veille_execution enable row level security;

create policy "veille_execution_select_super_admin" on veille_execution
  for select using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );
```

Aucune autre policy à toucher : `avis_ao_national_select_authenticated`
et `avis_importation_*` existent déjà et couvrent le nouveau flux sans
changement (le job de scraping écrit via `createServiceRoleClient`,
bypasse RLS, même patron que `traiterDao`). La policy
`avis_ao_national_write_super_admin` (écriture via l'app par un
utilisateur authentifié) devient inutilisée en pratique puisque plus
personne n'insère d'avis depuis le navigateur — laissée telle quelle,
inoffensive.

**Piège déjà documenté dans le projet, applicable à la migration
ci-dessus** : `alter column ... drop not null` ne nécessite pas de
`with check`, mais toute nouvelle policy ajoutée dans une future
itération devra y penser (mémoire `noubinao_rls_with_check_gotcha`).

## Colonnes existantes réutilisées telles quelles (mapping)

| Colonne `avis_ao_national` | Origine pour un avis scrapé |
|---|---|
| `reference` | Numéro AO (colonne source) |
| `type` | Type de marché (colonne source), mappé vers l'enum `type_avis_ao_national` existant — voir table de correspondance ci-dessous |
| `objet` | Objet (colonne source) |
| `autorite_contractante` | Autorité Contractante (colonne source, souvent vide → `null`) |
| `secteur` | toujours `null` (absent de la source, décision déjà actée — voir Hors périmètre) |
| `montant_caution` | toujours `null` (absent de la source) |
| `date_limite_remise_offres` | Date limite (colonne source, fiable) |
| `contact_retrait` | toujours `null` (absent de la source — contrairement au BOMP qui le donnait via ARTICLE 7) |
| `nombre_lots` | toujours `null` (absent de la source) |
| `bomp_numero_id` | toujours `null` |
| `texte_brut` | toujours `null` |
| `structure_le` | horodatage de l'insertion (l'avis est « structuré » dès le scraping, pas d'étape asynchrone séparée) |

**Table de correspondance Type de marché → `type_avis_ao_national`** (à
valider/étendre en plan d'implémentation contre un échantillon plus
large que celui déjà inspecté) :

```
TRAVAUX      → 'travaux'
FOURNITURE   → 'fournitures'
PRESTATION   → 'prestations'
(valeur non reconnue) → null
```

Aucune valeur « manifestation d'intérêt » observée dans l'échantillon
inspecté jusqu'ici — le mapping reste ouvert à cette 4ᵉ valeur si elle
apparaît sous un libellé à découvrir en pratique, sans bloquer le reste
du mapping si absente.

## Pipeline de scraping

Beaucoup plus simple que le pipeline BOMP décommissionné (pas de PDF, pas
de chunking texte libre, pas de structuration IA, pas de job QStash par
avis — les données sont déjà structurées en colonnes). Une seule étape
synchrone.

**Nouvelle dépendance** : `cheerio` (parseur HTML léger, style jQuery
côté serveur — absent du projet aujourd'hui, à ajouter). Cohérent avec
le principe du projet de ne pas construire de parseur maison quand un
outil existant suffit.

1. **Schedule QStash quotidien** (`npm run veille-marches-publics-schedule`,
   même patron que `email-sync-schedule` — script one-shot par
   environnement, à lancer une fois en prod après déploiement, jamais au
   runtime).
2. Callback signé vers `/api/veille/marches-publics/sync` (nouveau Route
   Handler, `Receiver` QStash + vérification signature, même patron que
   `/api/dao/traiter` et `/api/email/sync` — remplace les deux anciens
   endpoints `decouper`/`structurer`).
3. `lib/veille/marches-publics.ts` (nouveau module, remplace
   `chunking.ts`/`decoupage.ts`/`structuration-avis.ts`/`structurer.ts`) :
   - `recupererPageAppelOffres(): Promise<string>` — `fetch` natif vers
     `https://marchespublics.ci/appel_offre`, aucune authentification.
   - `extraireAvisDepuisHtml(html: string): AvisScrapeResult[]` —
     `cheerio.load(html)`, sélectionne `#example tbody tr`, extrait les 6
     colonnes, mappe `type` selon la table de correspondance ci-dessus.
     `date_publication` ignorée (jamais stockée, colonne inexistante côté
     avis scrapé). `date_limite` : parsing tolérant (format
     `JJ-MM-AAAA`), valeur invalide → `null`, ne bloque jamais
     l'extraction du reste de la ligne.
4. **Filtre par date limite, avant tout upsert** : ne retenir que les
   avis dont `date_limite` est strictement dans le futur au moment du
   scraping (`date_limite >= aujourd'hui`). Un avis avec `date_limite`
   non parsable (`null`) est **exclu**, pas retenu par défaut — la
   source décrit ce champ comme fiable, donc un échec de parsing signale
   plutôt une donnée aberrante qu'un cas à afficher quand même. Sur
   l'échantillon inspecté (~560 lignes, dates remontant à 2022), la
   grande majorité serait exclue dès ce filtre.
5. Pour chaque avis retenu : `upsert` sur `avis_ao_national` par la
   nouvelle contrainte `(reference, objet)` — insertion si nouveau
   (`bomp_numero_id`/`texte_brut` = `null`, `structure_le` = maintenant),
   sinon mise à jour de `date_limite_remise_offres`/`autorite_contractante`/
   `type` (au cas où la source les corrige après coup) si déjà existant.
6. **Nettoyage des avis devenus échus, tous pipelines confondus** :
   `delete from avis_ao_national where date_limite_remise_offres < aujourd'hui`.
   S'applique aussi bien aux avis scrapés qu'aux 46 avis BOMP historiques
   déjà en base — un avis expiré ne doit plus apparaître, quelle que soit
   son origine. Suppression cascade sur `avis_ao_national_importation`
   acceptée : un AO expiré ne doit plus être importable, et
   l'`appel_offres` déjà créé par un client qui l'avait importé n'est pas
   affecté (clé étrangère séparée).
7. Écrit une ligne `veille_execution` (`statut`, `nombre_ao_trouves` =
   nombre de lignes retenues après le filtre par date, avant upsert,
   `nombre_nouveaux_ao` = compte des insertions).

## Écran client « Veille » (existant, ajustements mineurs)

Route `/veille` et `VeilleTable` **inchangés** dans leur structure —
liste triée par `date_limite_remise_offres`, filtres secteur/type,
recherche texte sur l'objet, bouton import, tout continue de fonctionner
tel quel puisque les avis scrapés remplissent les mêmes colonnes que les
avis BOMP.

**Seul ajustement réel** : le filtre secteur (`select` peuplé depuis
`avis.map(a => a.secteur)`) affichera de moins en moins d'options utiles
à mesure que les avis BOMP expirent et sont remplacés par des avis
scrapés (`secteur` toujours `null`) — comportement attendu, pas un bug,
cohérent avec la décision « secteur vide en V1 » déjà actée. Rien à
coder spécifiquement pour ça, le filtre continue de fonctionner (options
vides simplement).

## Écran admin « Veille — Supervision » (réécrit)

Route `/admin/veille` et sa garde `super_admin` inchangées. Contenu
remplacé :

- **Retiré** : `<UploadBompForm />`, tableau des `bomp_numero`.
- **Ajouté** : liste des `veille_execution` récentes — date, statut,
  nombre d'AO trouvés, nombre de nouveaux AO, message d'erreur le cas
  échéant. Même structure de tableau que l'actuel (pas de nouveau
  composant partagé à construire, un tableau HTML simple comme
  l'existant suffit).

## États et erreurs

- Le scraping échoue à joindre `marchespublics.ci` (timeout, blocage
  géo/anti-bot depuis l'infra Vercel — **risque non encore vérifié
  depuis la prod**, seulement testé depuis cette session) :
  `veille_execution.statut = 'erreur'`, `erreur_message` renseigné,
  visible dans `/admin/veille`. Aucune ligne `avis_ao_national` touchée
  (ni insertion, ni le nettoyage de l'étape 6 — un échec de scraping ne
  doit jamais purger les avis existants par accident).
- La structure HTML de la table change (colonnes réordonnées,
  `id="example"` renommé) et `extraireAvisDepuisHtml` ne trouve aucune
  ligne : même traitement que ci-dessus.
- Une ligne source a une `reference` déjà vue mais un `objet` différent
  (collision confirmée dans l'échantillon, voir Contexte) : traitée
  comme un **nouvel avis distinct**, jamais fusionné avec l'existant —
  exactement ce que permet la contrainte composite `(reference, objet)`.
- Import d'un avis déjà importé par la même entreprise : inchangé,
  toujours géré par `importerAvis`/`importer_avis_national` (contrainte
  `unique (avis_id, entreprise_id)`).
- Utilisateur non `super_admin` sur `/admin/veille` : inchangé
  (redirection existante).

## Tests

- `lib/veille/marches-publics.ts` : TDD sur `extraireAvisDepuisHtml`,
  avec un extrait réel de la page capturée comme fixture — au moins un
  cas couvrant la collision `reference` dupliquée avec objet différent
  (`T 73/2023`, observé dans le fichier réel), un cas de mapping de type
  (TRAVAUX/FOURNITURE/PRESTATION/valeur inconnue → `null`), et un cas de
  `date_limite` invalide devenant `null` sans faire échouer la ligne.
- Logique de filtre par date + upsert + comptage `nombre_nouveaux_ao` :
  testée en isolant la fonction pure (avis extraits + date du jour →
  avis retenus / décisions insert-update), sans appel réseau ni Supabase
  réel.
- Tests existants à retirer avec leur module : `chunking.test.ts`,
  `decoupage.test.ts`, `structuration-avis.test.ts`, `structurer.test.ts`.
- Pas de test sur les écrans (`/veille`, `/admin/veille`) — inchangé.

## Hors périmètre

- Classification IA du secteur — reportée (déjà la décision BOMP,
  reconduite).
- Notifications (toast/email) sur nouveaux AO — reportée.
- Scraping authentifié SIGOMAP (`EMAIL_USER`/`CLE_SECRET` dans
  `.env.local`) — piste de secours non retenue tant que
  `marchespublics.ci` reste accessible.
- Vérification depuis l'infra Vercel réelle (risque géo-blocage) — à
  faire en tout début du plan d'implémentation, avant de construire le
  reste du pipeline autour.
- Suppression du bucket storage `bomp-national` et de la table
  `bomp_numero` — laissés tels quels (voir « Ce qui est décommissionné »),
  pas un objectif de ce sous-projet.
- Auto-injection dans le pipeline par correspondance secteur — rejeté,
  même décision que BOMP.
- RBAC complet — inchangé.
