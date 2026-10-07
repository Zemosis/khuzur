// GAME CONTROLS - Pixel Retro Action Buttons
//
// One row on a wide table. On a phone it wraps into three: the status line,
// the hand tools (sort, clear, all), then PASS and PLAY at full width.
// `dense` (a short screen) trims labels and padding to stay on one row.

import React, { useEffect } from "react";

const GameControls = ({
  onPlay,
  onPass,
  canPlay = false,
  canPass = true,
  isPlayerTurn = false,
  message = "",
  errorMessage = "",
  selectedCount = 0,
  comboInfo = null,
  onClear,
  onSelectAll,
  canSelect = false,
  sortMode = "rank",
  onSortModeChange,
  dense = false,
}) => {
  useEffect(() => {
    if (!isPlayerTurn) return;

    const handleKeyPress = (e) => {
      if (e.code === "Space" && canPlay) {
        e.preventDefault();
        onPlay();
      }
      if (e.key.toLowerCase() === "p" && canPass) {
        e.preventDefault();
        onPass();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isPlayerTurn, canPlay, canPass, onPlay, onPass]);

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 mt-1 px-2">
      {/* Status */}
      <div className="basis-full sm:basis-0 sm:flex-1 min-w-0 flex items-center gap-3 px-3 py-2"
        style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d" }}
      >
        {errorMessage ? (
          <div className="font-pixel-display text-[10px]" style={{ color: "#e85a7a" }}>
            {errorMessage}
          </div>
        ) : (
          <div className="font-pixel-body text-[20px] leading-none text-bone/80">
            {/* Your turn reads in gold so it can't be missed. */}
            <span style={isPlayerTurn ? { color: "#f4c430", textShadow: "0 0 8px rgba(244,196,48,0.6)" } : undefined}>{message}</span>
            {selectedCount > 0 && (
              <>
                <span className="text-bone/40"> · </span>
                <span className="text-glow-cyan">{selectedCount} selected</span>
                {comboInfo && (
                  <span className="ml-2" style={{ color: comboInfo.isValid ? "#f4c430" : "#e85a7a" }}>
                    {comboInfo.text}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 max-sm:flex-1 max-sm:justify-between">
        {/* Sort toggle — works any time, not just on your turn */}
        <div
          className="flex items-stretch gap-1 p-1"
          role="group"
          aria-label="Sort hand"
          style={{ backgroundColor: "#0a0712", border: "3px solid #1f1a3d" }}
        >
          {!dense && <span className="font-pixel-display text-[10px] text-bone/60 self-center px-2 max-md:hidden">SORT</span>}
          {[
            ["rank", "RANK"],
            ["suit", "SUIT"],
          ].map(([mode, label]) => {
            const on = sortMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onSortModeChange?.(mode)}
                aria-pressed={on}
                className="pixel-btn font-pixel-display text-[10px] px-3 py-2"
                style={{
                  backgroundColor: on ? "#f4c430" : "#1f1a3d",
                  borderColor: on ? "#c89820" : "#0a0712",
                  color: on ? "#1a1024" : "#ead8b1",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClear}
          disabled={!canSelect || selectedCount === 0}
          className="pixel-btn font-pixel-display text-[10px] px-3 py-3"
          style={{ backgroundColor: "#1f1a3d", borderColor: "#0a0712", color: "#ead8b1" }}
        >
          CLEAR
        </button>
        <button
          onClick={onSelectAll}
          disabled={!canSelect}
          className="pixel-btn font-pixel-display text-[10px] px-3 py-3"
          style={{ backgroundColor: "#463a78", borderColor: "#2a234d", color: "#ead8b1" }}
        >
          ALL
        </button>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2 sm:gap-3 max-sm:basis-full">
        <button
          onClick={onPass}
          disabled={!canPass || !isPlayerTurn}
          className={`pixel-btn font-pixel-display text-sm py-3 max-sm:flex-1 ${dense ? "px-4" : "px-6"}`}
          style={{
            backgroundColor: "#7a1530",
            borderColor: "#3a0a18",
            color: "#ead8b1",
          }}
        >
          PASS {canPass && isPlayerTurn && !dense && <span className="text-[8px] ml-1 max-sm:hidden">(P)</span>}
        </button>
        <button
          onClick={onPlay}
          disabled={!canPlay || !isPlayerTurn}
          className={`pixel-btn font-pixel-display text-sm py-3 max-sm:flex-1 ${dense ? "px-5" : "px-8"} ${canPlay && isPlayerTurn ? "pulse-gold" : ""}`}
          style={{
            backgroundColor: "#f4c430",
            borderColor: "#c89820",
            color: "#1a1024",
          }}
        >
          PLAY {canPlay && isPlayerTurn && !dense && <span className="text-[8px] ml-1 max-sm:hidden">(SPACE)</span>}
        </button>
      </div>
    </div>
  );
};

export default GameControls;
