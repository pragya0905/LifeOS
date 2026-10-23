import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AssistantRequestError, useAssistantStream } from "./useAssistantStream";
import { useSpeechToText } from "./useSpeechToText";
import { useSpeechOut } from "./useSpeechOut";
import { describeToolUse } from "../lib/toolLabels";
import { TIMEOUT_REASON, ToolCallTracker, type ToolFailure, type ToolResultEntry } from "../lib/toolCards";
import { PAUSE_TIMEOUT_MS, initialVoiceState, isActive, voiceReducer, type VoiceLang } from "../lib/voiceMachine";

// One spoken exchange, kept for the chat once the session is over (the page appends these).
export interface VoiceTurn {
  transcript: string;
  reply: string;
  toolResults: ToolResultEntry[];
  toolFailures: ToolFailure[];
  quietNotes: string[];
  // The user cut the reply off. The server may still have finished the work.
  interrupted: boolean;
  // The words were heard but the assistant never answered.
  unanswered: boolean;
  createdAt: string;
}

export interface VoiceSessionOptions {
  getConversationId: () => string | undefined;
  onConversationId: (id: string) => void;
  initialLang: VoiceLang;
  initialMuted: boolean;
  onLangChange?: (lang: VoiceLang) => void;
  onMutedChange?: (muted: boolean) => void;
}

