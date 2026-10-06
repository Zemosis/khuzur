// GAME LOGIC - Core Game Rules & Turn Management

import { GAME_SETTINGS, PLAYER_TYPES, GAME_STATES, BOT_NAMES } from "./constants.js";
import { removeCardsFromHand } from "./deckUtils.js";
import { validatePlay } from "./handEvaluator.js";

// GAME STATE INITIALIZATION

/**
 * Creates initial game state
 * @param {Array} hands - Dealt hands for all players
 * @param {Number} startingPlayer - Index of player who starts (dealer's left)
 * @returns {Object} Complete game state
 */
export const createGameState = (
  hands,
  startingPlayer = 0,
  aiDifficulty,
  matchMeta = {},
) => {
  const players = hands.map((hand, index) => ({
    id: index,
    hand: hand,
    score: 0,
    isEliminated: false,
    type: index === 0 ? PLAYER_TYPES.HUMAN : PLAYER_TYPES.AI,
    name: index === 0 ? "You" : BOT_NAMES[index - 1],
    hasPassed: false,
    lastPlay: null,
  }));

  return {
    players,
    currentPlayerIndex: startingPlayer,
    dealerIndex: (startingPlayer - 1 + hands.length) % hands.length,
    currentPlay: null,
    lastPlayedBy: null,
    roundNumber: 1,
    matchNumber: matchMeta.matchNumber || 1,
    matchWins: matchMeta.matchWins || hands.map(() => 0),
    gameState: GAME_STATES.PLAYING,
    passCount: 0,
    moveHistory: [],
    aiDifficulty: aiDifficulty || "MEDIUM",
  };
};

// TURN MANAGEMENT

/**
 * Gets the next active player index
 * @param {Object} gameState - Current game state
 * @returns {Number} Next player index
 */
export const getNextPlayerIndex = (gameState) => {
  const { players, currentPlayerIndex } = gameState;
  let nextIndex = (currentPlayerIndex + 1) % players.length;

  // Skip eliminated players and those who passed since the last play
  while (players[nextIndex].isEliminated || players[nextIndex].hasPassed) {
    nextIndex = (nextIndex + 1) % players.length;

    // Safety check: if we've looped back, something's wrong
    if (nextIndex === currentPlayerIndex) {
      break;
    }
  }

  return nextIndex;
};

/**
 * Checks if only one player hasn't passed (round should reset)
 * @param {Object} gameState - Current game state
 * @returns {Boolean} True if round should reset
 */
export const shouldResetRound = (gameState) => {
  const activePlayers = gameState.players.filter((p) => !p.isEliminated);
  const playersWhoHaventPassed = activePlayers.filter((p) => !p.hasPassed);

  // If only one player left who hasn't passed, or if last player just won the trick
  return playersWhoHaventPassed.length <= 1;
};

/**
 * Resets the round (clears passes, gives lead to last player)
 * @param {Object} gameState - Current game state
 * @returns {Object} Updated game state
 */
export const resetRound = (gameState) => {
  // Last player who played gets to lead
  const leadPlayer = gameState.lastPlayedBy ?? gameState.currentPlayerIndex;

  const updatedPlayers = gameState.players.map((player) => ({
    ...player,
    hasPassed: false,
    lastPlay: null,
  }));

  return {
    ...gameState,
    players: updatedPlayers,
    currentPlay: null,
    lastPlayedBy: null,
    currentPlayerIndex: leadPlayer,
    passCount: 0,
    moveHistory: [
      ...gameState.moveHistory,
      { type: "ROUND_RESET", leadPlayer },
    ],
  };
};

// PLAY ACTIONS

/**
 * Processes a player's play action
 * @param {Object} gameState - Current game state
 * @param {Array} selectedCards - Cards player wants to play
 * @returns {Object} { success: boolean, newState: Object, error: string }
 */
