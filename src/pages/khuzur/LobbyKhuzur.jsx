// KHUZUR LOBBY — the shared GameLobby configured for Khuzur, laid out like
// every other game's. A hosted table starts as 2 v 2 with the 5-card deal and
// its host reshapes it at the waiting table; a practice level opens the table
// builder first. The CREDITS tab hosts and joins credit matches: everyone
// stakes the same, and 1st place takes the pot.

import React, { useMemo, useState } from "react";
import GameLobby from "../../components/lobby/GameLobby";
import PracticeBuilder from "../../components/khuzur/PracticeBuilder";
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

const tableOf = (build) => ({ perTeam: build.perTeam, teams: build.teams, handSize: build.handSize });
const HOSTED = { table: tableOf(DEFAULT_BUILD) };

export default function LobbyKhuzur() {
  const [build, setBuild] = useState(DEFAULT_BUILD);
  const game = useMemo(
    () => ({
      ...KHUZUR,
      setup: {
        values: HOSTED,
        practice: ({ difficulty, onStart, onCancel }) => (
          <PracticeBuilder difficulty={difficulty} value={build} onChange={setBuild} onStart={() => onStart({ table: tableOf(build) })} onCancel={onCancel} />
        ),
      },
    }),
    [build],
  );
  return <GameLobby game={game} />;
}
