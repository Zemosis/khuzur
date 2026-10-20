// COUNT UP — a number that rolls to its new value instead of jumping: the
// balance badge after a claim. Eases out over `ms`; `landed` is true for a
// moment after it rises, for a glow. With REDUCED animations it just jumps.

import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "../utils/motion";

const LANDED_MS = 900;

/** { shown, landed }: the number to display now, and whether it just rose. */
export function useCountUp(value, ms = 700) {
  const [shown, setShown] = useState(value);
  const [landed, setLanded] = useState(false);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (value == null || start == null || start === value || reducedMotion()) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let frame;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
      else if (value > start) setLanded(true);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);

  useEffect(() => {
    if (!landed) return;
    const id = setTimeout(() => setLanded(false), LANDED_MS);
    return () => clearTimeout(id);
  }, [landed]);

  return { shown, landed };
}
