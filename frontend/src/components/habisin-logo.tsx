import Link from "next/link";
import Image from "next/image";
import logo from "../../public/habisin-logo.png";
export default function HabisinLogo({
  className = "brand text-[31px] [font-weight:850] tracking-[-1.8px] flex items-center tablet:text-[28px]",
}: {
  className?: string;
}) {
  return (
    <Link
      className={className}
      href="/"
      aria-label="Habisin beranda"
    >
      <Image
        src={logo}
        alt=""
        width={35}
        height={36}
        loading="eager"
        className="brand-icon mr-2 h-9 w-[35px] shrink-0 object-contain tablet:h-8 tablet:w-[30px]"
      />
      habisin<span className="brand-dot text-brand">.</span>
    </Link>
  );
}
