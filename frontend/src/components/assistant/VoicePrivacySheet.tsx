import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";

// Shown once, before the first voice session on this device.
export function VoicePrivacySheet({ open, onContinue, onCancel }: { open: boolean; onContinue: () => void; onCancel: () => void }) {
  return (
    <BottomSheet open={open} onClose={onCancel} title="Before you talk">
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-sm leading-relaxed text-ink dark:text-paper">
          While you speak, Chrome sends your voice to Google to turn it into text. Only the text goes to the assistant, and
          your voice is not saved here.
        </p>
        <p className="text-sm leading-relaxed text-ink-muted dark:text-mist-muted">
          Replies are read aloud by your phone. You can mute them or switch to typing at any time.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={onContinue}>Continue</Button>
          <Button variant="ghost" onClick={onCancel}>
            Not now
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
