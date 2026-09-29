# Veille nationale des AO par scraping marchespublics.ci

Date : 2026-09-29
Statut : décisions validées avec l'utilisateur (section par section).

## Contexte

Priorité #1 de la feuille de route stratégique ("Le Cap NoubinAO"),
bloquée depuis deux tentatives sur le scraping authentifié SIGOMAP
(compte pilote non partagé, CGU introuvable — voir mémoire
`noubinao_veille_sigmap_en_pause`).

**Déblocage (2026-09-29)** : `https://marchespublics.ci/appel_offre`
(portail public DGMP — Direction Générale des Marchés Publics, site
legacy PHP/CodeIgniter) expose la liste complète des avis d'appels
d'offres dans une table HTML serveur classique (`DataTable` jQuery
initialisée **sans** `serverSide: true`), **sans authentification, sans
JS nécessaire côté scraper, sans pagination API**. Vérifié par `curl`
direct : 200, ~1,2 Mo, ~560 lignes de données, dates jusqu'à fin 2027.
`robots.txt` absent (404), aucune CGU trouvée.

Ce sous-projet **remplace** l'approche BOMP (spec `2026-09-22-veille-bomp-design.md`,
jamais implémentée, aucune migration à défaire) et rend inutile le
scraping authentifié SIGOMAP (les identifiants `EMAIL_USER`/`CLE_SECRET`
stockés dans `.env.local` restent une piste de secours non retenue pour
cette V1).

