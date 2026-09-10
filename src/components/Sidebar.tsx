"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Package,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/",
  },
  {
    href: "/sheets",
    label: "Cost sheets",
    icon: FileSpreadsheet,
    match: (p) => p === "/sheets" || p.startsWith("/sheets/"),
  },
  {
    href: "/products",
    label: "Products",
    icon: Package,
    match: (p) => p.startsWith("/products"),
  },
  {
    href: "/rates",
    label: "Exchange rates",
    icon: ArrowLeftRight,
    match: (p) => p.startsWith("/rates"),
  },
];

export function Sidebar() {
  const pathname = usePathname() || "/";

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-surface p-6 print:hidden">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
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
        Totals are in PKR unless a sheet sets another display currency.
      </p>
    </aside>
  );
}
