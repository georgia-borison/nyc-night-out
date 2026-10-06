// Checks that a venue's "website" is really that venue. Claude recalls URLs
// from memory and domains lapse or get taken over (barciboenoteca.com is now
// an unrelated magazine), so a link must show the venue's name and place.

import { areaInfo } from "./neighborhoods";

const USER_AGENT =
  "Mozilla/5.0 (compatible; NightOutNYC/1.0; +https://nyc-night-out.vercel.app) link check";
const MAX_BYTES = 300_000;

// Words that don't identify a venue on their own.
const FILLER = new Set([
  "the", "a", "an", "and", "of", "at", "on", "in", "nyc", "ny", "new", "york", "restaurant", "restaurants",
  "bar", "cafe", "café", "club", "lounge", "kitchen", "house", "room", "co", "company",
]);

// Listing and booking sites often block automated requests; a URL there whose
// path names the venue is trusted without fetching.
const LISTING_HOSTS = [
  "resy.com", "opentable.com", "exploretock.com", "tock.com", "sevenrooms.com", "instagram.com",
  "theinfatuation.com", "eater.com", "timeout.com", "yelp.com", "google.com",
];

const PLACE_WORDS = ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx"];

// A venue's own page announcing it's gone ("Bar Boulud NYC - Permanently Closed").
const CLOSED = /\b(permanently closed|closed permanently|closed for good|permanently closing|closed its doors)\b/;

/** "ok": the venue's page. "bad": not its page. "closed": its page says it has closed. */
export type LinkStatus = "ok" | "bad" | "closed";

const cache = new Map<string, Promise<LinkStatus>>();

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words that identify a venue, e.g. "Barcibo Enoteca" -> ["barcibo", "enoteca"]. */
export function nameWords(name: string) {
  const words = normalize(name.replace(/\(.*?\)/g, " ")).split(" ").filter((w) => w.length > 1 && !FILLER.has(w));
  return words.length ? words : normalize(name).split(" ").filter(Boolean);
}

/**
 * Whether a page names the venue. Short names need every word ("Barcibo
 * Enoteca" fails on a page that only says "Barcibo"); longer names need the
 * first word and about two-thirds of the rest, since sites often shorten
 * them ("Smoke Jazz & Supper Club" calls itself "Smoke Jazz Club").
 */
function namesVenue(words: string[], has: (w: string) => boolean) {
  if (words.length <= 2) return words.every(has);
  return has(words[0]) && words.filter(has).length >= Math.ceil((words.length * 2) / 3);
}

/** Street name from an address, e.g. "2020 Broadway, New York" -> "broadway". */
function streetWords(address: string) {
  const street = address.split(",").map((s) => s.trim()).find((s) => /^\d/.test(s));
  if (!street) return null;
  const words = normalize(street).split(" ").slice(1).filter((w) => !/^(st|street|ave|avenue|rd|road|pl|place|blvd|w|e|n|s)$/.test(w));
  return words.length ? words.join(" ") : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", quot: '"', rsquo: "'", lsquo: "'", nbsp: " ", ndash: "-", mdash: "-", eacute: "é", egrave: "è",
};

/** "The Owl&#39;s Tail" -> "The Owl's Tail", so names with apostrophes or accents match. */
function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? " ";
  });
}

// Meta tags that name the venue even on pages whose body is built by scripts.
const META_NAMES = /^(og:title|og:site_name|og:description|description|twitter:title|twitter:description)$/i;

function metaText(html: string) {
  return (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((tag) => META_NAMES.test(tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ""))
    .map((tag) => tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i))
    .map((m) => m?.[1] ?? m?.[2] ?? "")
    .join(" ");
}

// A domain that names the city as well as the venue ("awashny.com") is local.
const LOCAL_HOST = /(nyc|newyork|manhattan|brooklyn|queens|bronx|ny$)/;

async function readText(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < MAX_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text;
}

async function check(url: string, name: string, address: string, places: string[]): Promise<LinkStatus> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "bad";
  }
  if (!/^https?:$/.test(parsed.protocol)) return "bad";

  const words = nameWords(name);
  const host = parsed.hostname.replace(/^www\./, "");
  const slug = normalize(decodeURIComponent(parsed.pathname));
  const compactHost = host.replace(/[^a-z0-9]/g, "");

  if (LISTING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return namesVenue(words, (w) => slug.includes(w)) ? "ok" : "bad";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return "bad"; // DNS failure, timeout, bad TLS.
  }

  // Bot protection on what is almost certainly the venue's own domain.
  if ((res.status === 403 || res.status === 429 || res.status === 503) && namesVenue(words, (w) => compactHost.includes(w))) {
    return "ok";
  }
  if (!res.ok) return "bad";

  const html = await readText(res);
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const text = normalize(decodeEntities(`${metaText(html)} ${body}`));
  // The site's own domain naming the venue counts too (script-built pages can be nearly empty).
  const hostNames = namesVenue(words, (w) => compactHost.includes(w));
  if (!hostNames && !namesVenue(words, (w) => text.includes(w))) return "bad";
  if (CLOSED.test(text)) return "closed";

  // And it must be the New York one, not a namesake elsewhere.
  const finalHost = new URL(res.url || url).hostname.replace(/^www\./, "").split(".")[0];
  if (hostNames && LOCAL_HOST.test(finalHost)) return "ok";
  const where = [...PLACE_WORDS, streetWords(address), ...places.map(normalize).filter((p) => p.length > 3)];
  return where.some((p) => p && text.includes(p)) ? "ok" : "bad";
}

/** Place names a venue's page might mention: its neighborhood, the area, and the area's parent. */
function placeNames(area: string, neighborhood?: string) {
  const info = areaInfo(area);
  return [neighborhood, area, info?.parent, ...area.split(/[/·]/)].filter(Boolean).map((p) => p!.trim());
}

/** Whether the URL is really this venue's page. Results are cached per process. */
export function verifyVenueUrl(
  url: string,
  name: string,
  address: string,
  area: string,
  neighborhood?: string,
): Promise<LinkStatus> {
  if (!url) return Promise.resolve("bad");
  const key = `${url}|${name}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = check(url, name, address, placeNames(area, neighborhood)).catch((): LinkStatus => "bad");
    cache.set(key, hit);
  }
  return hit;
}

/**
 * Checks venues' links, up to 6 at a time. Returns the names whose link isn't
 * their page (bad) and those whose own page says they've closed (closed).
 */
export async function checkLinks(
  items: { name: string; url: string; address: string; neighborhood?: string }[],
  area: string,
): Promise<{ bad: string[]; closed: string[] }> {
  const bad: string[] = [];
  const closed: string[] = [];
  const queue = items.filter((i) => i.url);
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const status = await verifyVenueUrl(item.url, item.name, item.address, area, item.neighborhood);
        if (status === "bad") bad.push(item.name);
        if (status === "closed") closed.push(item.name);
      }
    }),
  );
  return { bad, closed };
}
