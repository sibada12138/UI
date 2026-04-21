"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "ui_theme_mode";

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute("data-theme", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemeMode =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setMode(initial);
    applyTheme(initial);
  }, []);

  function switchMode(next: ThemeMode) {
    setMode(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="theme-switch">
      <button
        type="button"
        className={mode === "light" ? "active" : ""}
        onClick={() => switchMode("light")}
      >
        浅色
      </button>
      <button
        type="button"
        className={mode === "dark" ? "active" : ""}
        onClick={() => switchMode("dark")}
      >
        深色
      </button>
    </div>
  );
}
