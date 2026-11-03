// TABLE SHAPE — the stadium the poker table is built on, as on a real card
// room table: straight sides and two round ends. Seats, cards and bets are
// placed by how far round it they lie, so everything keeps to the rim whatever
// the table's size, and the dealer button can travel round it.
//
// `t` is the fraction of a lap from the middle of the bottom, clockwise on
// screen: 0 bottom, 0.25 left, 0.5 top, 0.75 right. A box is { x0, y0, x1, y1 }
// in the table's own units. Wider than tall it lies down; taller than wide (a
// phone) it stands up, with `t` meaning the same.

const wrap = (t) => t - Math.floor(t);

/** The lying-down stadium, centred on 0, 0: straights of `length`, ends of `r`. */
function point(length, r, t) {
  const lap = 2 * length + 2 * Math.PI * r;
  let s = wrap(t) * lap;
  const leg = (size, at) => {
    const done = s <= size;
    if (!done) s -= size;
    return done && at(s);
  };
  return (
    leg(length / 2, (d) => ({ x: -d, y: r, nx: 0, ny: 1 })) ||
    leg(Math.PI * r, (d) => {
      const a = d / r;
      return { x: -length / 2 - r * Math.sin(a), y: r * Math.cos(a), nx: -Math.sin(a), ny: Math.cos(a) };
    }) ||
    leg(length, (d) => ({ x: -length / 2 + d, y: -r, nx: 0, ny: -1 })) ||
    leg(Math.PI * r, (d) => {
      const a = d / r;
      return { x: length / 2 + r * Math.sin(a), y: -r * Math.cos(a), nx: Math.sin(a), ny: -Math.cos(a) };
    }) || { x: length / 2 - s, y: r, nx: 0, ny: 1 }
  );
}

/** Where `t` lies, `inset` in from the rim (negative: outside it): { x, y, nx, ny }, n pointing out. */
export function stadiumPoint(box, t, inset = 0) {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  if (w >= h) {
    const p = point(w - h, h / 2, t);
    return { x: cx + p.x - p.nx * inset, y: cy + p.y - p.ny * inset, nx: p.nx, ny: p.ny };
  }
  // Stood up: the lying stadium turned a quarter, its left end coming to the bottom.
  const p = point(h - w, w / 2, t + 0.25);
  const [x, y, nx, ny] = [p.y, -p.x, p.ny, -p.nx];
  return { x: cx + x - nx * inset, y: cy + y - ny * inset, nx, ny };
}

/** The same place as `to`, on or after `from`: round the table clockwise, never back. */
export function nextLap(from, to) {
  return to + Math.ceil(from - to - 1e-9);
}

/**
 * The outline as an SVG path, `inset` in from `box`. notch: { half, depth }
 * cuts the dealer's curve into the top edge (lying-down tables only).
 */
export function stadiumPath(box, notch = null, inset = 0) {
  const x0 = box.x0 + inset;
  const y0 = box.y0 + inset;
  const x1 = box.x1 - inset;
  const y1 = box.y1 - inset;
  const r = Math.min(x1 - x0, y1 - y0) / 2;
  const cx = (x0 + x1) / 2;
  if (x1 - x0 >= y1 - y0) {
    const top = notch ? `L${cx - notch.half} ${y0} Q${cx} ${y0 + notch.depth * 2} ${cx + notch.half} ${y0} ` : "";
    return `M${x0 + r} ${y0} ${top}L${x1 - r} ${y0} A${r} ${r} 0 0 1 ${x1 - r} ${y1} L${x0 + r} ${y1} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`;
  }
  return `M${x0} ${y0 + r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} L${x1} ${y1 - r} A${r} ${r} 0 0 1 ${x0} ${y1 - r} Z`;
}
