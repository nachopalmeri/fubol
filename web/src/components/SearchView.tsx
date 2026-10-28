"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddonMetaPreview } from "@/lib/addons";
import { PosterCard } from "./PosterRow";
import { IconAlert, IconSearch, IconSpark } from "./icons";

interface SearchResult {
  meta: AddonMetaPreview;
  addonId: string;
  addonName: string;
}

export default function SearchView({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery.trim());
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = initialQuery.trim();
    setSubmitted(trimmed);
    setQuery(initialQuery);
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vod/search?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "La búsqueda falló");
        if (!controller.signal.aborted) setResults(body.results ?? []);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "La búsqueda falló");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialQuery]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    setSubmitted(trimmed);
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }
    router.replace(`/buscar?q=${encodeURIComponent(trimmed)}`);
  };

  const movies = (results ?? []).filter((result) => result.meta.type === "movie");
  const series = (results ?? []).filter((result) => result.meta.type === "series");
  const others = (results ?? []).filter(
    (result) => result.meta.type !== "movie" && result.meta.type !== "series",
  );

  return (
    <>
      <section className="search-hero">
        <span className="eyebrow">
          <IconSpark size={14} /> Catálogo
        </span>
        <h1>¿Qué querés ver hoy?</h1>
        <p>
          Buscamos en los addons que configuró el administrador. Los resultados traen fuentes y
          subtítulos; el reproductor elige la mejor y sincroniza el VOSE.
        </p>
        <form className="search-form" onSubmit={submit} role="search">
          <div className="channel-search">
            <IconSearch size={19} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Una película, una serie, un documental…"
              aria-label="Buscar película o serie"
              autoFocus
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>
        <p className="search-hint">
          Atajo: <kbd>/</kbd> abre esta búsqueda desde cualquier pantalla. Mínimo 2 letras.
        </p>
      </section>

      {error && (
        <div className="empty-state" style={{ marginTop: 28 }}>
          <IconAlert size={26} />
          <h2>No pudimos buscar</h2>
          <p>{error}</p>
        </div>
      )}

      {!error && loading && (
        <div className="watch-loading" style={{ marginTop: 28 }}>
          <div className="spinner" />
          <p>Consultando addons…</p>
          <small>Se buscan varias fuentes en paralelo; puede tardar unos segundos.</small>
        </div>
      )}

      {!error && !loading && results !== null && results.length === 0 && (
        <div className="empty-state" style={{ marginTop: 28 }}>
          <IconSearch size={28} />
          <h2>Sin resultados para “{submitted}”</h2>
          <p>
            Probá con el título original o más corto. Si no aparece nada, puede que ningún addon
            tenga catálogo de búsqueda habilitado.
          </p>
        </div>
      )}

      {!error && !loading && results === null && (
        <div className="empty-state" style={{ marginTop: 28 }}>
          <IconSearch size={28} />
          <h2>Buscá por título</h2>
          <p>
            Escribí al menos dos letras. También podés recorrer los catálogos desde Inicio,
            Películas o Series.
          </p>
        </div>
      )}

      {movies.length > 0 && (
        <section className="result-group">
          <h2>Películas · {movies.length}</h2>
          <div className="result-grid">
            {movies.map((result) => (
              <PosterCard key={`movie:${result.meta.id}`} meta={result.meta} />
            ))}
          </div>
        </section>
      )}

      {series.length > 0 && (
        <section className="result-group">
          <h2>Series · {series.length}</h2>
          <div className="result-grid">
            {series.map((result) => (
              <PosterCard key={`series:${result.meta.id}`} meta={result.meta} />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="result-group">
          <h2>Otros · {others.length}</h2>
          <div className="result-grid">
            {others.map((result) => (
              <PosterCard key={`${result.meta.type}:${result.meta.id}`} meta={result.meta} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
