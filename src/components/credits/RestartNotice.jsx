// RESTART NOTICE — after a server restart sent your table credits home: where
// they went, shown until you press OK.

import React from "react";
import { fmt } from "../../utils/poker/tiers";

export default function RestartNotice({ notice, onDismiss, className = "" }) {
  if (!notice) return null;
  return (
    <div role="status" className={`flex items-center gap-3 px-3 py-2 ${className}`} style={{ backgroundColor: "#0a2a2c", border: "3px solid #2a8a8c" }}>
      <p className="flex-1 font-pixel-body text-[20px] leading-tight" style={{ color: "#5fd4d6" }}>
        The server restarted. Your {fmt(notice.amount)} credits from table {notice.tableName} are back in your balance.
      </p>
      <button
        onClick={onDismiss}
        className="pixel-btn font-pixel-display text-[10px] uppercase px-3 py-2 shrink-0"
        style={{ backgroundColor: "#5fd4d6", borderColor: "#2a8a8c", color: "#0a2a2c" }}
      >
        OK
      </button>
    </div>
  );
}
