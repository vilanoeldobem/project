-- The empty rows keep the global destination and each known NGO visible at zero.
WITH entries(target_kind, ngo_id, provider, amount_cents) AS (
  SELECT target_kind, ngo_id, provider, amount_cents FROM donations WHERE status = 'paid'
  UNION ALL SELECT 'global', NULL, NULL, 0
  UNION ALL SELECT 'ngo', id, NULL, 0 FROM ngos
),
by_destination AS (
  SELECT target_kind AS scope, ngo_id,
         COUNT(*) FILTER (WHERE provider = 'abacatepay') AS pix_count,
         SUM(CASE WHEN provider = 'abacatepay' THEN amount_cents ELSE 0 END) AS pix_gross_cents,
         COUNT(*) FILTER (WHERE provider = 'external_proof') AS proof_count,
         SUM(CASE WHEN provider = 'external_proof' THEN amount_cents ELSE 0 END) AS proof_amount_cents
  FROM entries
  GROUP BY target_kind, ngo_id
)
SELECT d.*, n.name AS ngo_name FROM by_destination d LEFT JOIN ngos n ON n.id = d.ngo_id
UNION ALL
SELECT 'total', NULL, SUM(pix_count), SUM(pix_gross_cents), SUM(proof_count), SUM(proof_amount_cents), NULL
FROM by_destination
ORDER BY scope, ngo_id;
