import { createContext, useContext } from "react";

// Filled by AuthProvider (components/auth/AuthProvider.jsx).
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
