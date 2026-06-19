"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./NavBar.module.css";

export default function NavBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname.startsWith("/dashboard") : pathname === href;

  return (
    <header className={s.nav}>
      <div className={`container ${s.inner}`}>
        <Link href="/" className={s.brand} aria-label="ProfPing home">
          <span className={s.mark} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 2 11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={s.brandText}>ProfPing</span>
        </Link>

        <nav className={s.right}>
          <Link
            href="/dashboard"
            className={`${s.link} ${isActive("/dashboard") ? s.linkActive : ""}`}
          >
            Find Professors
          </Link>
          <span className={s.avatar} aria-hidden="true" />
        </nav>
      </div>
    </header>
  );
}
