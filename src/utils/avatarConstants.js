// Odd, so a drawing has a true centre column and row to mirror around.
export const GRID_SIZE = 17;
// Avatars saved before the grid grew (v1 and v2) are 16×16.
const OLD_GRID_SIZE = 16;

export const BASIC_COLORS = [
  "#ff6b6b", "#ee5a24", "#f39c12", "#f1c40f",
  "#2ecc71", "#1abc9c", "#3498db", "#2980b9",
  "#9b59b6", "#8e44ad", "#e84393", "#fd79a8",
  "#d63031", "#e17055", "#fdcb6e", "#ffeaa7",
  "#00b894", "#55efc4", "#74b9ff", "#0984e3",
  "#6c5ce7", "#a29bfe", "#fab1a0", "#636e72",
  "#2d3436", "#000000", "#b2bec3", "#dfe6e9",
  "#ffffff", "#f4c430", "#5fd4d6", "#e85a7a",
];

// The five built-in avatars as 17x17 pixel maps, so they render through the
// same crisp path as painted ones. Each is a three-stop vertical gradient
// quantized to one color per row, with two 2x2 eyes and a one-row mouth,
// mirrored around the centre column.
const PRESET_STOPS = {
  1: ["#f4c430", "#c89820", "#6b3a1f"],
  2: ["#5fd4d6", "#2a8a8c", "#1a3a4a"],
  3: ["#e85a7a", "#a83a5a", "#4a1a2c"],
  4: ["#9bd14f", "#6a9a30", "#1a3a1a"],
  5: ["#c5a8ff", "#7a5fc8", "#3a2470"],
  me: ["#ead8b1", "#c8b890", "#6b3a1f"],
};
const FACE = "#1a1024";

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    "#" +
    pa
      .map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0"))
      .join("")
  );
}

const presetCache = new Map();

/** Pixel data ({ pixels: 17x17 }) for a built-in avatar variant. */
export function presetAvatar(variant) {
  const key = PRESET_STOPS[variant] ? variant : 1;
  if (presetCache.has(key)) return presetCache.get(key);

  const [top, mid, bottom] = PRESET_STOPS[key];
  const pixels = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const t = r / (GRID_SIZE - 1);
    const color = t < 0.5 ? mix(top, mid, t * 2) : mix(mid, bottom, (t - 0.5) * 2);
    const row = Array(GRID_SIZE).fill(color);
    if (r === 7 || r === 8) row[4] = row[5] = row[11] = row[12] = FACE;
    if (r === 11) for (let c = 3; c <= 13; c++) row[c] = FACE;
    pixels.push(row);
  }
  const data = { pixels };
  presetCache.set(key, data);
  return data;
}

/**
 * The face shown for a seat at the table: a player's own avatar when the
 * server sent one ({ variant, custom }), else a stock face for CPUs.
 * Returns props for PixelAvatar: { variant, customAvatarData }.
 */
export function seatAvatar(player, index = 0) {
  const a = player?.avatar;
  if (a?.variant === "custom" && a.custom) {
    return { variant: "custom", customAvatarData: deserializeAvatar(a.custom) };
  }
  if (a?.variant) return { variant: a.variant, customAvatarData: null };
  return { variant: ((player?.id ?? index) % 5) + 1, customAvatarData: null };
}

/** Device-pixel side (a multiple of 17) and CSS side for a requested size. */
export function snapAvatarSize(size, dpr = 1) {
  const cells = Math.max(1, Math.round((size * dpr) / GRID_SIZE));
  const device = cells * GRID_SIZE;
  return { device, css: device / dpr };
}

export function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

export function serializeAvatar(pixels) {
  return { v: 3, pixels: pixels.flat() };
}

/** A flat row-by-row list of `size`×`size` pixels → a 17×17 grid, blank-padded right and bottom. */
function toGrid(flat, size) {
  return Array.from({ length: GRID_SIZE }, (_, r) =>
    Array.from({ length: GRID_SIZE }, (_, c) => (r < size && c < size ? (flat[r * size + c] ?? null) : null)),
  );
}

export function deserializeAvatar(data) {
  if (!data) return null;

  // v3: flat array of hex strings, 17×17
  if (data.v === 3 && Array.isArray(data.pixels)) return { pixels: toGrid(data.pixels, GRID_SIZE) };

  // v2: flat array of hex strings, 16×16
  if (data.v === 2 && Array.isArray(data.pixels)) return { pixels: toGrid(data.pixels, OLD_GRID_SIZE) };

  // v1 legacy: palette index string, 16×16
  if (data.pixels && typeof data.pixels === "string") {
    const palette = data.palette || [];
    const flat = data.pixels.split("").map((c) => palette[parseInt(c, 36)] || null);
    return { pixels: toGrid(flat, OLD_GRID_SIZE) };
  }

  return null;
}

/**
 * Draws a 17x17 avatar onto a canvas whose side is a multiple of 17, so every
 * avatar pixel is a whole number of canvas pixels — no seams, no uneven cells.
 */
export function renderAvatarToCanvas(ctx, avatarData, canvasSize) {
  const pixels = avatarData.pixels;
  const cell = Math.max(1, Math.floor(canvasSize / GRID_SIZE));
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const color = pixels[r]?.[c];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }
}

// HSB <-> hex conversion utilities
export function hsbToHex(h, s, b) {
  s /= 100;
  b /= 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  const r = Math.round(f(5) * 255);
  const g = Math.round(f(3) * 255);
  const bl = Math.round(f(1) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

export function hexToHsb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, b: v };
}

const CUSTOM_COLORS_KEY = "cardlore_custom_colors";

export function loadCustomColors() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Unreadable: start with no custom colors.
  }
  return [];
}

export function saveCustomColors(colors) {
  localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors));
}
