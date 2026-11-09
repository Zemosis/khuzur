// PRACTICE BUILDER — picking a practice level in the Khuzur lobby opens this:
// the table builder with its live table, then START deals you in against CPUs
// at that level. The lobby keeps the shape between openings.

import React from "react";
import Modal from "../credits/Modal";
import { Btn } from "../PixelUI";
import { TONES } from "../pixelTokens";
import TableBuilder from "./TableBuilder";
import { KHUZUR_ACCENT } from "./teams";

const LEVEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export default function PracticeBuilder({ difficulty, value, onChange, onStart, onCancel }) {
  return (
    <Modal title="Build your table" icon="cards" deep={KHUZUR_ACCENT.deep} onClose={onCancel} width={820}>
      <TableBuilder value={value} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2.5">
        <Btn tone={TONES.dusk} onClick={onCancel} style={{ height: 44 }}>
          Cancel
        </Btn>
        <Btn tone={TONES.poison} onClick={onStart} style={{ height: 44 }} title={`Play against ${LEVEL[difficulty].toLowerCase()} CPUs`}>
          Start · {LEVEL[difficulty]} CPUs
        </Btn>
      </div>
    </Modal>
  );
}
