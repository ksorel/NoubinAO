# Module 2 — Bibliothèque documentaire

Date : 2026-08-21
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Le projet NoubinAO est actuellement un scaffold Next.js App Router + Supabase
(`create-next-app -e with-supabase`) avec l'auth générique du starter, le
rebranding (logo, thème) et le déploiement Vercel en place. Aucune table
métier n'existe encore : ni `entreprise`/`utilisateur` (Module 1 —
Fondations), ni `document` (Module 2). La page `/protected` est la démo du
starter, sans valeur produit.

CLAUDE.md définit l'ordre des modules : Fondations avant Bibliothèque
documentaire. Plutôt que de construire tout le Module 1 (sidebar complète,
Cmd+K, sélecteur de langue) avant de commencer, ce spec couvre un minimum de
fondations (tables `entreprise`/`utilisateur`, coquille de layout protégé
simple) suffisant pour débloquer la bibliothèque documentaire, en différant
le reste du Module 1 (sidebar, Cmd+K, i18n) à plus tard.

## Décisions validées avec l'utilisateur

1. **Fondations minimales d'abord** : tables `entreprise`/`utilisateur`
   multi-tenant + layout protégé simple (pas de sidebar complète, pas de
   Cmd+K, pas de sélecteur de langue à ce stade).
2. **Les 4 catégories de documents dès le départ** : pièce administrative,
   référence projet, CV, agrément.
3. **Alertes d'expiration visuelles uniquement** : badge coloré dans
   l'interface, pas d'email/notification active (Resend + jobs planifiés
   viendront avec le pipeline, plus tard).
4. **Normalisation Markdown reportée au Module 3** : le champ
   `contenu_markdown` existe dans le schéma mais reste vide jusqu'à ce que le
   moteur d'extraction de DAO en ait besoin.

## Modèle de données

```sql
entreprise
  id            uuid PK
  nom           text
  rccm          text nullable   -- utile plus tard pour l'anti-abus du palier gratuit
  created_at    timestamptz

utilisateur
  id            uuid PK  -- = auth.users.id
  entreprise_id uuid FK -> entreprise
  nom           text
  role          text     -- 'admin' uniquement pour l'instant, pas de gestion d'équipe
  created_at    timestamptz

document
  id                    uuid PK
  entreprise_id         uuid FK -> entreprise
  type                  text  -- 'piece_administrative' | 'reference_projet' | 'cv' | 'agrement'
  nom                   text  -- libellé libre : "RCCM", "CV Jean Kouassi", "Référence - École ABC"
  fichier_path          text  -- chemin dans Supabase Storage
  fichier_nom_original  text
  mime_type             text
  taille_octets         bigint
  date_expiration       date nullable   -- pertinent pour piece_administrative / agrement
  contenu_markdown      text nullable   -- vide pour l'instant, alimenté au module 3
  source_ocr            boolean nullable -- idem
  created_by            uuid FK -> utilisateur
  created_at            timestamptz
```

**Écart volontaire par rapport à CLAUDE.md** : pas de colonne
`statut_validite` stockée. Le statut (vert/orange/rouge) est calculé à la
volée depuis `date_expiration`, ce qui évite une tâche planifiée pour garder
une colonne à jour — cohérent avec la décision "alertes visuelles
uniquement".

**Seuils du badge d'expiration** :
- rouge : expiré ou expire dans moins de 30 jours
- orange : expire entre 30 et 90 jours
- vert : expire dans plus de 90 jours
- aucun badge ("—") : pas de date d'expiration applicable (référence projet,
  CV)

## Stockage (Supabase Storage)

- Bucket privé unique `documents`.
- Chemin : `{entreprise_id}/{document_id}-{fichier_nom_original}`.
- Accès exclusivement via URL signée générée côté serveur (Server Action).
  Jamais d'upload/téléchargement direct client vers le bucket.

## Sécurité (RLS)

- RLS activé sur `entreprise`, `utilisateur`, `document` : un utilisateur ne
  voit/modifie que les lignes de sa propre entreprise, via jointure sur
  `utilisateur.entreprise_id`.
