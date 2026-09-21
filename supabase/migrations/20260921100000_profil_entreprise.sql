-- Formulaires standards pré-remplis (feuille de route stratégique,
-- tier P1, brique 1/2). entreprise n'avait jusqu'ici que nom/rccm —
-- aucun champ ni aucune page ne permettait de renseigner l'adresse, le
-- représentant légal ou l'IDU, pourtant nécessaires pour pré-remplir une
-- lettre de soumission, une déclaration sur l'honneur ou un pouvoir
-- habilitant. Scope strictement limité à ce que ces 3 formulaires
-- exigent — pas un profil entreprise complet.
--
-- Pas de nouvelle policy RLS : la policy update "entreprise_update_membres"
-- (20260916150000_pyramide_cout_bpu.sql) couvre déjà toute colonne de
-- cette table.
alter table entreprise
  add column adresse text,
  add column representant_legal_nom text,
  add column representant_legal_qualite text,
  add column idu text;
