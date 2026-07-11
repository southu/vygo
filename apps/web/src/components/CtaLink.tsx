import Link from "next/link";
import type { ReactNode } from "react";

type CtaLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "on-dark" | "ghost-on-dark";
  className?: string;
};

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  "on-dark": "btn-on-dark",
  "ghost-on-dark": "btn-ghost-on-dark",
} as const;

export function CtaLink({ href, children, variant = "primary", className = "" }: CtaLinkProps) {
  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
  const classes = `${variants[variant]} ${className}`;

  if (isExternal) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
