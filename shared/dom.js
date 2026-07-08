export function text(el) {
  return (el?.textContent || "").trim();
}

export function normalizeDescriptionHtml(html) {
  const base = (html || "").replace(/<div[^>]*>\s*Advertisement[\s\S]*?<\/div>/gi, "").trim();
  return base;
}

export function slugToTitle(slug) {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
