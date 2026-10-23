import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice } from "../lib/speech";

export interface SpeakOptions {
  lang?: string;
  onStart?: () => void;
  // Fires when the utterance finishes or fails, but not when cancel() was called: a cancel is the
  // caller's own decision and it already knows.
  onEnd?: () => void;
}

// Browser text-to-speech behind a small interface, so a cloud voice could replace it later
// without touching the voice screen. One utterance at a time; speaking again replaces the last.
export function useSpeechOut() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const tokenRef = useRef(0);

  const cancel = useCallback(() => {
    // Bumping the token makes any pending utterance's callbacks inert, so a cancel never fires onEnd.
    tokenRef.current += 1;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, options: SpeakOptions = {}) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) {
      options.onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const token = ++tokenRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    if (options.lang) {
      utterance.lang = options.lang;
      const voice = pickVoice(window.speechSynthesis.getVoices(), options.lang);
      if (voice) utterance.voice = voice;
    }
    const done = () => {
      if (tokenRef.current !== token) return;
      setSpeaking(false);
      options.onEnd?.();
    };
    utterance.onstart = () => {
      if (tokenRef.current !== token) return;
      setSpeaking(true);
      options.onStart?.();
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
  }, []);

  // Speech must stop when the page is hidden or goes away, and never carry on in the background.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) cancel();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancel();
    };
  }, [cancel]);

  return { supported, speaking, speak, cancel };
}
