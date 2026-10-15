// MODAL — a pixel panel over the dimmed screen. Escape or a click outside
// closes it (unless onClose is left out, as while a request is in flight).

import React, { useEffect } from "react";
import { Panel } from "../PixelUI";

export default function Modal({ title, icon, deep = "#463a78", onClose, children }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(10,7,18,0.82)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[440px]">
        <Panel title={title} icon={icon} deep={deep}>
          <div className="flex flex-col gap-4 p-4">{children}</div>
        </Panel>
      </div>
    </div>
  );
}
