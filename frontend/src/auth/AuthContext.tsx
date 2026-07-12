import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resendSignUpCode as amplifyResendSignUpCode,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";

interface AuthUser {
  userId: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadCurrentUser(): Promise<AuthUser | null> {
  try {
    const current = await getCurrentUser();
    const session = await fetchAuthSession();
    const email = session.tokens?.idToken?.payload.email as string | undefined;
    return { userId: current.userId, email: email ?? current.username };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    async signUp(email, password) {
      await amplifySignUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
    },
    async confirmSignUp(email, code) {
      await amplifyConfirmSignUp({ username: email, confirmationCode: code });
    },
    async resendConfirmationCode(email) {
      await amplifyResendSignUpCode({ username: email });
    },
    async signIn(email, password) {
      await amplifySignIn({ username: email, password });
      setUser(await loadCurrentUser());
    },
    async signOut() {
      await amplifySignOut();
      setUser(null);
    },
    async getIdToken() {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
