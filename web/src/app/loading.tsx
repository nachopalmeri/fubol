export default function Loading() {
  return (
    <main className="shell">
      <div className="watch-loading" style={{ marginTop: 40 }}>
        <div className="spinner" />
        <p>Cargando Fubol…</p>
        <small>Buscando la agenda y las señales configuradas.</small>
      </div>
    </main>
  );
}
