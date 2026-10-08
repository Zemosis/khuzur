-- Poker tables are recorded like the other games. A new enum value can't be
-- used in the transaction that adds it, so the views that need it are 008.
alter type game_type add value if not exists 'poker';
