import Link from "next/link";
import { connection } from "next/server";
import { listPlans } from "@/lib/store";
import { DeletePlanButton } from "./DeletePlanButton";

export default async function PlansPage() {
  await connection();
  const plans = await listPlans();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl sm:text-4xl">My plans</h1>
      {plans.length === 0 ? (
        <p className="text-muted">
          No saved plans yet.{" "}
          <Link href="/" className="text-accent underline underline-offset-4">
            Plan a night
          </Link>
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <li key={p.id} className="relative rounded-2xl border border-line bg-surface p-4 hover:border-muted">
              <Link href={`/plan/${p.id}`} className="block space-y-1 pr-12">
                <p className="text-xs text-muted">
                  {new Date(`${p.trip.date}T12:00:00`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {p.trip.area}
                </p>
                <h2 className="font-display text-xl italic">{p.itinerary.title}</h2>
                <p className="text-sm text-muted">{p.itinerary.stops.map((s) => s.name).join(" → ")}</p>
              </Link>
              <DeletePlanButton id={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
