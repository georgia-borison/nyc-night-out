import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import type { Itinerary, SavedPlan, Trip } from "./schema";

// Plans live in Upstash Redis when it's configured (on Vercel, added from the
// Storage tab), otherwise in a local JSON file for development.
const TTL_SECONDS = 60 * 60 * 24 * 365;

function redisFromEnv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
const redis = redisFromEnv();

// Vercel servers can't keep files, so without Redis there is nowhere to save.
export const canSave = Boolean(redis) || !process.env.VERCEL;

const FILE = path.join(process.cwd(), "data", "plans.json");

async function readFile(): Promise<SavedPlan[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

// Long and random: share links are public, so ids must not be guessable.
function newId() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}

export async function getPlan(id: string): Promise<SavedPlan | null> {
  if (!/^[a-z0-9]{6,24}$/.test(id)) return null;
  if (redis) return (await redis.get<SavedPlan>(`plan:${id}`)) ?? null;
  return (await readFile()).find((p) => p.id === id) ?? null;
}

/** Overwrite an existing plan, keeping its original expiry. */
export async function updatePlan(plan: SavedPlan): Promise<void> {
  if (redis) {
    await redis.set(`plan:${plan.id}`, plan, { keepTtl: true });
    return;
  }
  const plans = await readFile();
  const i = plans.findIndex((p) => p.id === plan.id);
  if (i === -1) return;
  plans[i] = plan;
  await fs.writeFile(FILE, JSON.stringify(plans, null, 2));
}

export async function savePlan(trip: Trip, itinerary: Itinerary): Promise<SavedPlan> {
  const plan: SavedPlan = { id: newId(), createdAt: new Date().toISOString(), trip, itinerary };
  if (redis) {
    await redis.set(`plan:${plan.id}`, plan, { ex: TTL_SECONDS });
  } else {
    const plans = await readFile();
    plans.push(plan);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(plans, null, 2));
  }
  return plan;
}
