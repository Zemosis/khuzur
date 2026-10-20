import { fmt } from "../../utils/poker/tiers";

/** A credit change with its sign: +1,200, −300 (a true minus), or 0. */
export const signed = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : "0");
