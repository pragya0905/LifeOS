import { useCallback, useEffect, useRef, useState } from "react";
import { classifySpeechError, type SpeechErrorKind } from "../lib/speech";

// Reports the full transcript recognized since start() was called (not just the
// latest chunk) — isFinal is true only when the most recent segment was final.
type ResultCallback = (transcript: string, isFinal: boolean) => void;

export interface SpeechToTextOptions {
  // BCP-47 tag, e.g. "en-IN" or "hi-IN". Read each time start() is called, so changing it takes
  // effect from the next listen.
  lang?: string;
  // One utterance per start() when false (the default for voice mode: it ends when you pause).
  continuous?: boolean;
  onError?: (kind: SpeechErrorKind, code: string) => void;
  // The page was hidden while the mic was live: the mic is stopped and left paused. Nothing in
  // this hook ever starts it again by itself.
  onBackground?: () => void;
  // Recognition ended. `gotResult` is whether any text was heard, `errored` whether an error
  // fired first, `byUs` whether stop()/pause() caused it. An end with none of these means the
  // browser simply gave up on silence, which callers should treat as "no speech".
  onEnd?: (info: { gotResult: boolean; errored: boolean; byUs: boolean }) => void;
}

function getSpeechRecognitionCtor(): (new () => any) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
}

export function useSpeechToText(onResult: ResultCallback, options: SpeechToTextOptions = {}) {
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SpeechErrorKind | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Android Chrome's continuous recognition periodically restarts its internal
  // session and re-finalizes the whole utterance-so-far as a "new" final result
  // instead of just the new words, so finalized chunks are tracked individually
  // and exact/prefix repeats are collapsed instead of concatenated.
  const finalSegmentsRef = useRef<string[]>([]);

  const supported = !!getSpeechRecognitionCtor();

  const addFinalSegment = (transcript: string): string => {
    const trimmed = transcript.trim();
    if (trimmed) {
      const segments = finalSegmentsRef.current;
      const last = segments[segments.length - 1];
      if (last !== undefined && (trimmed === last || last.startsWith(trimmed))) {
        // exact repeat, or a shrunk re-recognition of what we already have — ignore
      } else if (last !== undefined && trimmed.startsWith(last)) {
        segments[segments.length - 1] = trimmed;
      } else {
        segments.push(trimmed);
      }
    }
    return finalSegmentsRef.current.join(" ");
  };

  const fail = useCallback((kind: SpeechErrorKind, code: string, message: string) => {
    setError(message);
    setErrorKind(kind);
    setListening(false);
    optionsRef.current.onError?.(kind, code);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      fail("unsupported", "unsupported", "Voice input isn't supported in this browser.");
      return;
    }
    // Chrome's recognition needs a connection; say so up front instead of failing mid-start.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      fail("offline", "network", "You're offline. Voice input needs a connection.");
      return;
    }
    // Only one live recognition at a time. Its own onend is ignored (it is replaced, not ended).
    const previous = recognitionRef.current;
    if (previous) {
      previous.__replaced = true;
      try {
        previous.abort();
      } catch {
        // already ended
      }
    }

    setError(null);
    setErrorKind(null);
    setPaused(false);
    finalSegmentsRef.current = [];
    const state = { gotResult: false, errored: false, byUs: false, live: true };
    const recognition = new Ctor();
    recognition.continuous = optionsRef.current.continuous ?? false;
    recognition.interimResults = true;
    recognition.lang = optionsRef.current.lang ?? "en-US";
    recognition.__state = state;

    recognition.onresult = (event: any) => {
      let interim = "";
      let gotFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          addFinalSegment(result[0].transcript);
          gotFinal = true;
        } else {
          const chunk = result[0].transcript.trim();
          if (chunk) interim = interim ? `${interim} ${chunk}` : chunk;
        }
      }
      const finalSoFar = finalSegmentsRef.current.join(" ");
      const combined = interim ? (finalSoFar ? `${finalSoFar} ${interim}` : interim) : finalSoFar;
      if (combined.trim()) state.gotResult = true;
      onResultRef.current(combined, gotFinal && !interim);
    };
    recognition.onerror = (event: any) => {
      const code = String(event.error ?? "unknown");
      const kind = classifySpeechError(code);
      if (kind === null) return;
      state.errored = true;
      state.live = false;
      fail(kind, code, kind === "permission" ? "Microphone permission denied." : `Voice input error: ${code}`);
    };
    recognition.onend = () => {
      if (recognition.__replaced) return;
      state.live = false;
      setListening(false);
      const { gotResult, errored, byUs } = state;
      optionsRef.current.onEnd?.({ gotResult, errored, byUs });
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if called while already starting; treat as a failure rather than crash.
      fail("failed", "start-failed", "Voice input couldn't start.");
    }
  }, [fail]);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (r?.__state) {
      r.__state.byUs = true;
      r.__state.live = false;
    }
    r?.stop();
    setListening(false);
  }, []);

  // Pause is stop plus a flag: the mic is off and stays off until resume() or start() is called
  // explicitly. Nothing here ever restarts recognition on its own.
  const pause = useCallback(() => {
    stop();
    setPaused(true);
  }, [stop]);

  const resume = useCallback(() => {
    setPaused(false);
    start();
  }, [start]);

  // Backgrounding the page (screen off, another app, a call) must not leave the mic live. It
  // stops and stays paused; coming back never resumes it.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && recognitionRef.current && !recognitionRef.current.__replaced) {
        const wasLive = !!recognitionRef.current.__state?.live;
        stop();
        if (wasLive) {
          setPaused(true);
          optionsRef.current.onBackground?.();
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stop]);

  useEffect(() => {
    return () => {
      const r = recognitionRef.current;
      if (r) {
        r.__replaced = true;
        try {
          r.abort();
        } catch {
          // already ended
        }
      }
    };
  }, []);

  return { supported, listening, paused, error, errorKind, start, stop, pause, resume };
}
