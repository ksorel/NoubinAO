-- Nouveaux types de documents demandés par le client pilote (retour 2026-10-04) :
-- ABE (Attestation de Bonne Exécution), Organigramme, Matériel.

alter type document_type add value 'abe';
alter type document_type add value 'organigramme';
alter type document_type add value 'materiel';
