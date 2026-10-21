// MUUSHIG LOBBY — the shared GameLobby configured for Muushig. Tables are
// hosted and joined on the same events as Thirteen; the game type keeps the
// two games' tables apart. The CREDITS tab hosts and joins credit matches:
// everyone stakes the same, the winner takes the pot.

import React from "react";
import GameLobby from "../../components/lobby/GameLobby";

const MUUSHIG = {
  id: "muushig",
  title: "Muushig",
  route: "/game-muushig",
  defaultTableName: "CR7 GOAT",
  accent: { main: "#e85a7a", deep: "#a83a5a" },
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

export default function LobbyMuushig() {
  return <GameLobby game={MUUSHIG} />;
}
