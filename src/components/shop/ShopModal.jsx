// SHOP — spend gold, in a big window over the darkened main menu (route
// /shop). Tabs down the left: Avatar slots sells now; borders, titles and
// card variants show as SOON. Buying takes two clicks (BUY, then SPEND) and
// the server checks the price (server/shop.js); then coins fly from your gold
// into the slot and it bursts open (purchaseFx.js). The catalog and prices
// are in utils/shop.js; docs/gold-economy.md explains them.
// Escape, the X and a click outside close it. Guests can look but not buy.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useCountUp } from "../../hooks/useCountUp";
import { api } from "../../lib/api";
import { fmt } from "../../utils/poker/tiers";
import { SHOP_CATEGORIES, SHOP_ITEMS, MAX_AVATAR_SLOTS, cantBuy, ownsItem, shopItem } from "../../utils/shop";
import { PixelAvatar } from "../PixelCard";
import { INK, TONES } from "../pixelTokens";
import PixelIcon from "../PixelIcon";
import Coin from "../Coin";
import ConveyorLoop from "../loading-ui/ConveyorLoop";
import { payIntoSlot, unlockBurst } from "./purchaseFx";

const GOLD = { bg: "#f4c430", deep: "#c89820", ink: INK };

const SoonTag = ({ className = "" }) => (
  <span
    className={`font-pixel-display text-[8px] leading-none px-1 py-0.5 shrink-0 ${className}`}
    style={{ backgroundColor: "#e85a7a", color: "#ead8b1", boxShadow: `0 0 0 2px ${INK}` }}
  >
    SOON
  </span>
);

