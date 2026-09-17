-- Pyramide de coût par ligne (Module 7, sous-projet 4b). Documente a
-- posteriori le prix_unitaire déjà saisi (sous-projet 4a) : déboursé sec
-- et taux de frais de structure sont saisis, la marge est calculée côté
-- application (lib/appels-offres/bpu.ts), jamais stockée. Les colonnes de
-- ligne_bpu s'ajoutent à une table déjà couverte par les policies du
-- sous-projet 4a (20260916120000_bpu.sql) : rien à faire côté RLS pour
-- elles. entreprise en revanche n'avait jusqu'ici qu'une policy select —
-- nouvelle policy update ci-dessous, nécessaire pour ce sous-projet.
alter table ligne_bpu
  add column debourse_sec numeric,
  add column taux_frais_structure numeric;

alter table entreprise
  add column taux_frais_structure_defaut numeric;

-- entreprise n'a aujourd'hui qu'une policy select (entreprise_select_membres)
-- — vérifié par lecture directe de pg_policies avant d'écrire cette spec,
-- pas supposé. Sans policy update, modifierTauxFraisStructureDefaut
-- échouerait silencieusement (0 ligne affectée). with check répété
-- explicitement (leçon déjà rencontrée sur ce projet : une policy update
-- sans with check réutilise using, voir mémoire
-- noubinao_rls_with_check_gotcha).
create policy "entreprise_update_membres" on entreprise
  for update
  using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  );
