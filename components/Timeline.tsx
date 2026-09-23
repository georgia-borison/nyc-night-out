import type { Itinerary } from "@/lib/schema";

export function Timeline({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl italic leading-tight sm:text-4xl">{itinerary.title}</h1>
        <p className="mt-2 max-w-2xl text-muted">{itinerary.summary}</p>
      </div>

      <ol className="relative space-y-6 border-l border-line pl-6">
        {itinerary.stops.map((stop, i) => (
          <li key={i} className="relative">
            {stop.getting_there && (
              <p className="mb-2 text-xs text-muted">↓ {stop.getting_there}</p>
            )}
            <span className="absolute -left-[31px] top-1.5 size-3.5 rounded-full border-2 border-bg bg-accent" />
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                {stop.time} · {stop.piece}
              </p>
              <h3 className="mt-1 font-display text-xl">{stop.name}</h3>
              <p className="text-xs text-muted">
                {stop.category}
                {stop.address && <> · {stop.address}</>}
              </p>
              {stop.notes && <p className="mt-2 text-sm leading-relaxed">{stop.notes}</p>}
              <div className="mt-2 flex gap-4 text-xs">
                {stop.url && (
                  <a
                    href={stop.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted underline underline-offset-4 hover:text-fg"
                  >
                    Website ↗
                  </a>
                )}
                {stop.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name} ${stop.address}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted underline underline-offset-4 hover:text-fg"
                  >
                    Map ↗
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {itinerary.tips.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Good to know</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {itinerary.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
