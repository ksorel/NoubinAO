-- Retour client pilote (4-2) : le "Formulaire d'identification du
-- soumissionnaire", récurrent dans les DAO ivoiriens, demande en plus
-- un téléphone et un email de l'entreprise — absents jusqu'ici (profil
-- entreprise limité à ce qu'exigeaient les 3 premiers formulaires
-- standards, voir 20260921100000_profil_entreprise.sql).
alter table entreprise
  add column telephone text,
  add column email text;
