import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { fetchMe, logout as logoutRequest, sendHeartbeat } from "@/api/auth";
import { User } from "@/api/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  setSession: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Matches the server's HEARTBEAT_ACTIVE_GAP_SECONDS tolerance — a heartbeat this often,
// but only when there's been real activity, is what lets the server tell "actively
// working" apart from "logged in with the tab open."
const HEARTBEAT_INTERVAL_MS = 60_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

/** Sends a heartbeat only when there's been real mouse/keyboard/scroll activity since the
 *  last one and the tab is actually visible — a background/inactive tab won't fake "active". */
function useActivityHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let hasActivity = true; // send one heartbeat promptly on mount/login
    const markActive = () => {
      hasActivity = true;
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    const interval = setInterval(() => {
      if (hasActivity && document.visibilityState === "visible") {
        sendHeartbeat().catch(() => {
          // Best-effort — a missed heartbeat just shows up as an idle gap, which is correct.
        });
        hasActivity = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      clearInterval(interval);
    };
  }, [enabled]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useActivityHeartbeat(!!user);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  function setSession(token: string, user: User) {
    localStorage.setItem("token", token);
    setUser(user);
  }

  function logout() {
    logoutRequest().catch(() => {
      // Best-effort — even if this fails (offline, expired token), clear the local session.
    });
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