- RLS sur `storage.objects` du bucket `documents` : le premier segment du
  chemin doit correspondre à l'`entreprise_id` de l'utilisateur connecté.
- **Onboarding** : à la première connexion, si l'utilisateur n'a pas encore
  de ligne `utilisateur`, un formulaire "Créer votre entreprise" (nom + RCCM
  optionnel) déclenche une fonction Postgres `security definer` qui crée
  `entreprise` + `utilisateur` de façon atomique — évite le problème
  d'œuf-et-poule des policies RLS (impossible de créer sa propre entreprise
  si les policies exigent déjà d'appartenir à une entreprise).

## Structure de pages

- `app/(app)/layout.tsx` — vérifie l'auth (redirige vers `/auth/login` si
  absente), vérifie l'existence d'une ligne `utilisateur` (redirige vers
  `/onboarding` sinon), affiche une barre de nav simple (logo NoubinAO, lien
  "Bibliothèque", menu utilisateur avec bascule thème + déconnexion).
- `app/(app)/onboarding/page.tsx` — formulaire de création d'entreprise,
  affiché uniquement au premier login.
- `app/(app)/bibliotheque/page.tsx` — écran principal du module.
- La page `/protected` du starter est retirée (remplacée par cette coquille).

## Écran bibliothèque documentaire

- En-tête : titre + bouton "Ajouter un document" (bleu primaire).
- Onglets de filtre : Tous · Pièces administratives · Références projets ·
  CV · Agréments.
- Barre de recherche (filtre sur `nom`).
- Tableau à en-tête collant : Nom · Type · Expiration (badge) · Ajouté le ·
  Ajouté par · Actions (télécharger / supprimer).
- États à couvrir : chargement (lignes squelettes), vide global
  (illustration + CTA "Ajouter votre premier document"), vide par filtre
  (message contextuel), erreur (message + bouton réessayer).

### Dialogue d'ajout de document

Champs : Type (select) · Nom/libellé (texte) · Date d'expiration (affichée
seulement si type = pièce administrative ou agrément) · Fichier (zone
glisser-déposer).

Contraintes fichier (hypothèse à ajuster si besoin) :
- Types acceptés : PDF, DOCX, DOC, JPG, JPEG, PNG
- Taille max : 10 Mo

Validation Zod côté client, re-validée côté Server Action. Flux : upload
Storage → insertion `document` → toast Sonner "Document ajouté" → fermeture
du dialogue + rafraîchissement de la liste.

### Suppression et téléchargement

- Suppression : confirmation via `AlertDialog` (action irréversible) avant
  suppression du fichier Storage + de la ligne `document`.
- Téléchargement : génération d'une URL signée à la demande (jamais stockée
  en base), ouverte dans un nouvel onglet.

## Tests

- Vitest sur : le schéma Zod du formulaire d'upload, la fonction pure de
  calcul du badge d'expiration (seuils ci-dessus), et la construction du
  chemin de stockage.
- Pas de Playwright à ce stade — réservé au parcours DAO → dossier des
  modules 3-4 selon CLAUDE.md. Pas oublié, différé.

## Skills à mobiliser pendant l'implémentation

- `shadcn-ui` pour la construction des composants (Dialog, AlertDialog,
  Tabs, Table, Skeleton) de façon cohérente avec le reste de l'app.
- `frontend-ui-engineering` pour les états (chargement/vide/erreur) et
  l'accessibilité (WCAG AA, navigation clavier) exigées par CLAUDE.md.
- `test-driven-development` pour les schémas Zod et fonctions pures
  (badge d'expiration, chemin de stockage) avant de les brancher à l'UI.
- `verify` avant de considérer le module terminé — dérouler le flux upload →
  liste → suppression dans le navigateur, pas seulement `npm run build`.

## Hors périmètre (explicitement différé)

- Sidebar complète, palette de commandes Cmd+K, sélecteur de langue FR/EN
  (reste du Module 1).
- Notifications email d'expiration (Resend, jobs planifiés).
- Normalisation Markdown / OCR (Module 3).
- Gestion d'équipe multi-utilisateurs (rôles autres que `admin`, invitations).
