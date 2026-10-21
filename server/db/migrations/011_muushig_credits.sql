-- MUUSHIG CREDITS — credit tables for Muushig: everyone stakes the same and
-- the match winner takes the pot (docs/superpowers/specs/2026-10-20-muushig-credits-design.md).
--
-- A stake sits in credit_seats like a poker stack until the match is settled.
-- A pot a CPU wins leaves the economy, recorded as the match's cpu_take, so
--   sum(balance) + sum(stack + pending) = granted + claimed - removed - sum(cpu_take)

alter type credit_kind add value 'stake';      -- sitting at a credit match: balance to seat
alter type credit_kind add value 'stake_back'; -- standing up before the deal: seat to balance
alter type credit_kind add value 'pot';        -- winning a match: the pot to the balance

-- Which game a seat, a record or a table movement belongs to. Every row so far is poker's.
alter table credit_seats add column game_type text not null default 'poker';
alter table credit_hands add column game_type text not null default 'poker';
alter table credit_hands add column cpu_take bigint not null default 0 check (cpu_take >= 0);
alter table credit_ledger add column game_type text; -- null for movements that aren't at a table
update credit_ledger set game_type = 'poker' where kind in ('buy_in', 'top_up', 'cash_out', 'restart_return');
