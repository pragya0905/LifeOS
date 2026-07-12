import { useCallback, useEffect, useRef, useState } from "react";

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

  const supported = !!getSpeechRecognitionCtor();

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser.");
      return;
    }
    setError(null);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        onResultRef.current(result[0].transcript, result.isFinal);
      }
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
