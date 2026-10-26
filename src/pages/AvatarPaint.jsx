import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PixelButton, PixelPanel } from "../components/PixelCard";
import CustomAvatarCanvas from "../components/CustomAvatarCanvas";
import ColorPickerModal from "../components/auth/ColorPickerModal";
import ShopModal from "../components/shop/ShopModal";
import { useAuth } from "../hooks/useAuth";
import {
  BASIC_COLORS,
  GRID_SIZE,
  createEmptyGrid,
  serializeAvatar,
} from "../utils/avatarConstants";
import PixelIcon from "../components/PixelIcon";
import Coin from "../components/Coin";
import { MAX_AVATAR_SLOTS, SHOP_ITEMS } from "../utils/shop";
import { fmt } from "../utils/poker/tiers";

const MAX_CUSTOM_COLORS = 8;
const SIDE_LEFT = 320;
const SIDE_RIGHT = 260;
// A side column: fixed width beside the canvas, full width (capped) stacked.
const STACKED_COL = "w-full max-w-[440px] shrink-0 lg:w-[var(--col-w)] lg:max-w-none";

const STACK_W = 1024; // narrower than this, the columns stack (Tailwind's lg)

/**
 * Canvas size that fills the space between the side columns: a whole number
 * of device pixels per cell, so the grid stays sharp at any display scaling.
 * Stacked (phones, split screens), it fills the width instead and the page
 * scrolls. Returns the backing size (device px) and the CSS size.
 */
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const stacked = window.innerWidth < STACK_W;
  const byHeight = stacked ? Infinity : window.innerHeight - 64 - 32 - 60;
  const byWidth = stacked ? window.innerWidth - 32 - 40 : window.innerWidth - SIDE_LEFT - SIDE_RIGHT - 96;
  const css = Math.max(stacked ? 200 : 320, Math.min(byHeight, byWidth, stacked ? 560 : 768));
  const cell = Math.max(1, Math.floor((css * dpr) / GRID_SIZE));
  return { backing: cell * GRID_SIZE, css: (cell * GRID_SIZE) / dpr, cell };
}

