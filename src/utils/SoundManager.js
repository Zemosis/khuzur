// SOUND MANAGER - Synthesized Audio Effects using Web Audio API

class SoundManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.isMuted = false;

    // Default volumes (0.0 to 1.0)
    this.volumes = {
      master: 0.5,
      sfx: 0.5,
    };
  }

  // Initialize Audio Context (must be triggered by user interaction first)
  init() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();

      // 1. Create Master Gain (Final Output to Speakers)
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volumes.master;
      this.masterGain.connect(this.context.destination);

      // 2. Create SFX Gain (Feeds into Master)
      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.volumes.sfx;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.context.state === "suspended") {
      this.context.resume();
    }
  }

  // Volume Controls
  setMasterVolume(value) {
    this.volumes.master = Math.max(0, Math.min(1, value));
    if (this.masterGain) {
      // If muted, keep actual gain at 0, but update the stored volume level
      this.masterGain.gain.value = this.isMuted ? 0 : this.volumes.master;
    }
  }

  setSFXVolume(value) {
    this.volumes.sfx = Math.max(0, Math.min(1, value));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.volumes.sfx;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.volumes.master;
    }
    return this.isMuted;
  }

  // Generic Tone Generator
  playTone(freq, type, duration, startTime = 0) {
    if (!this.context || this.isMuted) return;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.context.currentTime + startTime);

    // Envelope for smooth sound
    gain.gain.setValueAtTime(0.1, this.context.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.context.currentTime + startTime + duration,
    );

    osc.connect(gain);
    // CONNECT TO SFX GAIN instead of direct Master
    // This allows the SFX slider to control this sound
    if (this.sfxGain) {
      gain.connect(this.sfxGain);
    } else {
      // Fallback if not initialized
      gain.connect(this.context.destination);
    }

    osc.start(this.context.currentTime + startTime);
    osc.stop(this.context.currentTime + startTime + duration);
  }

  // --- GAME SFX ---
  // (Identical sound definitions as before)

  playSnap() {
    if (!this.context || this.isMuted) return;
    this.playTone(800, "triangle", 0.1);
    this.playTone(200, "sine", 0.15);
  }

  playDeal() {
    if (!this.context || this.isMuted) return;
    this.playTone(Math.random() * 1000 + 500, "square", 0.05);
  }

  // Quick burst of ticks — one riffle of the deck
  playShuffle() {
    if (!this.context || this.isMuted) return;
    for (let i = 0; i < 9; i++) {
      this.playTone(1400 + Math.random() * 1600, "square", 0.025, i * 0.04);
    }
  }

  playVictory() {
    if (!this.context || this.isMuted) return;
    const now = 0;
    this.playTone(523.25, "sine", 0.2, now);
    this.playTone(659.25, "sine", 0.2, now + 0.15);
    this.playTone(783.99, "sine", 0.4, now + 0.3);
    this.playTone(1046.5, "square", 0.6, now + 0.45);
  }

  playTurnAlert() {
    if (!this.context || this.isMuted) return;
    this.playTone(880, "sine", 0.5);
  }

  playChat() {
    if (!this.context || this.isMuted) return;
    this.playTone(1200, "sine", 0.1);
  }

  playError() {
    if (!this.context || this.isMuted) return;
    this.playTone(150, "sawtooth", 0.3);
  }

  playClick() {
    if (!this.context || this.isMuted) return;
    this.playTone(1200, "triangle", 0.05);
  }

  // Two quick high notes: a coin dropping in (the shop).
  playCoin(startTime = 0) {
    if (!this.context || this.isMuted) return;
    this.playTone(988, "square", 0.06, startTime);
    this.playTone(1319, "square", 0.12, startTime + 0.06);
  }

  // A short rising run: something bought is unlocked.
  playUnlock() {
    if (!this.context || this.isMuted) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.playTone(f, "square", 0.12, i * 0.06));
  }
}

export const soundManager = new SoundManager();
