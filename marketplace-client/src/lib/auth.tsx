import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { fetchMe, login as loginRequest } from "@/api/buyerAuth";
import { Buyer } from "@/api/types";

interface AuthContextValue {
  buyer: Buyer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("buyer_token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setBuyer)
      .catch(() => localStorage.removeItem("buyer_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const result = await loginRequest(email, password);
    localStorage.setItem("buyer_token", result.token);
    setBuyer(result.buyer);
  }

  function logout() {
    localStorage.removeItem("buyer_token");
    setBuyer(null);
  }

  return <AuthContext.Provider value={{ buyer, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
