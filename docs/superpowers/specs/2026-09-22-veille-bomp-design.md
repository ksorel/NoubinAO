# Veille nationale des AO par extraction du BOMP

Date : 2026-09-22
Statut : approuvé par l'utilisateur (design section par section).

## Contexte

Priorité #1 de la feuille de route stratégique ("Le Cap NoubinAO"),
bloquée depuis deux tentatives sur le scraping SIGOMAP (compte pilote
non partagé, CGU introuvable — voir mémoire
`noubinao_veille_sigmap_en_pause`).

Découverte le 2026-09-22 : le client pilote (KANRI CONSTRUCTION) reçoit
chaque mardi de son assureur le **BOMP** (Bulletin Officiel des Marchés
Publics), édité par l'ARCOP elle-même. Inspection réelle d'un exemplaire
(`BOMP_1896__du_mardi_22_septembre_2026.pdf`, 240 pages, ~23 Mo, via
pypdf) :

- Texte natif (pas scanné, sauf la page de couverture).
- Sommaire en page 1 avec compteurs par catégorie : AO en cours de
  publication, AO nouveaux (travaux/fournitures/prestations/
  manifestations d'intérêt), résultats jugés, procédures simplifiées,
  décisions ARCOP, etc.
- La section « Avis d'appels d'offres nouveaux » suit un format très
  régulier, un bloc `ARTICLE 1` à `ARTICLE 13` par annonce (autorité
  contractante, objet, allotissement, financement, garantie de
  soumission avec montant exact, conditions de participation, retrait
  du dossier avec contact, **remise des offres = date limite**,
  ouverture des plis, durée de validité).

Le BOMP est une source **nationale**, pas propre à un client : il couvre
tous les AO publics de Côte d'Ivoire, quel que soit le secteur ou
l'entreprise. Le construire comme un catalogue central que NoubinAO
alimente une fois, consultable par tous les clients, évite de rendre la
veille dépendante de la relation assurance d'un seul client.

## Décisions validées avec l'utilisateur

- **Source du PDF (V1)** : le client pilote sert de relais temporaire
  (transfert manuel chaque mardi), le temps de valider le pipeline —
  explicitement un bouchon à remplacer plus tard (abonnement direct
  ARCOP/DGMP à investiguer séparément), pas une dépendance permanente du
  design.
- **Périmètre d'extraction V1** : uniquement la section « Avis d'appels
  d'offres nouveaux » (travaux/fournitures/prestations/manifestations
  d'intérêt). La section « AO en cours de publication » (récapitulatif
  des AO déjà annoncés les semaines précédentes) est explicitement hors
  périmètre — format non inspecté, à évaluer plus tard.
- **Catalogue partagé, pas par entreprise** : nouvelles tables sans
  `entreprise_id`, lisibles par tout utilisateur authentifié.
- **Import explicite, pas d'auto-injection** : le client garde la main,
  cohérent avec le principe de validation humaine déjà en place ailleurs
  dans le produit (CLAUDE.md, section « À ne pas faire »).
