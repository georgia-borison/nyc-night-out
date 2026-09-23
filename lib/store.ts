import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Itinerary, SavedPlan, Trip } from "./schema";

const FILE = path.join(process.cwd(), "data", "plans.json");

async function readAll(): Promise<SavedPlan[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(plans: SavedPlan[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(plans, null, 2));
}

export async function listPlans() {
  const plans = await readAll();
  return plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPlan(id: string) {
  return (await readAll()).find((p) => p.id === id) ?? null;
}

export async function savePlan(trip: Trip, itinerary: Itinerary) {
  const plans = await readAll();
  const plan: SavedPlan = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    trip,
    itinerary,
  };
  plans.push(plan);
  await writeAll(plans);
  return plan;
}

export async function deletePlan(id: string) {
  const plans = await readAll();
  const next = plans.filter((p) => p.id !== id);
  if (next.length === plans.length) return false;
  await writeAll(next);
  return true;
}
