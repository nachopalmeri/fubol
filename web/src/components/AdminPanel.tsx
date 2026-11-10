"use client";

import { useCallback, useEffect, useState } from "react";
import type { AddonRow, AddonKind } from "@/lib/vod/store";
import type { LiveSourceKind } from "@/lib/live/types";
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTrash,
} from "./icons";

export type AdminTab = "links" | "sources" | "addons" | "health";

type Tab = AdminTab;

interface AdminLink {
  id: number;
  code: string;
  label: string;
  permissions: ("live" | "vod")[];
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  lastSeenAt: number | null;
  hasPin: boolean;
}

interface AdminSource {
  id: string;
  kind: LiveSourceKind;
  name: string;
  url: string;
  config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

interface HealthSource {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  channels: number;
  checks: number;
  okRate: number | null;
  avgTtfbMs: number | null;
  maxEdgeAgeS: number | null;
  lastCheck: number | null;
}

interface HealthData {
  sources: HealthSource[];
  totalChannels: number;
  addons: number;
  links: number;
  network?: {
    ips: string[];
    distinct: number;
    stable: boolean;
    note: string;
  };
}

interface ProbeResult {
  ok: boolean;
  kind: string;
  ttfbMs: number;
  edgeAgeS: number | null;
  live: boolean;
  status?: number;
  error?: string;
}

interface AddonDiagnostic {
  id: string;
  name: string;
  kind: AddonRow["kind"];
  url: string;
  manifestOk: boolean;
  needsConfiguration: boolean;
  configureUrl: string | null;
  resources: string[];
  error?: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "links", label: "Links" },
  { id: "sources", label: "Fuentes en vivo" },
  { id: "addons", label: "Addons VOD" },
  { id: "health", label: "Salud" },
];

const SOURCE_KINDS: { id: LiveSourceKind; label: string; hint: string }[] = [
  { id: "m3u", label: "Lista M3U", hint: "URL de la lista .m3u o .m3u8 con canales" },
  { id: "xtream", label: "Xtream Codes", hint: "URL del panel, usuario y contraseña" },
  { id: "hls", label: "Canal HLS directo", hint: "URL .m3u8 de un solo canal" },
  { id: "addon", label: "Addon Stremio", hint: "Manifest del addon y catálogo de vivo" },
];

const ADDON_KINDS: { id: AddonKind; label: string }[] = [
  { id: "vod", label: "Streams VOD" },
  { id: "meta", label: "Metadata" },
  { id: "subs", label: "Subtítulos" },
  { id: "live", label: "Vivo" },
];

function formatDate(value: number | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function timeAgo(value: number | null): string {
  if (!value) return "nunca";
  const delta = Date.now() - value;
  if (delta < 60_000) return "recién";
  if (delta < 3_600_000) return `hace ${Math.round(delta / 60_000)} min`;
  if (delta < 86_400_000) return `hace ${Math.round(delta / 3_600_000)} h`;
  return `hace ${Math.round(delta / 86_400_000)} d`;
}

function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname.length > 34 ? `${url.pathname.slice(0, 31)}…` : url.pathname;
    return `${url.protocol}//${url.username ? "***@" : ""}${url.host}${path}`;
  } catch {
    return raw.length > 64 ? `${raw.slice(0, 61)}…` : raw;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "La operación falló");
  return body;
}

function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

