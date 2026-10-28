"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconRefresh, IconSearch, IconTv } from "./icons";

interface ChannelItem {
  id: string;
  name: string;
  group: string;
  logo?: string;
  sourceName: string;
  kind: string;
}

interface ChannelsResponse {
  total: number;
  channels: ChannelItem[];
  error?: string;
}

export default function ChannelBrowser() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ limit: "200" });
        if (query.trim()) params.set("q", query.trim());
        fetch(`/api/live/channels?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then(async (response) => {
            const body = (await response.json()) as ChannelsResponse;
            if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los canales");
            if (!controller.signal.aborted) setData(body);
          })
          .catch((reason: unknown) => {
            if (controller.signal.aborted) return;
            setError(reason instanceof Error ? reason.message : "No se pudieron cargar los canales");
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query ? 280 : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, nonce]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const channel of data?.channels ?? []) {
      counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [data]);

  const visible = useMemo(
    () => (data?.channels ?? []).filter((channel) => (group ? channel.group === group : true)),
    [data, group],
  );

  return (
    <section className="channel-browser">
      <div className="channel-toolbar">
        <div className="channel-search">
          <IconSearch size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setGroup(null);
              setQuery(event.target.value);
            }}
            placeholder="Buscar canal o grupo…"
            aria-label="Buscar canal"
          />
        </div>
        <button className="icon-btn" onClick={() => setNonce((value) => value + 1)} aria-label="Recargar canales">
          <IconRefresh size={17} />
        </button>
      </div>

      {groups.length > 1 && (
        <div className="group-chips">
          <button className="group-chip" data-active={group === null} onClick={() => setGroup(null)}>
            Todos
          </button>
          {groups.map(([name, count]) => (
            <button
              key={name}
              className="group-chip"
              data-active={group === name}
              onClick={() => setGroup(group === name ? null : name)}
            >
              {name} · {count}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="empty-state" style={{ border: 0, padding: "28px 12px" }}>
          <p>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setNonce((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      ) : loading && !data ? (
        <div className="watch-loading" style={{ minHeight: 220, border: 0, background: "transparent" }}>
          <div className="spinner" />
          <p>Cargando canales…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state" style={{ border: 0, padding: "28px 12px" }}>
          <IconTv size={26} />
          <p>
            {data?.total === 0
              ? "Todavía no hay fuentes de vivo configuradas."
              : "No encontramos canales con esa búsqueda."}
          </p>
        </div>
      ) : (
        <>
          <div className="channel-grid">
            {visible.map((channel) => (
              <Link key={channel.id} href={`/watch/live/${channel.id}`} className="channel-card">
                <span className="channel-logo">
                  {channel.logo ? (
                    <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    channel.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="channel-meta">
                  <strong>{channel.name}</strong>
                  <span>
                    {channel.group} · {channel.sourceName}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="channel-note">
            {visible.length} de {data?.total ?? 0} canales
            {query ? ` para “${query}”` : ""}. Al abrir uno se prueban las fuentes en paralelo.
          </p>
        </>
      )}
    </section>
  );
}
