"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "./ui";

export function Sidebar() {
  const pathname = usePathname() || "/";

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-surface p-6 print:hidden md:flex">
      <Link href="/costing-hub" className="mb-8 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-[0.95rem] font-bold text-white">
          M
        </span>
        <span className="text-[1.1rem] font-semibold tracking-tight text-ink">
          Manza
        </span>
      </Link>

      <nav>
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-full px-3.5 py-3 text-[0.95rem] transition-colors",
                    active
                      ? "bg-lime font-medium text-ink"
                      : "text-ink-soft hover:bg-canvas hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-ink text-white" : "text-ink-soft",
                    )}
                  >
                    <Icon size={active ? 14 : 20} strokeWidth={2} />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mt-auto pt-6 text-[0.78rem] leading-relaxed text-ink-soft">
        {pathname.startsWith("/attendance-salary")
          ? "Salary figures are in PKR."
          : "Totals are in PKR unless a sheet sets another display currency."}
      </p>
    </aside>
  );
}
