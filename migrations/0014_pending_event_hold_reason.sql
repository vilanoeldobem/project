-- 0014_pending_event_hold_reason: why a signed AbacatePay webhook event waits for an operator (IMPL-0028).
-- PROPOSTA, like everything about donations: dark behind DONATIONS_ENABLED ("false" in production and staging).
-- Additive only: one column with a default, so every row 0013 wrote keeps its meaning ('no_donation').
--
-- 'no_donation': the event arrived before the donation for its charge existed. It is applied, in arrival order,
--                as soon as that donation exists (the behaviour of 0013).
-- 'transition_refused': the donation existed, but the status guard refused the change the event asks for (for
--                example a payment confirmation after a dispute or a refund). It is NOT recorded as processed and
--                is never applied automatically: it stays visible until an administrator dismisses it.
-- A waiting event that the guard refuses when it is finally applied moves from 'no_donation' to
-- 'transition_refused'. Neither kind is ever in abacatepay_webhook_events while it waits.
ALTER TABLE abacatepay_pending_events ADD COLUMN hold_reason TEXT NOT NULL DEFAULT 'no_donation'
  CHECK (hold_reason IN ('no_donation', 'transition_refused'));
