import { LayoutDashboard, Users, type LucideIcon } from "lucide-react";

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
    shortLabel: "Costing",
    icon: LayoutDashboard,
    match: (p) => p === "/costing-hub" || p.startsWith("/costing-hub/"),
  },
  {
    href: "/attendance-salary",
    label: "Attendance & Salary",
    shortLabel: "Attendance",
    icon: Users,
    match: (p) =>
      p === "/attendance-salary" || p.startsWith("/attendance-salary/"),
  },
];
