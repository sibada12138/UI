import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-light)]">
      <section className="bg-[var(--bg-dark)] px-6 py-24 text-[var(--text-light)] md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <h1 className="h-display text-5xl font-semibold leading-[1.07] md:text-6xl">
            Recharge Card System
          </h1>
          <p className="max-w-3xl text-lg text-white/80">
            Token-based card activation and manual recharge workflow. UI follows
            the local DESIGN.md style guide.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link className="btn-primary" href="/query">
              Check Progress
            </Link>
            <Link className="btn-pill btn-pill-dark" href="/admin/login">
              Admin Console
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:px-10">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          <article className="apple-panel p-6">
            <h2 className="h-display text-3xl font-semibold leading-tight">
              User Entry
            </h2>
            <p className="mt-3 text-[var(--text-muted)]">
              Submit phone and SMS code by token link. Token expires immediately
              after successful submit.
            </p>
          </article>
          <article className="apple-panel p-6">
            <h2 className="h-display text-3xl font-semibold leading-tight">
              Admin Entry
            </h2>
            <p className="mt-3 text-[var(--text-muted)]">
              Create token, monitor tasks, generate recharge links and QR codes.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

