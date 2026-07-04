"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import type { Locale } from "@/lib/i18n";

export default function Header() {
  const { locale, setLocale, t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();

  function toggleLocale(next: Locale) {
    setLocale(next);
    // Osvježi stranicu da server komponente (sessions) dobiju novi kolačić.
    router.refresh();
  }

  function navClass(href: string) {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return [
      "rounded-md px-3 py-1.5 text-sm transition",
      active
        ? "bg-phosphor/10 text-phosphor"
        : "text-dim hover:bg-panel hover:text-white",
    ].join(" ");
  }

  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-line bg-panel">
            <span className="block h-3 w-3 rounded-full bg-phosphor shadow-[0_0_12px_var(--phosphor)] tick" />
          </span>
          <span>
            <span className="readout block text-[15px] font-semibold tracking-wide text-white">
              ENGINE&nbsp;WATCH
            </span>
            <span className="label block">{t.nav.subtitle}</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Navigacija */}
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/" className={navClass("/")}>
              {t.nav.live}
            </Link>
            <Link href="/sessions" className={navClass("/sessions")}>
              {t.nav.sessions}
            </Link>
          </nav>

          {/* Jezični toggle */}
          <div className="flex overflow-hidden rounded-lg border border-line text-xs">
            {(["hr", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => locale !== l && toggleLocale(l)}
                className="readout px-3 py-1.5 uppercase tracking-wide transition"
                style={
                  locale === l
                    ? {
                        background: "rgba(95,230,201,0.12)",
                        color: "var(--phosphor)",
                      }
                    : { color: "var(--dim)" }
                }
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
