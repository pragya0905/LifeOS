import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorText, input, label, mutedText, primaryButton } from "../components/ui";

export default function ConfirmSignUp() {
  const { confirmSignUp, resendConfirmationCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await confirmSignUp(email, code);
      navigate("/login", { state: { confirmed: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    try {
      await resendConfirmationCode(email);
      setInfo("Verification code resent — check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    }
  }

  return (
    <div className="mx-auto mt-20 w-full max-w-sm px-4">
      <h1 className="font-display mb-2 text-3xl font-medium text-ink dark:text-cream">
        Verify your email
      </h1>
      <p className={`mb-8 ${mutedText}`}>Enter the 6-digit code we sent to your email address.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={label}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full ${input}`}
          />
        </div>
        <div>
          <label className={label}>Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`w-full ${input}`}
          />
        </div>
        {error && <p className={errorText}>{error}</p>}
        {info && <p className="text-sm text-sage">{info}</p>}
        <button type="submit" disabled={submitting} className={`w-full ${primaryButton}`}>
          {submitting ? "Verifying..." : "Verify"}
        </button>
        <button type="button" onClick={handleResend} className="text-sm text-sage hover:underline">
          Resend code
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-muted dark:text-fog-muted">
        <Link to="/login" className="text-sage hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