const AvatarPaint = () => {
  const navigate = useNavigate();
  const { isGuest, identity, profile, updateProfile, loading } = useAuth();
  const [params] = useSearchParams();
  const canvasRef = useRef(null);
  // Painted-avatar slots: everyone owns the first; more come from the shop.
  const slots = identity.avatarSlots ?? [identity.customAvatar];
  const [slot, setSlot] = useState(1); // the slot SAVE writes to

  const [pixels, setPixels] = useState(createEmptyGrid);
  const [initialized, setInitialized] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#f4c430");
  const [tool, setTool] = useState("paint");
  const [isPainting, setIsPainting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [customColors, setCustomColors] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  // A locked slot opens the shop over the painter, so you come straight back.
  const [showShop, setShowShop] = useState(false);
  const closeShop = useCallback(() => setShowShop(false), []);
  const [canvasFit, setCanvasFit] = useState(fitCanvas);

  useEffect(() => {
    const onResize = () => setCanvasFit(fitCanvas());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Once the profile has loaded, open the slot asked for (?slot=2, from the
  // shop), else the one you wear.
  if (!loading && !initialized) {
    const asked = Number(params.get("slot"));
    const start = asked >= 1 && asked <= slots.length ? asked : identity.avatar === "custom" ? identity.customSlot ?? 1 : 1;
    setSlot(start);
    if (slots[start - 1]?.pixels) {
      setPixels(slots[start - 1].pixels.map((row) => [...row]));
    }
    setCustomColors(identity.customColors || []);
    setInitialized(true);
  }

  useEffect(() => {
    if (!loading && isGuest) navigate("/", { replace: true });
  }, [loading, isGuest, navigate]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { backing, cell } = canvasFit;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, backing, backing);

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const color = pixels[r][c];
        ctx.fillStyle = color || ((r + c) % 2 === 0 ? "#1a1530" : "#14102a");
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }

    // 1-device-pixel grid lines on cell boundaries.
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 1; i < GRID_SIZE; i++) {
      ctx.fillRect(i * cell, 0, 1, backing);
      ctx.fillRect(0, i * cell, backing, 1);
    }
  }, [pixels, canvasFit]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  function getCellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor((x / rect.width) * GRID_SIZE);
    const row = Math.floor((y / rect.height) * GRID_SIZE);
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return null;
    return { row, col };
  }

  function paintCell(row, col) {
    const value = tool === "eraser" ? null : selectedColor;
    if (pixels[row][col] === value) return;
    setPixels((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = value;
      return next;
    });
    setDirty(true);
  }

  function handlePointerDown(e) {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;
    setIsPainting(true);
    paintCell(cell.row, cell.col);
  }

  function handlePointerMove(e) {
    if (!isPainting) return;
    const cell = getCellFromEvent(e);
    if (!cell) return;
    paintCell(cell.row, cell.col);
  }

  function handlePointerUp() {
    setIsPainting(false);
  }

  function handleClear() {
    setPixels(createEmptyGrid());
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (slot === 1) {
        await updateProfile({ custom_avatar: serializeAvatar(pixels), avatar: "custom", custom_slot: 1 });
      } else {
        const extras = Array.from({ length: slots.length - 1 }, (_, i) => profile?.extra_avatars?.[i] ?? null);
        extras[slot - 2] = serializeAvatar(pixels);
        await updateProfile({ extra_avatars: extras, avatar: "custom", custom_slot: slot });
      }
      navigate(-1);
    } catch (err) {
      console.error("Failed to save avatar:", err);
      setSaving(false);
    }
  }

  async function handleAddCustomColor(hex) {
    const next = [hex, ...customColors.filter((c) => c !== hex)].slice(0, MAX_CUSTOM_COLORS);
    setCustomColors(next);
    setSelectedColor(hex);
    setTool("paint");
    setShowPicker(false);
    try {
      await updateProfile({ custom_colors: next });
    } catch (err) {
      console.error("Failed to save custom colors:", err);
    }
  }

  // A painted slot opens its drawing; an empty one keeps the canvas, so
  // SAVE puts the drawing there.
  function handleOpenSlot(n) {
    setSlot(n);
    if (slots[n - 1]?.pixels) {
      setPixels(slots[n - 1].pixels.map((row) => [...row]));
      setDirty(false);
    } else {
      setDirty(true);
    }
  }

  function handleNewAvatar() {
    setPixels(createEmptyGrid());
    setDirty(true);
  }

  function selectColor(color) {
    setSelectedColor(color);
    setTool("paint");
  }

  const previewData = { pixels };

  if (loading || isGuest) return null;

  const colorBtnStyle = (color, isSelected) => ({
    width: "100%",
    aspectRatio: "1",
    backgroundColor: color,
    border: isSelected ? "3px solid #f4c430" : "2px solid #1f1a3d",
    boxShadow: isSelected ? "0 0 8px rgba(244,196,48,0.5)" : "none",
    cursor: "pointer",
    transition: "border-color 120ms ease",
  });

  const emptySlotStyle = {
    width: "100%",
    aspectRatio: "1",
    border: "2px dashed #463a78",
    backgroundColor: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 14,
    color: "#f4c430",
    transition: "border-color 120ms ease",
  };

  const customSlots = [];
  for (let i = 0; i < MAX_CUSTOM_COLORS; i++) {
    if (i < customColors.length) {
      const color = customColors[i];
      customSlots.push(
        <button
          key={`custom-${i}`}
          onClick={() => selectColor(color)}
          className="pixel-pick"
          aria-label={`Color ${color}`}
          style={colorBtnStyle(color, tool === "paint" && selectedColor === color)}
        />
      );
    } else {
      customSlots.push(
        <button
          key={`empty-${i}`}
          onClick={() => setShowPicker(true)}
          className="pixel-pick"
          aria-label="Add a custom color"
          style={emptySlotStyle}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#f4c430")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#463a78")}
        >
          +
        </button>
      );
    }
  }

  return (
    <div className="relative w-full h-screen starfield font-pixel-body text-parchment overflow-hidden flex flex-col">
      {/* TOP BAR */}
      <div
        className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b-4"
        style={{ borderColor: "#0a0712", background: "#14102a" }}
      >
        <div className="flex items-center gap-4">
          <PixelButton color="dusk" size="sm" onClick={() => navigate(-1)}>
            <span className="flex items-center gap-2"><PixelIcon name="back" size={12} />BACK</span>
          </PixelButton>
          <div className="flex items-center gap-2 font-pixel-display text-[12px] tracking-wider">
            <span className="text-bone/60 max-sm:hidden">PROFILE /</span>
            <span className="text-glow-gold">AVATAR PAINT</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-pixel-body text-[22px] text-bone max-sm:hidden">
            {identity.name}{" "}
            <span className="text-bone/60">#{identity.tag}</span>
          </span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col items-center lg:flex-row lg:items-start lg:justify-center gap-5 p-4 min-h-0 overflow-auto">
        {/* LEFT — Colors & Tools (under the canvas when stacked) */}
        <div className={`flex flex-col gap-4 ${STACKED_COL}`} style={{ "--col-w": `${SIDE_LEFT}px` }}>
          {/* Basic Colors */}
          <PixelPanel accent="gold" title="BASIC COLORS">
            <div className="p-3">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: 6,
                }}
              >
                {BASIC_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => selectColor(color)}
                    className="pixel-pick"
                    aria-label={`Color ${color}`}
                    style={colorBtnStyle(color, tool === "paint" && selectedColor === color)}
                  />
                ))}
              </div>
            </div>
          </PixelPanel>

          {/* Custom Colors */}
          <PixelPanel accent="cyan" title="CUSTOM COLORS">
            <div className="p-3">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: 6,
                }}
              >
                {customSlots}
              </div>
            </div>
          </PixelPanel>

          {/* Tools */}
          <PixelPanel accent="dusk" title="TOOLS">
            <div className="p-3 grid grid-cols-3 gap-3">
              <div className="col-span-3 flex items-center gap-3" aria-live="polite">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    backgroundColor: tool === "eraser" ? "transparent" : selectedColor,
                    border: "3px solid #c89820",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
                    ...(tool === "eraser" ? {
                      backgroundImage: "repeating-conic-gradient(#1a1530 0% 25%, #14102a 0% 50%)",
                      backgroundSize: "12px 12px",
                    } : {}),
                  }}
                />
                <div className="font-pixel-display text-[12px] text-parchment uppercase">
                  {tool === "eraser" ? "ERASER" : selectedColor}
                </div>
              </div>
              <PixelButton
                color={tool === "paint" ? "gold" : "dusk"}
                size="sm"
                onClick={() => setTool("paint")}
              >
                PAINT
              </PixelButton>
              <PixelButton
                color={tool === "eraser" ? "gold" : "dusk"}
                size="sm"
                onClick={() => setTool("eraser")}
              >
                ERASER
              </PixelButton>
              <PixelButton color="dusk" size="sm" onClick={handleClear}>
                CLEAR
              </PixelButton>
            </div>
          </PixelPanel>
        </div>

        {/* CENTER — Canvas (first when stacked) */}
        <div className="max-lg:order-first">
          <PixelPanel accent="gold" title="CANVAS">
            <div className="p-3">
              <canvas
                ref={canvasRef}
                width={canvasFit.backing}
                height={canvasFit.backing}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{
                  width: canvasFit.css,
                  height: canvasFit.css,
                  cursor: "crosshair",
                  touchAction: "none",
                  display: "block",
                }}
              />
            </div>
          </PixelPanel>
        </div>

        {/* RIGHT — Storage, Preview & Actions */}
        <div className={`flex flex-col gap-4 ${STACKED_COL}`} style={{ "--col-w": `${SIDE_RIGHT}px` }}>
          {/* Avatar Storage: your slots, the one SAVE writes to outlined in gold. */}
          <PixelPanel accent="cyan" title="AVATAR STORAGE">
            <div className="p-3">
              <div className="flex gap-2">
                {Array.from({ length: MAX_AVATAR_SLOTS }, (_, i) => i + 1).map((n) => {
                  if (n > slots.length) {
                    const item = SHOP_ITEMS.find((it) => it.avatarSlot === n);
                    return (
                      <button
                        key={n}
                        onClick={() => setShowShop(true)}
                        className="pixel-pick flex flex-col items-center justify-center gap-1.5"
                        style={{ width: 68, height: 68, border: "2px dashed #463a78", backgroundColor: "transparent" }}
                        aria-label={`Slot ${n} is locked: buy it in the shop for ${fmt(item?.price ?? 0)} gold`}
                        title="Buy this slot in the shop"
                      >
                        <span className="text-bone/50"><PixelIcon name="lock" size={12} /></span>
                        <span className="flex items-center gap-1 font-pixel-display text-[8px] text-glow-gold">
                          <Coin size={6} />
                          {fmt(item?.price ?? 0)}
                        </span>
                      </button>
                    );
                  }
                  const editing = slot === n;
                  return (
                    <button
                      key={n}
                      onClick={() => handleOpenSlot(n)}
                      aria-pressed={editing}
                      aria-label={slots[n - 1] ? `Open slot ${n}` : `Save to empty slot ${n}`}
                      title={slots[n - 1] ? `Slot ${n}` : `Slot ${n} (empty): SAVE puts your drawing here`}
                      className="pixel-pick flex items-center justify-center"
                      style={{
                        width: 68,
                        height: 68,
                        padding: 0,
                        background: "none",
                        border: `2px ${slots[n - 1] ? "solid" : "dashed"} ${editing ? "#f4c430" : "#2a8a8c"}`,
                        boxShadow: editing ? "0 0 10px rgba(244,196,48,0.5)" : "none",
                      }}
                    >
                      {slots[n - 1] ? (
                        <CustomAvatarCanvas avatarData={slots[n - 1]} size={51} />
                      ) : (
                        <span className="font-pixel-display text-[10px] text-bone/50">EMPTY</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="font-pixel-body text-[18px] text-bone/70 mt-2">Saving to slot {slot}</div>
              <div className="mt-2">
                <PixelButton color="cyan" size="sm" onClick={handleNewAvatar} className="w-full">
                  + NEW
                </PixelButton>
              </div>
            </div>
          </PixelPanel>

          {/* Preview */}
          <PixelPanel accent="gold" title="PREVIEW">
            <div className="p-3 flex flex-col items-center gap-3">
              <div className="flex items-end gap-4">
                {[68, 51, 34].map((px) => (
                  <div key={px} className="flex flex-col items-center gap-2">
                    <CustomAvatarCanvas avatarData={previewData} size={px} />
                    <div className="font-pixel-body text-[18px] text-bone/70">{px}px</div>
                  </div>
                ))}
              </div>
            </div>
          </PixelPanel>

          <div className="flex flex-col gap-2">
            <PixelButton
              color="gold"
              size="md"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="w-full"
            >
              {saving ? "SAVING..." : "SAVE"}
            </PixelButton>
            <PixelButton
              color="dusk"
              size="md"
              onClick={() => navigate(-1)}
              className="w-full"
            >
              CANCEL
            </PixelButton>
          </div>
        </div>
      </div>

      {showShop && (
        <ShopModal
          onClose={closeShop}
          onSignIn={closeShop}
          onPaint={(n) => {
            setShowShop(false);
            handleOpenSlot(n);
          }}
        />
      )}
      {showPicker && (
        <ColorPickerModal
          initialColor={selectedColor}
          onSelect={handleAddCustomColor}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default AvatarPaint;
