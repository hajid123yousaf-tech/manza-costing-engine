import {
  LayoutDashboard,
  FileSpreadsheet,
  Package,
  type LucideIcon,
} from "lucide-react";

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
    label: "Dashboard",
    shortLabel: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/costing-hub",
  },
  {
    href: "/costing-hub/sheets",
    label: "Cost Sheets",
    shortLabel: "Sheets",
    icon: FileSpreadsheet,
    match: (p) =>
      p === "/costing-hub/sheets" || p.startsWith("/costing-hub/sheets/"),
  },
  {
    href: "/costing-hub/products",
    label: "Products",
    shortLabel: "Products",
    icon: Package,
    match: (p) => p.startsWith("/costing-hub/products"),
  },
];
