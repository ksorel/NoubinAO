-- Seed par défaut des types de marché et questions Go/No-Go, pour toute
-- nouvelle entreprise (via creer_entreprise) ET backfill des entreprises
-- déjà existantes (le pilote notamment) qui n'auraient jamais appelé cette
-- fonction avec le nouveau comportement.

create or replace function seed_go_no_go(p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_btp uuid;
  v_ingenierie uuid;
  v_environnement uuid;
  v_energie uuid;
  v_it uuid;
  v_agro uuid;
begin
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'BTP / Travaux', 1) returning id into v_btp;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Ingénierie / Études', 2) returning id into v_ingenierie;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Environnement', 3) returning id into v_environnement;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Énergie-climat', 4) returning id into v_energie;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'IT / Informatique', 5) returning id into v_it;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Agro-industrie', 6) returning id into v_agro;

  -- 5 questions administratives génériques (ordre 1-5). Seules les deux
  -- premières portent une cle_suggestion : ce sont les seules que la
  -- bibliothèque documentaire sait pré-renseigner. La question 4 mentionne
  -- aussi « attestations » dans son texte, mais parle d'attestations de
  -- bonne exécution — d'où la clé explicite plutôt qu'un match de texte.
  insert into question_go_no_go (entreprise_id, categorie, texte, ordre, cle_suggestion) values
    (p_entreprise_id, 'administratif', 'Avons-nous l''agrément ou la qualification exigée dans le DAO ?', 1, 'agrement'),
    (p_entreprise_id, 'administratif', 'Nos attestations sont-elles à jour (impôts, CNPS, RCCM… selon la liste du DAO) ?', 2, 'attestations'),
    (p_entreprise_id, 'administratif', 'Atteignons-nous le chiffre d''affaires moyen exigé ?', 3, null),
    (p_entreprise_id, 'administratif', 'Avons-nous le nombre de références similaires demandé (attestations de bonne exécution) ?', 4, null),
    (p_entreprise_id, 'administratif', 'Pouvons-nous fournir la caution de soumission demandée ?', 5, null);

  -- 1 question ouverture de marché générique (ordre 10, comme le xls)
  insert into question_go_no_go (entreprise_id, categorie, texte, ordre, cle_suggestion) values
    (p_entreprise_id, 'ouverture_marche', 'Le marché n''est PAS « fléché » (pas de gagnant connu d''avance) ?', 10, null);

  -- 4 questions savoir-faire par type de marché (ordre 6-9)
  insert into question_go_no_go (entreprise_id, type_marche_id, categorie, texte, ordre) values
    (p_entreprise_id, v_btp, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_btp, 'savoir_faire', 'Avons-nous le matériel minimum demandé (bétonnière, camion benne…) ?', 7),
    (p_entreprise_id, v_btp, 'savoir_faire', 'Le lieu du chantier est-il accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_btp, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'Avons-nous les outils et références méthodologiques demandés pour cette étude ?', 7),
    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'La zone d''intervention est-elle accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_environnement, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_environnement, 'savoir_faire', 'Avons-nous le matériel et les agréments environnementaux demandés ?', 7),
    (p_entreprise_id, v_environnement, 'savoir_faire', 'Le site d''intervention est-il accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_environnement, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_energie, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_energie, 'savoir_faire', 'Avons-nous le matériel et les habilitations électriques/solaires demandés ?', 7),
    (p_entreprise_id, v_energie, 'savoir_faire', 'Le site d''intervention est-il accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_energie, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_it, 'savoir_faire', 'Avons-nous les profils clés demandés (chef de projet, développeurs, expert données…) avec l''expérience exigée ?', 6),
    (p_entreprise_id, v_it, 'savoir_faire', 'Avons-nous les outils et l''hébergement demandés (serveurs, licences, sécurité) ?', 7),
    (p_entreprise_id, v_it, 'savoir_faire', 'Pouvons-nous assurer la maintenance et l''assistance après livraison sur la durée demandée ?', 8),
    (p_entreprise_id, v_it, 'savoir_faire', 'Le délai de livraison est-il réalisable avec notre équipe actuelle ?', 9),

    (p_entreprise_id, v_agro, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience agricole/agro-industrielle) ?', 6),
    (p_entreprise_id, v_agro, 'savoir_faire', 'Avons-nous le matériel et les agréments sanitaires/phytosanitaires demandés ?', 7),
    (p_entreprise_id, v_agro, 'savoir_faire', 'La zone de production ou d''intervention est-elle accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_agro, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens (saisonnalité comprise) ?', 9);
end;
$$;

-- Pas de grant à `authenticated` : cette fonction est `security definer`
-- sans contrôle d'appartenance, l'exposer via PostgREST
-- (POST /rest/v1/rpc/seed_go_no_go) laisserait n'importe quel utilisateur
-- connecté injecter des lignes dans le catalogue d'une AUTRE entreprise.
-- Elle n'est appelée qu'en interne depuis creer_entreprise (elle-même
-- security definer), qui n'a besoin d'aucun grant pour cet appel.
revoke all on function seed_go_no_go(uuid) from public;

-- creer_entreprise : corps repris à l'identique de 20261013150000, ajout
-- du seed à la fin.
create or replace function creer_entreprise(p_nom text, p_rccm text default null, p_nom_utilisateur text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  insert into entreprise (nom, rccm) values (p_nom, p_rccm) returning id into v_entreprise_id;
  insert into utilisateur (auth_id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');
  insert into abonnement (entreprise_id) values (v_entreprise_id);
  perform seed_go_no_go(v_entreprise_id);
  return v_entreprise_id;
end;
$$;

-- Backfill : toute entreprise déjà existante n'a jamais eu ce seed (créée
-- avant cette migration). On ne seed que celles qui n'ont encore aucun type
-- de marché Go/No-Go — idempotent si cette migration est relancée.
do $$
declare
  v_entreprise record;
begin
  for v_entreprise in
    select e.id from entreprise e
    where not exists (
      select 1 from type_marche_go_no_go t where t.entreprise_id = e.id
    )
  loop
    perform seed_go_no_go(v_entreprise.id);
  end loop;
end;
$$;
