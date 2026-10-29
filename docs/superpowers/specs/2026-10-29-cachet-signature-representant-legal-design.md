# Cachet et signature du représentant légal

Date : 2026-10-29
Statut : approuvé par Sorel (brainstorming), prêt pour plan d'implémentation.

## Contexte

Le profil entreprise a déjà `representant_legal_nom`/`representant_legal_qualite` (texte libre, migration `20260921100000_profil_entreprise.sql`), utilisés dans 7 gabarits de formulaires standards (`lib/appels-offres/formulaires-standards.ts`) sous la forme `"Le représentant légal,\n${nom}"`. Aujourd'hui, le nom reste du texte brut dans l'export — l'utilisateur doit signer et tamponner à la main après impression.

Le logo entreprise a déjà exactement le pattern technique nécessaire pour résoudre ça : upload image → Supabase Storage (bucket `documents`) → colonnes `logo_path`/`logo_nom_original`/`logo_mime_type` sur `entreprise` → `ImageRun` (docx) dans l'export Word. Cette feature étend ce pattern à deux nouvelles images : le cachet de l'entreprise et la signature du représentant légal (DG/Gérant, ou son représentant - DT/RT, etc. - selon qui est renseigné dans `representant_legal_nom`/`qualite`).

## Décisions issues du brainstorming

- **Un seul signataire** : pas de notion de signataire différent par type de document. Cachet + signature sont liés à l'unique `representant_legal_nom`/`qualite` déjà existant.
- **Portée documents** : uniquement les 3 gabarits qui engagent juridiquement l'entreprise et se terminent par le bloc signataire — lettre de soumission, déclaration sur l'honneur, pouvoir habilitant. Pas le formulaire d'identification, les tableaux personnel/matériel, ni le PV d'ouverture.
- **Deux formats d'export** : Word et PDF, tous deux dès cette livraison (les deux existent déjà pour le dossier de réponse, avec deux moteurs de rendu distincts).
- **Deux images séparées** : cachet et signature téléversés indépendamment (pas un scan combiné unique), même UX que le logo.

## Modèle de données

Migration, 6 nouvelles colonnes sur `entreprise`, miroir exact de `logo_path`/`logo_nom_original`/`logo_mime_type` :

| Colonne | Type |
|---|---|
| `cachet_path` | `text`, nullable |
| `cachet_nom_original` | `text`, nullable |
| `cachet_mime_type` | `text`, nullable |
| `signature_path` | `text`, nullable |
| `signature_nom_original` | `text`, nullable |
| `signature_mime_type` | `text`, nullable |

Pas de nouvelle policy RLS : la policy update `entreprise_update_membres` (`20260916150000_pyramide_cout_bpu.sql`) couvre déjà toute colonne de cette table, comme pour `logo_path` en son temps.

## Stockage et upload

