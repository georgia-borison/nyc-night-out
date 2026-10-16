import Link from "next/link";
import { notFound } from "next/navigation";
import { NightPlan } from "@/components/NightPlan";
import { repairPlan } from "@/lib/repairPlan";
import { getPlan } from "@/lib/store";
import { CopyLinkButton } from "./CopyLinkButton";

export default async function PlanPage({ params }: PageProps<"/plan/[id]">) {
  const { id } = await params;
  const saved = await getPlan(id);
  if (!saved) notFound();
  const plan = await repairPlan(saved);

  return (
    <div className="space-y-8">
      <NightPlan itinerary={plan.itinerary} trip={plan.trip} />
      <div className="flex flex-wrap items-center gap-4">
        <CopyLinkButton />
        <Link href="/plan" className="text-sm text-muted underline underline-offset-4 hover:text-fg">
          Plan your own night
        </Link>
      </div>
    </div>
  );
}
