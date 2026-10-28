import Link from "next/link";
import { IconBall } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="shell">
      <div className="empty-state" style={{ marginTop: 60 }}>
        <IconBall size={34} />
        <h2>Esta página no existe</h2>
        <p>
          Puede que el link haya cambiado o que el contenido ya no esté en el catálogo. Probá desde
          el inicio o buscá el título de nuevo.
        </p>
        <div className="page-actions">
          <Link href="/" className="btn btn-primary">
            Ir al inicio
          </Link>
          <Link href="/buscar" className="btn btn-ghost">
            Buscar
          </Link>
        </div>
      </div>
    </main>
  );
}
