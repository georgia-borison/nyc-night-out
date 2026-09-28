// Last-resort title when Claude doesn't provide one. Strips the "/ Nolita"
// style suffixes from area names so it reads naturally.
export function templateTitle(area: string) {
  const place = area.split("/")[0].trim() || "The City";
  return `${place} After Dark`;
}
