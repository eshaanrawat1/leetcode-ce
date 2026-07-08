export const SOURCES = [
  {
    id: "leetcode",
    label: "LeetCode",
    domain: "leetcode.com",
    hostMatch: "leetcode.com",
    pathMatch: "/problems/",
    placeholder: "leetcode/problems"
  },
  {
    id: "cses",
    label: "CSES",
    domain: "cses.fi",
    hostMatch: "cses.fi",
    pathMatch: "/problemset/task/",
    placeholder: "cses/problems"
  }
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export function detectSourceFromUrl(url = "") {
  const match = SOURCES.find((s) => url.includes(s.hostMatch) && url.includes(s.pathMatch));
  return match?.id || "";
}

export function detectSourceFromLocation(loc = location) {
  const href = `${loc.hostname}${loc.pathname}`;
  return detectSourceFromUrl(href);
}
