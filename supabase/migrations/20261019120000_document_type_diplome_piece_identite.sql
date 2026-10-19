-- Nouveaux types de documents pour le personnel qualifié (retour client
-- 2026-10-19) : en plus du CV, la bibliothèque doit pouvoir stocker les
-- diplômes et les pièces d'identité de l'équipe mise en avant dans un DAO.

alter type document_type add value 'diplome';
alter type document_type add value 'piece_identite';
