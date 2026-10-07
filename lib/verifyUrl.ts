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

/**
 * "ok": the venue's page. "bad": not its page. "closed": its page says it has
 * closed. "misplaced": its page gives a different address than Claude did.
 */
export type LinkStatus = "ok" | "bad" | "closed" | "misplaced";

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

// Street addresses in normalized page text: "107 eldridge street", "212 w 20th st", "2020 broadway".
const PAGE_ADDRESS =
  /\b(\d{1,5})(?: \d{1,5})? (?:(?:w|e|n|s|west|east|north|south) )?(?:[a-z0-9]+ ){0,2}?(?:st|street|ave|avenue|pl|place|blvd|boulevard|rd|road|ln|lane|sq|square)\b|\b(\d{1,5}) (?:broadway|bowery)\b/g;

/**
 * Whether the page's own address agrees with Claude's. "none" when the page
 * shows no street address (common on script-built sites) or Claude gave none.
 */
function addressOnPage(text: string, address: string): "match" | "mismatch" | "none" {
  const street = address.split(",").map((s) => s.trim()).find((s) => /^\d/.test(s));
  if (!street) return "none";
  const number = street.match(/^\d+/)![0];
  const key = streetWords(address)?.split(" ")[0];
  if (!key) return "none";
  const found = [...text.matchAll(PAGE_ADDRESS)];
  if (!found.length) return "none";
  return found.some((m) => (m[1] ?? m[2]) === number && m[0].includes(key)) ? "match" : "mismatch";
}

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

/** The page's readable text: meta tags, title and body, decoded and normalized. */
async function pageText(res: Response) {
  const html = await readText(res);
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  return normalize(decodeEntities(`${metaText(html)} ${body}`));
}

