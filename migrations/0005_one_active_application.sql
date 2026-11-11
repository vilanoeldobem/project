-- 0005: at most one active NGO application per applicant (IMPL-0011, security review 2026-11-11).
-- Enforced by the database, not only by the API's read-then-write check, so two parallel submissions
-- cannot reserve two lots for the same person. Rejected applications are reused (resubmission), not stacked.
CREATE UNIQUE INDEX idx_ngos_one_active_per_applicant
  ON ngos(applicant_id)
  WHERE applicant_id IS NOT NULL AND status IN ('submitted', 'under_review', 'changes_requested', 'published');
