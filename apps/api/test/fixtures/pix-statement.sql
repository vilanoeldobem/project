-- Synthetic D1 rows for FIN-01. Apply once in a fresh local database.
INSERT INTO ngos (id, name, cnpj) VALUES ('ngo-fin01', 'FIN-01 fixture', '00000000000001');

INSERT INTO donations
  (id, target_kind, ngo_id, recipient_name, provider, provider_charge_id, sub_account_id, amount_cents,
   ngo_share_cents, vila_share_cents, ngo_percent_bps, fixed_fee_cents, status, dev_mode)
VALUES
  ('fin01-a', 'ngo', 'ngo-fin01', 'FIN-01 fixture', 'abacatepay', 'pix_fin01_match', 'sacc_fin01', 1000, 900, 100, 9800, 80, 'paid', 1),
  ('fin01-b', 'ngo', 'ngo-fin01', 'FIN-01 fixture', 'abacatepay', 'pix_fin01_cent',  'sacc_fin01', 1000, 900, 100, 9800, 80, 'paid', 1);
