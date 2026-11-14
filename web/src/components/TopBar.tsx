"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBall,
  IconFilm,
  IconHome,
  IconLogout,
  IconSearch,
  IconSeries,
  IconSpark,
  IconSettings,
  IconTv,
} from "./icons";

const NAV = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/live", label: "En vivo", icon: IconTv },
  { href: "/peliculas", label: "Películas", icon: IconFilm },
  { href: "/series", label: "Series", icon: IconSeries },
  { href: "/aprender", label: "Aprender", icon: IconSpark },
];

function initials(label: string): string {
  const clean = label.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }
  return clean.slice(0, 2).toUpperCase();
}

export default function TopBar({ isAdmin, label }: { isAdmin: boolean; label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // En la portada la barra flota sobre el hero; después de bajar un poco se
  // vuelve opaca para que el texto no compita con la carátula de atrás.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname.startsWith("/entrar") || pathname.startsWith("/admin/login")) return null;

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const logout = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/entrar");
    router.refresh();
  };

  return (
    <>
      <header className="topbar" data-scrolled={scrolled}>
        <Link href="/" className="brand" aria-label="Fubol, inicio">
          <span className="brand-mark">
            <IconBall size={19} />
          </span>
          <span className="brand-word">FUBOL</span>
        </Link>

        <nav className="nav" aria-label="Principal">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} data-active={active(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-right">
          <Link href="/buscar" className="search-pill" data-active={pathname.startsWith("/buscar")}>
            <IconSearch size={16} />
            <span>Buscar</span>
            <kbd>/</kbd>
          </Link>
          {isAdmin ? (
            <Link href="/admin" className="icon-btn" aria-label="Administración" title="Administración">
              <IconSettings size={19} />
            </Link>
          ) : null}
          <button className="user-chip" onClick={() => void logout()} disabled={busy} title="Cerrar sesión">
            <span className="user-avatar" aria-hidden="true">{initials(label)}</span>
            <span className="user-name">{label}</span>
            <IconLogout size={15} />
          </button>
        </div>
      </header>

      <nav className="bottom-nav" aria-label="Navegación">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} data-active={active(item.href)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Link href="/buscar" data-active={pathname.startsWith("/buscar")}>
          <IconSearch size={20} />
          <span>Buscar</span>
        </Link>
      </nav>
    </>
  );
}