export default function ShopModal({ onClose, onSignIn, onPaint }) {
  const { identity, profile, isGuest, applyProfile } = useAuth();
  const [tab, setTab] = useState("avatar");
  const dialogRef = useRef(null);
  const goldRef = useRef(null); // the gold count, where a purchase's coins leave from
  const fxRef = useRef(null); // the layer the purchase's coins and sparks fly in
  const [spent, setSpent] = useState(null); // { amount, at }: the "-1,500" under your gold
  const { shown: gold, landed } = useCountUp(isGuest ? null : (identity.gold ?? 0));

  useEffect(() => {
    if (!spent) return;
    const id = setTimeout(() => setSpent(null), 1200);
    return () => clearTimeout(id);
  }, [spent]);
  const category = SHOP_CATEGORIES.find((c) => c.id === tab);

  useEffect(() => {
    const before = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6"
      style={{ backgroundColor: "rgba(10, 7, 18, 0.85)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full outline-none"
        style={{
          maxWidth: 1040,
          height: "min(720px, 100%)",
          backgroundColor: "#14102a",
          border: `4px solid ${GOLD.deep}`,
          boxShadow: `0 0 0 4px ${INK}, 8px 8px 0 ${INK}, inset 0 4px 0 rgba(255,255,255,0.05)`,
        }}
      >
        {/* Title bar: the shop, your gold, close. */}
        <header
          className="flex items-center gap-3 px-3 sm:px-4 shrink-0"
          style={{ height: 52, backgroundColor: GOLD.deep, borderBottom: `4px solid ${INK}`, color: INK }}
        >
          <PixelIcon name="bag" size={16} />
          <h2 id="shop-title" className="font-pixel-display text-[14px] uppercase leading-none mr-auto">
            Shop
          </h2>
          {!isGuest && (
            <span className="relative">
              <span
                ref={goldRef}
                className={`flex items-center gap-2 px-2.5 py-1.5 font-pixel-display text-[11px] leading-none tabular-nums text-glow-gold ${landed ? "badge-landed" : ""}`}
                style={{ backgroundColor: INK, color: GOLD.bg }}
                aria-label={`${fmt(identity.gold ?? 0)} gold`}
              >
                <Coin size={10} />
                {fmt(gold)}
              </span>
              {spent && (
                <span
                  key={spent.at}
                  aria-hidden
                  className="spend-float absolute right-0 top-full mt-1 pointer-events-none font-pixel-display text-[10px] px-1.5 py-1 whitespace-nowrap"
                  style={{ backgroundColor: "#e85a7a", color: INK, boxShadow: `0 0 0 2px ${INK}` }}
                >
                  -{fmt(spent.amount)}
                </span>
              )}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close the shop"
            className="pixel-hbtn flex items-center justify-center shrink-0"
            style={{ width: 32, height: 32, backgroundColor: INK, color: "#e85a7a" }}
          >
            <PixelIcon name="close" size={12} />
          </button>
        </header>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Tabs: a column on wide screens, a sideways row on phones. */}
          <nav
            role="tablist"
            aria-label="Shop sections"
            className="flex md:flex-col gap-2 p-3 shrink-0 overflow-x-auto md:w-[264px] border-[#0a0712] max-md:border-b-4 md:border-r-4"
            style={{ backgroundColor: "#0f0b20", scrollbarWidth: "none" }}
          >
            {SHOP_CATEGORIES.map((c) => {
              const selected = tab === c.id;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={selected}
                  aria-controls="shop-panel"
                  onClick={() => setTab(c.id)}
                  className="pixel-hbtn flex items-center justify-between gap-3 px-3 text-left whitespace-nowrap shrink-0 font-pixel-display text-[10px] uppercase"
                  style={{
                    height: 44,
                    backgroundColor: selected ? GOLD.bg : "#1f1a3d",
                    color: selected ? INK : c.live ? "#ead8b1" : "#c8b890",
                    boxShadow: `0 0 0 2px ${INK}`,
                  }}
                >
                  {c.label}
                  {!c.live && <SoonTag />}
                </button>
              );
            })}
          </nav>

          <section id="shop-panel" role="tabpanel" aria-label={category.label} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
              <h3 className="font-pixel-display text-[12px] uppercase text-glow-gold">{category.label}</h3>
              <p className="font-pixel-body text-[20px] leading-tight text-bone/80">{category.blurb}</p>
            </div>
            {category.live ? (
              <AvatarSlots
                identity={identity}
                profile={profile}
                isGuest={isGuest}
                onBought={applyProfile}
                onSpend={(amount) => setSpent({ amount, at: Date.now() })}
                goldRef={goldRef}
                fxRef={fxRef}
                onSignIn={onSignIn}
                onPaint={onPaint}
              />
            ) : (
              <ComingSoon category={category.id} />
            )}
          </section>
        </div>

        <footer
          className="shrink-0 px-4 py-2 font-pixel-body text-[18px] leading-tight text-bone/70 max-sm:hidden"
          style={{ borderTop: `4px solid ${INK}`, backgroundColor: "#0f0b20" }}
        >
          Earn gold by playing people online and by levelling up. It isn't credits, and everything here is for looks only.
        </footer>
      </div>
      <div ref={fxRef} aria-hidden className="fixed inset-0 pointer-events-none z-[60]" />
    </div>
  );
}

/** Slot 1 (everyone's) and the slots on sale, each with its painting, price and button. */
function AvatarSlots({ identity, profile, isGuest, onBought, onSpend, goldRef, fxRef, onSignIn, onPaint }) {
  const [confirming, setConfirming] = useState(null); // the item id awaiting SPEND
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok" | "error", text }
  const [unlocked, setUnlocked] = useState(null); // the slot just bought, while it bursts open
  const faces = useRef({}); // slot -> its face, where the coins land

  useEffect(() => {
    if (!unlocked) return;
    const id = setTimeout(() => setUnlocked(null), 1400);
    return () => clearTimeout(id);
  }, [unlocked]);

  // Once the server has sold it: the coins fly into the slot, then it opens.
  const buy = async (item) => {
    setBusy(true);
    setMessage(null);
    try {
      const { profile: after } = await api("/buy", { method: "POST", body: { itemId: item.id }, base: "/api/shop" });
      onSpend(item.price);
      await payIntoSlot({ layer: fxRef.current, from: goldRef.current, to: faces.current[item.avatarSlot] });
      onBought(after);
      setUnlocked(item.avatarSlot);
      setMessage({ kind: "ok", text: `${item.name} is yours. Paint it!` });
    } catch (err) {
      setMessage({ kind: "error", text: err.message || "Couldn't buy that" });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const slots = Array.from({ length: MAX_AVATAR_SLOTS }, (_, i) => i + 1);

  return (
    <>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {slots.map((slot) => {
          const item = SHOP_ITEMS.find((i) => i.avatarSlot === slot);
          const owned = !isGuest && (!item || ownsItem(profile, item));
          return (
            <SlotCard
              key={slot}
              slot={slot}
              item={item}
              owned={owned}
              painting={owned ? identity.avatarSlots?.[slot - 1] : null}
              worn={owned && identity.avatar === "custom" && identity.customSlot === slot}
              faceRef={(el) => (faces.current[slot] = el)}
              celebrate={unlocked === slot}
              fxRef={fxRef}
            >
              {isGuest ? (
                <ActionBtn tone={GOLD} onClick={onSignIn}>
                  <PixelIcon name="key" size={12} />
                  Sign in to buy
                </ActionBtn>
              ) : owned ? (
                <ActionBtn tone={TONES.cyan} onClick={() => onPaint(slot)}>
                  <PixelIcon name="pencil" size={12} />
                  {identity.avatarSlots?.[slot - 1] ? "Edit" : "Paint it"}
                </ActionBtn>
              ) : (
                <BuyButton
                  item={item}
                  reason={cantBuy(profile, item)}
                  gold={identity.gold ?? 0}
                  confirming={confirming === item.id}
                  busy={busy}
                  onBuy={() => setConfirming(item.id)}
                  onConfirm={() => buy(item)}
                  onCancel={() => setConfirming(null)}
                />
              )}
            </SlotCard>
          );
        })}
      </div>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className="mt-4 font-pixel-body text-[20px]"
          style={{ color: message.kind === "error" ? "#e85a7a" : "#9bd14f" }}
        >
          {message.text}
        </p>
      )}
    </>
  );
}

function SlotCard({ slot, item, owned, painting, worn, faceRef, celebrate, fxRef, children }) {
  const face = useRef(null);
  useLayoutEffect(() => {
    if (celebrate) unlockBurst({ layer: fxRef.current, face: face.current });
  }, [celebrate, fxRef]);

  return (
    <article
      className={`flex flex-col ${celebrate ? "slot-unlocked" : ""}`}
      style={{
        backgroundColor: owned ? "#1f1a3d" : "#14102a",
        border: `3px solid ${owned ? "#2a8a8c" : "#463a78"}`,
        boxShadow: `0 0 0 3px ${INK}, inset 0 3px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div className="flex items-center justify-center py-5 dither-light relative" style={{ borderBottom: `3px solid ${INK}` }}>
        <span
          ref={(el) => {
            face.current = el;
            faceRef(el);
          }}
          className="flex"
        >
          <SlotFace owned={owned} painting={painting} />
        </span>
        {celebrate && (
          <span
            className="result-pop absolute bottom-1.5 font-pixel-display text-[10px] px-1.5 py-1 leading-none"
            style={{ backgroundColor: GOLD.bg, color: INK, boxShadow: `0 0 0 2px ${INK}` }}
          >
            UNLOCKED!
          </span>
        )}
        <span
          className="absolute top-2 left-2 font-pixel-display text-[8px] leading-none px-1 py-0.5"
          style={{
            backgroundColor: owned ? "#5fd4d6" : "#463a78",
            color: owned ? INK : "#ead8b1",
            boxShadow: `0 0 0 2px ${INK}`,
          }}
        >
          {worn ? "WEARING" : owned ? "OWNED" : "LOCKED"}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-pixel-display text-[11px] uppercase text-parchment">Slot {slot}</h4>
          {owned && item ? null : item ? (
            <span className="flex items-center gap-1.5 font-pixel-display text-[10px] tabular-nums text-glow-gold">
              <Coin />
              {fmt(item.price)}
            </span>
          ) : (
            <span className="font-pixel-display text-[10px] text-bone/70">FREE</span>
          )}
        </div>
        <p className="font-pixel-body text-[19px] leading-tight text-bone/80 flex-1">
          {item ? item.desc : "Everyone's first painted avatar."}
        </p>
        {children}
      </div>
    </article>
  );
}

/** The slot's painting, an empty frame to paint, or a padlock. */
function SlotFace({ owned, painting }) {
  if (owned && painting) {
    return (
      <span style={{ boxShadow: `0 0 0 3px ${INK}` }}>
        <PixelAvatar variant="custom" size={68} customAvatarData={painting} />
      </span>
    );
  }
  return (
    <span
      className="flex items-center justify-center"
      style={{
        width: 68,
        height: 68,
        border: `3px dashed ${owned ? "#2a8a8c" : "#463a78"}`,
        backgroundColor: INK,
        color: owned ? "#5fd4d6" : "#7a6abf",
      }}
    >
      {owned ? <span className="font-pixel-display text-[16px]">+</span> : <PixelIcon name="lock" size={16} title="Locked" />}
    </span>
  );
}

function ActionBtn({ tone, onClick, disabled, busy, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={`pixel-btn font-pixel-display text-[10px] uppercase flex items-center justify-center gap-2 w-full ${className}`}
      style={{ height: 40, backgroundColor: tone.bg, borderColor: tone.deep, color: tone.ink }}
    >
      {children}
    </button>
  );
}

/** BUY, then CONFIRM / BACK; or why you can't yet. */
function BuyButton({ item, reason, gold, confirming, busy, onBuy, onConfirm, onCancel }) {
  if (reason === "requires") {
    return (
      <ActionBtn tone={TONES.dusk} disabled>
        Buy {shopItem(item.requires).name.replace(/^Avatar /, "")} first
      </ActionBtn>
    );
  }
  if (reason === "gold") {
    return (
      <>
        <ActionBtn tone={GOLD} disabled>
          Buy
        </ActionBtn>
        <span className="font-pixel-body text-[18px] leading-none text-bone/70 text-center">
          {fmt(item.price - gold)} more gold to go
        </span>
      </>
    );
  }
  if (confirming) {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr auto" }}>
        {/* Busy, it keeps its color and shows the CLAIM buttons' loader. */}
        <ActionBtn tone={TONES.poison} onClick={busy ? undefined : onConfirm} busy={busy}>
          {busy ? (
            <>
              <ConveyorLoop length={4} mask={TONES.poison.bg} label={null} className="text-[12px]" />
              Buying
            </>
          ) : (
            `Spend ${fmt(item.price)}`
          )}
        </ActionBtn>
        <ActionBtn tone={TONES.dusk} onClick={onCancel} disabled={busy} className="px-3">
          Back
        </ActionBtn>
      </div>
    );
  }
  return (
    <ActionBtn tone={GOLD} onClick={onBuy}>
      Buy
    </ActionBtn>
  );
}

/** A section not on sale yet: a few locked shapes of what's coming. */
function ComingSoon({ category }) {
  const Shape = { borders: BorderShape, titles: TitleShape, cards: CardShape }[category] ?? BorderShape;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden={i > 0}
          className="relative flex flex-col items-center justify-center gap-3 p-4"
          style={{
            minHeight: 180,
            backgroundColor: "#100c22",
            border: "3px dashed #2a234d",
          }}
        >
          <Shape index={i} />
          <span className="font-pixel-display text-[10px] text-bone/50 tracking-widest">? ? ?</span>
          <SoonTag className="absolute top-2 right-2" />
        </div>
      ))}
    </div>
  );
}

const BorderShape = ({ index }) => (
  <span style={{ padding: 4, boxShadow: `0 0 0 4px ${["#463a78", "#2a8a8c", "#a83a5a", "#c89820"][index]}, 0 0 0 7px ${INK}`, opacity: 0.55 }}>
    <PixelAvatar variant={(index % 5) + 1} size={51} />
  </span>
);

const TitleShape = ({ index }) => (
  <span className="flex flex-col items-center gap-2" style={{ opacity: 0.55 }}>
    <PixelAvatar variant={((index + 2) % 5) + 1} size={34} />
    <span style={{ width: [96, 72, 112, 84][index], height: 12, backgroundColor: "#2a234d", boxShadow: `0 0 0 2px ${INK}` }} />
  </span>
);

const CardShape = ({ index }) => (
  <span
    className="flex items-center justify-center"
    style={{
      width: 56,
      height: 80,
      opacity: 0.55,
      backgroundColor: ["#4a1a2c", "#1a3a4a", "#13240f", "#2a1f1a"][index],
      border: `3px solid ${INK}`,
      backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 4px, transparent 4px 8px)",
    }}
  >
    <PixelIcon name="lock" size={14} />
  </span>
);
