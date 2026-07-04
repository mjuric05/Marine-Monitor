import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel panel-glow p-10 text-center">
      <h1 className="readout text-3xl text-white">404</h1>
      <p className="mt-2 text-dim">Stranica ili sesija nije pronađena.</p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-md border border-line px-4 py-2 text-sm text-phosphor hover:border-phosphor"
      >
        ← Nadzorna ploča
      </Link>
    </div>
  );
}
