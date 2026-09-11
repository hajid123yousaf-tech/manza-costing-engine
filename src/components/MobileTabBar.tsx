"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "./ui";

export function MobileTabBar() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] print:hidden md:hidden">
      {NAV.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.7rem] font-medium transition-colors",
              active ? "text-ink" : "text-ink-soft",
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            {item.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}
