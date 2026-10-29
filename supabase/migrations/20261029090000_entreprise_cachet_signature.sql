-- Cachet et signature du représentant légal (voir
-- docs/superpowers/specs/2026-10-29-cachet-signature-representant-legal-design.md).
-- Même structure que logo_path/logo_nom_original/logo_mime_type
-- (20261019130000_entete_pied_page.sql) : deux images distinctes,
-- téléchargées une fois par export et insérées dans les 3 gabarits de
-- formulaires standards qui engagent juridiquement l'entreprise (lettre de
-- soumission, déclaration sur l'honneur, pouvoir habilitant).
--
-- Pas de nouvelle policy RLS : la policy update "entreprise_update_membres"
-- couvre déjà toute colonne de cette table.
alter table entreprise
  add column cachet_path text,
  add column cachet_nom_original text,
  add column cachet_mime_type text,
  add column signature_path text,
  add column signature_nom_original text,
  add column signature_mime_type text;
