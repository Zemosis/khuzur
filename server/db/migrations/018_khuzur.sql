-- KHUZUR — the game type for Khuzur's online tables, credit matches and solo
-- reports (docs/superpowers/specs/2026-11-05-khuzur-complete-design.md).

alter type game_type add value if not exists 'khuzur';
