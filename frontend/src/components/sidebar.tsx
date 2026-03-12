"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/lecture", label: "Lecture" },
  { href: "/flashcards", label: "FlashCards" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="panel-strong flex w-full shrink-0 flex-col gap-5 rounded-none border-b p-5 md:sticky md:top-0 md:h-screen md:w-72 md:border-b-0 md:border-r">
      <Link href="/" className="panel rounded-2xl p-4">
        <p className="mono b4 text-muted tracking-[0.18em]">
          Lecture Buddy
        </p>
        <h1 className="h3 mono mt-1">Space Scrapbook</h1>
        <p className="b3 mt-1 text-muted">LangChain learning cockpit</p>
      </Link>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mono b2 block rounded-xl border px-4 py-3 transition ${
                isActive
                  ? "border-transparent bg-[var(--accent)]/40 text-[#090807]"
                  : "border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="b3 text-muted mt-auto rounded-xl border border-[var(--border)] p-3">
        Add API key in Settings before using AI generation.
      </div>
    </aside>
  );
}
