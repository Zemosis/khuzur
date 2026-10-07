// Rank Order
export const RANKS = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];

// Rank values for comparison (higher = stronger)
export const RANK_VALUES = {
  3: 0,
  4: 1,
  5: 2,
  6: 3,
  7: 4,
  8: 5,
  9: 6,
  10: 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  2: 12,
};

// CARD SUITS (Strength Order)
// Diamonds (weakest) < Clubs < Hearts < Spades (strongest)
export const SUITS = ["♦", "♣", "♥", "♠"];

// Suit values for easy comparison (higher = stronger)
export const SUIT_VALUES = {
  "♦": 0, // Diamonds
  "♣": 1, // Clubs
  "♥": 2, // Hearts
  "♠": 3, // Spades
};

// Suit colors for UI rendering
export const SUIT_COLORS = {
  "♦": "red",
  "♣": "black",
  "♥": "red",
  "♠": "black",
};

// Full suit names
export const SUIT_NAMES = {
  "♦": "Diamonds",
  "♣": "Clubs",
  "♥": "Hearts",
  "♠": "Spades",
};

// COMBINATION TYPES
export const COMBO_TYPES = {
  SINGLE: "SINGLE",
  PAIR: "PAIR",
  TRIPLE: "TRIPLE",
  FOUR_OF_A_KIND: "FOUR_OF_A_KIND",
  STRAIGHT: "STRAIGHT",
  FLUSH: "FLUSH",
  FULL_HOUSE: "FULL_HOUSE",
  STRAIGHT_FLUSH: "STRAIGHT_FLUSH",
  ROYAL_FLUSH: "ROYAL_FLUSH",
};

// Combination strength hierarchy for 5-card poker hands
export const POKER_COMBO_STRENGTH = {
  [COMBO_TYPES.STRAIGHT]: 0,
  [COMBO_TYPES.FLUSH]: 1,
  [COMBO_TYPES.FULL_HOUSE]: 2,
  [COMBO_TYPES.STRAIGHT_FLUSH]: 3,
  [COMBO_TYPES.ROYAL_FLUSH]: 4,
};

// Human-readable names
export const COMBO_NAMES = {
  [COMBO_TYPES.SINGLE]: "Single",
  [COMBO_TYPES.PAIR]: "Pair",
  [COMBO_TYPES.TRIPLE]: "Triple",
  [COMBO_TYPES.FOUR_OF_A_KIND]: "Four of a Kind",
  [COMBO_TYPES.STRAIGHT]: "Straight",
  [COMBO_TYPES.FLUSH]: "Flush",
  [COMBO_TYPES.FULL_HOUSE]: "Full House",
  [COMBO_TYPES.STRAIGHT_FLUSH]: "Straight Flush",
  [COMBO_TYPES.ROYAL_FLUSH]: "Royal Flush",
};

// GAME SETTINGS
export const GAME_SETTINGS = {
  NUM_PLAYERS: 4,
  CARDS_PER_PLAYER: 13,
  TOTAL_CARDS: 52,

  // Tournament Scoring
  // Player eliminated at 30 points
  ELIMINATION_SCORE: 30,
  // Double points if ≥10 cards remaining
  PENALTY_THRESHOLD: 10,

  // Timing (in milliseconds)
  AI_TURN_DELAY: 1000, // Delay before AI plays
  CARD_ANIMATION_DURATION: 300, // Card play animation
  ROUND_END_DELAY: 2000, // Delay before starting new round
};

// PLAYER TYPES
export const PLAYER_TYPES = {
  HUMAN: "HUMAN",
  AI: "AI",
};

// Bot names in seating order, every game: solar-system planets, then moons.
// Saturn and Venus always come first; the rest are spares for bigger tables.
export const BOT_NAMES = [
  "Bot Saturn",
  "Bot Venus",
  "Bot Mars",
  "Bot Jupiter",
  "Bot Mercury",
  "Bot Neptune",
  "Bot Uranus",
  "Bot Titan",
  "Bot Europa",
  "Bot Ganymede",
  "Bot Io",
  "Bot Callisto",
  "Bot Triton",
  "Bot Phobos",
];

// Player positions (for UI layout)
export const PLAYER_POSITIONS = {
  BOTTOM: 0, // Human player
  LEFT: 1, // Bot Saturn
  TOP: 2, // Bot Venus
  RIGHT: 3, // Bot Mars
};

// GAME STATES
export const GAME_STATES = {
  SETUP: "SETUP", // Initial setup
  PLAYING: "PLAYING", // Active gameplay
  ROUND_END: "ROUND_END", // Round finished, calculating scores
  PLAYER_ELIMINATED: "PLAYER_ELIMINATED", // A player was eliminated
  GAME_OVER: "GAME_OVER", // Only one player remains
};

// AI DIFFICULTY LEVELS (for future expansion)
export const AI_DIFFICULTY = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
};

// UI CONSTANTS
export const UI_CONSTANTS = {
  CARD_WIDTH: 80,
  CARD_HEIGHT: 112,
  CARD_OVERLAP: 30, // How much cards overlap in hand
  MAX_HAND_WIDTH: 800, // Maximum width of player hand display

  // Animation classes
  ANIMATIONS: {
    CARD_PLAY: "animate-card-play",
    CARD_DEAL: "animate-card-deal",
    CARD_SELECT: "scale-110 -translate-y-4",
  },
};

// GAME MESSAGES
export const MESSAGES = {
  YOUR_TURN: "Your turn! Select cards and play.",
  WAITING: "Waiting for other players...",
  ROUND_WON: "You won the round!",
  ROUND_LOST: "Round finished!",
  GAME_WON: "Congratulations! You won the game!",
  GAME_LOST: "Game Over! You've been eliminated.",
  INVALID_COMBO: "Invalid combination. Try again.",
  MUST_BEAT: "You must play a stronger combination or pass.",
  PASSED: "You passed this round.",
};

export default {
  RANKS,
  RANK_VALUES,
  SUITS,
  SUIT_VALUES,
  SUIT_COLORS,
  SUIT_NAMES,
  COMBO_TYPES,
  POKER_COMBO_STRENGTH,
  COMBO_NAMES,
  GAME_SETTINGS,
  PLAYER_TYPES,
  PLAYER_POSITIONS,
  GAME_STATES,
  AI_DIFFICULTY,
  UI_CONSTANTS,
  MESSAGES,
};
