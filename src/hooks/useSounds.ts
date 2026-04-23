"use client";

import { useRef, useCallback } from "react";

// Web Audio API tone generator — no audio files needed.
// Note: Howler.js is great with pre-recorded files, but for programmatic
// UI sounds without assets, the Web Audio API is ideal.

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
}

export function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ctx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }, []);

  // Short 880 Hz ping — webhook received
  const playPing = useCallback(() => {
    const ac = ctx();
    if (!ac) return;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ac.currentTime + 0.1);
    gain.gain.setValueAtTime(0.18, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.2);
  }, [ctx]);

  // Low 110 Hz hum while data is moving — returns a stop function
  const playHum = useCallback((): (() => void) => {
    const ac = ctx();
    if (!ac) return () => {};
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, ac.currentTime);
    gain.gain.setValueAtTime(0.0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.07, ac.currentTime + 0.15);
    osc.start(ac.currentTime);

    return () => {
      gain.gain.setValueAtTime(gain.gain.value, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
      osc.stop(ac.currentTime + 0.2);
    };
  }, [ctx]);

  // Ascending C5-E5-G5-C6 arpeggio chime — success
  const playChime = useCallback(() => {
    const ac = ctx();
    if (!ac) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      const t = ac.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }, [ctx]);

  return { playPing, playHum, playChime };
}
