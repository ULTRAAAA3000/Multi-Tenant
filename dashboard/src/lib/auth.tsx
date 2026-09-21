import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "./types";
import { api, ApiRequestError, getStoredToken, setStoredToken, clearStoredToken } from "./api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * There's no GET /auth/me on the backend, so on load we can't verify
 * an existing token independently of a real request. We optimistically
 * treat "a token exists" as "logged in" and let the first authenticated
 * API call (api.ts's 401 handling) redirect to login if the token is
 * actually invalid or expired — avoiding a spurious extra request just
 * to check.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    const storedUser = localStorage.getItem("kiosk_user");
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch {
        clearStoredToken();
      }
    }
    setIsLoading(false);
  }, []);

  const persistSession = (token: string, sessionUser: User) => {
    setStoredToken(token);
    localStorage.setItem("kiosk_user", JSON.stringify(sessionUser));
    setUser(sessionUser);
  };

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    persistSession(result.token, result.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const result = await api.register(email, password, name);
    persistSession(result.token, result.user);
  };

  const logout = () => {
    clearStoredToken();
    localStorage.removeItem("kiosk_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiRequestError };
