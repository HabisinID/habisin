import Image from "next/image";
import Link from "next/link";

export type NavItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  current?: boolean;
};

const navItemClass =
  "inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium text-dark hover:bg-surface-2 aria-[current=page]:bg-light aria-[current=page]:font-bold aria-[current=page]:text-brand";

// Shared top bar from the design (TopNav/Pembeli): logo, page links, and the
// actions each page owns (account, auth, partner shortcut).
export default function SiteHeader({
  nav = [{ label: "Jelajahi", href: "/" }],
  actions,
}: {
  nav?: NavItem[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-[900] border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-8 tablet:gap-3 tablet:px-4">
        <Link
          href="/"
          aria-label="Habisin beranda"
          className="shrink-0 rounded-field"
        >
          <Image
            src="/logo.png"
            alt="habisin"
            width={969}
            height={390}
            priority
            className="h-10 w-auto mobile:h-8"
          />
        </Link>
        <nav
          aria-label="Navigasi utama"
          className="ml-auto flex items-center gap-1 tablet:hidden"
        >
          {nav.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={navItemClass}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                className={navItemClass}
                aria-current={item.current ? "page" : undefined}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>
        {actions && (
          <div className="flex items-center gap-3 tablet:ml-auto mobile:gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
