import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { getPlan } from "@/lib/store";
import { CopyLinkButton } from "./CopyLinkButton";

export default async function PlanPage({ params }: PageProps<"/plan/[id]">) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) notFound();

  const date = new Date(`${plan.trip.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        {date} · {plan.trip.area} · {plan.trip.partySize} {plan.trip.partySize === 1 ? "person" : "people"} ·{" "}
        {plan.trip.budget}
      </p>
      <Timeline itinerary={plan.itinerary} />
      <div className="flex flex-wrap items-center gap-4">
        <CopyLinkButton />
        <Link href="/" className="text-sm text-muted underline underline-offset-4 hover:text-fg">
          Plan another night
        </Link>
      </div>
    </div>
  );
}
