// USE ELEMENT WIDTH — an element's width in px, kept current; 0 until it's
// been laid out. For tables that size what's on them to the room they get.

import { useLayoutEffect, useState } from "react";

export function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
