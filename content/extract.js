const MESSAGE_TYPES = {
  SCRAPE_PROBLEM_REQUEST: "SCRAPE_PROBLEM_REQUEST",
  SCRAPE_PROBLEM_RESULT: "SCRAPE_PROBLEM_RESULT",
  RENDER_TEMPLATE_REQUEST: "RENDER_TEMPLATE_REQUEST",
  RENDER_TEMPLATE_RESULT: "RENDER_TEMPLATE_RESULT",
  BUILD_OBSIDIAN_URI_REQUEST: "BUILD_OBSIDIAN_URI_REQUEST",
  BUILD_OBSIDIAN_URI_RESULT: "BUILD_OBSIDIAN_URI_RESULT"
};

const EXTRACTION_MODES = {
  STRUCTURED: "structured",
  DOM_FALLBACK: "dom-fallback",
  PARTIAL: "partial"
};

function detectSourceFromLocation() {
  if (location.hostname.includes("leetcode.com")) return "leetcode";
  if (location.hostname.includes("cses.fi")) return "cses";
  return "";
}

function text(el) {
  return (el?.textContent || "").trim();
}

function getSlugFromLocation() {
  const m = location.pathname.match(/^\/problems\/([^/]+)\/?/);
  return m ? m[1] : "";
}

function slugToTitle(slug) {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isLikelyBadTitle(value) {
  if (!value) return true;
  const t = value.trim();
  return /^\d+$/.test(t);
}

function getSourceFromLocation() {
  return detectSourceFromLocation();
}

function getCsesTaskIdFromLocation() {
  const m = location.pathname.match(/^\/problemset\/task\/(\d+)\/?/);
  return m ? m[1] : "";
}

function getCsesTitleFromDom() {
  return (
    text(document.querySelector(".title-block h1")) ||
    text(document.querySelector(".content h1")) ||
    text(document.querySelector("h1"))
  );
}

function getCsesTaskLimitsHtml() {
  const items = Array.from(document.querySelectorAll(".task-constraints li"))
    .map((li) => `<li>${li.innerHTML}</li>`)
    .join("");

  if (!items) return "";

  return `<h2>Task Limits</h2><ul>${items}</ul>`;
}

function extractFromStructuredData() {
  const scripts = Array.from(document.querySelectorAll("script"));
  const source = scripts.map((s) => s.textContent || "").find((s) => s.includes("questionTitle") && s.includes("questionFrontendId"));
  if (!source) return null;

  const frontendId = source.match(/"questionFrontendId"\s*:\s*"?(\d+)"?/)?.[1] || "";
  const title = source.match(/"questionTitle"\s*:\s*"([^"]+)"/)?.[1] || "";
  const difficulty = source.match(/"difficulty"\s*:\s*"(Easy|Medium|Hard)"/)?.[1] || "";

  if (!title && !frontendId) return null;

  return {
    num: frontendId,
    title,
    difficulty,
    source: "leetcode"
  };
}

