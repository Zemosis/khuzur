// POKER LOBBY — the shared GameLobby configured for Poker. Tables are hosted
// and joined on the same events as the other games; the game type keeps each
// game's tables apart. Practice seats you with five CPUs at the chosen level.

import React from "react";
import GameLobby from "../../components/lobby/GameLobby";

const POKER = {
  id: "poker",
  title: "Poker",
  route: "/game-poker",
  defaultTableName: "High Rollers",
  accent: { main: "#9bd14f", deep: "#6a9a30" },
  events: {
    list: "get_public_lobbies",
    listUpdate: "public_lobbies_update",
    unlist: "leave_public_lobbies",
    create: "create_lobby",
    join: "join_lobby",
    joined: "lobby_joined",
  },
};

export default function LobbyPoker() {
  return <GameLobby game={POKER} />;
}
