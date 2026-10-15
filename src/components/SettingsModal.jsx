// SETTINGS MODAL - shared sound and animation settings popup (pixel style)

import React, { useState } from "react";
import { soundManager } from "../utils/SoundManager";
import { reducedMotion, setReducedMotion } from "../utils/motion";
import PixelIcon from "./PixelIcon";

/** FULL / REDUCED animations (see utils/motion.js); the game tables use it too. */
export const MotionToggle = ({ className = "text-[10px] px-3 py-2.5" }) => {
  const [reduced, setReduced] = useState(reducedMotion);
  const toggle = () => {
    setReducedMotion(!reduced);
    setReduced(!reduced);
  };
  return (
    <button
      onClick={toggle}
      className={`pixel-btn font-pixel-display ${className}`}
      style={{
        backgroundColor: reduced ? "#2a234d" : "#463a78",
        borderColor: reduced ? "#1a1530" : "#2a234d",
        color: "#ead8b1",
      }}
    >
      <span className="flex items-center justify-center gap-2">
        <PixelIcon name="cards" size={12} />
        {reduced ? "ANIMATIONS: REDUCED" : "ANIMATIONS: FULL"}
      </span>
    </button>
  );
};

// `account` (main menu only): { isGuest, onSignIn, onSignOut } adds a small
// sign in / sign out button under the sliders.
const SettingsModal = ({ onClose, account = null }) => {
  const [isMuted, setIsMuted] = useState(soundManager.isMuted);
  const [volumes, setVolumes] = useState({
    master: Math.round(soundManager.volumes.master * 100),
    sfx: Math.round(soundManager.volumes.sfx * 100),
  });

  const handleToggleMute = () => {
    soundManager.init();
    setIsMuted(soundManager.toggleMute());
  };

  const handleVolumeChange = (type, value) => {
    soundManager.init();
    const newVal = parseInt(value, 10);
    setVolumes((prev) => ({ ...prev, [type]: newVal }));
    if (type === "master") soundManager.setMasterVolume(newVal / 100);
    if (type === "sfx") soundManager.setSFXVolume(newVal / 100);
    if (!soundManager.isMuted) soundManager.playClick();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(10, 7, 18, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="p-5"
        style={{
          minWidth: 300,
          backgroundColor: "#1f1a3d",
          border: "4px solid #0a0712",
          boxShadow: "0 0 0 4px #463a78, 6px 6px 0 #0a0712",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="font-pixel-display text-[11px] text-glow-gold">
            SETTINGS
          </span>
          <button
            onClick={onClose}
            className="font-pixel-display text-[11px] text-rose"
          >
            <PixelIcon name="close" size={12} title="Close" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={handleToggleMute}
            className="pixel-btn font-pixel-display text-[10px] px-3 py-2.5"
            style={{
              backgroundColor: isMuted ? "#7a1530" : "#463a78",
              borderColor: isMuted ? "#3a0a18" : "#2a234d",
              color: "#ead8b1",
            }}
          >
            <span className="flex items-center justify-center gap-2"><PixelIcon name={isMuted ? "mute" : "speaker"} size={12} />{isMuted ? "SOUND OFF" : "SOUND ON"}</span>
          </button>
          <MotionToggle />

          <div>
            <label className="font-pixel-display text-[9px] text-bone/60">
              MASTER: {volumes.master}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={volumes.master}
              onChange={(e) => handleVolumeChange("master", e.target.value)}
              className="w-full pixel-range"
            />
          </div>
          <div>
            <label className="font-pixel-display text-[9px] text-bone/60">
              SFX: {volumes.sfx}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={volumes.sfx}
              onChange={(e) => handleVolumeChange("sfx", e.target.value)}
              className="w-full pixel-range"
            />
          </div>

          {account && (
            <button
              onClick={() => {
                onClose();
                (account.isGuest ? account.onSignIn : account.onSignOut)();
              }}
              className="pixel-btn font-pixel-display text-[9px] px-3 py-2 self-end"
              style={{ backgroundColor: "#2a234d", borderColor: "#1a1530", color: "#ead8b1" }}
            >
              {account.isGuest ? "SIGN IN" : "SIGN OUT"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
