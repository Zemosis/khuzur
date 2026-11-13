// HAND CARD BOX — where a card of your Khuzur hand lies on screen, for the
// flights to and from it (see CardFlights). The hand's slots are placed by
// GSAP (see KhuzurHand), so the tilt is read back from there.

import gsap from "gsap";

/**
 * A hand card as a flight's end (see CardFlights): `el` is its slot
 * ([data-hand-card]). The centre is where it lies in the fan, raised by its
 * lift when it's picked and `lifted` is asked for (worked out, not measured:
 * the lift is a CSS transition, and may not have finished); w its width; rot
 * its tilt.
 */
export function handCardBox(el, lifted = false) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rot = Number(gsap.getProperty(el, "rotation")) || 0;
  const face = lifted && el.querySelector('[aria-pressed="true"] .pixel-card');
  const lift = face ? parseFloat(getComputedStyle(face).getPropertyValue("--lift")) || 0 : 0;
  const a = (rot * Math.PI) / 180;
  return { x: r.left + r.width / 2 + lift * Math.sin(a), y: r.top + r.height / 2 - lift * Math.cos(a), w: el.offsetWidth, rot };
}
