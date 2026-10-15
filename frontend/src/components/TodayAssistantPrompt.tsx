import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Send } from "lucide-react";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { Icon } from "./Icon";

// Frontend-only: this never calls the Assistant API itself. It navigates to /assistant with
// the typed/spoken text handed over via router state; Assistant.tsx prefills its input from
// that and the user still taps Send there — nothing is sent on their behalf.
export function TodayAssistantPrompt() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const { supported, listening, start, stop } = useSpeechToText((transcript) => setText(transcript));

  function go() {
    if (!text.trim()) return;
    if (listening) stop();
    navigate("/assistant", { state: { prefillText: text.trim() } });
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-stone px-3 py-1 dark:border-stone-dark">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
        placeholder="Tell me about your day..."
        className="min-h-11 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted dark:text-paper dark:placeholder:text-mist-muted"
      />
      {supported && (
        <button
          type="button"
          onClick={() => (listening ? stop() : start())}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          aria-pressed={listening}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            listening ? "bg-alert text-paper-card" : "text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
          }`}
        >
          <Icon icon={Mic} size={16} />
        </button>
      )}
      <button
        type="button"
        onClick={go}
        disabled={!text.trim()}
        aria-label="Open in Assistant"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-bloom disabled:opacity-40"
      >
        <Icon icon={Send} size={16} />
      </button>
    </div>
  );
}
