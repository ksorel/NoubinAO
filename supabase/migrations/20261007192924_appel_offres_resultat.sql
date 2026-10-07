-- Capture de la raison gagné/perdu (post-mortem) — voir
-- docs/superpowers/specs/2026-10-07-post-mortem-gagne-perdu-design.md

alter table appel_offres add column raison_resultat text;
alter table appel_offres add column note_resultat text;

-- La liste ci-dessous est l'union exacte de RAISONS_RESULTAT_AO
-- (lib/appels-offres/types.ts, Task 2) — garder les deux synchronisées si
-- une raison est ajoutée ou retirée un jour.
alter table appel_offres add constraint appel_offres_raison_resultat_check
  check (
    raison_resultat is null
    or raison_resultat in (
      'prix_trop_eleve',
      'delai_manque',
      'criteres_techniques_non_respectes',
      'concurrent_mieux_positionne',
      'sans_reponse_acheteur',
      'prix_competitif',
      'references_solides',
      'relation_acheteur',
      'qualite_technique',
      'autre'
    )
  );
