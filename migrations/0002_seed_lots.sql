-- 0002_seed_lots: world structure — 8 lots around the plaza (street 'praca', renamed 'plaza' in 0003).
-- Not fake NGO data: every lot starts available (DEC-028; PEN-017 defines the final layout).
-- Positions mirror apps/web/src/game/world.ts (LOTS); a test keeps them in sync.
INSERT INTO lots (id, street, slot, x, z) VALUES
  ('praca-01', 'praca', 1, 20.33, 8.42),
  ('praca-02', 'praca', 2, 8.42, 20.33),
  ('praca-03', 'praca', 3, -8.42, 20.33),
  ('praca-04', 'praca', 4, -20.33, 8.42),
  ('praca-05', 'praca', 5, -20.33, -8.42),
  ('praca-06', 'praca', 6, -8.42, -20.33),
  ('praca-07', 'praca', 7, 8.42, -20.33),
  ('praca-08', 'praca', 8, 20.33, -8.42);
