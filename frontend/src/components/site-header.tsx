import Link from "next/link";
import HabisinLogo from "./habisin-logo";
import ThemeToggle from "./theme-toggle";
import styles from "./site-header.module.css";
export type NavItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  current?: boolean;
};
// Shared top bar: logo, page content (search, location), page links, the
// page's `actions`, then the theme switcher, always the top-right item.
export default function SiteHeader({
  nav = [{ label: "Jelajahi", href: "/jelajahi" }],
  actions,
  children,
  navLabel = "Navigasi utama",
  className = "",
}: {
  nav?: NavItem[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
  navLabel?: string;
  className?: string;
}) {
  return (
    <header className={`${styles.header} ${className}`}>
      <div className={styles.inner}>
        <HabisinLogo />
        {children && <div className={styles.content}>{children}</div>}
        {nav.length > 0 && (
          <nav aria-label={navLabel} className={styles.nav}>
            {nav.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>
        )}
        <div className={styles.actions}>
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
