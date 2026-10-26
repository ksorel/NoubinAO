-- Régime fiscal de l'entreprise (TEE/RSI/RNI, voir CLAUDE.md section
-- "Spécificités Côte d'Ivoire à paramétrer"), utilisé pour calculer la TVA
-- dans la lettre de soumission (F3) — sprint S5, parcours expert v2.
-- TEE = Taxe Estimée (pas de TVA) ; RSI/RNI = régimes imposables, TVA
-- standard 18 % appliquée. Nullable : non renseigné tant que l'entreprise
-- ne l'a pas indiqué dans son profil.
alter table entreprise
  add column regime_fiscal text
  check (regime_fiscal in ('tee', 'rsi', 'rni'));