export const playCards = (gameState, selectedCards) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Validate the play
  const validation = validatePlay(selectedCards, gameState.currentPlay);

  if (!validation.valid) {
    return {
      success: false,
      newState: gameState,
      error: validation.reason,
    };
  }

  // Remove cards from player's hand
  const updatedHand = removeCardsFromHand(currentPlayer.hand, selectedCards);

  // Check if player won (no cards left)
  const playerWon = updatedHand.length === 0;

  // Update player
  const updatedPlayer = {
    ...currentPlayer,
    hand: updatedHand,
    lastPlay: validation.combination,
  };

  // Update players array. A play wipes everyone's pass: passing only skips
  // that one turn, so a player who passed gets asked again once someone beats
  // the table. The trick ends when everyone else passes in a row.
  const updatedPlayers = gameState.players.map((p, idx) =>
    idx === gameState.currentPlayerIndex ? updatedPlayer : { ...p, hasPassed: false },
  );

  // Create new game state
  let newState = {
    ...gameState,
    players: updatedPlayers,
    currentPlay: validation.combination,
    lastPlayedBy: gameState.currentPlayerIndex,
    passCount: 0,
    moveHistory: [
      ...gameState.moveHistory,
      {
        type: "PLAY",
        playerIndex: gameState.currentPlayerIndex,
        // As the table shows it (see identifyCombination), not as clicked
        cards: validation.combination.cards,
        combination: validation.combination,
      },
    ],
  };

  // If player won, end the round
  if (playerWon) {
    return {
      success: true,
      newState: endRound(newState, gameState.currentPlayerIndex),
      playerWon: true,
    };
  }

  // Move to next player
  newState.currentPlayerIndex = getNextPlayerIndex(newState);

  // Check if round should reset
  if (shouldResetRound(newState)) {
    newState = resetRound(newState);
  }

  return {
    success: true,
    newState,
    playerWon: false,
  };
};

/**
 * Processes a player's pass action
 * @param {Object} gameState - Current game state
 * @returns {Object} Updated game state
 */
export const passAction = (gameState) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  // Update player to passed state
  const updatedPlayer = {
    ...currentPlayer,
    hasPassed: true,
  };

  // Update players array
  const updatedPlayers = gameState.players.map((p, idx) =>
    idx === gameState.currentPlayerIndex ? updatedPlayer : p,
  );

  let newState = {
    ...gameState,
    players: updatedPlayers,
    passCount: gameState.passCount + 1,
    moveHistory: [
      ...gameState.moveHistory,
      {
        type: "PASS",
        playerIndex: gameState.currentPlayerIndex,
      },
    ],
  };

  // Move to next player
  newState.currentPlayerIndex = getNextPlayerIndex(newState);

  // Check if round should reset
  if (shouldResetRound(newState)) {
    newState = resetRound(newState);
  }

  return newState;
};

// ROUND END & SCORING

/**
 * Ends the round and calculates scores
 * @param {Object} gameState - Current game state
 * @param {Number} winnerIndex - Index of player who won
 * @returns {Object} Updated game state with scores
 */
export const endRound = (gameState, winnerIndex) => {
  const updatedPlayers = gameState.players.map((player, idx) => {
    // Winner: no score change
    if (idx === winnerIndex) {
      return {
        ...player,
        hand: [],
      };
    }

    // Calculate score for other players
    const cardsRemaining = player.hand.length;
    let pointsToAdd = cardsRemaining;

    // Penalty: double points if 10+ cards remaining
    if (cardsRemaining >= GAME_SETTINGS.PENALTY_THRESHOLD) {
      pointsToAdd = cardsRemaining * 2;
    }

    const newScore = player.score + pointsToAdd;
    const isEliminated = newScore >= GAME_SETTINGS.ELIMINATION_SCORE;

    return {
      ...player,
      score: newScore,
      isEliminated,
      hand: [], // Clear hand for next round
    };
  });

  // Check if game is over (only one player left)
  const activePlayers = updatedPlayers.filter((p) => !p.isEliminated);
  const gameOver = activePlayers.length === 1;

  const updatedMatchWins = [...(gameState.matchWins || gameState.players.map(() => 0))];
  if (gameOver) {
    updatedMatchWins[activePlayers[0].id] += 1;
  }

  return {
    ...gameState,
    players: updatedPlayers,
    gameState: gameOver ? GAME_STATES.GAME_OVER : GAME_STATES.ROUND_END,
    winnerIndex,
    matchWins: updatedMatchWins,
    moveHistory: [
      ...gameState.moveHistory,
      {
        type: "ROUND_END",
        winnerIndex,
        scores: updatedPlayers.map((p) => ({
          id: p.id,
          score: p.score,
          eliminated: p.isEliminated,
        })),
      },
    ],
  };
};