function extractFromDom() {
  const source = getSourceFromLocation();

  if (source === "cses") {
    const descriptionRoot = document.querySelector(".content .md");
    const taskId = getCsesTaskIdFromLocation();
    const title = getCsesTitleFromDom();
    const taskLimitsHtml = getCsesTaskLimitsHtml();

    return {
      num: taskId,
      title,
      slug: taskId ? `task-${taskId}` : "",
      difficulty: "",
      topics: [],
      descriptionHtml: [taskLimitsHtml, descriptionRoot?.innerHTML?.trim() || ""].filter(Boolean).join("\n"),
      solved: false,
      code: "",
      language: "text",
      source
    };
  }

  const titleAnchor =
    document.querySelector('.text-title-large a[href^="/problems/"]') ||
    document.querySelector('a.no-underline[href^="/problems/"]') ||
    document.querySelector('a[href^="/problems/"]');
  const titleText = text(titleAnchor);
  const titleMatch = titleText.match(/^(\d+)\.\s*(.+)$/);

  const difficulty =
    text(Array.from(document.querySelectorAll("div,span")).find((el) => /^(Easy|Medium|Hard)$/.test(text(el)))) ||
    "";

  const descriptionRoot = document.querySelector(".HTMLContent_html__0OZLp");
  const descriptionHtml = descriptionRoot?.innerHTML?.trim() || "";

  const topicSectionHeader = Array.from(document.querySelectorAll("div")).find((el) => text(el) === "Topics");
  let topics = [];
  if (topicSectionHeader) {
    const topicsContainer = topicSectionHeader.closest("div")?.parentElement?.querySelector("a[href*='/tag/']")
      ? topicSectionHeader.closest("div")?.parentElement
      : null;
    if (topicsContainer) {
      topics = Array.from(topicsContainer.querySelectorAll("a[href*='/tag/']")).map((a) => text(a)).filter(Boolean);
    }
  }
  if (!topics.length) {
    topics = Array.from(document.querySelectorAll("a[href*='/tag/']")).map((a) => text(a)).filter(Boolean);
  }

  const solved = Boolean(Array.from(document.querySelectorAll("div,span")).find((el) => text(el) === "Solved"));

  const slug = getSlugFromLocation();
  const num = titleMatch?.[1] || "";
  const title = titleMatch?.[2] || titleText || slugToTitle(slug);

  return {
    num,
    title,
    slug,
    difficulty,
    topics,
    descriptionHtml,
    solved,
    code: "",
    language: "python",
    source
  };
}

function normalizeDescriptionHtml(html) {
  const base = (html || "").replace(/<div[^>]*>\s*Advertisement[\s\S]*?<\/div>/gi, "").trim();
  return base;
}

function cleanPayload(raw) {
  const cleanedHtml = normalizeDescriptionHtml(raw.descriptionHtml || "");

  return {
    num: raw.num || "",
    title: raw.title || "",
    slug: raw.slug || getSlugFromLocation(),
    difficulty: raw.difficulty || "",
    topics: Array.from(new Set((raw.topics || []).filter(Boolean))),
    descriptionHtml: cleanedHtml,
    descriptionMarkdown: "",
    code: raw.code || "",
    language: raw.language || "python",
    source: raw.source || getSourceFromLocation(),
    url: location.href,
    solved: Boolean(raw.solved),
    scrapedAt: new Date().toISOString()
  };
}

function extractProblemPayload() {
  const structured = extractFromStructuredData();
  const dom = extractFromDom();

  const merged = cleanPayload({
    num: dom.num || structured?.num || "",
    // Prefer on-page rendered title so capitalization matches LeetCode exactly.
    title: !isLikelyBadTitle(dom.title) ? dom.title : (structured?.title || slugToTitle(dom.slug)),
    slug: dom.slug,
    difficulty: dom.difficulty || structured?.difficulty || "",
    topics: dom.topics || [],
    descriptionHtml: dom.descriptionHtml || "",
    solved: dom.solved
  });

  const mode = structured
    ? EXTRACTION_MODES.STRUCTURED
    : merged.descriptionHtml && merged.title
      ? EXTRACTION_MODES.DOM_FALLBACK
      : EXTRACTION_MODES.PARTIAL;

  return {
    mode,
    diagnostics: {
      hasStructured: Boolean(structured),
      hasTitle: Boolean(merged.title),
      hasDescription: Boolean(merged.descriptionHtml),
      topicCount: merged.topics.length,
      source: merged.source
    },
    payload: merged
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.SCRAPE_PROBLEM_REQUEST) {
    try {
      sendResponse({ ok: true, type: MESSAGE_TYPES.SCRAPE_PROBLEM_RESULT, ...extractProblemPayload() });
    } catch (error) {
      sendResponse({ ok: false, type: MESSAGE_TYPES.SCRAPE_PROBLEM_RESULT, error: String(error) });
    }
    return true;
  }
  return false;
});
