-- BLACKJACK TYPES — the enum values Blackjack's credit tables need
-- (docs/superpowers/specs/2026-10-27-blackjack-design.md). A new enum value
-- can't be used in the transaction that adds it, so the tables and views that
-- use them are 017.

alter type game_type add value if not exists 'blackjack';
alter type credit_tier add value if not exists 'HOUSE';  -- a blackjack seat: bets against the house, no tiers
alter type credit_kind add value if not exists 'bet';    -- a blackjack bet (double, split, insurance): balance to seat
alter type credit_kind add value if not exists 'payout'; -- a settled blackjack round (or a refund): seat to balance
