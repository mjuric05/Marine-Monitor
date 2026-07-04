// Server-side helper za čitanje jezičnih postavki iz kolačića.
// Koristi se u server komponentama (app/sessions/...).

import { cookies } from "next/headers";
import { translations, type Locale } from "@/lib/i18n";

export function getServerLocale(): Locale {
  try {
    const val = cookies().get("marine-lang")?.value;
    return val === "en" ? "en" : "hr";
  } catch {
    return "hr";
  }
}

export function getServerT() {
  return translations[getServerLocale()];
}
