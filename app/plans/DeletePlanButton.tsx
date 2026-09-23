"use client";

import { useRouter } from "next/navigation";

export function DeletePlanButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Delete plan"
      onClick={async () => {
        if (!confirm("Delete this plan?")) return;
        await fetch(`/api/plans/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      className="absolute right-3 top-3 text-xs text-muted hover:text-danger"
    >
      Delete
    </button>
  );
}
