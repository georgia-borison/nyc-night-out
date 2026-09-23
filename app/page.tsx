import { connection } from "next/server";
import { Planner } from "@/components/Planner";

export default async function Home() {
  // Render per request so the default date is today, not the build date.
  await connection();
  return <Planner />;
}
