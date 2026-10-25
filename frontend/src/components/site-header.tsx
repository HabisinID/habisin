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
// TopNav in design.pen: logo, page content (search, location), page links,
// `actions`, the theme switcher, then `end`, the last item (Daftar gratis or the avatar).
export default function SiteHeader({
  nav = [{ label: "Jelajahi", href: "/jelajahi" }],
  actions,
  end,
  children,
  navLabel = "Navigasi utama",
  className = "",
}: {
  nav?: NavItem[];
  actions?: React.ReactNode;
  end?: React.ReactNode;
  children?: React.ReactNode;
  navLabel?: string;
  className?: string;
}) {
  return (
    <header className={`${styles.header} ${className}`}>
      <div className={styles.inner}>
        <HabisinLogo />
        {children}
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
          {end}
        </div>
      </div>
    </header>
  );
}
