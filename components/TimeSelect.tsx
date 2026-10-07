"use client";

/** "19:30" -> "7:30 PM" */
function label(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Every 15 minutes from 10:00 AM to 11:45 PM.
const SLOTS = Array.from({ length: (24 - 10) * 4 }, (_, i) => {
  const minutes = 10 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** A time picker in 15-minute steps (no 7:27). Values are "HH:MM", or "" for none when allowed. */
export function TimeSelect({
  value,
  onChange,
  ariaLabel,
  noneLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Adds a first "no time" choice with this label (value ""). */
  noneLabel?: string;
  className?: string;
}) {
  // A value from before (or off the grid) still shows rather than silently changing.
  const slots = value && !SLOTS.includes(value) ? [...SLOTS, value].sort() : SLOTS;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-accent ${className}`}
    >
      {noneLabel !== undefined && <option value="">{noneLabel}</option>}
      {slots.map((t) => (
        <option key={t} value={t}>
          {label(t)}
        </option>
      ))}
    </select>
  );
}
