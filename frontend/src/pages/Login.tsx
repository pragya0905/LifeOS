import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorText, input, label, primaryButton } from "../components/ui";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const justConfirmed = (location.state as { confirmed?: boolean } | null)?.confirmed;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-20 w-full max-w-sm px-4">
      <h1 className="font-display mb-8 text-3xl font-medium text-ink dark:text-cream">
        Log in to LifeOs
      </h1>
      {justConfirmed && (
        <p className="mb-4 text-sm text-sage">Email verified — you can log in now.</p>
      )}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full ${input}`}
          />
        </div>
        {error && <p className={errorText}>{error}</p>}
        <button type="submit" disabled={submitting} className={`w-full ${primaryButton}`}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-muted dark:text-fog-muted">
        Don't have an account?{" "}
        <Link to="/signup" className="text-sage hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
