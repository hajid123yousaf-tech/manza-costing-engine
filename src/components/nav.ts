import { LayoutDashboard, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
}

export const NAV: NavItem[] = [
  {
    href: "/costing-hub",
    label: "Costing Hub",
    shortLabel: "Costing Hub",
    icon: LayoutDashboard,
    match: (p) => p === "/costing-hub" || p.startsWith("/costing-hub/"),
  },
];
