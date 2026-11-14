/**
 * Design-system primitives. Dense, square-edged, terminal-style surfaces.
 * Colours come from theme tokens in globals.css; do not hardcode hex values in pages.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-[13px] text-mute">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("border border-line bg-panel", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{title}</h2>
          {meta && <div className="text-[11px] text-mute">{meta}</div>}
        </header>
      )}
      <div className={cx("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="border border-line bg-panel px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-mute">{label}</div>
      <div className="num mt-1 text-xl font-semibold text-ink">{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-mute">{note}</div>}
    </div>
  );
}

type Tone = "neutral" | "accent" | "up" | "down" | "warn";
const toneClass: Record<Tone, string> = {
  neutral: "border-line text-mute",
  accent: "border-accent/40 text-accent",
  up: "border-up/40 text-up",
  down: "border-down/40 text-down",
  warn: "border-warn/50 text-warn",
};

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center border px-1.5 py-px font-mono text-[10px] font-medium uppercase leading-4 tracking-wide",
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "ACTIVE" ? "up" : status === "SUSPENDED" ? "warn" : status === "DELISTED" ? "down" : "neutral";
  return <Badge tone={tone}>{status.toLowerCase()}</Badge>;
}

export function SegmentBadge({ segment }: { segment: string }) {
  return <Badge tone={segment === "SME" ? "warn" : "neutral"}>{segment === "SME" ? "SME" : "Main"}</Badge>;
}

/** Honest placeholder for data the platform does not have yet. Never a fake number. */
export function DataUnavailable({
  title = "Data not yet available",
  children,
  phase,
}: {
  title?: string;
  children?: ReactNode;
  phase?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1 border border-dashed border-line px-3 py-4 text-[13px]">
      <div className="flex items-center gap-2 font-medium text-ink">
        <span aria-hidden className="inline-block h-1.5 w-1.5 bg-mute" />
        {title}
        {phase && <Badge>{phase}</Badge>}
      </div>
      {children && <div className="text-mute">{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-[13px] text-mute">{children}</div>}
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-ink underline decoration-mute underline-offset-2 hover:decoration-ink">
      {children}
    </Link>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-mute underline-offset-2 hover:decoration-ink">
      {children}
      <span aria-hidden className="ml-0.5 text-[10px]">↗</span>
    </a>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse bg-line/60", className)} />;
}

export const fmtInt = (n: number) => n.toLocaleString("en-IN");

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTimeIst(d: Date | null | undefined): string {
  if (!d) return "—";
  return (
    d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }) + " IST"
  );
}
