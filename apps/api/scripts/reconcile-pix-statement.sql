-- Replace these normalized example lines in a local copy for a different rehearsal.
WITH statement(charge_id, target_kind, ngo_id, sub_account_id, amount_cents, ngo_share_cents, vila_share_cents, status) AS (
  VALUES
    ('pix_fin01_match', 'ngo', 'ngo-fin01', 'sacc_fin01', 1000, 900, 100, 'paid'),
    ('pix_fin01_cent',  'ngo', 'ngo-fin01', 'sacc_fin01', 1000, 899, 100, 'paid'),
    ('pix_fin01_missing', 'ngo', 'ngo-fin01', 'sacc_fin01', 1000, 900, 100, 'paid'),
    ('pix_fin01_duplicate', 'ngo', 'ngo-fin01', 'sacc_fin01', 1000, 900, 100, 'paid'),
    ('pix_fin01_duplicate', 'ngo', 'ngo-fin01', 'sacc_fin01', 1000, 900, 100, 'paid')
),
charge_ids AS (
  SELECT charge_id, COUNT(*) AS line_count FROM statement GROUP BY charge_id
),
paired AS (
  SELECT s.charge_id,
    json_object('target_kind', d.target_kind, 'ngo_id', d.ngo_id, 'sub_account_id', d.sub_account_id,
                'amount_cents', d.amount_cents, 'ngo_share_cents', d.ngo_share_cents,
                'vila_share_cents', d.vila_share_cents, 'status', d.status) AS recorded,
    json_object('target_kind', s.target_kind, 'ngo_id', s.ngo_id, 'sub_account_id', s.sub_account_id,
                'amount_cents', s.amount_cents, 'ngo_share_cents', s.ngo_share_cents,
                'vila_share_cents', s.vila_share_cents, 'status', s.status) AS reported
  FROM statement s
  JOIN charge_ids i ON i.charge_id = s.charge_id AND i.line_count = 1
  JOIN donations d ON d.provider_charge_id = s.charge_id AND d.provider = 'abacatepay'
),
differences AS (
  SELECT p.charge_id, d.key AS field, d.value AS d1_value, s.value AS statement_value,
         CASE WHEN d.key IN ('amount_cents', 'ngo_share_cents', 'vila_share_cents')
              THEN s.value - d.value END AS delta_cents
  FROM paired p, json_each(p.recorded) d, json_each(p.reported) s
  WHERE d.key = s.key AND d.value IS NOT s.value
)
SELECT charge_id, 'difference' AS result, field, d1_value, statement_value, delta_cents
FROM differences
UNION ALL
SELECT i.charge_id,
       CASE WHEN i.charge_id IS NULL OR trim(i.charge_id) = '' THEN 'missing_charge_id'
            WHEN i.line_count > 1 THEN 'ambiguous_statement'
            WHEN p.charge_id IS NULL THEN 'missing_in_d1'
            ELSE 'match' END,
       NULL, NULL, NULL, NULL
FROM charge_ids i
LEFT JOIN paired p ON p.charge_id = i.charge_id
WHERE NOT EXISTS (SELECT 1 FROM differences f WHERE f.charge_id = i.charge_id)
ORDER BY charge_id, field;