export default function AdminPanel({ initialTab = "links" }: { initialTab?: AdminTab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [links, setLinks] = useState<AdminLink[] | null>(null);
  const [sources, setSources] = useState<AdminSource[] | null>(null);
  const [addons, setAddons] = useState<AddonRow[] | null>(null);
  const [diagnostics, setDiagnostics] = useState<AddonDiagnostic[] | null>(null);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [addonEditUrl, setAddonEditUrl] = useState("");
  const [addonEditName, setAddonEditName] = useState("");
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (which: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (which === "links") {
        const data = await request<{ links: AdminLink[] }>("/api/admin/links");
        setLinks(data.links);
      } else if (which === "sources") {
        const data = await request<{ sources: AdminSource[] }>("/api/admin/sources");
        setSources(data.sources);
      } else if (which === "addons") {
        const data = await request<{ addons: AddonRow[] }>("/api/admin/addons");
        setAddons(data.addons);
        const diag = await request<{ addons: AddonDiagnostic[] }>("/api/admin/addons/diagnostics");
        setDiagnostics(diag.addons);
      } else {
        const data = await request<HealthData>("/api/admin/health");
        setHealth(data);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(tab);
  }, [tab, refresh]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 4500);
  };

  /* -------------------------------- links ------------------------------- */

  const [linkLabel, setLinkLabel] = useState("Familia");
  const [linkLive, setLinkLive] = useState(true);
  const [linkVod, setLinkVod] = useState(true);
  const [linkDays, setLinkDays] = useState("0");
  const [linkPin, setLinkPin] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const createLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const permissions = [linkLive ? "live" : null, linkVod ? "vod" : null].filter(
        (value): value is "live" | "vod" => value !== null,
      );
      if (permissions.length === 0) throw new Error("Elegí al menos un permiso");
      if (linkPin && !/^\d{4,8}$/.test(linkPin)) throw new Error("El PIN debe tener 4 a 8 dígitos");
      const days = Number(linkDays);
      const data = await request<{ link: AdminLink; url: string }>("/api/admin/links", {
        method: "POST",
        body: JSON.stringify({
          label: linkLabel,
          permissions,
          expiresInDays: Number.isFinite(days) && days > 0 ? days : null,
          pin: linkPin || null,
        }),
      });
      setCreatedUrl(data.url);
      setLinkPin("");
      flash("Link creado. Copialo y compartilo.");
      await refresh("links");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear el link");
    } finally {
      setBusy(false);
    }
  };

  const revokeLink = async (link: AdminLink) => {
    if (!window.confirm(`¿Revocar el link “${link.label}”? Deja de funcionar al instante.`)) return;
    setBusy(true);
    try {
      await request(`/api/admin/links/${link.id}`, { method: "DELETE" });
      flash("Link revocado");
      await refresh("links");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo revocar");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copiado al portapapeles");
    } catch {
      flash("No se pudo copiar: seleccioná el texto y copialo a mano");
    }
  };

  /* ------------------------------- sources ------------------------------ */

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<LiveSourceKind>("m3u");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePriority, setSourcePriority] = useState("100");
  const [sourceEnabled, setSourceEnabled] = useState(true);
  const [sourceGroup, setSourceGroup] = useState("");
  const [sourceUser, setSourceUser] = useState("");
  const [sourcePass, setSourcePass] = useState("");
  const [sourceCatalog, setSourceCatalog] = useState("");
  const [sourceCatalogType, setSourceCatalogType] = useState("sports");
  const [testResult, setTestResult] = useState<ProbeResult | null>(null);

  const resetSourceForm = () => {
    setEditingId(null);
    setSourceKind("m3u");
    setSourceName("");
    setSourceUrl("");
    setSourcePriority("100");
    setSourceEnabled(true);
    setSourceGroup("");
    setSourceUser("");
    setSourcePass("");
    setSourceCatalog("");
    setSourceCatalogType("sports");
    setTestResult(null);
  };

  const startEdit = (source: AdminSource) => {
    setEditingId(source.id);
    setSourceKind(source.kind);
    setSourceName(source.name);
    setSourceUrl(source.url);
    setSourcePriority(String(source.priority));
    setSourceEnabled(source.enabled);
    setSourceGroup(configString(source.config, "groupFilter"));
    setSourceUser(configString(source.config, "username"));
    setSourcePass("");
    setSourceCatalog(configString(source.config, "catalogId"));
    setSourceCatalogType(configString(source.config, "catalogType") || "sports");
    setTestResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitSource = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {};
      if (sourceGroup.trim()) config.groupFilter = sourceGroup.trim();
      if (sourceKind === "xtream") {
        if (sourceUser.trim()) config.username = sourceUser.trim();
        if (sourcePass) config.password = sourcePass;
      }
      if (sourceKind === "addon") {
        if (!sourceCatalog.trim()) throw new Error("El addon de vivo necesita catalogId");
        config.catalogId = sourceCatalog.trim();
        config.catalogType = sourceCatalogType.trim() || "sports";
      }
      const payload = {
        kind: sourceKind,
        name: sourceName.trim(),
        url: sourceUrl.trim(),
        priority: Number(sourcePriority) || 100,
        enabled: sourceEnabled,
        config,
      };
      if (!payload.name || !payload.url) throw new Error("Nombre y URL son obligatorios");

      if (editingId) {
        await request(`/api/admin/sources/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: payload.name,
            url: payload.url,
            priority: payload.priority,
            enabled: payload.enabled,
            config,
          }),
        });
        flash("Fuente actualizada");
      } else {
        await request("/api/admin/sources", { method: "POST", body: JSON.stringify(payload) });
        flash("Fuente agregada");
      }
      resetSourceForm();
      await refresh("sources");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la fuente");
    } finally {
      setBusy(false);
    }
  };

  const testSource = async () => {
    if (!sourceUrl.trim()) {
      setError("Poné una URL para probar");
      return;
    }
    setBusy(true);
    setTestResult(null);
    setError(null);
    try {
      const data = await request<{ result: ProbeResult }>("/api/admin/sources/test", {
        method: "POST",
        body: JSON.stringify({ url: sourceUrl.trim() }),
      });
      setTestResult(data.result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La prueba falló");
    } finally {
      setBusy(false);
    }
  };

  const toggleSource = async (source: AdminSource) => {
    setBusy(true);
    try {
      await request(`/api/admin/sources/${source.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      await refresh("sources");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  const removeSource = async (source: AdminSource) => {
    if (!window.confirm(`¿Eliminar la fuente “${source.name}”?`)) return;
    setBusy(true);
    try {
      await request(`/api/admin/sources/${source.id}`, { method: "DELETE" });
      flash("Fuente eliminada");
      if (editingId === source.id) resetSourceForm();
      await refresh("sources");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------------- addons ------------------------------ */

  const [addonUrl, setAddonUrl] = useState("");
  const [addonKind, setAddonKind] = useState<AddonKind>("vod");
  const [addonName, setAddonName] = useState("");

  const submitAddon = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request("/api/admin/addons", {
        method: "POST",
        body: JSON.stringify({ url: addonUrl.trim(), kind: addonKind, name: addonName.trim() || undefined }),
      });
      setAddonUrl("");
      setAddonName("");
      flash("Addon agregado");
      await refresh("addons");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo agregar el addon");
    } finally {
      setBusy(false);
    }
  };

  const toggleAddon = async (addon: AddonRow) => {
    setBusy(true);
    try {
      await request("/api/admin/addons", {
        method: "PATCH",
        body: JSON.stringify({ id: addon.id, enabled: !addon.enabled }),
      });
      await refresh("addons");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  const startEditAddon = (addon: AddonRow) => {
    setEditingAddonId(addon.id);
    setAddonEditUrl(addon.url);
    setAddonEditName(addon.name);
  };

  const saveAddonEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingAddonId) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/admin/addons/${editingAddonId}`, {
        method: "PATCH",
        body: JSON.stringify({ url: addonEditUrl.trim(), name: addonEditName.trim() || undefined }),
      });
      flash("Manifest actualizado");
      setEditingAddonId(null);
      await refresh("addons");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el manifest");
    } finally {
      setBusy(false);
    }
  };

  const removeAddon = async (addon: AddonRow) => {
    if (!window.confirm(`¿Eliminar “${addon.name}”?`)) return;
    setBusy(true);
    try {
      await request(`/api/admin/addons/${addon.id}`, { method: "DELETE" });
      flash("Addon eliminado");
      await refresh("addons");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------------- render ------------------------------ */

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <span className="eyebrow">
            <IconSettings size={14} /> Administración
          </span>
          <h1>Panel de Fubol</h1>
          <p>Links de la familia, fuentes de vivo, addons y salud de las señales.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => void refresh(tab)} disabled={loading || busy}>
            <IconRefresh size={15} /> {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Secciones del panel">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="admin-tab"
            data-active={tab === item.id}
            onClick={() => {
              setError(null);
              setNotice(null);
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }} role="alert">
          <IconAlert size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {error}
        </div>
      )}
      {notice && (
        <div className="form-ok" style={{ marginBottom: 16 }}>
          <IconCheck size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          {notice}
        </div>
      )}

      {tab === "links" && (
        <div className="admin-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Links compartidos</h2>
                <p>Se validan contra la base en cada request: revocar corta el acceso al instante.</p>
              </div>
              <span className="tag">{links?.length ?? 0} total</span>
            </div>
            <div className="data-list">
              {links === null ? (
                <div className="panel-body">
                  <p className="muted">Cargando…</p>
                </div>
              ) : links.length === 0 ? (
                <div className="panel-body">
                  <p className="muted">Todavía no hay links. Creá el primero con el formulario.</p>
                </div>
              ) : (
                links.map((link) => {
                  const url = typeof window !== "undefined" ? `${window.location.origin}/f/${link.code}` : `/f/${link.code}`;
                  const active = !link.revokedAt && (!link.expiresAt || link.expiresAt > Date.now());
                  return (
                    <div className="data-row" key={link.id}>
                      <div className="data-main">
                        <strong>
                          {link.label}{" "}
                          <span className={`tag ${active ? "tag-on" : "tag-off"}`}>{active ? "activo" : "revocado"}</span>{" "}
                          {link.hasPin && <span className="tag">PIN</span>}
                        </strong>
                        <span>/f/{link.code} · {link.permissions.join(" + ")} · visto {timeAgo(link.lastSeenAt)}</span>
                        <span>
                          Creado {formatDate(link.createdAt)} ·{" "}
                          {link.expiresAt ? `vence ${formatDate(link.expiresAt)}` : "sin vencimiento"}
                        </span>
                      </div>
                      <div className="data-actions">
                        <button className="btn btn-ghost btn-xs" onClick={() => void copy(url)}>
                          <IconCopy size={13} /> Copiar
                        </button>
                        {active && (
                          <button className="btn btn-ghost btn-xs" onClick={() => void revokeLink(link)} disabled={busy}>
                            <IconTrash size={13} /> Revocar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <aside className="panel">
            <div className="panel-head">
              <h2>Nuevo link</h2>
            </div>
            <form className="panel-body" onSubmit={createLink}>
              <div className="field">
                <label htmlFor="link-label">Para quién</label>
                <input
                  id="link-label"
                  className="input"
                  value={linkLabel}
                  onChange={(event) => setLinkLabel(event.target.value)}
                  maxLength={60}
                  placeholder="Familia, Living, Abuela…"
                />
              </div>
              <div className="field-row">
                <label className="checkbox">
                  <input type="checkbox" checked={linkLive} onChange={(event) => setLinkLive(event.target.checked)} />
                  Fútbol en vivo
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={linkVod} onChange={(event) => setLinkVod(event.target.checked)} />
                  Películas y series
                </label>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="link-days">Vence en (días)</label>
                  <input
                    id="link-days"
                    className="input"
                    inputMode="numeric"
                    value={linkDays}
                    onChange={(event) => setLinkDays(event.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                  <small>0 = sin vencimiento</small>
                </div>
                <div className="field">
                  <label htmlFor="link-pin">PIN opcional</label>
                  <input
                    id="link-pin"
                    className="input"
                    inputMode="numeric"
                    value={linkPin}
                    onChange={(event) => setLinkPin(event.target.value.replace(/\D/g, ""))}
                    placeholder="4 a 8 dígitos"
                    maxLength={8}
                  />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                <IconPlus size={16} /> Crear link
              </button>

              {createdUrl && (
                <div className="field">
                  <label htmlFor="created-url">Link recién creado</label>
                  <div className="copy-field">
                    <input id="created-url" className="input" value={createdUrl} readOnly onFocus={(event) => event.target.select()} />
                    <button type="button" className="icon-btn" onClick={() => void copy(createdUrl)} aria-label="Copiar link">
                      <IconCopy size={16} />
                    </button>
                  </div>
                  <small>Si tiene PIN, mandalo por otro canal. El link se puede revocar cuando quieras.</small>
                </div>
              )}
            </form>
          </aside>
        </div>
      )}

      {tab === "sources" && (
        <div className="admin-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Fuentes de vivo</h2>
                <p>Se prueban en paralelo al abrir un canal; gana la de menor delay.</p>
              </div>
              <span className="tag">{sources?.length ?? 0} configuradas</span>
            </div>
            <div className="data-list">
              {sources === null ? (
                <div className="panel-body">
                  <p className="muted">Cargando…</p>
                </div>
              ) : sources.length === 0 ? (
                <div className="panel-body">
                  <p className="muted">No hay fuentes. Agregá una lista M3U, Xtream, un HLS o un addon.</p>
                </div>
              ) : (
                sources.map((source) => (
                  <div className="data-row" key={source.id}>
                    <div className="data-main">
                      <strong>
                        {source.name}{" "}
                        <span className={`tag ${source.enabled ? "tag-on" : "tag-off"}`}>
                          {source.enabled ? "activa" : "pausada"}
                        </span>{" "}
                        <span className="tag">{source.kind}</span>
                      </strong>
                      <span>{maskUrl(source.url)}</span>
                      <span>
                        prioridad {source.priority}
                        {configString(source.config, "groupFilter")
                          ? ` · filtro ${configString(source.config, "groupFilter")}`
                          : ""}
                      </span>
                    </div>
                    <div className="data-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => startEdit(source)}>
                        Editar
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => void toggleSource(source)} disabled={busy}>
                        {source.enabled ? "Pausar" : "Activar"}
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => void removeSource(source)} disabled={busy}>
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="panel">
            <div className="panel-head">
              <h2>{editingId ? "Editar fuente" : "Agregar fuente"}</h2>
              {editingId && (
                <button className="btn btn-ghost btn-xs" onClick={resetSourceForm} type="button">
                  Cancelar
                </button>
              )}
            </div>
            <form className="panel-body" onSubmit={submitSource}>
              <div className="form-grid">
                <div className="field field-full">
                  <label htmlFor="source-kind">Tipo</label>
                  <select
                    id="source-kind"
                    className="select"
                    value={sourceKind}
                    onChange={(event) => setSourceKind(event.target.value as LiveSourceKind)}
                    disabled={Boolean(editingId)}
                  >
                    {SOURCE_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                  <small>{SOURCE_KINDS.find((kind) => kind.id === sourceKind)?.hint}</small>
                </div>
                <div className="field field-full">
                  <label htmlFor="source-name">Nombre</label>
                  <input
                    id="source-name"
                    className="input"
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    placeholder="Cable, IPTV casa, Addon deportes…"
                    maxLength={80}
                    required
                  />
                </div>
                <div className="field field-full">
                  <label htmlFor="source-url">URL</label>
                  <input
                    id="source-url"
                    className="input"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://…"
                    spellCheck={false}
                    disabled={Boolean(editingId)}
                    required
                  />
                  {editingId ? (
                    <small>La URL no se cambia al editar. Eliminá y creá otra fuente si hace falta.</small>
                  ) : (
                    <small>Para IPTV privada en LAN puede hacer falta FUBOL_ALLOW_PRIVATE_SOURCES=1.</small>
                  )}
                </div>

                {sourceKind === "xtream" && (
                  <>
                    <div className="field">
                      <label htmlFor="source-user">Usuario</label>
                      <input
                        id="source-user"
                        className="input"
                        value={sourceUser}
                        onChange={(event) => setSourceUser(event.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="source-pass">Password</label>
                      <input
                        id="source-pass"
                        className="input"
                        type="password"
                        value={sourcePass}
                        onChange={(event) => setSourcePass(event.target.value)}
                        autoComplete="new-password"
                        placeholder={editingId ? "Dejar vacío para conservar" : ""}
                      />
                    </div>
                  </>
                )}

                {sourceKind === "addon" && (
                  <>
                    <div className="field">
                      <label htmlFor="source-catalog">Catalog ID</label>
                      <input
                        id="source-catalog"
                        className="input"
                        value={sourceCatalog}
                        onChange={(event) => setSourceCatalog(event.target.value)}
                        placeholder="ej. sports"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="source-catalog-type">Tipo de catálogo</label>
                      <input
                        id="source-catalog-type"
                        className="input"
                        value={sourceCatalogType}
                        onChange={(event) => setSourceCatalogType(event.target.value)}
                        placeholder="sports"
                      />
                    </div>
                  </>
                )}

                <div className="field">
                  <label htmlFor="source-group">Filtro de grupo (opcional)</label>
                  <input
                    id="source-group"
                    className="input"
                    value={sourceGroup}
                    onChange={(event) => setSourceGroup(event.target.value)}
                    placeholder="Deportes"
                  />
                </div>
                <div className="field">
                  <label htmlFor="source-priority">Prioridad</label>
                  <input
                    id="source-priority"
                    className="input"
                    inputMode="numeric"
                    value={sourcePriority}
                    onChange={(event) => setSourcePriority(event.target.value.replace(/\D/g, ""))}
                  />
                  <small>Menor = se lista antes</small>
                </div>
              </div>

              <label className="checkbox">
                <input type="checkbox" checked={sourceEnabled} onChange={(event) => setSourceEnabled(event.target.checked)} />
                Fuente activa
              </label>

              {testResult && (
                <div className={testResult.ok ? "form-ok" : "form-error"}>
                  {testResult.ok ? "Responde" : "No responde"} · {testResult.kind} · {testResult.ttfbMs} ms
                  {testResult.edgeAgeS != null ? ` · delay ~${Math.round(testResult.edgeAgeS)} s` : ""}
                  {testResult.error ? ` · ${testResult.error}` : ""}
                </div>
              )}

              <div className="field-row">
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {editingId ? "Guardar cambios" : "Agregar fuente"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void testSource()} disabled={busy}>
                  Probar URL
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {tab === "addons" && (
        <div className="admin-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Addons de VOD</h2>
                <p>Cinemeta solo aporta carátulas y sinopsis. Para reproducir hace falta un addon de streams.</p>
              </div>
              <span className="tag">{addons?.length ?? 0} addons</span>
            </div>
            {addons && addons.length > 0 && !addons.some((addon) => addon.kind === "vod" && addon.enabled) && (
              <div className="panel-body" style={{ paddingBottom: 0 }}>
                <div className="empty-inline">
                  <span className="empty-icon">
                    <IconAlert size={18} />
                  </span>
                  <div>
                    <h3>Falta un addon de streams</h3>
                    <p>
                      Los addons <strong>meta</strong> solo dan metadata: por eso “Ver ahora” dice
                      “Sin fuentes”. Agregá abajo un addon de tipo <strong>vod</strong> (tu propio
                      servicio, un addon privado o uno que tengas derecho a usar) y volvé a abrir el
                      título.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="panel-body" style={{ paddingBottom: 0 }}>
              <div className="empty-inline">
                <span className="empty-icon">
                  <IconSettings size={18} />
                </span>
                <div>
                  <h3>Cómo queda cada addon operativo</h3>
                  <p>
                    El manifest público de un proveedor responde 200 pero devuelve 404 en cada uso
                    hasta que iniciás sesión en su web. Con tu sesión, el proveedor te da un
                    manifest propio: copiá esa URL en <strong>Manifest</strong> (fila del addon) y
                    guardala. La app valida el manifest antes de aceptarlo.
                  </p>
                  <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    <li>
                      <strong>Subtítulos</strong> (SubSource, SubDL, Community Subtitles, SubSense,
                      OpenSubtitles PRO): entrá al proveedor, iniciá sesión y copiá el manifest con
                      tus credenciales. OpenSubtitles v3 ya funciona sin cuenta.
                    </li>
                    <li>
                      <strong>Sports Streams</strong> (pestaña Fuentes en vivo): el manifest con la
                      verificación del proveedor; pegalo en la fuente, en <strong>Editar</strong> →
                      Manifest URL.
                    </li>
                    <li>
                      <strong>Streams VOD</strong> (Torrentio, AIOStreams): el manifest tiene que
                      llevar tu token de un servicio de descarga (debrid). Sin ese token el addon
                      devuelve <code>infoHash</code> y el navegador no puede abrirlo.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="data-list">
              {addons === null ? (
                <div className="panel-body">
                  <p className="muted">Cargando…</p>
                </div>
              ) : addons.length === 0 ? (
                <div className="panel-body">
                  <p className="muted">No hay addons. Agregá uno con manifest.json.</p>
                </div>
              ) : (
                addons.map((addon) => {
                  const diag = diagnostics?.find((item) => item.id === addon.id);
                  const editing = editingAddonId === addon.id;
                  return (
                    <div className="data-row" key={addon.id}>
                      <div className="data-main">
                        <strong>
                          {addon.name}{" "}
                          <span className={`tag ${addon.enabled ? "tag-on" : "tag-off"}`}>
                            {addon.enabled ? "activo" : "pausado"}
                          </span>{" "}
                          <span className="tag">{addon.kind}</span>{" "}
                          {diag && !diag.manifestOk && (
                            <span className="tag tag-off">manifest caído</span>
                          )}
                          {diag?.needsConfiguration && (
                            <span className="tag tag-off">pide configuración</span>
                          )}
                          {diag?.manifestOk && !diag.needsConfiguration && (
                            <span className="tag tag-on">ok</span>
                          )}
                        </strong>
                        <span>{addon.url}</span>
                        {diag?.error && <span className="muted">{diag.error}</span>}
                      </div>
                      <div className="data-actions">
                        {diag?.configureUrl && (
                          <a
                            className="btn btn-ghost btn-xs"
                            href={diag.configureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Configurar ↗
                          </a>
                        )}
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => (editing ? setEditingAddonId(null) : startEditAddon(addon))}
                          disabled={busy}
                        >
                          Manifest
                        </button>
                        <button className="btn btn-ghost btn-xs" onClick={() => void toggleAddon(addon)} disabled={busy}>
                          {addon.enabled ? "Pausar" : "Activar"}
                        </button>
                        <button className="btn btn-ghost btn-xs" onClick={() => void removeAddon(addon)} disabled={busy}>
                          <IconTrash size={13} />
                        </button>
                      </div>
                      {editing && (
                        <form className="panel-body" onSubmit={saveAddonEdit} style={{ gridColumn: "1 / -1" }}>
                          <div className="field">
                            <label htmlFor={`addon-url-${addon.id}`}>Manifest URL (el personal, con tu cuenta)</label>
                            <input
                              id={`addon-url-${addon.id}`}
                              className="input"
                              value={addonEditUrl}
                              onChange={(event) => setAddonEditUrl(event.target.value)}
                              spellCheck={false}
                            />
                            <small>
                              El manifest público responde 200 pero devuelve 404 en cada uso hasta que
                              iniciás sesión en el proveedor. Pegá acá la URL que te da el
                              proveedor y el addon queda operativo.
                            </small>
                          </div>
                          <div className="field">
                            <label htmlFor={`addon-name-${addon.id}`}>Nombre</label>
                            <input
                              id={`addon-name-${addon.id}`}
                              className="input"
                              value={addonEditName}
                              onChange={(event) => setAddonEditName(event.target.value)}
                            />
                          </div>
                          <div className="field-row">
                            <button className="btn btn-primary" type="submit" disabled={busy}>
                              Guardar manifest
                            </button>
                            <button className="btn btn-ghost" type="button" onClick={() => setEditingAddonId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <aside className="panel">
            <div className="panel-head">
              <h2>Agregar addon</h2>
            </div>
            <form className="panel-body" onSubmit={submitAddon}>
              <div className="field">
                <label htmlFor="addon-url">Manifest URL</label>
                <input
                  id="addon-url"
                  className="input"
                  value={addonUrl}
                  onChange={(event) => setAddonUrl(event.target.value)}
                  placeholder="https://…/manifest.json"
                  spellCheck={false}
                  required
                />
                <small>Se valida el manifest antes de guardar. Sin addons de piratería.</small>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="addon-kind">Rol</label>
                  <select
                    id="addon-kind"
                    className="select"
                    value={addonKind}
                    onChange={(event) => setAddonKind(event.target.value as AddonKind)}
                  >
                    {ADDON_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="addon-name">Nombre (opcional)</label>
                  <input
                    id="addon-name"
                    className="input"
                    value={addonName}
                    onChange={(event) => setAddonName(event.target.value)}
                    placeholder="Se toma del manifest"
                  />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                <IconPlus size={16} /> Agregar addon
              </button>
            </form>
          </aside>
        </div>
      )}

      {tab === "health" && (
        <>
          <div className="stats-grid" style={{ marginBottom: 18 }}>
            <div className="stat-card">
              <strong>{health?.totalChannels ?? "—"}</strong>
              <span>canales en vivo</span>
            </div>
            <div className="stat-card">
              <strong>{health?.sources.length ?? "—"}</strong>
              <span>fuentes</span>
            </div>
            <div className="stat-card">
              <strong>{health?.addons ?? "—"}</strong>
              <span>addons</span>
            </div>
            <div className="stat-card">
              <strong>{health?.links ?? "—"}</strong>
              <span>links activos</span>
            </div>
          </div>

          {health?.network && (
            <section className="panel" style={{ marginBottom: 18 }}>
              <div className="panel-head">
                <div>
                  <h2>Salida de red</h2>
                  <p>Algunos proveedores atan el stream a la IP que pidió el token.</p>
                </div>
                <span className={`tag ${health.network.stable ? "tag-on" : "tag-off"}`}>
                  {health.network.stable ? "IP fija" : `${health.network.distinct} IPs`}
                </span>
              </div>
              <div className="panel-body">
                <p className="muted">{health.network.note}</p>
                {health.network.ips.length > 0 && (
                  <p className="muted" style={{ wordBreak: "break-all" }}>{health.network.ips.join(" · ")}</p>
                )}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Salud por fuente</h2>
                <p>Últimas 24 h de chequeos: tasa de respuesta, TTFB y delay de borde.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => void refresh("health")} disabled={loading}>
                <IconRefresh size={14} /> Reanalizar
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fuente</th>
                    <th>Tipo</th>
                    <th>Canales</th>
                    <th>Chequeos</th>
                    <th>OK</th>
                    <th>TTFB</th>
                    <th>Delay borde</th>
                    <th>Último</th>
                  </tr>
                </thead>
                <tbody>
                  {(health?.sources ?? []).map((source) => (
                    <tr key={source.id}>
                      <td>
                        {source.name}{" "}
                        {!source.enabled && <span className="tag tag-off">pausada</span>}
                      </td>
                      <td>{source.kind}</td>
                      <td className="num">{source.channels}</td>
                      <td className="num">{source.checks}</td>
                      <td className="num">{source.okRate === null ? "—" : `${source.okRate}%`}</td>
                      <td className="num">{source.avgTtfbMs === null ? "—" : `${source.avgTtfbMs} ms`}</td>
                      <td className="num">
                        {source.maxEdgeAgeS === null ? "—" : `${Math.round(source.maxEdgeAgeS)} s`}
                      </td>
                      <td>{timeAgo(source.lastCheck)}</td>
                    </tr>
                  ))}
                  {(health?.sources.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={8} className="muted">
                        Todavía no hay chequeos. Abrí un canal para generar métricas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-body">
              <h2 style={{ fontSize: 15 }}>Cómo leer esto</h2>
              <p className="muted" style={{ fontSize: 12.5 }}>
                TTFB mide cuánto tarda el origen en responder. El delay de borde es la distancia
                entre el último segmento publicado y el vivo real: cuanto más chico, más cerca del
                partido. Fubol ordena por ambos y por estabilidad. Si una fuente falla, el
                reproductor salta a la siguiente sin que tengas que hacer nada.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
