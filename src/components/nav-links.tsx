"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

interface Item {
  href: string;
  label: string;
}

interface Props {
  items: readonly Item[];
  variant: "side" | "bar";
}

/** Highlights the current route. Needs a Suspense boundary (pathname is runtime data). */
export function NavLinks(props: Props) {
  return <NavList {...props} path={usePathname()} />;
}

/** Pure nav list. Rendered with path=null as the prerendered fallback (no active highlight). */
export function NavList({ items, variant, path }: Props & { path: string | null }) {
  const isActive = (href: string) =>
    path !== null &&
    (href === "/" ? path === "/" : path === href || path.startsWith(href + "/") || (href === "/companies" && path.startsWith("/company/")));

  if (variant === "bar") {
    return (
      <ul className="flex overflow-x-auto px-2">
        {items.map((i) => (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={isActive(i.href) ? "page" : undefined}
              className={cx(
                "block border-b-2 px-2.5 py-2 text-[12px]",
                isActive(i.href) ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink",
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul>
      {items.map((i) => (
        <li key={i.href}>
          <Link
            href={i.href}
            aria-current={isActive(i.href) ? "page" : undefined}
            className={cx(
              "block border-l-2 px-4 py-1.5 text-[13px]",
              isActive(i.href) ? "border-accent bg-panel text-ink" : "border-transparent text-mute hover:bg-panel hover:text-ink",
            )}
          >
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
