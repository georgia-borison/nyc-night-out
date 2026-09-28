// "My plans" lives in this browser only. The site has no logins, so a shared
// list would show every visitor's plans. Storage can be blocked (private
// windows, cleared site data), so every access is wrapped and fails soft.

export type MyPlan = { id: string; title: string; date: string; area: string; savedAt: string };

const KEY = "night-out:my-plans";

export function loadMyPlans(): MyPlan[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: MyPlan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable; the share link still works.
  }
}

export function rememberPlan(plan: MyPlan) {
  write([plan, ...loadMyPlans().filter((p) => p.id !== plan.id)]);
}

export function forgetPlan(id: string) {
  write(loadMyPlans().filter((p) => p.id !== id));
}
