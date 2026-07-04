import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { Metadata } from "next";
import { LanguageProvider } from "@/components/LanguageProvider";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Engine Watch — Nadzor brodskog motora",
  description:
    "Nadzorni sustav brodskog dizelskog motora — parametri, sesije i lokacija u stvarnom vremenu",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hr">
      <body>
        <LanguageProvider>
          <Header />
          <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-5 pb-10 pt-4">
            <p className="label">
              SAE&nbsp;J1939 · CAN · Next.js — prototip nadzornog sustava brodskog motora
            </p>
          </footer>
        </LanguageProvider>
      </body>
    </html>
  );
}
