SELECT COUNT(*) AS paid_global_pix
FROM donations
WHERE target_kind = 'global'
  AND status = 'paid';
