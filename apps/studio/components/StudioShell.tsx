import type { ReactNode } from "react";
import { StudioNav } from "./StudioNav";
import styles from "./StudioShell.module.css";

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

      <div className={styles.mobileNav}>
        <StudioNav ariaLabel="Mobile Studio navigation" />
      </div>

      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">{icon}</div>
          <div className="brandText">
            <strong>TracePilot Studio</strong>
            <span>{subtitle}</span>
          </div>
        </div>

        <div className={styles.desktopNav}>
          <StudioNav />
        </div>

        {sidebar}
      </aside>

      <section className="main" id="main-content">
        {children}
      </section>
    </main>
  );
}
