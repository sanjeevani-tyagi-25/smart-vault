"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false,
});

export const THEME_STORAGE_KEY = "smartvault_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 1. Check localStorage first
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    let initialTheme: Theme = "light";

    if (savedTheme === "light" || savedTheme === "dark") {
      initialTheme = savedTheme;
    } else {
      // 2. Respect system preference if no saved preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      initialTheme = prefersDark ? "dark" : "light";
    }

    setThemeState(initialTheme);
    applyThemeToDOM(initialTheme);
    setMounted(true);

    // 3. Listen to system preference changes if user hasn't explicitly set a preference
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const explicit = localStorage.getItem(THEME_STORAGE_KEY);
      if (!explicit) {
        const next = e.matches ? "dark" : "light";
        setThemeState(next);
        applyThemeToDOM(next);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const applyThemeToDOM = (t: Theme) => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyThemeToDOM(newTheme);
  };

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
