-- Demande client (2026-10-19) : intégrer le logo de l'entreprise pour
-- construire un entête et un pied de page sur le dossier Word exporté
-- (offre technique + offre financière). Interface voulue "comme sous
-- Excel" : 3 zones par bande (gauche/centre/droite), des jetons insérables
-- ({{logo}}, {{entreprise}}, {{date}}, {{page}}, {{pages}}) plutôt qu'un
-- texte figé.

alter table entreprise
  add column logo_path text,
  add column logo_nom_original text,
  add column logo_mime_type text,
  add column entete_gauche text,
  add column entete_centre text,
  add column entete_droite text,
  add column pied_gauche text,
  add column pied_centre text,
  add column pied_droite text;
