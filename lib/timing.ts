import type { PieceId, Trip } from "./schema";

// When each part of the night roughly happens, in minutes after the night starts.
export const OFFSET: Record<PieceId, number> = {
  pre_drinks: 0,
  dinner: 60,
  activity: 150,
  events: 150,
  post_drinks: 210,
  dancing: 270,
};

/** "19:30" -> 1170 */
export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight (possibly past 24h) to "HH:MM". */
export function clockOf(minutes: number) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * When each part of the night happens, in minutes after midnight. Normally
 * counted from the night's start; with a timed booking, from the booking
 * (drinks an hour before a 7:30 dinner, the show after it).
 */
export function targetMinutes(piece: PieceId, trip: NightTiming) {
  if (trip.booked?.time) return toMinutes(trip.booked.time) + OFFSET[piece] - OFFSET[trip.booked.piece];
  // The night starts with the first part they chose: with no pre-drinks, dinner is at the start time.
  const first = Math.min(OFFSET[piece], ...(trip.otherPieces ?? []).map((p) => OFFSET[p]));
  return toMinutes(trip.time) + OFFSET[piece] - first;
}

/** What timing needs: the start time, any booking, and which parts of the night they chose. */
export type NightTiming = Pick<Trip, "time" | "booked"> & { otherPieces?: readonly PieceId[] };

/** The planned time for a part of the night, rounded to the quarter hour ("19:30"). */
export function plannedClock(piece: PieceId, trip: NightTiming) {
  return clockOf(Math.round(targetMinutes(piece, trip) / 15) * 15);
}

/** "7:30 PM" -> "19:30", or null if it isn't a time. */
export function parseClock(text: string): string | null {
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0);
  return clockOf(h * 60 + Number(m[2] ?? 0));
}

/** Days from today in New York to a "YYYY-MM-DD" date (0 = tonight). */
export function daysUntil(date: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** "19:30" -> "7:30 PM" */
export function clockLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
