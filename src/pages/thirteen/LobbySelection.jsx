// THIRTEEN LOBBY — the shared GameLobby configured for Thirteen. The CREDITS
// tab hosts and joins credit matches: everyone stakes the same, the winner
// takes the pot, and only people play.

import React from "react";
import GameLobby from "../../components/lobby/GameLobby";

// Module-level so the object is stable across renders (GameLobby's socket
// effect depends on `events`).
const THIRTEEN = {
  id: "thirteen",
  title: "Thirteen",
  route: "/game-13",
  defaultTableName: "CR7 GOAT",
  accent: { main: "#f4c430", deep: "#c89820" },
  credits: { kind: "stake" },
  events: {
    list: "get_public_lobbies",
    listUpdate: "public_lobbies_update",
    unlist: "leave_public_lobbies",
    create: "create_lobby",
    join: "join_lobby",
    joined: "lobby_joined",
  },
};

export default function LobbySelection() {
  return <GameLobby game={THIRTEEN} />;
}
