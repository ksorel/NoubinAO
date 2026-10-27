-- Sprint S8, parcours expert v2 (voir CLAUDE.md, Étape 8 "Assemblage &
-- dépôt") : bascule entre un dossier à pli unique (comportement historique,
-- inchangé) et un dossier scindé en deux plis (offre technique / offre
-- financière), chacun avec sa propre garde, sommaire et export — voir
-- lib/appels-offres/export/plan.ts (paramètre pli) et
-- exporterDossierReponsePli dans actions.ts.

create type type_plis_ao as enum ('single', 'tech_fin');

alter table appel_offres add column type_plis type_plis_ao;

alter table dossier_reponse add column export_path_technique text;
alter table dossier_reponse add column export_path_financiere text;
