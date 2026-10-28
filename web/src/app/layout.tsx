import type { Metadata, Viewport } from "next";
import Link from "next/link";
import PwaRegister from "@/components/PwaRegister";
import TopBar from "@/components/TopBar";
import { getSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fubol · fútbol en vivo y VOSE",
    template: "%s · Fubol",
  },
  description:
    "Fútbol en vivo con la señal más cercana, failover automático y películas o series con subtítulos sincronizados. Un link privado para la familia.",
  applicationName: "Fubol",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Fubol" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#07090a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isAdmin = session?.role === "admin";
  const label = isAdmin ? "Admin" : session?.role === "link" ? session.label : "Invitado";

  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <TopBar isAdmin={isAdmin} label={label} />
        <div id="contenido">{children}</div>
        <footer className="site-foot">
          <span>Fubol · uso privado</span>
          <Link href={isAdmin ? "/admin" : "/entrar?admin=1"}>
            {isAdmin ? "Panel de administración" : "Administración"}
          </Link>
        </footer>
        <PwaRegister />
      </body>
    </html>
  );
}