// Runs a hands-free voice session: listen, send to the assistant, speak the reply, listen again.
// All the rules live in voiceMachine.ts; this hook just does the work each state calls for and
// feeds what happens back in as events. Browser speech only, behind the two small speech hooks.
export function useVoiceSession(options: VoiceSessionOptions) {
  const { sendMessage } = useAssistantStream();
  // Read through a ref so a changed function identity can never restart a reply mid-stream.
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, dispatch] = useReducer(voiceReducer, undefined, () =>
    initialVoiceState({ lang: options.initialLang, muted: options.initialMuted }),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const [reply, setReply] = useState("");
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [cards, setCards] = useState<ToolResultEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const replyRef = useRef("");
  const turnsRef = useRef<VoiceTurn[]>([]);
  // A heard sentence the assistant has not answered yet (an error, or the session ended first).
  const unansweredRef = useRef<string | null>(null);
  const turnToken = useRef(0);

  const speech = useSpeechOut();

  const stt = useSpeechToText(
    (text, isFinal) => {
      if (stateRef.current.status !== "listening") return;
      dispatch(isFinal ? { type: "RESULT_FINAL", text } : { type: "RESULT_INTERIM", text });
    },
    {
      lang: state.lang,
      continuous: false,
      onError: (kind) => {
        if (stateRef.current.status !== "listening") return;
        if (kind === "no-speech") dispatch({ type: "NO_SPEECH" });
        else if (kind === "permission") dispatch({ type: "STT_ERROR", kind: "permission" });
        else if (kind === "offline") dispatch({ type: "STT_ERROR", kind: "offline" });
        else dispatch({ type: "STT_ERROR", kind: "failed" });
      },
      // The browser sometimes just ends a session on silence without an error. That is no-speech.
      onEnd: ({ gotResult, errored, byUs }) => {
        if (stateRef.current.status === "listening" && !gotResult && !errored && !byUs) dispatch({ type: "NO_SPEECH" });
      },
    },
  );
  const { start: startListening, stop: stopListening } = stt;
  const { speak, cancel: cancelSpeech } = speech;

  // Listening: the mic is on exactly while the state says so, and stops the moment it changes.
  useEffect(() => {
    if (state.status !== "listening") return;
    startListening();
    return () => stopListening();
  }, [state.status, state.listenId, startListening, stopListening]);

  const record = useCallback((turn: Omit<VoiceTurn, "createdAt">) => {
    turnsRef.current = [...turnsRef.current, { ...turn, createdAt: new Date().toISOString() }];
  }, []);

  // Thinking: send the heard sentence; leaving the state for any reason aborts the request.
  useEffect(() => {
    if (state.status !== "thinking") return;
    const message = state.lastTranscript;
    const controller = new AbortController();
    const token = ++turnToken.current;
    const tracker = new ToolCallTracker();
    const results: ToolResultEntry[] = [];
    let text = "";
    let sawDone = false;
    let errorText: string | undefined;

    setReply("");
    replyRef.current = "";
    setToolLabel(null);
    setCards([]);
    setErrorMessage(null);

    (async () => {
      try {
        await sendRef.current(
          message,
          optionsRef.current.getConversationId(),
          (event) => {
            if (token !== turnToken.current) return;
            if (event.type === "text") {
              text += event.delta;
              replyRef.current = text;
              setReply(text);
            } else if (event.type === "tool_use" || event.type === "tool_error") {
              if (event.type === "tool_use") setToolLabel(describeToolUse(event.name));
              const card = tracker.handle(event);
              if (card) {
                results.push(card);
                setCards([...results]);
              }
            } else if (event.type === "done") {
              sawDone = true;
              optionsRef.current.onConversationId(event.conversationId);
            } else if (event.type === "error") {
              errorText = event.message;
            }
          },
          "voice",
          undefined,
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) {
          // Interrupted. The server carries on regardless; keep what we have for the chat.
          if (token === turnToken.current) {
            record({ transcript: message, reply: text, toolResults: results, toolFailures: [], quietNotes: [], interrupted: true, unanswered: !text });
            unansweredRef.current = null;
          }
          return;
        }
        errorText = err instanceof AssistantRequestError ? err.message : "Couldn't reach the assistant.";
      }
      if (token !== turnToken.current || controller.signal.aborted) return;

      if (errorText === undefined && !sawDone) errorText = TIMEOUT_REASON;
      if (errorText !== undefined && !sawDone) {
        unansweredRef.current = message;
        setErrorMessage(errorText);
        dispatch({ type: "ASSISTANT_ERROR" });
        return;
      }
      unansweredRef.current = null;
      const failures = tracker.finish("done", undefined, results.length);
      record({ transcript: message, reply: text, toolResults: results, toolFailures: failures, quietNotes: [...tracker.quiet], interrupted: false, unanswered: false });
      setToolLabel(null);
      dispatch({ type: "REPLY_DONE", hasSpeech: text.trim().length > 0 });
    })();

    return () => controller.abort();
  }, [state.status, state.lastTranscript, record]);

  // Speaking: read the reply aloud; leaving the state cancels the voice without reporting an end.
  useEffect(() => {
    if (state.status !== "speaking") return;
    // The language is read now, not tracked: toggling it mid-reply must not restart the speech.
    speak(replyRef.current, { lang: stateRef.current.lang, onEnd: () => dispatch({ type: "SPEECH_ENDED" }) });
    return () => cancelSpeech();
  }, [state.status, speak, cancelSpeech]);

  // Paused too long: the session ends by itself.
  useEffect(() => {
    if (state.status !== "paused") return;
    const timer = window.setTimeout(() => dispatch({ type: "PAUSE_TIMEOUT" }), PAUSE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state.status]);

  // The app going to the background pauses everything and never resumes by itself.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && isActive(stateRef.current.status)) dispatch({ type: "BACKGROUNDED" });
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const open = useCallback(() => {
    turnsRef.current = [];
    unansweredRef.current = null;
    setReply("");
    setCards([]);
    setToolLabel(null);
    setErrorMessage(null);
    dispatch({ type: "OPEN" });
  }, []);

  // The turns made since the last call, including a heard sentence that never got an answer.
  const takeTurns = useCallback((): VoiceTurn[] => {
    const out = turnsRef.current;
    if (unansweredRef.current) {
      out.push({ transcript: unansweredRef.current, reply: "", toolResults: [], toolFailures: [], quietNotes: [], interrupted: false, unanswered: true, createdAt: new Date().toISOString() });
      unansweredRef.current = null;
    }
    turnsRef.current = [];
    return out;
  }, []);

  const toggleMute = useCallback(() => {
    optionsRef.current.onMutedChange?.(!stateRef.current.muted);
    dispatch({ type: "TOGGLE_MUTE" });
  }, []);

  const setLang = useCallback((lang: VoiceLang) => {
    optionsRef.current.onLangChange?.(lang);
    dispatch({ type: "SET_LANG", lang });
    // A language change while listening restarts the mic so the new language applies at once.
    if (stateRef.current.status === "listening") {
      dispatch({ type: "PAUSE" });
      dispatch({ type: "RESUME" });
    }
  }, []);

  return {
    state,
    supported: stt.supported,
    speechOutSupported: speech.supported,
    reply,
    toolLabel,
    cards,
    errorMessage,
    open,
    takeTurns,
    pause: useCallback(() => dispatch({ type: "PAUSE" }), []),
    resume: useCallback(() => dispatch({ type: "RESUME" }), []),
    interrupt: useCallback(() => dispatch({ type: "INTERRUPT" }), []),
    retry: useCallback(() => dispatch({ type: "RETRY" }), []),
    typeInstead: useCallback(() => dispatch({ type: "TYPE_INSTEAD" }), []),
    end: useCallback(() => dispatch({ type: "END" }), []),
    toggleMute,
    setLang,
  };
}
