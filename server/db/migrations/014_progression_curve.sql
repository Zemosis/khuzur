-- PROGRESSION CURVE — levels used to cost 100 XP each; now each costs 50 more
-- than the last, from 100 up to 1,500 (server/game/progression.js). Everyone
-- keeps the level they had: their XP moves to the start of that level on the
-- new curve, plus the XP they had into it (always under 100, so it fits).

update profiles p
   set exp = coalesce((select sum(least(100 + 50 * (k - 1), 1500))
                         from generate_series(1, p.level - 1) as k), 0)
             + (p.exp % 100);
