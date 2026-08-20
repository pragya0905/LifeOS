import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorText, input, label, mutedText, primaryButton } from "../components/ui";

export default function SignUp() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email, password);
      navigate("/confirm", { state: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-20 w-full max-w-sm px-4">
      <h1 className="font-display mb-8 text-3xl font-medium text-ink dark:text-paper">
        Create your LifeOs account
      </h1>
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
          <label className={label}>Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full ${input}`}
          />
          <p className={`mt-1 ${mutedText}`}>
            At least 8 characters, with uppercase, lowercase, and a number.
          </p>
        </div>
        {error && <p className={errorText}>{error}</p>}
        <button type="submit" disabled={submitting} className={`w-full ${primaryButton}`}>
          {submitting ? "Creating account..." : "Sign up"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-muted dark:text-mist-muted">
        Already have an account?{" "}
        <Link to="/login" className="text-bloom hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
