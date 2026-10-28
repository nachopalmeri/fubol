import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import { IconBall, IconSpark } from "@/components/icons";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acceso privado de Fubol.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; motivo?: string; admin?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const wantsAdmin = params.admin === "1";
  // A family session can still open the admin login, so the owner is never
  // locked out after entering with a link. A successful admin login replaces it.
  if (session && !(wantsAdmin && session.role === "link")) redirect("/");

  return (
    <main className="login-page">
      <section className="login-visual">
        <div style={{ position: "relative" }}>
          <Link href="/" className="brand" style={{ marginBottom: 24 }}>
            <span className="brand-mark">
              <IconBall size={21} />
            </span>
            <span className="brand-word">FUBOL</span>
          </Link>
          <h1>El fútbol de casa, en un solo link.</h1>
          <p>
            Señales ordenadas por cercanía al vivo, cambio automático si una se cae y películas o
            series con subtítulos en español sincronizados.
          </p>
        </div>
        <div className="login-points">
          <span>
            <i /> Sin instalar nada: se abre en el navegador
          </span>
          <span>
            <i /> Un link por persona, revocable al instante
          </span>
          <span>
            <i /> VOSE automático con ajuste de offset
          </span>
          <span>
            <i /> Sin cuentas, sin anuncios, sin captchas
          </span>
        </div>
        <p className="login-note" style={{ position: "relative" }}>
          <IconSpark size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          Uso privado. Si no tenés acceso, pedile a quien administra el servidor que te genere un
          link.
        </p>
      </section>

      <LoginForm
        initialCode={params.codigo ?? ""}
        initialMode={params.admin === "1" ? "admin" : "link"}
        motivo={params.motivo}
      />
    </main>
  );
}
