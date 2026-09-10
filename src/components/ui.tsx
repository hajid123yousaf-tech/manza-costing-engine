"use client";

import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[0.95rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-indigo-strong",
  secondary:
    "border border-hairline bg-surface text-ink hover:bg-canvas",
  ghost: "text-ink-soft hover:bg-canvas hover:text-ink",
  danger:
    "border border-danger-line bg-surface text-danger-ink hover:bg-[#fdf2f2]",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={cn(buttonBase, variants[variant], className)} {...props} />
  );
}

export function ButtonLink({
  variant = "secondary",
  className,
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(buttonBase, variants[variant], className)}
      {...props}
    />
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-hairline bg-surface",
        hover &&
          "transition-shadow hover:shadow-[0_10px_30px_-14px_rgba(28,30,33,0.22)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[1.125rem] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[0.9rem] text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------- Page header ---------- */

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[1rem] text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex items-center gap-3 pt-1">{children}</div>
      ) : null}
    </div>
  );
}

/* ---------- Status badge ---------- */

export function StatusBadge({ status }: { status: "draft" | "archived" }) {
  const styles =
    status === "draft"
      ? "bg-draft-bg text-draft-ink"
      : "bg-archived-bg text-archived-ink";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium capitalize",
        styles,
      )}
    >
      {status}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "dark" | "mint";
}) {
  const styles =
    tone === "dark"
      ? "bg-ink text-white"
      : tone === "mint"
        ? "bg-mint text-[#0f766e]"
        : "bg-canvas text-ink-soft border border-hairline";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.78rem] font-medium",
        styles,
      )}
    >
      {children}
    </span>
  );
}

/** Small rounded gray badge used for serial numbers in lists. */
export function SerialBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-canvas px-2 py-0.5 text-[0.8rem] font-medium text-ink-soft">
      {children}
    </span>
  );
}

/* ---------- Misc ---------- */

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-ink-soft">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-ink" />
      <span className="text-[0.95rem]">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-surface px-6 py-14 text-center">
      <p className="text-[1.05rem] font-medium text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-[0.95rem] text-ink-soft">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-danger-line bg-[#fdf2f2] px-4 py-3 text-[0.9rem] text-danger-ink">
      {message}
    </div>
  );
}

export function SuccessNote({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-[#bbe7cf] bg-[#effaf3] px-4 py-3 text-[0.9rem] text-[#15803d]">
      {message}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.85rem] font-medium text-ink">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[0.8rem] text-ink-soft">{hint}</span>
      ) : null}
    </label>
  );
}
