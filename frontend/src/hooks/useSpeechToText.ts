import { useCallback, useEffect, useRef, useState } from "react";

// Reports the full transcript recognized since start() was called (not just the
// latest chunk) — isFinal is true only when the most recent segment was final.
type ResultCallback = (transcript: string, isFinal: boolean) => void;

function getSpeechRecognitionCtor(): (new () => any) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
}

export function useSpeechToText(onResult: ResultCallback) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

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

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser.");
      return;
    }
    setError(null);
    finalSegmentsRef.current = [];
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

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
      onResultRef.current(combined, gotFinal && !interim);
    };
    recognition.onerror = (event: any) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone permission denied."
          : `Voice input error: ${event.error}`,
      );
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { supported, listening, error, start, stop };
}
