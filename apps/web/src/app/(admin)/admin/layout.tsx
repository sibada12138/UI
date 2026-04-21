"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/admin-auth";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/tokens", label: "Tokens" },
  { href: "/admin/recharge", label: "Recharge" },
  { href: "/admin/admin-users", label: "Admins" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--bg-light)]">
      <header className="sticky top-0 z-10 bg-black/80 px-6 py-4 text-white backdrop-blur-[20px] md:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <span className="h-display text-xl font-semibold">Recharge Admin</span>
          <nav className="flex flex-wrap gap-3 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[980px] border border-white/20 px-3 py-1.5 hover:border-[var(--link-on-dark)] hover:text-[var(--link-on-dark)]"
              >
                {item.label}
              </Link>
            ))}
            <button
              className="rounded-[980px] border border-white/20 px-3 py-1.5 hover:border-[var(--link-on-dark)] hover:text-[var(--link-on-dark)]"
              onClick={() => {
                clearAdminToken();
                router.push("/admin/login");
              }}
              type="button"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main className="px-6 py-10 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

