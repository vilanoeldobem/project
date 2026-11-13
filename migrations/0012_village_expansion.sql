-- 0012_village_expansion: the village grows around the square (IMPL-0024, PROPOSTA; the final plan is
-- PEN-017/PEN-023). World structure only, no NGO, account or ownership data.
--
-- 1. `lots` keeps its meaning (plots reserved for approved NGOs, DEC-028): the eight existing lots move to the
--    square's new frontage, keeping their ids, state and NGO, and 4 more are added, all available.
-- 2. `residential_plots` is new: the three residential tiers (PROPOSTA, OQ-17). Ownership is switched off
--    (RESIDENTIAL_PLOTS_ENABLED = "false"): `owner_id` and `claimed_at` exist so that a later phase needs no
--    rebuild, and nothing writes them yet. A tier has no price: what it requires lives in the code
--    (VILLAGE_PLAN), never in a currency column.
--
-- Positions mirror packages/shared/src/game/world.ts (LOTS, RESIDENTIAL_PLOTS); tests keep them in sync.

UPDATE lots SET x = 30.5, z = 5 WHERE id = 'plaza-01';
UPDATE lots SET x = 18.03, z = 25.1 WHERE id = 'plaza-02';
UPDATE lots SET x = -5, z = 30.5 WHERE id = 'plaza-03';
UPDATE lots SET x = -25.1, z = 18.03 WHERE id = 'plaza-04';
UPDATE lots SET x = -30.5, z = -5 WHERE id = 'plaza-05';
UPDATE lots SET x = -18.03, z = -25.1 WHERE id = 'plaza-06';
UPDATE lots SET x = 5, z = -30.5 WHERE id = 'plaza-07';
UPDATE lots SET x = 25.1, z = -18.03 WHERE id = 'plaza-08';

INSERT INTO lots (id, street, slot, x, z) VALUES
  ('plaza-09', 'plaza', 9, 25.1, 18.03),
  ('plaza-10', 'plaza', 10, -18.03, 25.1),
  ('plaza-11', 'plaza', 11, -25.1, -18.03),
  ('plaza-12', 'plaza', 12, 18.03, -25.1);

CREATE TABLE residential_plots (
  id         TEXT PRIMARY KEY,                    -- e.g. 'premium-01'
  tier       TEXT NOT NULL CHECK (tier IN ('premium','standard','economy')),
  slot       INTEGER NOT NULL CHECK (slot > 0),   -- position inside the tier
  x          REAL NOT NULL,                       -- centre of the plot (voxel units)
  z          REAL NOT NULL,
  facing     REAL NOT NULL,                       -- rotation (rad) towards the street in front of the plot
  owner_id   TEXT REFERENCES users(id) ON DELETE SET NULL,  -- never written while ownership is off
  claimed_at TEXT,
  UNIQUE (tier, slot)
);

CREATE INDEX idx_residential_plots_owner ON residential_plots(owner_id);

