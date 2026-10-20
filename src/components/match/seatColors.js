// One color per seat on the match page: the swatch in the standings and the
// seat's line on the timeline, so the two read together. Fixed order, by seat.
// Checked with the dataviz palette validator against the panel (#14102a):
// lightness band, chroma, colorblind and normal-vision separation, contrast.
// The closest pair (green / rose for deutan, ΔE 8) sits at the floor, so the
// timeline never relies on color alone: legend, end label and tooltip names.
export const SEAT_COLORS = ["#ab870d", "#179fa2", "#e15474", "#6c9e01", "#9374e6"];

export const seatColor = (seat) => SEAT_COLORS[seat % SEAT_COLORS.length];
