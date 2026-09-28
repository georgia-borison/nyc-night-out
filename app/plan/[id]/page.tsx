import Link from "next/link";
import { notFound } from "next/navigation";
import { NightPlan } from "@/components/NightPlan";
import { getPlan } from "@/lib/store";
import { CopyLinkButton } from "./CopyLinkButton";

export default async function PlanPage({ params }: PageProps<"/plan/[id]">) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) notFound();

  return (
    <div className="space-y-8">
      <NightPlan itinerary={plan.itinerary} trip={plan.trip} />
      <div className="flex flex-wrap items-center gap-4">
        <CopyLinkButton />
        <Link href="/" className="text-sm text-muted underline underline-offset-4 hover:text-fg">
          Plan your own night
        </Link>
      </div>
    </div>
  );
}
