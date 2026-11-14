"use client";

import { useEffect, useState } from "react";

interface Quote {
  key: string;
  label: string;
  kind: "index" | "stock";
  last: number;
  change: number;
  changePct: number;
}

type State =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message: string }
  | { status: "ok"; quotes: Quote[]; fetchedAt: string };

const REFRESH_MS = 15_000;

/** Polls /api/market every 15s while the tab is visible (each widget polls independently). */
function useLiveMarket(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (res.status === 403) {
          setState({ status: "disabled" });
          return; // not shown on this deployment; stop polling
        }
        if (!res.ok || !body.quotes) setState({ status: "error", message: body.error ?? "Live quotes unavailable." });
        else setState({ status: "ok", quotes: body.quotes, fetchedAt: body.fetchedAt });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Live quotes unavailable." });
      }
      if (!cancelled) timer = setTimeout(tick, REFRESH_MS);
    }
    function tick() {
      if (document.visibilityState === "visible") load();
      else timer = setTimeout(tick, REFRESH_MS);
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return state;
}

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + nf.format(Math.abs(n));
const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-mute");

/** Regular NSE session: Mon–Fri 09:15–15:30 IST. Exchange holidays are not detected. */
function marketSession(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  const day = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open = day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
  return open ? "Market hours" : "Market closed · last traded prices";
}

const timeIst = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Thin index ticker under the header. Renders nothing when live data is disabled. */
export function MarketTicker() {
  const s = useLiveMarket();
  if (s.status === "disabled" || s.status === "error" || s.status === "loading") return null;
  const indices = s.quotes.filter((q) => q.kind === "index");
  return (
    <div className="border-b border-line bg-panel">
      <ul className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 py-1.5 text-[11.5px] lg:px-6" aria-label="Live market indices">
        {indices.map((q) => (
          <li key={q.key} className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-mute">{q.label}</span>
            <span className="num text-ink">{nf.format(q.last)}</span>
            <span className={`num ${tone(q.change)}`}>
              {signed(q.change)} ({signed(q.changePct)}%)
            </span>
          </li>
        ))}
        <li className="ml-auto shrink-0 whitespace-nowrap text-mute">
          <span className="num">{timeIst(s.fetchedAt)}</span> IST · Upstox
        </li>
      </ul>
    </div>
  );
}

/** Home-page panel: indices and large caps, live. */
export function MarketPanel() {
  const s = useLiveMarket();
  if (s.status === "disabled") return null;

  return (
    <section className="mt-10 border border-line bg-panel" aria-label="Live market">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink">Market today</h2>
        {s.status === "ok" && (
          <span className="text-[11px] text-mute">
            {marketSession(s.fetchedAt)} · updated <span className="num">{timeIst(s.fetchedAt)}</span> IST · refreshes every
            15s · source: Upstox
          </span>
        )}
      </header>
      {s.status === "loading" && <p className="px-4 py-6 text-[12px] text-mute">Loading live prices…</p>}
      {s.status === "error" && <p className="px-4 py-6 text-[12px] text-down">{s.message}</p>}
      {s.status === "ok" && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num-cell">Last</th>
              <th className="num-cell">Change</th>
              <th className="num-cell">% Change</th>
            </tr>
          </thead>
          <tbody>
            {s.quotes.map((q) => (
              <tr key={q.key}>
                <td className={q.kind === "index" ? "font-medium" : ""}>{q.label}</td>
                <td className="num-cell">{nf.format(q.last)}</td>
                <td className={`num-cell ${tone(q.change)}`}>{signed(q.change)}</td>
                <td className={`num-cell ${tone(q.change)}`}>{signed(q.changePct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
