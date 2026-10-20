// COUNTDOWN — whole seconds left until `endsAt` (a Date.now() time), kept
// current: children(n) draws them, from the ceiling of what's left down to 0.

import { useEffect, useState } from "react";

export default function Countdown({ endsAt, children }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  return children(Math.max(0, Math.ceil((endsAt - now) / 1000)));
}
