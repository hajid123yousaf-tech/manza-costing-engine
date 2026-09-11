import {
  LayoutDashboard,
  FileSpreadsheet,
  Package,
  ArrowLeftRight,
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
    href: "/",
    label: "Dashboard",
    shortLabel: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/",
  },
  {
    href: "/sheets",
    label: "Cost sheets",
    shortLabel: "Sheets",
    icon: FileSpreadsheet,
    match: (p) => p === "/sheets" || p.startsWith("/sheets/"),
  },
  {
    href: "/products",
    label: "Products",
    shortLabel: "Products",
    icon: Package,
    match: (p) => p.startsWith("/products"),
  },
  {
    href: "/rates",
    label: "Exchange rates",
    shortLabel: "Rates",
    icon: ArrowLeftRight,
    match: (p) => p.startsWith("/rates"),
  },
];
