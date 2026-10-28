export interface HlsVariant {
  uri: string;
  bandwidth: number;
  width?: number;
  height?: number;
  codecs?: string;
  frameRate?: number;
}

export interface HlsSegment {
  uri: string;
  duration: number;
  pdt?: number;
  byteRange?: string;
}

export interface HlsPlaylist {
  isMaster: boolean;
  variants: HlsVariant[];
  segments: HlsSegment[];
  targetDuration: number | null;
  mediaSequence: number;
  endList: boolean;
  live: boolean;
  lowLatency: boolean;
  partTarget: number | null;
  holdBack: number | null;
  edgeAgeS: number | null;
  height: number | null;
  bitrate: number | null;
}

function attrsOf(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const key = match[1]?.toUpperCase();
    const value = match[2]?.replace(/^"|"$/g, "");
    if (key && value !== undefined) attrs[key] = value;
  }
  return attrs;
}

function resolveUri(uri: string, baseUrl: string): string {
  try {
    return new URL(uri.trim(), baseUrl).toString();
  } catch {
    return uri.trim();
  }
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Parses a master or media HLS playlist. This is a tolerant parser: providers
 * emit non-standard tags, so unknown lines are ignored instead of failing.
 */
export function parseHlsPlaylist(text: string, baseUrl: string, now = Date.now()): HlsPlaylist {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const variants: HlsVariant[] = [];
  const segments: HlsSegment[] = [];
  let targetDuration: number | null = null;
  let mediaSequence = 0;
  let endList = false;
  let partTarget: number | null = null;
  let holdBack: number | null = null;
  let pendingInf: number | null = null;
  let pendingPdt: number | undefined;
  let pendingRange: string | undefined;
  let pendingVariant: Partial<HlsVariant> | null = null;
  let hasParts = false;

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = attrsOf(line);
      pendingVariant = {
        bandwidth: Number(attrs.BANDWIDTH ?? 0) || 0,
        codecs: attrs.CODECS,
        frameRate: attrs["FRAME-RATE"] ? Number(attrs["FRAME-RATE"]) : undefined,
      };
      const resolution = attrs.RESOLUTION;
      if (resolution) {
        const [width, height] = resolution.split("x").map(Number);
        if (width && height) {
          pendingVariant.width = width;
          pendingVariant.height = height;
        }
      }
      continue;
    }

    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      targetDuration = Number(line.split(":")[1]) || null;
      continue;
    }

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = Number(line.split(":")[1]) || 0;
      continue;
    }

    if (line.startsWith("#EXT-X-PART-INF:")) {
      const attrs = attrsOf(line);
      partTarget = attrs["PART-TARGET"] ? Number(attrs["PART-TARGET"]) : null;
      hasParts = true;
      continue;
    }

    if (line.startsWith("#EXT-X-SERVER-CONTROL:")) {
      const attrs = attrsOf(line);
      holdBack = attrs["PART-HOLD-BACK"] ? Number(attrs["PART-HOLD-BACK"]) : null;
      if (attrs["CAN-BLOCK-RELOAD"] === "YES") hasParts = true;
      continue;
    }

    if (line.startsWith("#EXT-X-PART:")) {
      hasParts = true;
      continue;
    }

    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      pendingPdt = parseDate(line.split(":").slice(1).join(":").trim());
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      const value = Number(line.slice("#EXTINF:".length).split(",")[0]);
      pendingInf = Number.isFinite(value) ? value : null;
      continue;
    }

    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      pendingRange = line.split(":")[1];
      continue;
    }

    if (line === "#EXT-X-ENDLIST") {
      endList = true;
      continue;
    }

    if (line.startsWith("#")) continue;

    const uri = resolveUri(line, baseUrl);
    if (pendingVariant) {
      variants.push({ ...pendingVariant, uri, bandwidth: pendingVariant.bandwidth ?? 0 } as HlsVariant);
      pendingVariant = null;
      continue;
    }
    if (pendingInf !== null) {
      segments.push({ uri, duration: pendingInf, pdt: pendingPdt, byteRange: pendingRange });
      pendingInf = null;
      pendingPdt = undefined;
      pendingRange = undefined;
    }
  }

  const isMaster = variants.length > 0 && segments.length === 0;
  let edgeAgeS: number | null = null;

  if (segments.length > 0) {
    let lastEdge: number | null = null;
    let trailing = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];
      if (!segment) continue;
      trailing += segment.duration;
      if (segment.pdt !== undefined) {
        lastEdge = (segment.pdt + trailing * 1000) / 1000;
        break;
      }
    }
    if (lastEdge !== null) {
      edgeAgeS = Math.max(0, now / 1000 - lastEdge);
    }
  }

  const bestVariant = [...variants].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  const bitrate = bestVariant?.bandwidth ?? null;

  return {
    isMaster,
    variants,
    segments,
    targetDuration,
    mediaSequence,
    endList,
    live: !endList && segments.length > 0,
    lowLatency: hasParts,
    partTarget,
    holdBack,
    edgeAgeS,
    height: bestVariant?.height ?? null,
    bitrate,
  };
}

export function selectVariant(variants: HlsVariant[], maxHeight = 1080): HlsVariant | undefined {
  const usable = variants.filter((variant) => (variant.height ?? 0) <= maxHeight);
  const pool = usable.length ? usable : variants;
  return [...pool].sort((a, b) => {
    const heightDiff = (b.height ?? 0) - (a.height ?? 0);
    if (heightDiff !== 0) return heightDiff;
    return b.bandwidth - a.bandwidth;
  })[0];
}

/**
 * Rewrites every resource reference so the browser never talks to the origin
 * directly: segments, keys, init maps, renditions and LL-HLS parts.
 */
export function rewritePlaylist(
  text: string,
  baseUrl: string,
  mapUrl: (absolute: string) => string,
): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          return `URI="${mapUrl(resolveUri(uri, baseUrl))}"`;
        });
      }
      return mapUrl(resolveUri(trimmed, baseUrl));
    })
    .join("\n");
}
