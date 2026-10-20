-- The match page (GET /api/matches/:id) shows every seat and each round's key
-- moments. Matches recorded before this have neither: their page falls back to
-- the player rows and the round results.

-- Every seat as the match started: [{ seat, name, kind: human|cpu, level }].
-- CPUs never get a game_players row, so this is the only place their names
-- and levels are kept.
alter table game_sessions add column seats jsonb
  constraint game_sessions_seats_is_array check (seats is null or jsonb_typeof(seats) = 'array');

-- The round's key plays, in order (see server/game/highlights.js).
alter table game_rounds add column highlights jsonb
  constraint game_rounds_highlights_is_array check (highlights is null or jsonb_typeof(highlights) = 'array');
