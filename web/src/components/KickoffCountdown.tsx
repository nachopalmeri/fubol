"use client";

import { useEffect, useState } from "react";

/**
 * Relative time to kickoff. Renders nothing during SSR and on the first paint
 * so the server and the client never disagree about "now".
 */
export default function KickoffCountdown({
  kickoff,
  className,
}: {
  kickoff: number;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) return null;

  const diff = kickoff - now;
  if (diff <= 0) {
    return <span className={className}>Se juega ahora</span>;
  }

  const minutes = Math.round(diff / 60_000);
  const label =
    minutes < 60
      ? `Faltan ${minutes} min`
      : `Faltan ${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();

  return <span className={className}>{label}</span>;
}
