// TURN TITLE — while it's your turn and the game tab is in the background,
// its title flashes "▶ YOUR TURN" so you notice from another tab. It goes
// back to normal when you look, or when your turn ends.

import { useEffect } from "react";

const FLASH = "▶ YOUR TURN";

export function useTurnTitle(myTurn) {
  useEffect(() => {
    if (!myTurn) return;
    const original = document.title;
    let on = false;
    const tick = setInterval(() => {
      on = document.hidden ? !on : false;
      document.title = on ? FLASH : original;
    }, 1000);
    return () => {
      clearInterval(tick);
      document.title = original;
    };
  }, [myTurn]);
}
