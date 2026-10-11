import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorText, input, label, mutedText, primaryButton } from "../components/ui";

// Two steps, same shape as SignUp -> ConfirmSignUp: request a code, then use it to set a new
// password. Cognito's resetPassword always reports success even for an email it doesn't
// recognize (prevents account enumeration), so step 1 can't tell a real email from a typo —
// step 2's own error message is the first point a wrong code/email actually surfaces.
export default function ForgotPassword() {
  const { resetPassword, confirmResetPassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(email);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await confirmResetPassword(email, code, newPassword);
      navigate("/login", { state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-20 w-full max-w-sm px-4">
      <h1 className="font-display mb-2 text-3xl font-medium text-ink dark:text-paper">
        Reset your password
      </h1>

      {step === "request" ? (
        <>
          <p className={`mb-8 ${mutedText}`}>Enter your account email and we'll send you a reset code.</p>
          <form onSubmit={handleRequest} className="flex flex-col gap-4">
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
            {error && <p className={errorText}>{error}</p>}
            <button type="submit" disabled={submitting} className={`w-full ${primaryButton}`}>
              {submitting ? "Sending..." : "Send reset code"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className={`mb-8 ${mutedText}`}>Enter the code we sent to {email} and choose a new password.</p>
          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <div>
              <label className={label}>Reset code</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`w-full ${input}`}
              />
            </div>
            <div>
              <label className={label}>New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`w-full ${input}`}
              />
            </div>
            {error && <p className={errorText}>{error}</p>}
            <button type="submit" disabled={submitting} className={`w-full ${primaryButton}`}>
              {submitting ? "Resetting..." : "Reset password"}
            </button>
            <button
              type="button"
              onClick={() => setStep("request")}
              className="text-sm text-bloom hover:underline"
            >
              Use a different email
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-ink-muted dark:text-mist-muted">
        <Link to="/login" className="text-bloom hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
