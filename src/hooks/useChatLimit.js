// CHAT LIMIT — the server turns away chat floods (`chat_rejected`, see
// server/chatGuard.js). This turns its answer into a notice for the chat box,
// and holds the box for as long as the server said. Only the sender hears
// about it; nobody else at the table sees a thing.

import { useEffect, useState } from "react";
import { socket } from "../utils/socket";

const REPEAT_NOTICE_MS = 3000;

export function useChatLimit() {
  // { reason, until } while a notice shows; null otherwise.
  const [limit, setLimit] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onRejected = ({ reason, retryInMs = 0 } = {}) => {
      const t = Date.now();
      setNow(t);
      setLimit({ reason, until: t + (reason === "repeat" ? REPEAT_NOTICE_MS : retryInMs) });
    };
    socket.on("chat_rejected", onRejected);
    return () => socket.off("chat_rejected", onRejected);
  }, []);

  useEffect(() => {
    if (!limit) return;
    const tick = setInterval(() => {
      const t = Date.now();
      if (t >= limit.until) setLimit(null);
      else setNow(t);
    }, 250);
    return () => clearInterval(tick);
  }, [limit]);

  if (!limit) return { notice: null, blocked: false };
  if (limit.reason === "repeat") return { notice: "You just said that — try something new", blocked: false };
  const seconds = Math.max(1, Math.ceil((limit.until - now) / 1000));
  return { notice: `Slow down — chat again in ${seconds}s`, blocked: true };
}
