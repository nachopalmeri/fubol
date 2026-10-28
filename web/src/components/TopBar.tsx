"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  IconBall,
  IconFilm,
  IconHome,
  IconLogout,
  IconSearch,
  IconSeries,
  IconSettings,
  IconTv,
} from "./icons";

const NAV = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/live", label: "En vivo", icon: IconTv },
  { href: "/peliculas", label: "Películas", icon: IconFilm },
  { href: "/series", label: "Series", icon: IconSeries },
];

export default function TopBar({ isAdmin, label }: { isAdmin: boolean; label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
      <header className="topbar">
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
            <span className="user-dot" />
            <span>{label}</span>
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
