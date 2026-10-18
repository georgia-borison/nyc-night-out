import type { CalendarEvent } from "./google";
import type { Itinerary, Trip } from "./schema";
import { clockOf, parseClock, toMinutes } from "./timing";

const ZONE = "America/New_York";
// How long the night runs after arriving at the last stop.
const LAST_STOP_MINUTES = 90;

/** "2026-10-16" plus minutes after that midnight (may run past 24h) -> "2026-10-17T00:30:00". */
function localDateTime(date: string, minutes: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Math.floor(minutes / 1440));
  return `${day.toISOString().slice(0, 10)}T${clockOf(minutes)}:00`;
}

/**
 * The calendar event for a plan: from the first stop to 90 minutes after the
 * last, in New York time, with every stop (time, place, address, link) in the
 * description. Stops after midnight land on the next day.
 */
export function planToEvent(
  plan: { trip: Trip; itinerary: Itinerary },
  opts: { shareUrl: string; guests: string[]; note?: string },
): CalendarEvent {
  const { trip, itinerary } = plan;
  // Each stop's time in minutes, kept moving forward so 12:30 AM follows 11 PM.
  let prev = -1;
  const minutes = itinerary.stops.map((s) => {
    const clock = parseClock(s.time);
    let m = clock ? toMinutes(clock) : prev >= 0 ? prev + 60 : toMinutes(trip.time);
    while (prev >= 0 && m < prev) m += 1440;
    prev = m;
    return m;
  });
  const start = minutes[0] ?? toMinutes(trip.time);
  const end = (minutes.at(-1) ?? start) + LAST_STOP_MINUTES;

  const lines: string[] = [];
  if (opts.note?.trim()) lines.push(opts.note.trim(), "");
  if (itinerary.tagline) lines.push(itinerary.tagline, "");
  itinerary.stops.forEach((s, i) => {
    if (s.walk && i > 0) lines.push(`   🚶 ~${Math.max(1, Math.round(s.walk.minutes))} min walk`);
    lines.push(`${s.time} · ${s.piece}: ${s.name}`);
    if (s.address) lines.push(`   ${s.address}`);
    if (s.url) lines.push(`   ${s.url}`);
  });
  lines.push("", `Full plan and map: ${opts.shareUrl}`);

  return {
    summary: itinerary.title.trim() || "Night out",
    description: lines.join("\n"),
    location: itinerary.stops[0]?.address || undefined,
    start: { dateTime: localDateTime(trip.date, start), timeZone: ZONE },
    end: { dateTime: localDateTime(trip.date, end), timeZone: ZONE },
    attendees: opts.guests.map((email) => ({ email })),
  };
}
