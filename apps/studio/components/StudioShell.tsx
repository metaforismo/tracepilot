import type { ReactNode } from "react";
import { StudioNav } from "./StudioNav";

type StudioShellProps = {
  children: ReactNode;
  icon: ReactNode;
  subtitle: string;
  sidebar?: ReactNode;
};

export function StudioShell({ children, icon, subtitle, sidebar }: StudioShellProps) {
  return (
    <main className="shell">
      <a className="skipLink" href="#main-content">
        Skip to content
      </a>

      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">{icon}</div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>{subtitle}</span>
          </div>
        </div>

        <StudioNav />

        {sidebar}
      </aside>

      <section className="main" id="main-content">
        {children}
      </section>
    </main>
  );
}