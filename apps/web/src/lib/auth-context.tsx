"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api-client";

interface AuthState {
  apiKey: string | null;
  email: string | null;
  isAdmin: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, blogName: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    apiKey: null,
    email: null,
    isAdmin: false,
    isLoading: true,
  });

  const detectAdmin = useCallback(async (key: string) => {
    try {
      await api("/api/admin/tenants", { apiKey: key });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("notipo_api_key");
    const email = localStorage.getItem("notipo_email");
    if (stored) {
      detectAdmin(stored).then((isAdmin) => {
        setState({ apiKey: stored, email, isAdmin, isLoading: false });
      });
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, [detectAdmin]);

  const setApiKey = useCallback(
    async (key: string) => {
      const isAdmin = await detectAdmin(key);
      localStorage.setItem("notipo_api_key", key);
      setState({ apiKey: key, email: null, isAdmin, isLoading: false });
    },
    [detectAdmin],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ data: { apiKey: string } }>(
        "/api/auth/login",
        { method: "POST", body: { email, password } },
      );
      localStorage.setItem("notipo_api_key", res.data.apiKey);
      localStorage.setItem("notipo_email", email);
      const isAdmin = await detectAdmin(res.data.apiKey);
      setState({
        apiKey: res.data.apiKey,
        email,
        isAdmin,
        isLoading: false,
      });
    },
    [detectAdmin],
  );

  const register = useCallback(
    async (email: string, password: string, blogName: string) => {
      const res = await api<{ data: { apiKey: string } }>(
        "/api/auth/register",
        { method: "POST", body: { email, password, blogName } },
      );
      localStorage.setItem("notipo_api_key", res.data.apiKey);
      localStorage.setItem("notipo_email", email);
      const isAdmin = await detectAdmin(res.data.apiKey);
      setState({
        apiKey: res.data.apiKey,
        email,
        isAdmin,
        isLoading: false,
      });
    },
    [detectAdmin],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("notipo_api_key");
    localStorage.removeItem("notipo_email");
    setState({ apiKey: null, email: null, isAdmin: false, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, setApiKey, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
