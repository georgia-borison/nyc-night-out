import { connection } from "next/server";
import { Planner } from "@/components/Planner";

// The planner: pick an area, describe the night, choose the parts, pick spots.
export default async function PlanStart({ searchParams }: PageProps<"/plan">) {
  // Render per request so the default date is today, not the build date.
  await connection();
  // "Roll the dice" on the home page opens the planner with the dice ready.
  const { roll } = await searchParams;
  return <Planner openDice={roll === "1"} />;
}
