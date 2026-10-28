// BLACKJACK LOBBY — the shared GameLobby configured for Blackjack. Credit
// tables take no buy-in ("house"), and PLAY ALONE replaces CPU practice.

import React from "react";
import GameLobby from "../../components/lobby/GameLobby";

const BLACKJACK = {
  id: "blackjack",
  title: "Blackjack",
  route: "/game-blackjack",
  defaultTableName: "The House",
  accent: { main: "#5fd4d6", deep: "#2a8a8c" },
  credits: { kind: "house" },
  playAlone: true,
  events: {
    list: "get_public_lobbies",
    listUpdate: "public_lobbies_update",
    unlist: "leave_public_lobbies",
    create: "create_lobby",
    join: "join_lobby",
    joined: "lobby_joined",
  },
};

export default function LobbyBlackjack() {
  return <GameLobby game={BLACKJACK} />;
}
