import Link from "next/link";

type LogoTextProps = {
  className?: string;
};

export function LogoText({ className = "" }: LogoTextProps) {
  return (
    <Link
      href="/"
      className={`font-display text-xl font-bold tracking-tight text-ink ${className}`}
      aria-label="vygo home"
    >
      vygo
      <span className="text-purple" aria-hidden="true">
        .
      </span>
      <span className="text-muted">ai</span>
    </Link>
  );
}
