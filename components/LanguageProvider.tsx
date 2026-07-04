"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { translations, type Locale, type Translations } from "@/lib/i18n";

interface LangCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
}

const Context = createContext<LangCtx>({
  locale: "hr",
  setLocale: () => {},
  t: translations.hr,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("hr");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("marine-lang") as Locale;
      if (saved === "hr" || saved === "en") setLocaleState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    try {
      localStorage.setItem("marine-lang", l);
      // Postavi i kolačić da server komponente mogu čitati jezik.
      document.cookie = `marine-lang=${l};path=/;max-age=31536000;SameSite=Lax`;
    } catch {
      /* ignore */
    }
  }

  return (
    <Context.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </Context.Provider>
  );
}

/** Koristi u svim klijentskim komponentama za prijevode i trenutni jezik. */
export function useLanguage(): LangCtx {
  return useContext(Context);
}