/**
 * Prepares for the next round
 * @param {Object} gameState - Current game state
 * @param {Array} newHands - New dealt hands
 * @returns {Object} Updated game state
 */
export const startNextRound = (gameState, newHands) => {
  const numPlayers = gameState.players.length;

  let newDealerIndex = (gameState.dealerIndex + 1) % numPlayers;
  for (let i = 0; i < numPlayers && gameState.players[newDealerIndex].isEliminated; i++) {
    newDealerIndex = (newDealerIndex + 1) % numPlayers;
  }

  let startingPlayerIndex =
    gameState.winnerIndex !== undefined
      ? gameState.winnerIndex
      : (newDealerIndex + 1) % numPlayers;
  for (
    let i = 0;
    i < numPlayers &&
    gameState.players[startingPlayerIndex].isEliminated;
    i++
  ) {
    startingPlayerIndex = (startingPlayerIndex + 1) % numPlayers;
  }

  const updatedPlayers = gameState.players.map((player, idx) => ({
    ...player,
    hand: player.isEliminated ? [] : newHands[idx],
    hasPassed: false,
    lastPlay: null,
  }));

  return {
    ...gameState,
    players: updatedPlayers,
    currentPlayerIndex: startingPlayerIndex,
    dealerIndex: newDealerIndex,
    currentPlay: null,
    lastPlayedBy: null,
    roundNumber: gameState.roundNumber + 1,
    gameState: GAME_STATES.PLAYING,
    passCount: 0,
    moveHistory: [
      ...gameState.moveHistory,
      {
        type: "NEW_ROUND",
        roundNumber: gameState.roundNumber + 1,
        dealer: newDealerIndex,
      },
    ],
  };
};

// GAME STATE QUERIES

/**
 * Checks if it's the human player's turn
 * @param {Object} gameState - Current game state
 * @returns {Boolean} True if human's turn
 */
export const isHumanTurn = (gameState) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  return (
    currentPlayer.type === PLAYER_TYPES.HUMAN && !currentPlayer.isEliminated
  );
};

/**
 * Gets active (non-eliminated) players
 * @param {Object} gameState - Current game state
 * @returns {Array} Active players
 */
export const getActivePlayers = (gameState) => {
  return gameState.players.filter((p) => !p.isEliminated);
};

/**
 * Gets the winner (if game is over)
 * @param {Object} gameState - Current game state
 * @returns {Object|null} Winner player or null
 */
export const getWinner = (gameState) => {
  if (gameState.gameState !== GAME_STATES.GAME_OVER) return null;

  const activePlayers = getActivePlayers(gameState);
  return activePlayers.length === 1 ? activePlayers[0] : null;
};

/**
 * Checks if human player is eliminated
 * @param {Object} gameState - Current game state
 * @returns {Boolean} True if human is eliminated
 */
export const isHumanEliminated = (gameState) => {
  return gameState.players[0].isEliminated;
};

export default {
  createGameState,
  getNextPlayerIndex,
  shouldResetRound,
  resetRound,
  playCards,
  passAction,
  endRound,
  startNextRound,
  isHumanTurn,
  getActivePlayers,
  getWinner,
  isHumanEliminated,
};
