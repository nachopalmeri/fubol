"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddonMetaPreview } from "@/lib/addons";
import { PosterCard } from "./PosterRow";
import { IconAlert, IconSearch } from "./icons";

interface SearchResult { meta: AddonMetaPreview; addonId: string; addonName: string }

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
    if (trimmed.length < 2) { setResults(null); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vod/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo completar la búsqueda.");
        if (!controller.signal.aborted) setResults(body.results ?? []);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo completar la búsqueda.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialQuery]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    setSubmitted(trimmed);
    if (trimmed.length < 2) { setResults(null); return; }
    router.replace(`/buscar?q=${encodeURIComponent(trimmed)}`);
  };
  const movies = (results ?? []).filter((result) => result.meta.type === "movie");
  const series = (results ?? []).filter((result) => result.meta.type === "series");
  const others = (results ?? []).filter((result) => result.meta.type !== "movie" && result.meta.type !== "series");

  return <>
    <section className="search-hero">
      <span className="eyebrow">Biblioteca familiar</span>
      <h1>¿Qué quieren ver?</h1>
      <p>Buscá por título. Mostramos únicamente resultados con una fuente de reproducción verificada.</p>
      <form className="search-form" onSubmit={submit} role="search">
        <div className="channel-search"><IconSearch size={19} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Película o serie" aria-label="Buscar película o serie" autoFocus /></div>
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
      </form>
      <p className="search-hint">Escribí al menos dos letras para buscar.</p>
    </section>
    {error && <div className="empty-state search-message" role="alert"><IconAlert size={26} /><h2>No pudimos buscar</h2><p>{error}</p></div>}
    {!error && loading && <div className="watch-loading search-message" role="status"><div className="spinner" /><p>Verificando títulos disponibles…</p></div>}
    {!error && !loading && results !== null && results.length === 0 && <div className="empty-state search-message"><IconSearch size={28} /><h2>Sin títulos disponibles para “{submitted}”</h2><p>No encontramos resultados reproducibles con las fuentes configuradas. Probá con el título original o una búsqueda más breve.</p></div>}
    {!error && !loading && results === null && <div className="empty-state search-message"><IconSearch size={28} /><h2>Buscá en tu biblioteca</h2><p>Ingresá un título para consultar qué está disponible.</p></div>}
    {movies.length > 0 && <section className="result-group"><h2>Películas · {movies.length}</h2><div className="result-grid">{movies.map((result) => <PosterCard key={`movie:${result.meta.id}`} meta={result.meta} />)}</div></section>}
    {series.length > 0 && <section className="result-group"><h2>Series · {series.length}</h2><div className="result-grid">{series.map((result) => <PosterCard key={`series:${result.meta.id}`} meta={result.meta} />)}</div></section>}
    {others.length > 0 && <section className="result-group"><h2>Otros · {others.length}</h2><div className="result-grid">{others.map((result) => <PosterCard key={`${result.meta.type}:${result.meta.id}`} meta={result.meta} />)}</div></section>}
  </>;
}
