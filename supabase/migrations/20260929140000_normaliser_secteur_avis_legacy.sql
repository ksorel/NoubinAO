-- Nettoyage ponctuel : toutes les valeurs non-nulles existantes de
-- avis_ao_national.secteur ont été écrites par l'ancien pipeline BOMP
-- (texte libre, avant ce référentiel fermé à 4 clés) et ne matchent aucune
-- des valeurs de SECTEURS_CIBLES (lib/veille/classification-secteur.ts) —
-- y compris des variantes qui ne diffèrent que par la casse (ex. "BTP").
-- Sans ce nettoyage, dès qu'une entreprise configure un secteur, ces
-- avis deviennent invisibles dans /veille : ils échouent à la fois au
-- filtre enum ET au test "non classé reste visible" (secteur is null),
-- puisqu'ils sont non-nuls mais non conformes. Les repasser à null les
-- fait retomber dans le seau "non classé, toujours visible" — le
-- comportement déjà prévu par la spec pour une classification incertaine.
-- Plus aucun code ne peut réécrire une valeur hors référentiel dans cette
-- colonne : classifierSecteur ne renvoie qu'une des 4 clés ou null.
update avis_ao_national
set secteur = null
where secteur is not null
  and secteur not in ('btp', 'ingenierie', 'environnement', 'energie_climat');