- **Upload réservé à un rôle admin plateforme** (`utilisateur.super_admin`,
  nouveau booléen — pas de RBAC complet, juste ce qu'il faut pour un seul
  compte aujourd'hui, extensible plus tard).
- **Écran admin dans l'app** (pas un script CLI) — `/admin/veille`.
- **Pipeline d'extraction : réutilise QStash**, même infrastructure que
  le traitement DAO (Module 3), pas une nouvelle brique.
- **Classification du secteur par l'IA**, dans le même appel Claude que
  l'extraction structurée de l'avis — pas de champ déclaré dans le BOMP
  lui-même.

## Modèle de données

Trois nouvelles tables, aucune modification des tables existantes.
`secteur` reste `text` libre (pas d'ENUM), cohérent avec
`appel_offres.secteur` déjà en place — évite le piège ENUM Postgres vs
union TypeScript documenté dans la mémoire du projet.

```sql
alter table utilisateur add column super_admin boolean not null default false;

create type statut_traitement_bomp as enum (
  'en_attente', 'extraction_en_cours', 'termine', 'erreur'
);

create table bomp_numero (
  id uuid primary key default gen_random_uuid(),
  numero text not null,                      -- ex. "1896"
  date_publication date not null,
  fichier_path text not null,                 -- storage, bucket dédié (pas le bucket privé par entreprise)
  statut statut_traitement_bomp not null default 'en_attente',
  nombre_avis_extraits integer not null default 0,
  erreur_message text,
  cree_par uuid not null references utilisateur(id),
  cree_le timestamptz not null default now()
);

create type type_avis_ao_national as enum (
  'travaux', 'fournitures', 'prestations', 'manifestation_interet'
);

create table avis_ao_national (
  id uuid primary key default gen_random_uuid(),
  bomp_numero_id uuid not null references bomp_numero(id) on delete cascade,
  reference text not null,                    -- ex. "T 1364/2026"
  type type_avis_ao_national not null,
  autorite_contractante text not null,
  objet text not null,
  secteur text,                               -- classé par l'IA, texte libre comme appel_offres.secteur
  montant_caution numeric,
  date_limite_remise_offres date,
  contact_retrait text,                       -- adresse/tél/email tels qu'extraits, texte libre
  nombre_lots integer,
  texte_brut text not null,                   -- fragment Markdown source, traçabilité (relire sans reparser le PDF)
  cree_le timestamptz not null default now()
);
create index avis_ao_national_secteur_idx on avis_ao_national(secteur);
create index avis_ao_national_date_limite_idx on avis_ao_national(date_limite_remise_offres);

create table avis_ao_national_importation (
  id uuid primary key default gen_random_uuid(),
  avis_id uuid not null references avis_ao_national(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  importe_par uuid not null references utilisateur(id),
  importe_le timestamptz not null default now(),
  unique (avis_id, entreprise_id)              -- empêche le double-import
);
```

RLS : `avis_ao_national` et `bomp_numero` lisibles par tout utilisateur
authentifié (catalogue partagé), écriture réservée `super_admin`.
`avis_ao_national_importation` scopée par `entreprise_id` (même patron
que le reste du schéma). **Piège déjà documenté dans le projet** :
policy `for insert`/`for update` doit déclarer `with check` explicitement
— une policy sans `with check` réutilise silencieusement `using`, ce qui
n'est pas la même chose (mémoire `noubinao_rls_with_check_gotcha`).

```sql
alter table bomp_numero enable row level security;
alter table avis_ao_national enable row level security;
alter table avis_ao_national_importation enable row level security;

create policy "bomp_numero_select_authenticated" on bomp_numero
  for select using (auth.uid() is not null);

create policy "bomp_numero_write_super_admin" on bomp_numero
  for all using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  ) with check (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

create policy "avis_ao_national_select_authenticated" on avis_ao_national
  for select using (auth.uid() is not null);

create policy "avis_ao_national_write_super_admin" on avis_ao_national
  for all using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  ) with check (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

create policy "avis_importation_select_membres" on avis_ao_national_importation
  for select using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.entreprise_id = avis_ao_national_importation.entreprise_id)
  );

create policy "avis_importation_insert_membres" on avis_ao_national_importation
  for insert with check (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.entreprise_id = avis_ao_national_importation.entreprise_id)
  );
```

Bucket storage séparé (ex. `bomp-national`) pour les PDF BOMP — pas le
bucket privé scopé par `entreprise_id` existant (`lib/documents`,
`lib/appels-offres`), puisque ce fichier n'appartient à aucune
entreprise. Accès en lecture/écriture réservé `super_admin`.

## Pipeline d'extraction

Réutilise l'infrastructure QStash de `lib/appels-offres/file-attente.ts`
et `app/api/dao/traiter/route.ts` (Receiver signé, `createServiceRoleClient`,
`maxDuration = 60`), mais **en deux temps** plutôt qu'un seul job — une
section de 30-40 annonces dépasserait le budget de 60s (plan Vercel
Hobby) si chaque annonce déclenche un appel Claude dans le même
invocation.

**Étape 1 — chunking (synchrone, à l'upload)** :

1. Admin dépose le PDF sur `/admin/veille`.
2. `lib/veille/chunking.ts` (nouveau module) : extraction texte via
   `pdfjs-dist` (même lib que Module 3), mais **chunker dédié** — pas de
   titres `##` dans ce document, découpage par récurrence du motif
   `ARTICLE 1 : AUTORITE CONTRACTANTE` (chaque occurrence démarre un
   nouveau bloc, jusqu'à la prochaine occurrence ou la fin de la
   sous-section). Repère les limites de sous-section via le sommaire de
   la page 1 (travaux/fournitures/prestations/manifestations) pour
   assigner `type` à chaque bloc découpé.
3. Un `bomp_numero` est créé (`statut='extraction_en_cours'`), et une
   ligne `avis_ao_national` par bloc est insérée immédiatement avec
   `texte_brut` rempli et les autres champs structurés `null` — les
   avis existent tout de suite en base, juste pas encore classés/
   structurés par l'IA.

**Étape 2 — structuration IA (asynchrone, par avis)** :

4. Un job QStash est publié **par avis** (ou par petit lot de 3-5, à
   trancher en plan d'implémentation selon le nombre réel de nouveaux
   AO par semaine — ~40 d'après le sommaire inspecté) vers un nouvel
   endpoint `/api/veille/structurer`, même patron de signature/vérification
   que `/api/dao/traiter`.
5. Chaque job appelle Claude sur le `texte_brut` du bloc pour en extraire
   les champs structurés (référence, autorité contractante, objet,
   secteur, montant caution, date limite, contact, nombre de lots) et
   met à jour la ligne `avis_ao_national` correspondante.
6. Dernier job d'un `bomp_numero` fait passer son `statut` à `termine`
   (ou `erreur` si un échec bloquant survient — voir États et erreurs).

## Écran client « Veille »

Nouvelle entrée sidebar (icône à choisir, cohérente avec Bibliothèque/
Appels d'offres/Pipeline/Réglages), page `/veille`.

- Liste des avis (édition la plus récente en tête, archives précédentes
  accessibles), filtrable par secteur et par type
  (travaux/fournitures/prestations/manifestation), recherche texte sur
  l'objet, triée par date limite croissante.
- Chaque ligne : référence, objet, autorité contractante, secteur, date
  limite, bouton **« Importer dans mon pipeline »**.
- Bouton désactivé (« Déjà importé ») si une ligne
  `avis_ao_national_importation` existe déjà pour cet avis et cette
  entreprise.
- Import : crée un `appel_offres` (statut `identifie`) pré-rempli à
  partir de l'avis — `titre` ← objet, `acheteur` ← autorité
  contractante, `secteur`, `date_limite`, `montant_caution`. **Aucun
  fichier DAO joint** — le BOMP ne contient que l'avis, pas le dossier
  complet ; le client le récupère lui-même via les informations de
  retrait affichées (`contact_retrait`), puis l'uploade normalement via
  le flux Module 3 existant une fois en main.

## Écran admin « Veille — Administration »

Route `/admin/veille`, garde `super_admin` (même patron que la garde
`/onboarding` — redirection si non autorisé, pas d'écran d'erreur
générique).

- Liste des `bomp_numero` déjà traités : numéro, date, statut, nombre
  d'avis extraits.
- Formulaire d'upload d'un nouveau BOMP (fichier PDF).
- Pas de vue détaillée par avis dans ce sous-projet — la relecture se
  fait directement dans l'écran client « Veille » (même donnée, pas de
  duplication d'interface).

## États et erreurs

- Chunking échoue à trouver le motif `ARTICLE 1 : AUTORITE CONTRACTANTE`
  dans le PDF (mise en page différente d'un numéro à l'autre) :
  `bomp_numero.statut = 'erreur'`, `erreur_message` renseigné, admin
  informé dans la liste — aucun `avis_ao_national` créé plutôt que des
  lignes incohérentes.
- Un job de structuration IA échoue pour un avis donné (timeout Claude,
  réponse malformée) : ce job retente selon la politique QStash par
  défaut (comme le traitement DAO) ; l'avis concerné reste avec ses
  champs structurés `null` au-delà des tentatives — visible et filtrable
  dans l'écran client comme « à compléter manuellement » plutôt que
  bloquant tout le lot.
- Import d'un avis déjà importé par la même entreprise : la contrainte
  `unique (avis_id, entreprise_id)` rejette l'insertion ; l'action
  serveur traduit ça en message utilisateur plutôt qu'une erreur brute.
- Utilisateur non `super_admin` accède à `/admin/veille` directement par
  URL : redirection, pas d'écran d'erreur — même traitement que les
  autres gardes de route du projet.

## Tests

- `lib/veille/chunking.ts` : TDD sur le découpage par motif `ARTICLE 1`,
  avec un extrait réel du PDF inspecté comme fixture (pas un exemple
  inventé) — au moins un cas multi-lots (« N° T 1363/2026 (suite) »
  observé dans le fichier réel, à ne pas casser en deux avis distincts).
- `lib/veille/importation.ts` (ou équivalent) : logique de création de
  `appel_offres` depuis un `avis_ao_national`, testée sans appel réseau
  (fonction pure prenant l'avis en entrée, retournant l'objet à insérer).
- Pas de test sur les écrans (`/veille`, `/admin/veille`) — cohérent
  avec le reste du projet (aucun test sur les composants UI).

## Hors périmètre

- Section « AO en cours de publication » du BOMP (récapitulatif des AO
  déjà annoncés) — évaluée séparément si la V1 s'avère utile.
- Sourcing automatique/abonnement direct du BOMP (remplacement du relais
  manuel par le client pilote) — sous-projet séparé, pas un prérequis de
  ce design.
- Auto-injection dans le pipeline par correspondance secteur — rejeté
  explicitement par l'utilisateur, import reste une action manuelle.
- Notifications (email/toast) quand de nouveaux avis correspondant au
  secteur d'une entreprise arrivent — pas demandé, à reconsidérer une
  fois l'écran de base validé sur un usage réel.
- RBAC complet (rôles multiples, permissions granulaires) — un seul
  booléen `super_admin` suffit pour l'usage actuel (un seul compte).