/** The host a request ended up on after redirects, without "www.". */
function landedHost(res: Response, url: string) {
  return new URL(res.url || url).hostname.replace(/^www\./, "");
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

  // A blocked or broken page proves nothing: dead domains answer 403 too
  // (yunnankitchen.com), so the venue has to pass the map check instead.
  if (!res.ok) return "bad";

  const text = await pageText(res);
  // The site's own domain naming the venue counts too (script-built pages can be
  // nearly empty). Judge the domain the link lands on, not the one it starts on:
  // motherofpearlnyc.com now redirects to a gambling site.
  const landed = landedHost(res, url);
  const hostNames = namesVenue(words, (w) => landed.replace(/[^a-z0-9]/g, "").includes(w));
  if (!hostNames && !namesVenue(words, (w) => text.includes(w))) return "bad";
  if (CLOSED.test(text)) return "closed";
  // The site lists its address and it isn't the one Claude gave (The Flower
  // Shop is on Eldridge St, not in Chelsea): the place isn't where we'd send people.
  if (addressOnPage(text, address) === "mismatch") return "misplaced";

  // And it must be the New York one, not a namesake elsewhere.
  if (hostNames && LOCAL_HOST.test(landed.split(".")[0])) return "ok";
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
  const key = `${url}|${name}|${address}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = check(url, name, address, placeNames(area, neighborhood)).catch((): LinkStatus => "bad");
    cache.set(key, hit);
  }
  return hit;
}

/**
 * Checks venues' links, up to 6 at a time. Returns the names whose link isn't
 * their page (bad), those whose own page says they've closed (closed), and
 * those whose page gives a different address (misplaced).
 */
export async function checkLinks(
  items: { name: string; url: string; address: string; neighborhood?: string }[],
  area: string,
): Promise<{ bad: string[]; closed: string[]; misplaced: string[] }> {
  const bad: string[] = [];
  const closed: string[] = [];
  const misplaced: string[] = [];
  const queue = items.filter((i) => i.url);
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const status = await verifyVenueUrl(item.url, item.name, item.address, area, item.neighborhood);
        if (status === "bad") bad.push(item.name);
        if (status === "closed") closed.push(item.name);
        if (status === "misplaced") misplaced.push(item.name);
      }
    }),
  );
  return { bad, closed, misplaced };
}

// ---- Links from Google's listings ----

export type LinkKind = "website" | "instagram" | "tickets" | "maps";

const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "linktr.ee", "tiktok.com"];
const TICKET_HOSTS = [
  "eventbrite.com", "dice.fm", "ticketmaster.com", "seetickets.us", "axs.com", "ticketweb.com", "showclix.com",
  "tixr.com", "ra.co", "songkick.com", "etix.com", "venuepilot.co", "ticketleap.com",
];
// Online-ordering pages: a menu to order from, not the venue's site.
const ORDERING_HOSTS = [
  "toasttab.com", "chownow.com", "doordash.com", "grubhub.com", "seamless.com", "ubereats.com", "slicelife.com",
  "menufy.com", "order.online", "beyondmenu.com", "clover.com", "spoton.com", "menupages.com", "allmenus.com",
];

const onHost = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Drops tracking junk ("?utm_source=google&utm_medium=organic…") from a link. */
export function cleanUrl(url: string) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|y_source$|ref$|g_mp$)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** What kind of page a link is, for its label on the card. */
export function linkKindOf(url: string): LinkKind {
  const host = hostOf(url);
  if (onHost(host, ["instagram.com"])) return "instagram";
  if (onHost(host, TICKET_HOSTS)) return "tickets";
  if (onHost(host, ["google.com", "maps.google.com", "goo.gl"]) && /maps|cid=/.test(url)) return "maps";
  return "website";
}

// Google adds the branch to chain names ("Mountain House East Village") that
// the venue's own site doesn't repeat ("Szechuan Mountain House").
const BRANCH_WORDS = new Set([
  "east", "west", "north", "south", "upper", "lower", "side", "village", "midtown", "downtown", "uptown", "chelsea",
  "soho", "noho", "nolita", "tribeca", "flatiron", "nomad", "gramercy", "murray", "hill", "harlem", "williamsburg",
  "greenpoint", "bushwick", "astoria", "brooklyn", "manhattan", "queens", "bronx", "fidi", "seaport", "park", "slope",
  "square", "union", "bryant", "times", "heights", "les", "ues", "uws", "hells", "kitchen", "city", "long", "island",
]);
function branchless(words: string[]) {
  const core = words.filter((w) => !BRANCH_WORDS.has(w));
  return core.length ? core : words;
}

const listedCache = new Map<string, Promise<boolean>>();

/**
 * Whether a website from Google's listing still works and is still the
 * venue's. Google knows where the venue is, so unlike check() this doesn't
 * look for an address; it catches dead sites, lapsed domains taken over by
 * someone else, and ordering pages. Sites that block robots (403/429/503)
 * are kept: they load fine in a browser (the Met, Gotham Comedy Club).
 */
export function checkListedSite(url: string, name: string): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  const key = `${url}|${name}`;
  let hit = listedCache.get(key);
  if (!hit) {
    hit = (async () => {
      const host = hostOf(url);
      if (!host || !/^https?:/i.test(url)) return false;
      if (onHost(host, ORDERING_HOSTS)) return false;
      if (onHost(host, SOCIAL_HOSTS)) return true; // they block robots; Google's link to them is fine
      let res: Response;
      try {
        res = await fetch(url, {
          redirect: "follow",
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        return false; // DNS failure, timeout, bad TLS
      }
      if (res.status === 403 || res.status === 429 || res.status === 503) return true;
      if (!res.ok) return false;
      const landed = landedHost(res, url);
      if (onHost(landed, ORDERING_HOSTS)) return false;
      const words = branchless(nameWords(name));
      const text = await pageText(res);
      // Named by the page or by the domain it lands on (not the one it started on).
      return (
        namesVenue(words, (w) => text.includes(w)) ||
        namesVenue(words, (w) => landed.replace(/[^a-z0-9]/g, "").includes(w))
      );
    })().catch(() => false);
    listedCache.set(key, hit);
  }
  return hit;
}
