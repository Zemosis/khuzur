// KHUZUR LOBBY — the shared GameLobby configured for Khuzur, with the table
// builder on top: every table hosted and every practice game is built to the
// shape it shows. The CREDITS tab hosts and joins credit matches: everyone
// stakes the same, and 1st place takes the pot.

import React, { useMemo, useState } from "react";
import GameLobby from "../../components/lobby/GameLobby";
import TableBuilder from "../../components/khuzur/TableBuilder";
import { DEFAULT_BUILD, KHUZUR_ACCENT } from "../../components/khuzur/teams";

const KHUZUR = {
  id: "khuzur",
  title: "Khuzur",
  route: "/game-khuzur",
  defaultTableName: "Ger",
  accent: KHUZUR_ACCENT,
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

export default function LobbyKhuzur() {
  const [build, setBuild] = useState(DEFAULT_BUILD);
  const table = useMemo(() => ({ perTeam: build.perTeam, teams: build.teams, handSize: build.handSize }), [build.perTeam, build.teams, build.handSize]);
  const game = useMemo(() => ({ ...KHUZUR, setup: { panel: <TableBuilder value={build} onChange={setBuild} />, values: { table } } }), [build, table]);
  return <GameLobby game={game} />;
}
