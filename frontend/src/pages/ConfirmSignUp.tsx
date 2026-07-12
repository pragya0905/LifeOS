import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

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
    <div className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Verify your email
      </h1>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Enter the 6-digit code we sent to your email address.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Verification code
          </label>
          <input
            type="text"
            inputMode="numeric"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? "Verifying..." : "Verify"}
        </button>
        <button
          type="button"
          onClick={handleResend}
          className="text-sm text-indigo-600 hover:underline"
        >
          Resend code
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        <Link to="/login" className="text-indigo-600 hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
