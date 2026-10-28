"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlert, IconArrowRight, IconSettings, IconTv } from "./icons";

export default function LoginForm({
  initialCode = "",
  initialMode = "link",
  motivo,
}: {
  initialCode?: string;
  initialMode?: "link" | "admin";
  motivo?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "admin">(initialMode);
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    motivo === "invalido" ? "Ese link no existe o fue revocado." : null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mode === "link" ? "/api/auth/link" : "/api/auth/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "link" ? { code: code.trim(), pin: pin.trim() || undefined } : { password },
        ),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        setError(body.error ?? "No se pudo entrar");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Error de red. Revisá la conexión e intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-card">
      <span className="eyebrow">
        {mode === "link" ? <IconTv size={14} /> : <IconSettings size={14} />}
        {mode === "link" ? "Acceso familiar" : "Administración"}
      </span>
      <h2>{mode === "link" ? "Entrá con tu link" : "Panel de control"}</h2>
      <p>
        {mode === "link"
          ? "Pegá el código que te compartieron. Si el link tiene PIN, ingresalo acá."
          : "Ingresá la contraseña del administrador para configurar fuentes, addons y links."}
      </p>

      <form className="login-form" onSubmit={submit}>
        {error && (
          <div className="form-error" role="alert">
            <IconAlert size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            {error}
          </div>
        )}

        {mode === "link" ? (
          <>
            <div className="field">
              <label htmlFor="code">Código del link</label>
              <input
                id="code"
                className="input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="Ej. K7M2Q9ZX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={16}
                required
              />
              <small>Está en la URL que te compartieron: /f/CODIGO</small>
            </div>
            <div className="field">
              <label htmlFor="pin">PIN (si te lo pidieron)</label>
              <input
                id="pin"
                className="input"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                placeholder="4 a 8 dígitos"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
              />
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="password">Contraseña de administrador</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              required
            />
            <small>
              Está en <code>data/admin-password.txt</code> del servidor o en{" "}
              <code>FUBOL_ADMIN_PASSWORD</code>.
            </small>
          </div>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || (mode === "link" ? code.length < 4 : password.length === 0)}
          style={{ width: "100%" }}
        >
          {busy ? "Entrando…" : mode === "link" ? "Entrar" : "Abrir panel"}
          {!busy && <IconArrowRight size={16} />}
        </button>
      </form>

      <div className="login-alt">
        <span>{mode === "link" ? "¿Sos quien administra?" : "¿Solo querés mirar?"}</span>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "link" ? "admin" : "link");
            setError(null);
          }}
        >
          {mode === "link" ? "Usar contraseña de admin" : "Entrar con link familiar"}
        </button>
      </div>

      <p className="login-note">
        Fubol es de uso privado. La sesión queda en una cookie httpOnly y el acceso se puede
        revocar en cualquier momento desde el panel. No se comparten datos con terceros.
      </p>
    </div>
  );
}
