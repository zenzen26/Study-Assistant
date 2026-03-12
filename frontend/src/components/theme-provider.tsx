"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "lecture-buddy-theme";
const COOKIE_KEY = "lecture-buddy-theme";

export function ThemeProvider({
  children,
  initialMode,
}: {
  children: React.ReactNode;
  initialMode: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
    document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=31536000; samesite=lax`;
  }, [mode]);

  function setMode(nextMode: ThemeMode) {
    setModeState(nextMode);
  }

  function toggleMode() {
    setModeState((current) => (current === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ mode, setMode, toggleMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