**Colonnes disponibles dans la table source** : Numéro AO, Type de
marché (texte libre : TRAVAUX/FOURNITURE/PRESTATION/...), Objet, Autorité
Contractante (souvent vide dans l'échantillon inspecté), Date de
publication (**champ peu fiable**, ex. `30-11--0001` observé — ne pas
bloquer dessus), Date limite (fiable).

**Piège trouvé à la vérification (ne pas répéter)** : `Numéro AO` n'est
**pas unique** dans la source — `T 73/2023` apparaît deux fois avec des
objets complètement différents (vraie collision de numérotation côté
DGMP, pas un doublon d'affichage). La clé de dédoublonnage doit être
composite `(numero_ao, objet)`, jamais `numero_ao` seul.

## Décisions validées avec l'utilisateur

- **Secteur laissé vide en V1** — pas de classification IA par avis (pas
  de coût Claude, pas de job de structuration supplémentaire). Le client
  filtre par recherche texte sur l'Objet. Réévaluable plus tard si le
  besoin se confirme à l'usage.
- **Fréquence de scraping : quotidienne** (moins de requêtes vers le
  site tiers qu'un rythme horaire, latence de détection jusqu'à 24h
  jugée acceptable — un AO national a un délai légal minimum de 30 jours
  calendaires, voir CLAUDE.md).
- **V1 = liste + import manuel uniquement**, pas de notification
  (toast/email) sur nouveaux AO — cohérent avec la décision déjà prise
  pour BOMP. Sous-projet séparé si le besoin se confirme à l'usage.
- **Catalogue partagé, pas par entreprise** — mêmes tables sans
  `entreprise_id`, lisibles par tout utilisateur authentifié. Réutilise
  la décision déjà actée pour BOMP (source nationale, pas propre à un
  client).
- **Import explicite, pas d'auto-injection** — même principe que BOMP et
  que le reste du produit (validation humaine avant tout ajout au
  pipeline, CLAUDE.md section « À ne pas faire »).
- **Pas d'écran d'upload admin** (contrairement à BOMP) — le scraping
  est entièrement automatisé (schedule QStash quotidien, même patron que
  la sync email), aucune action manuelle de dépôt de fichier. Un écran
  admin minimal de **supervision** (historique des exécutions) suffit,
  réservé `super_admin` (même booléen que prévu pour BOMP, à créer ici
  puisque BOMP n'a jamais été implémenté).

## Modèle de données

Deux nouvelles tables + le booléen `super_admin` (repris du design BOMP,
créé ici pour la première fois). Pas de bucket storage — aucun fichier à
conserver, seulement des lignes structurées.

```sql
alter table utilisateur add column super_admin boolean not null default false;

create type statut_execution_veille as enum ('succes', 'erreur');

create table veille_execution (
  id uuid primary key default gen_random_uuid(),
  execute_le timestamptz not null default now(),
  statut statut_execution_veille not null,
  nombre_ao_trouves integer,
  nombre_nouveaux_ao integer,
  erreur_message text
);

create table avis_ao_national (
  id uuid primary key default gen_random_uuid(),
  numero_ao text not null,            -- pas unique seul, voir contrainte composite plus bas
  type_marche text,                   -- texte libre depuis la source (TRAVAUX/FOURNITURE/...)
  objet text not null,
  autorite_contractante text,         -- souvent vide dans la source, nullable
  date_publication date,              -- peu fiable, ne jamais l'utiliser pour trier/filtrer
  date_limite date,
  premiere_vue_le timestamptz not null default now(),
  derniere_vue_le timestamptz not null default now(),
  unique (numero_ao, objet)
);
create index avis_ao_national_date_limite_idx on avis_ao_national(date_limite);

create table avis_ao_national_importation (
  id uuid primary key default gen_random_uuid(),
  avis_id uuid not null references avis_ao_national(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  importe_par uuid not null references utilisateur(id),
  importe_le timestamptz not null default now(),
  unique (avis_id, entreprise_id)     -- empêche le double-import
);
```

RLS : `avis_ao_national` lisible par tout utilisateur authentifié
(catalogue partagé), écriture réservée au rôle service (le job de
scraping tourne avec `createServiceRoleClient`, bypasse RLS — aucune
policy d'écriture nécessaire pour les utilisateurs authentifiés).
`veille_execution` réservée en lecture à `super_admin` (information
opérationnelle, pas utile au client). `avis_ao_national_importation`
scopée par `entreprise_id`, même patron que le reste du schéma.

**Piège déjà documenté dans le projet à respecter** : toute policy
`for insert`/`for update` doit déclarer `with check` explicitement — une
policy sans `with check` réutilise silencieusement `using` (mémoire
`noubinao_rls_with_check_gotcha`).

```sql
alter table veille_execution enable row level security;
alter table avis_ao_national enable row level security;
alter table avis_ao_national_importation enable row level security;

create policy "veille_execution_select_super_admin" on veille_execution
  for select using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

create policy "avis_ao_national_select_authenticated" on avis_ao_national
  for select using (auth.uid() is not null);

create policy "avis_importation_select_membres" on avis_ao_national_importation
  for select using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.entreprise_id = avis_ao_national_importation.entreprise_id)
  );

create policy "avis_importation_insert_membres" on avis_ao_national_importation
  for insert with check (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.entreprise_id = avis_ao_national_importation.entreprise_id)
  );
```

## Pipeline de scraping

Beaucoup plus simple que le pipeline BOMP envisagé (pas de PDF, pas de
chunking texte libre, pas de structuration IA — les données sont déjà
structurées en colonnes). Une seule étape synchrone, pas de découpage en
jobs QStash par avis.

**Nouvelle dépendance** : `cheerio` (parseur HTML léger, style jQuery
côté serveur — absent du projet aujourd'hui, à ajouter). Cohérent avec
le principe du projet de ne pas construire de parseur maison quand un
outil existant suffit (même logique que la note CLAUDE.md sur
`mammoth`/`turndown` pour la normalisation DAO).

1. **Schedule QStash quotidien** (`npm run veille-marches-publics-schedule`,
   même patron que `email-sync-schedule` — script one-shot par
   environnement, à lancer une fois en prod après déploiement, jamais au
   runtime).
2. Callback signé vers `/api/veille/marches-publics/sync` (Route Handler,
   `Receiver` QStash + vérification signature, même patron que
   `/api/dao/traiter` et `/api/email/sync`).
3. `lib/veille/marches-publics.ts` (nouveau module) :
   - `recupererPageAppelOffres(): Promise<string>` — `fetch` natif vers
     `https://marchespublics.ci/appel_offre`, aucune authentification.
   - `extraireAvisDepuisHtml(html: string): AvisScrapeResult[]` —
     `cheerio.load(html)`, sélectionne `#example tbody tr`, extrait les 6
     colonnes. `date_publication`/`date_limite` : parsing tolérant
     (format `JJ-MM-AAAA`), valeur invalide → `null`, ne bloque jamais
     l'extraction du reste de la ligne.
4. Pour chaque avis extrait : `upsert` sur `avis_ao_national` par
   contrainte `(numero_ao, objet)` — insertion si nouveau
   (`premiere_vue_le`/`derniere_vue_le` = maintenant), sinon mise à jour
   de `derniere_vue_le` (et des champs structurés, au cas où la source
   les corrige après coup) si déjà existant. Aucune suppression — un
   avis qui disparaît de la page source (AO clôturé, retiré) reste en
   base tel quel, l'écran client filtre par `date_limite` pour ne pas
   l'afficher en avant.
5. Écrit une ligne `veille_execution` (`statut`, `nombre_ao_trouves`,
   `nombre_nouveaux_ao` = compte des insertions, pas des mises à jour).

## Écran client « Veille »

Nouvelle entrée sidebar, page `/veille` (même route que prévue pour
BOMP — un seul écran, peu importe la source de données derrière).

- Liste des avis, triée par `date_limite` croissante (les avis sans
  `date_limite` connue en dernier), recherche texte sur l'Objet (le
  secteur étant absent de la V1).
- Chaque ligne : `numero_ao`, `type_marche`, objet, autorité
  contractante (tiret si vide), date limite, bouton **« Importer dans
  mon pipeline »**.
- Bouton désactivé (« Déjà importé ») si une ligne
  `avis_ao_national_importation` existe déjà pour cet avis et cette
  entreprise.
- Import : crée un `appel_offres` (statut `identifie`) pré-rempli —
  `titre` ← objet, `acheteur` ← autorité contractante (si renseignée),
  `date_limite`. **Aucun fichier DAO joint** — la source ne contient que
  l'avis, pas le dossier ; le client récupère le DAO lui-même puis
  l'uploade normalement via le flux Module 3 existant.

## Écran admin « Veille — Supervision »

Route `/admin/veille`, garde `super_admin` (même patron que la garde
`/onboarding` — redirection si non autorisé, pas d'écran d'erreur
générique).

- Liste des `veille_execution` récentes : date, statut, nombre d'AO
  trouvés, nombre de nouveaux AO, message d'erreur le cas échéant.
- Aucun formulaire d'upload (contrairement à BOMP) — rien à déposer
  manuellement, le scraping est automatique.

## États et erreurs

- Le scraping échoue à joindre `marchespublics.ci` (timeout, blocage
  géo/anti-bot depuis l'infra Vercel — **risque non encore vérifié
  depuis la prod**, seulement testé depuis cette session) :
  `veille_execution.statut = 'erreur'`, `erreur_message` renseigné,
  visible dans `/admin/veille`. Aucune ligne `avis_ao_national` touchée.
- La structure HTML de la table change (colonnes réordonnées,
  `id="example"` renommé) et `extraireAvisDepuisHtml` ne trouve aucune
  ligne : même traitement que ci-dessus (`erreur`, pas de mise à jour
  partielle silencieuse) plutôt que d'écrire des lignes vides.
- Une ligne source a un `numero_ao` déjà vu mais un `objet` différent
  (collision confirmée dans l'échantillon, voir Contexte) : traitée
  comme un **nouvel avis distinct**, jamais fusionnée avec l'existant —
  c'est exactement ce que permet la contrainte composite
  `(numero_ao, objet)`.
- Import d'un avis déjà importé par la même entreprise : la contrainte
  `unique (avis_id, entreprise_id)` rejette l'insertion ; l'action
  serveur traduit ça en message utilisateur plutôt qu'une erreur brute.
- Utilisateur non `super_admin` accède à `/admin/veille` directement par
  URL : redirection, pas d'écran d'erreur — même traitement que les
  autres gardes de route du projet.

## Tests

- `lib/veille/marches-publics.ts` : TDD sur `extraireAvisDepuisHtml`,
  avec un extrait réel de la page capturée comme fixture (pas un exemple
  inventé) — au moins un cas couvrant la collision `numero_ao` dupliqué
  avec objet différent (`T 73/2023`, observé dans le fichier réel), et
  un cas de `date_publication` invalide (`30-11--0001`, observé aussi)
  pour vérifier qu'elle devient `null` sans faire échouer la ligne.
- Logique d'upsert et de comptage `nombre_nouveaux_ao` : testée en
  isolant la fonction pure (avis extraits → décisions insert/update),
  sans appel réseau ni Supabase réel.
- `lib/veille/importation.ts` (ou équivalent) : logique de création de
  `appel_offres` depuis un `avis_ao_national`, testée sans appel réseau
  (fonction pure prenant l'avis en entrée, retournant l'objet à
  insérer) — même patron que prévu pour BOMP.
- Pas de test sur les écrans (`/veille`, `/admin/veille`) — cohérent
  avec le reste du projet (aucun test sur les composants UI).

## Hors périmètre

- Classification IA du secteur — reportée, voir Décisions validées.
- Notifications (toast/email) sur nouveaux AO — reportée, voir Décisions
  validées.
- Scraping authentifié SIGOMAP (`EMAIL_USER`/`CLE_SECRET`) et BOMP PDF —
  pistes de secours non retenues, à ne pas construire tant que
  `marchespublics.ci` reste accessible et fiable.
- Vérification depuis l'infra Vercel réelle (risque géo-blocage) — à
  faire en tout début du plan d'implémentation, avant de construire le
  reste du pipeline autour (si ça échoue, le design entier doit être
  reconsidéré, pas juste une tâche parmi d'autres).
- Auto-injection dans le pipeline par correspondance secteur — rejeté,
  même décision que BOMP.
- RBAC complet — un seul booléen `super_admin` suffit pour l'usage
  actuel (un seul compte), même décision que BOMP.
