"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { from12Hour, to12Hour } from "@/lib/attendanceSalary";

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
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
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

/* ---------- Dashboard cards ---------- */

export type PastelFamily = "peach" | "lavender" | "mint";

const PASTEL_FAMILY: Record<PastelFamily, { card: string; badge: string }> = {
  peach: { card: "bg-peach", badge: "bg-peach-badge" },
  lavender: { card: "bg-lavender", badge: "bg-lavender-badge" },
  mint: { card: "bg-mint", badge: "bg-mint-badge" },
};

/** Small pastel stat tile used on module dashboards. */
export function KpiCard({
  family,
  icon: Icon,
  label,
  value,
}: {
  family: PastelFamily;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  const f = PASTEL_FAMILY[family];
  return (
    <div className={cn("rounded-2xl p-6", f.card)}>
      <span
        className={cn(
          "mb-4 flex h-10 w-10 items-center justify-center rounded-full text-white",
          f.badge,
        )}
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <p className="text-[2rem] font-bold leading-none tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[0.9rem] font-medium text-ink-soft">{label}</p>
    </div>
  );
}

/** Large entry-point card — a module dashboard's main sections. */
export function EntryCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-6 transition-shadow hover:shadow-[0_10px_30px_-14px_rgba(28,30,33,0.22)]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-canvas text-ink">
        <Icon size={22} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[1.05rem] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[0.85rem] text-ink-soft">{description}</p>
      </div>
      <ChevronRight
        size={18}
        className="shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5"
      />
    </Link>
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

/**
 * 12-hour (AM/PM) time picker — a drop-in replacement for `<input type="time">`
 * with the same "HH:MM" 24-hour string contract in/out. Native time inputs
 * render in whatever 12/24-hour format the OS/browser locale picks, which a
 * plain `<input type="time">` can't override; this always shows AM/PM.
 * Uncontrolled-feeling but prop-driven: local hour/minute/ampm state re-syncs
 * from `value` via effect (needed because the same row/instance gets new
 * `value` props on reload — e.g. switching dates — without unmounting).
 */
export function TimePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const initial = to12Hour(value);
  const [hour, setHour] = useState<number | null>(initial?.hour ?? null);
  const [minute, setMinute] = useState<number | null>(initial?.minute ?? null);
  const [ampm, setAmpm] = useState<"AM" | "PM">(initial?.ampm ?? "AM");

  useEffect(() => {
    void (async () => {
      const parts = to12Hour(value);
      setHour(parts?.hour ?? null);
      setMinute(parts?.minute ?? null);
      setAmpm(parts?.ampm ?? "AM");
    })();
  }, [value]);

  function commit(h: number | null, m: number | null, ap: "AM" | "PM") {
    setHour(h);
    setMinute(m);
    setAmpm(ap);
    onChange(h !== null && m !== null ? from12Hour(h, m, ap) : "");
  }

  return (
    <div
      className={cn(
        "field flex items-center gap-1 py-1",
        disabled && "opacity-50",
        className,
      )}
    >
      <select
        disabled={disabled}
        aria-label="Hour"
        className="min-w-0 flex-1 bg-transparent text-right focus:outline-none disabled:cursor-not-allowed"
        value={hour ?? ""}
        onChange={(e) =>
          commit(e.target.value === "" ? null : Number(e.target.value), minute, ampm)
        }
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-ink-soft">:</span>
      <select
        disabled={disabled}
        aria-label="Minute"
        className="min-w-0 flex-1 bg-transparent focus:outline-none disabled:cursor-not-allowed"
        value={minute ?? ""}
        onChange={(e) =>
          commit(hour, e.target.value === "" ? null : Number(e.target.value), ampm)
        }
      >
        <option value="">--</option>
        {Array.from({ length: 60 }, (_, i) => i).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <div className="ml-1 inline-flex shrink-0 overflow-hidden rounded-md border border-hairline">
        {(["AM", "PM"] as const).map((ap) => (
          <button
            key={ap}
            type="button"
            disabled={disabled}
            onClick={() => commit(hour, minute, ap)}
            className={cn(
              "px-1.5 py-0.5 text-[0.7rem] font-medium transition-colors disabled:cursor-not-allowed",
              ampm === ap ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
            )}
          >
            {ap}
          </button>
        ))}
      </div>
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
