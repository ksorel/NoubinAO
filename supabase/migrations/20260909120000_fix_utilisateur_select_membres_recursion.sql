-- Corrige "infinite recursion detected in policy for relation utilisateur",
-- cassant TOUTE requête sur `utilisateur` (y compris l'onboarding) depuis le
-- merge de 20260908140000 : une policy RLS ne peut pas interroger sa propre
-- table dans une sous-requête directe — Postgres réécrit la sous-requête en
-- lui appliquant elle-même le RLS, qui se réapplique indéfiniment, quel que
-- soit le contenu logique de la condition (même un cas de base non
-- récursif comme `utilisateur_select_self` ne suffit pas à arrêter cette
-- expansion syntaxique).
--
-- Fix standard : passer par une fonction SECURITY DEFINER, qui contourne le
-- RLS pour sa propre lecture interne et casse ainsi la récursion.
create or replace function utilisateur_entreprise_id(p_utilisateur_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select entreprise_id from utilisateur where id = p_utilisateur_id;
$$;

drop policy "utilisateur_select_membres" on utilisateur;

create policy "utilisateur_select_membres" on utilisateur
  for select using (
    entreprise_id = utilisateur_entreprise_id(auth.uid())
  );
