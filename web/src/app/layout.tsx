import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, Playfair_Display } from "next/font/google";
import PwaRegister from "@/components/PwaRegister";
import TopBar from "@/components/TopBar";
import { getSession } from "@/lib/auth";
import "./globals.css";
import "./design.css";

/**
 * Dos voces: la serif de editorial para los títulos (el cartel de la película)
 * y la sans para todo lo que se lee rápido. Son fuentes del proyecto, no del
 * sistema, porque el mismo título tiene que verse igual en el celular de la
 * familia que en la tele.
 */
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

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
  themeColor: "#07070a",
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
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
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
