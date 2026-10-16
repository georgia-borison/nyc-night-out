"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { forgetPlan, loadMyPlans, type MyPlan } from "@/lib/myPlans";

export default function PlansPage() {
  const [plans, setPlans] = useState<MyPlan[] | null>(null);

  // localStorage only exists in the browser, so read it after mounting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlans(loadMyPlans());
  }, []);

  if (plans === null) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">My plans</h1>
        <p className="mt-2 text-sm text-muted">Plans you&rsquo;ve saved on this device.</p>
      </div>
      {plans.length === 0 ? (
        <p className="text-muted">
          No saved plans yet.{" "}
          <Link href="/plan" className="text-accent underline underline-offset-4">
            Plan a night
          </Link>
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <li key={p.id} className="relative rounded-2xl border border-line bg-surface p-4 hover:border-muted">
              <Link href={`/plan/${p.id}`} className="block space-y-1 pr-16">
                <p className="text-xs text-muted">
                  {new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {p.area}
                </p>
                <h2 className="font-display text-xl italic">{p.title}</h2>
              </Link>
              <button
                type="button"
                onClick={() => {
                  forgetPlan(p.id);
                  setPlans(loadMyPlans());
                }}
                className="absolute right-3 top-3 text-xs text-muted hover:text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
