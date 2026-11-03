import Link from "next/link";

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 15 16 5l12 10" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="8" y="14" width="16" height="13" fill="var(--accent)" />
      <rect x="11" y="17" width="4" height="4" fill="var(--panel)" />
      <rect x="18" y="19" width="4" height="8" fill="var(--panel)" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      <Logo />
      <div><h1>House to i3d</h1><small>Build your house for Farming Simulator</small></div>
    </Link>
  );
}
