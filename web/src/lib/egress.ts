import { cacheGet, cacheSet } from "./cache";

/**
 * Outbound IP of this deployment.
 *
 * Some providers (Sports Streams among them) mint stream tokens bound to the
 * IP that asked for them: the JWT carries the address, and a request from a
 * different one is rejected with "Stream already active on another device".
 * On a platform that rotates its egress addresses between requests, that
 * breaks the very first segment, so the panel has to be able to show it.
 */
const ECHO = "https://api.ipify.org?format=json";

export interface EgressInfo {
  /** Distinct addresses seen in the sample. */
  ips: string[];
  distinct: number;
  /** Same address on every sample: a provider that binds tokens to the IP works. */
  stable: boolean;
  note: string;
}

let last: { at: number; info: EgressInfo } | null = null;

export async function egressInfo(samples = 3): Promise<EgressInfo> {
  const cached = cacheGet<EgressInfo>("egress:info");
  if (cached) return cached;
  if (last && Date.now() - last.at < 30_000) return last.info;

  const ips: string[] = [];
  for (let index = 0; index < samples; index += 1) {
    try {
      const res = await fetch(`${ECHO}&n=${index}-${Date.now()}`, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { ip?: string };
      if (data.ip) ips.push(data.ip);
    } catch {
      // The echo service is a convenience, not a requirement.
    }
  }
  const distinct = new Set(ips).size;
  const stable = ips.length > 0 && distinct <= 1;
  const info: EgressInfo = {
    ips: [...new Set(ips)],
    distinct,
    stable,
    note: stable
      ? "La salida usa una sola IP: los proveedores que atan el stream a la IP funcionan."
      : `La salida rota entre ${distinct} IPs: los proveedores que atan el stream a la IP (Sports Streams) rechazan los tokens de otra instancia.`,
  };
  last = { at: Date.now(), info };
  cacheSet("egress:info", info, 60_000);
  return info;
}