Même bucket Storage `documents`, même convention de chemin que le logo (`construireCheminStockageLogo`, généralisée ou dupliquée pour `cachet`/`signature` selon ce qui reste le plus lisible au moment de coder — décision d'implémentation, pas de design).

Deux nouvelles paires de Server Actions dans `lib/utilisateur/actions.ts`, calquées sur `televerserLogoEntreprise`/`retirerLogoEntreprise` (réservées au rôle `admin`, upload avec `upsert: true`, suppression du fichier Storage en cas d'échec de mise à jour de la ligne `entreprise`) :

- `televerserCachetEntreprise(formData)` / `retirerCachetEntreprise(cheminStockage)`
- `televerserSignatureEntreprise(formData)` / `retirerSignatureEntreprise(cheminStockage)`

Accept upload restreint à `image/png,image/jpeg` (comme le logo) — nécessaire aussi côté PDF : `pdf-lib` n'embarque que PNG/JPEG, contrairement à `docx.ImageRun` qui accepte aussi GIF/BMP. Restreindre dès l'upload évite un format accepté côté Word mais cassé côté PDF.

## Interface

Ajout dans `profil-entreprise-card.tsx` (où vivent déjà les champs `representant_legal_nom`/`qualite`), pas dans `entete-pied-page-card.tsx` — logique différente (identité de signature juridique vs mise en page d'en-tête/pied de page). Deux blocs d'upload, UX identique à celle du logo dans `entete-pied-page-card.tsx` : aperçu via URL signée (`genererUrlTelechargement`), nom de fichier affiché, bouton retirer ; formulaire d'upload simple si aucune image présente.

## Export Word

Dans `lib/appels-offres/export/docx.ts`, boucle `plan.sectionsRedigees` (ligne ~148) : `identifierFormulaireStandard(section.titre)` détecte déjà les types de gabarit. Pour les 3 types concernés (`lettre_soumission`, `declaration_honneur`, `pouvoir_habilitant`), traiter spécialement le dernier paragraphe de la section (la ligne contenant `entreprise.representant_legal_nom`) :

- Si `signature` et/ou `cachet` sont disponibles (buffers non null) : remplacer ce dernier paragraphe texte par un paragraphe contenant les `ImageRun` disponibles côte à côte (signature puis cachet, dans cet ordre, quand les deux sont présents), suivi d'un paragraphe texte inchangé avec le nom.
- Si aucun des deux n'est disponible : comportement actuel inchangé (juste le texte du nom).
- Si un seul des deux est disponible : n'afficher que celui-là, pas d'espace réservé vide pour l'autre.

Dimensions d'image : même ordre de grandeur que le logo (`TAILLE_LOGO_PX = 50`) à ajuster empiriquement — une signature/cachet doit rester lisible mais ne pas dominer la page ; valeur exacte laissée à l'implémentation, pas un point de design bloquant.

## Export PDF

Dans `lib/appels-offres/export/pdf.ts`, boucle `plan.sectionsRedigees` (ligne ~58) : même détection par `identifierFormulaireStandard`, même traitement spécial du dernier paragraphe pour les 3 gabarits concernés.

Nouvelle fonction dans `lib/appels-offres/export/pdf-layout.ts`, même convention que `ecrireLigne`/`ecrireEspace` (gère elle-même le saut de page si l'image ne tient pas dans l'espace restant) :

```
ecrireImage(etat: EtatRendu, buffer: Buffer, type: "png" | "jpg", dimensions: { largeur: number; hauteur: number }): Promise<void>
```

→ `etat.doc.embedPng`/`embedJpg` puis `etat.page.drawImage`, avance `etat.y` de la hauteur dessinée (comme `ecrireLigne` avance de `taille * 1.4`). Signature et cachet dessinés côte à côte (deux appels à `ecrireImage` avec des `x` différents) selon la même règle de disponibilité que l'export Word.

## Récupération des buffers

Même pattern que le logo aujourd'hui dans `lib/appels-offres/actions.ts` (2 points d'entrée d'export déjà existants, ~ligne 863 et ~ligne 963) : téléchargement depuis Supabase Storage (`supabase.storage.from("documents").download(...)`) une fois par export, avant construction du plan.

`PlanExport` (`lib/appels-offres/export/plan.ts`) gagne deux champs à côté de `logo: LogoExport | null` :

```
signature: LogoExport | null;
cachet: LogoExport | null;
```

`LogoExport` (`{ buffer: Buffer; type: "png" | "jpg" | "gif" | "bmp" }`, défini dans `entete-pied-page.ts`) est réutilisé tel quel — pas de nouveau type, cachet/signature sont structurellement identiques au logo pour cet usage.

## Hors scope

- Signataire différent selon le type de document (DG vs DT).
- Insertion dans d'autres gabarits que les 3 déclarations juridiques (formulaire d'identification, tableaux personnel/matériel, PV d'ouverture).
- Upload d'un scan combiné cachet+signature unique.
- Positionnement/dimensionnement pixel-perfect validé visuellement avant implémentation — ajusté empiriquement pendant le développement et vérifié en navigateur/export réel avant merge.

## Tests

- `lib/utilisateur/actions.test.ts` (ou fichier existant couvrant déjà le logo) : upload cachet/signature (succès, échec upload Storage, échec mise à jour ligne `entreprise` → nettoyage Storage), suppression, garde admin-only.
- `lib/appels-offres/export/docx.test.ts` (ou équivalent) : section `lettre_soumission` avec signature+cachet présents → paragraphe image généré ; absents → texte seul inchangé ; un seul présent → un seul `ImageRun`.
- Même jeu de cas côté `pdf.test.ts`.
- Vérification manuelle navigateur : upload réel des deux images dans `/parametres`, export Word et export PDF d'un AO réel, image visible et lisible dans les deux formats.
