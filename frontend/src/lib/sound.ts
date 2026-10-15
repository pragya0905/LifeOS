import { loadSoundEnabled } from "./preferences";

// A tiny synthesized two-note chime for the celebration moment — no audio asset needed.
// Off by default (loadSoundEnabled), and never called at all for routine per-tap status
// changes, only the "whole routine/all meds done" celebration.
export function playCelebrationChime(): void {
  if (!loadSoundEnabled()) return;
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const ctx = new AudioContextCtor();
    const notes = [523.25, 659.25]; // C5, E5 — a short, warm two-note chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const startAt = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.12, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.32);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // Best-effort — a sandboxed/locked-down AudioContext just means no sound.
  }
}
