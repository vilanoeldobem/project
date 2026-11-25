-- Seek directly to the next administrative review page, including timestamps shared by many rows.
CREATE INDEX idx_ngos_updated_id ON ngos(updated_at DESC, id DESC);