INSERT INTO residential_plots (id, tier, slot, x, z, facing) VALUES
  ('premium-01', 'premium', 1, 44.5, -7.5, -1.5708),
  ('premium-02', 'premium', 2, 44.5, 7.5, -1.5708),
  ('premium-03', 'premium', 3, 36.77, 26.16, -2.3562),
  ('premium-04', 'premium', 4, 26.16, 36.77, -2.3562),
  ('premium-05', 'premium', 5, 7.5, 44.5, -3.1416),
  ('premium-06', 'premium', 6, -7.5, 44.5, -3.1416),
  ('premium-07', 'premium', 7, -26.16, 36.77, 2.3562),
  ('premium-08', 'premium', 8, -36.77, 26.16, 2.3562),
  ('premium-09', 'premium', 9, -44.5, 7.5, 1.5708),
  ('premium-10', 'premium', 10, -44.5, -7.5, 1.5708),
  ('premium-11', 'premium', 11, -36.77, -26.16, 0.7854),
  ('premium-12', 'premium', 12, -26.16, -36.77, 0.7854),
  ('premium-13', 'premium', 13, -7.5, -44.5, 0),
  ('premium-14', 'premium', 14, 7.5, -44.5, 0),
  ('premium-15', 'premium', 15, 26.16, -36.77, -0.7854),
  ('premium-16', 'premium', 16, 36.77, -26.16, -0.7854),
  ('standard-01', 'standard', 1, 59, -15.75, -1.5708),
  ('standard-02', 'standard', 2, 59, -6.25, -1.5708),
  ('standard-03', 'standard', 3, 59, 6.25, -1.5708),
  ('standard-04', 'standard', 4, 59, 15.75, -1.5708),
  ('standard-05', 'standard', 5, 52.86, 30.58, -2.3562),
  ('standard-06', 'standard', 6, 46.14, 37.3, -2.3562),
  ('standard-07', 'standard', 7, 37.3, 46.14, -2.3562),
  ('standard-08', 'standard', 8, 30.58, 52.86, -2.3562),
  ('standard-09', 'standard', 9, 15.75, 59, -3.1416),
  ('standard-10', 'standard', 10, 6.25, 59, -3.1416),
  ('standard-11', 'standard', 11, -6.25, 59, -3.1416),
  ('standard-12', 'standard', 12, -15.75, 59, -3.1416),
  ('standard-13', 'standard', 13, -30.58, 52.86, 2.3562),
  ('standard-14', 'standard', 14, -37.3, 46.14, 2.3562),
  ('standard-15', 'standard', 15, -46.14, 37.3, 2.3562),
  ('standard-16', 'standard', 16, -52.86, 30.58, 2.3562),
  ('standard-17', 'standard', 17, -59, 15.75, 1.5708),
  ('standard-18', 'standard', 18, -59, 6.25, 1.5708),
  ('standard-19', 'standard', 19, -59, -6.25, 1.5708),
  ('standard-20', 'standard', 20, -59, -15.75, 1.5708),
  ('standard-21', 'standard', 21, -52.86, -30.58, 0.7854),
  ('standard-22', 'standard', 22, -46.14, -37.3, 0.7854),
  ('standard-23', 'standard', 23, -37.3, -46.14, 0.7854),
  ('standard-24', 'standard', 24, -30.58, -52.86, 0.7854),
  ('standard-25', 'standard', 25, -15.75, -59, 0),
  ('standard-26', 'standard', 26, -6.25, -59, 0),
  ('standard-27', 'standard', 27, 6.25, -59, 0),
  ('standard-28', 'standard', 28, 15.75, -59, 0),
  ('standard-29', 'standard', 29, 30.58, -52.86, -0.7854),
  ('standard-30', 'standard', 30, 37.3, -46.14, -0.7854),
  ('standard-31', 'standard', 31, 46.14, -37.3, -0.7854),
  ('standard-32', 'standard', 32, 52.86, -30.58, -0.7854),
  ('economy-01', 'economy', 1, 72, -22.5, -1.5708),
  ('economy-02', 'economy', 2, 72, -16.5, -1.5708),
  ('economy-03', 'economy', 3, 72, -10.5, -1.5708),
  ('economy-04', 'economy', 4, 72, -4.5, -1.5708),
  ('economy-05', 'economy', 5, 72, 4.5, -1.5708),
  ('economy-06', 'economy', 6, 72, 10.5, -1.5708),
  ('economy-07', 'economy', 7, 72, 16.5, -1.5708),
  ('economy-08', 'economy', 8, 72, 22.5, -1.5708),
  ('economy-09', 'economy', 9, 66.82, 35, -2.3562),
  ('economy-10', 'economy', 10, 62.58, 39.24, -2.3562),
  ('economy-11', 'economy', 11, 58.34, 43.49, -2.3562),
  ('economy-12', 'economy', 12, 54.09, 47.73, -2.3562),
  ('economy-13', 'economy', 13, 47.73, 54.09, -2.3562),
  ('economy-14', 'economy', 14, 43.49, 58.34, -2.3562),
  ('economy-15', 'economy', 15, 39.24, 62.58, -2.3562),
  ('economy-16', 'economy', 16, 35, 66.82, -2.3562),
  ('economy-17', 'economy', 17, 22.5, 72, -3.1416),
  ('economy-18', 'economy', 18, 16.5, 72, -3.1416),
  ('economy-19', 'economy', 19, 10.5, 72, -3.1416),
  ('economy-20', 'economy', 20, 4.5, 72, -3.1416),
  ('economy-21', 'economy', 21, -4.5, 72, -3.1416),
  ('economy-22', 'economy', 22, -10.5, 72, -3.1416),
  ('economy-23', 'economy', 23, -16.5, 72, -3.1416),
  ('economy-24', 'economy', 24, -22.5, 72, -3.1416),
  ('economy-25', 'economy', 25, -35, 66.82, 2.3562),
  ('economy-26', 'economy', 26, -39.24, 62.58, 2.3562),
  ('economy-27', 'economy', 27, -43.49, 58.34, 2.3562),
  ('economy-28', 'economy', 28, -47.73, 54.09, 2.3562),
  ('economy-29', 'economy', 29, -54.09, 47.73, 2.3562),
  ('economy-30', 'economy', 30, -58.34, 43.49, 2.3562),
  ('economy-31', 'economy', 31, -62.58, 39.24, 2.3562),
  ('economy-32', 'economy', 32, -66.82, 35, 2.3562),
  ('economy-33', 'economy', 33, -72, 22.5, 1.5708),
  ('economy-34', 'economy', 34, -72, 16.5, 1.5708),
  ('economy-35', 'economy', 35, -72, 10.5, 1.5708),
  ('economy-36', 'economy', 36, -72, 4.5, 1.5708),
  ('economy-37', 'economy', 37, -72, -4.5, 1.5708),
  ('economy-38', 'economy', 38, -72, -10.5, 1.5708),
  ('economy-39', 'economy', 39, -72, -16.5, 1.5708),
  ('economy-40', 'economy', 40, -72, -22.5, 1.5708),
  ('economy-41', 'economy', 41, -66.82, -35, 0.7854),
  ('economy-42', 'economy', 42, -62.58, -39.24, 0.7854),
  ('economy-43', 'economy', 43, -58.34, -43.49, 0.7854),
  ('economy-44', 'economy', 44, -54.09, -47.73, 0.7854),
  ('economy-45', 'economy', 45, -47.73, -54.09, 0.7854),
  ('economy-46', 'economy', 46, -43.49, -58.34, 0.7854),
  ('economy-47', 'economy', 47, -39.24, -62.58, 0.7854),
  ('economy-48', 'economy', 48, -35, -66.82, 0.7854),
  ('economy-49', 'economy', 49, -22.5, -72, 0),
  ('economy-50', 'economy', 50, -16.5, -72, 0),
  ('economy-51', 'economy', 51, -10.5, -72, 0),
  ('economy-52', 'economy', 52, -4.5, -72, 0),
  ('economy-53', 'economy', 53, 4.5, -72, 0),
  ('economy-54', 'economy', 54, 10.5, -72, 0),
  ('economy-55', 'economy', 55, 16.5, -72, 0),
  ('economy-56', 'economy', 56, 22.5, -72, 0),
  ('economy-57', 'economy', 57, 35, -66.82, -0.7854),
  ('economy-58', 'economy', 58, 39.24, -62.58, -0.7854),
  ('economy-59', 'economy', 59, 43.49, -58.34, -0.7854),
  ('economy-60', 'economy', 60, 47.73, -54.09, -0.7854),
  ('economy-61', 'economy', 61, 54.09, -47.73, -0.7854),
  ('economy-62', 'economy', 62, 58.34, -43.49, -0.7854),
  ('economy-63', 'economy', 63, 62.58, -39.24, -0.7854),
  ('economy-64', 'economy', 64, 66.82, -35, -0.7854);
