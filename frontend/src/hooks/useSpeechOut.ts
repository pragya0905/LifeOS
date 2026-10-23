import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice, speakableText, splitSentences } from "../lib/speech";

export interface SpeakOptions {
  lang?: string;
  onStart?: () => void;
  // Fires as each sentence begins, with its position in splitSentences(text).
  onSentence?: (index: number) => void;
  // Fires when the utterance finishes or fails, but not when cancel() was called: a cancel is the
  // caller's own decision and it already knows.
  onEnd?: () => void;
}

// Browser text-to-speech behind a small interface, so a cloud voice could replace it later
// without touching the voice screen. Speaks a reply one sentence at a time (long single utterances get cut off on some phones, and
// the caption can follow along); speaking again replaces the last.
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
    const sentences = splitSentences(text).filter((x) => speakableText(x));
    if (typeof window === "undefined" || !window.speechSynthesis || sentences.length === 0) {
      options.onEnd?.();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const token = ++tokenRef.current;
    const voice = options.lang ? pickVoice(synth.getVoices(), options.lang) : undefined;
    const allSpoken = splitSentences(text);

    const finish = () => {
      if (tokenRef.current !== token) return;
      setSpeaking(false);
      options.onEnd?.();
    };
    const next = (i: number) => {
      if (tokenRef.current !== token) return;
      if (i >= sentences.length) return finish();
      const utterance = new SpeechSynthesisUtterance(speakableText(sentences[i]));
      if (options.lang) utterance.lang = options.lang;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (tokenRef.current !== token) return;
        if (i === 0) {
          setSpeaking(true);
          options.onStart?.();
        }
        options.onSentence?.(allSpoken.indexOf(sentences[i]));
      };
      utterance.onend = () => next(i + 1);
      // A failed sentence ends the reply rather than skipping ahead and talking over a problem.
      utterance.onerror = finish;
      synth.speak(utterance);
    };
    next(0);
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
