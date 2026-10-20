// CARD COMPONENT - Individual image file rendering

import React from "react";

/**
 * Vite glob import — loads every PNG in the asset pack at build time.
 * Keys are the exact relative paths used in the glob pattern.
 * Values are the resolved module URL (`.default` on eagerly-loaded assets).
 */
const cardImages = import.meta.glob(
  "../assets/Pixel Playing Cards - Asset Pack/*.png",
  { eager: true },
);

/** Resolve a filename to its bundled URL. */
const img = (filename) =>
  cardImages[
    `../assets/Pixel Playing Cards - Asset Pack/${filename}`
  ]?.default;

// ─── Mapping tables ───────────────────────────────────────────────────────────

/** Game rank value → filename rank word */
const RANK_WORD = {
  A: "ace",   2: "two",   3: "three", 4: "four",  5: "five",
  6: "six",   7: "seven", 8: "eight", 9: "nine", 10: "ten",
  J: "jack",  Q: "queen", K: "king",
};

/** Game suit symbol → filename suit word */
const SUIT_WORD = {
  "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs",
};

// ─── URL helpers ──────────────────────────────────────────────────────────────

const getCardSrc = (rank, suit) =>
  img(`${RANK_WORD[rank]}_of_${SUIT_WORD[suit]}.png`);

const getBackSrc = (color = "blue") => img(`${color}_backing.png`);

// ─── Size config ──────────────────────────────────────────────────────────────

const SIZE_CLASS = {
  small:  "w-12 h-16",
  medium: "w-16 h-24",
  large:  "w-20 h-28",
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Card Component
 *
 * @param {Object}  card      - Card object { rank, suit, id }
 * @param {Boolean} isSelected  - Lift card and show selection ring
 * @param {Boolean} isPlayable  - Enable click and hover effects
 * @param {Boolean} faceDown    - Show card back instead of face
 * @param {String}  cardBack    - Back colour: 'blue'|'green'|'grey'|'pink'|'purple'|'red'|'yellow'
 * @param {Function} onClick    - Click handler (card, event)
 * @param {String}  size        - 'small' | 'medium' | 'large'
 * @param {String}  className   - Extra Tailwind classes for the wrapper
 */
const Card = ({
  card,
  isSelected = false,
  isPlayable = false,
  faceDown = false,
  cardBack = "blue",
  onClick,
  size = "medium",
  className = "",
}) => {
  const sizeClass = SIZE_CLASS[size];

  const handleClick = (e) => {
    if (isPlayable && onClick) onClick(card, e);
  };

  const hoverEffect   = isPlayable ? "hover:scale-105 hover:-translate-y-2 cursor-pointer" : "";
  const liftTransform = isSelected && !faceDown ? "-translate-y-6" : "";
  const dimOpacity    = !isPlayable && !isSelected && !faceDown ? "opacity-70" : "opacity-100";
  const selectionRing = isSelected && !faceDown ? "ring-2 ring-blue-400 ring-offset-1" : "";

  const wrapperClass = `
    ${sizeClass}
    ${hoverEffect}
    ${liftTransform}
    ${dimOpacity}
    ${selectionRing}
    ${className}
    rounded-lg shadow-lg transition-all duration-200
    relative overflow-hidden select-none flex-shrink-0
  `;

  // ── Face-down (card back) ──────────────────────────────────────────────────
  if (faceDown) {
    return (
      <div className={wrapperClass}>
        <img
          src={getBackSrc(cardBack)}
          alt="card back"
          className="w-full h-full object-fill"
          draggable={false}
        />
      </div>
    );
  }

  // ── Face-up ────────────────────────────────────────────────────────────────
  return (
    <div onClick={handleClick} className={wrapperClass}>
      <img
        src={getCardSrc(card.rank, card.suit)}
        alt={`${card.rank}${card.suit}`}
        className="w-full h-full object-fill"
        draggable={false}
      />

      {/* Selection tick */}
      {isSelected && (
        <div className="absolute top-0 right-0 bg-blue-500 text-white rounded-bl-lg w-4 h-4 flex items-center justify-center text-[10px] font-bold z-10">
          ✓
        </div>
      )}
    </div>
  );
};

export default Card;
