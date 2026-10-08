// The games the hall serves online, and where each one's table page lives.
// The server says which game a table is (lobby_joined's gameType), so a code
// typed in any lobby, or an invite link, opens the right page.

export const GAME_ROUTES = { thirteen: "/game-13", muushig: "/game-muushig", poker: "/game-poker" };

export const gameRoute = (gameType) => GAME_ROUTES[gameType] ?? GAME_ROUTES.thirteen;
