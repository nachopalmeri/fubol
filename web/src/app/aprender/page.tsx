import type { Metadata } from "next";
import Link from "next/link";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aprender inglés", description: "Práctica deliberada con escenas, escucha y subtítulos." };

export default async function LearnPage() {
  await requirePageSession("vod");
  return <main className="shell">
    <header className="page-head"><div><span className="eyebrow">Escuchar. Repetir. Recordar.</span><h1>Tu inglés, escena por escena.</h1><p>No alcanza con dejar una serie de fondo. Usá escenas cortas, escuchá con intención y volvé a las expresiones que querés incorporar.</p></div></header>
    <section className="section" aria-labelledby="routine-title">
      <div className="section-head"><div><h2 id="routine-title">Una sesión de 20 minutos</h2><p>Elegí una escena con diálogo cotidiano, audio en inglés y una pista de subtítulos que corresponda a esa versión.</p></div></div>
      <ol className="learning-routine">
        <li><strong>5 min · Comprender.</strong> Mirá una escena y explicá con tus palabras qué pasó. En B1 podés apoyarte primero en español.</li>
        <li><strong>8 min · Escuchar.</strong> Repetí frases con subtítulos en inglés. Después ocultá el texto y tratá de reconocerlas solo con el audio.</li>
        <li><strong>4 min · Hablar.</strong> Repetí en voz alta imitando ritmo y entonación. Grabate por tu cuenta y compará, sin perseguir un acento perfecto.</li>
        <li><strong>3 min · Recuperar.</strong> Guardá hasta cinco expresiones útiles. Al día siguiente intentá usarlas sin mirar; exportalas a Anki si querés repasarlas.</li>
      </ol>
    </section>
    <section className="section" aria-labelledby="level-title"><div className="section-head"><div><h2 id="level-title">Menos ayuda a medida que avanzás</h2></div></div>
      <div className="fixture-grid">
        <article className="fixture-card"><h3>B1 · Entender lo esencial</h3><p>Contexto conocido, escenas de 30–60 segundos. Español solo como apoyo, luego inglés. Comprobá que podés contar la idea principal.</p></article>
        <article className="fixture-card"><h3>B2 · Seguir el diálogo</h3><p>Subtítulos en inglés, repetición de escenas y una segunda escucha sin texto. Buscá conectores, colocaciones y cómo cambia el registro.</p></article>
        <article className="fixture-card"><h3>C1 · Captar matices</h3><p>Escuchá primero sin texto. Explicá ironía, intención y significado implícito; contrastá con la transcripción y defendé tu interpretación.</p></article>
      </div>
    </section>
    <section className="section"><h2>En el reproductor</h2><p className="watch-note">Abrí un título disponible y activá «Learn English» debajo del video. Podés elegir una pista inglesa, repetir la frase actual y guardar expresiones en este navegador. Una pista de otra edición puede necesitar su propio ajuste de tiempo. No enviamos tus frases a un servicio de traducción.</p><p className="watch-note">El modo de práctica acompaña el estudio: no evalúa ni certifica un nivel CEFR. Para pasar de B1 a C1 también necesitás conversación, escritura y feedback.</p><div className="page-actions"><Link className="btn btn-primary" href="/buscar">Buscar algo disponible</Link><Link className="btn btn-ghost" href="/peliculas">Explorar películas</Link></div></section>
  </main>;
}
