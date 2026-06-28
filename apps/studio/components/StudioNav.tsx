"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, ClipboardCheck, Gauge, TriangleAlert } from "lucide-react";

type StudioRoute =
  | "/"
  | "/diagnostics"
  | "/readiness"
  | "/scorecards/provider"
  | "/scorecards/reliability";

type NavItem = {
  href: StudioRoute;
  label: string;
  icon: typeof Gauge;
  exact?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: Gauge, exact: true },
  { href: "/readiness", label: "Readiness", icon: ClipboardCheck },
  { href: "/scorecards/provider", label: "Provider scorecard", icon: BarChart3 },
  { href: "/scorecards/reliability", label: "Reliability scorecard", icon: BarChart3 },
  { href: "/diagnostics", label: "Diagnostics", icon: TriangleAlert }
];

function isActive(pathname: string, href: StudioRoute, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioNav() {
  const pathname = usePathname();

  return (
    <nav className="sidebarActions" aria-label="Studio navigation">
      {navItems.map(({ href, label, icon: Icon, exact }) => (
        <Link
          aria-current={isActive(pathname, href, exact) ? "page" : undefined}
          className={`navLink${isActive(pathname, href, exact) ? " active" : ""}`}
          href={href}
          key={href}
        >
          <Icon size={15} />
          {label}
        </Link>
      ))}
      <Link
        aria-current={pathname.startsWith("/runs/") ? "page" : undefined}
        className={`navLink${pathname.startsWith("/runs/") ? " active" : ""}`}
        href="/runs/smoke-form"
      >
        <Activity size={15} />
        Trace replay
      </Link>
    </nav>
  );
}