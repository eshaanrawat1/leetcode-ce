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

// Shared utilities
function text(el) {
  return (el?.textContent || "").trim();
}

function normalizeDescriptionHtml(html) {
  const base = (html || "").replace(/<div[^>]*>\s*Advertisement[\s\S]*?<\/div>/gi, "").trim();
  return base;
}

function slugToTitle(slug) {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function detectSourceFromLocation() {
  if (location.hostname.includes("leetcode.com")) return "leetcode";
  if (location.hostname.includes("cses.fi")) return "cses";
  return "";
}

// Extractor registry - add new sites here
const EXTRACTORS = {
  leetcode: {
    extractFromStructuredData() {
      const slug = getSlugFromLocation();

      // Preferred: parse Next.js page data. Only trust it when it matches the current slug,
      // since client-side navigation (Prev/Next question) leaves __NEXT_DATA__ stale.
      const nextData = document.getElementById("__NEXT_DATA__")?.textContent;
      if (nextData) {
        try {
          const queries = JSON.parse(nextData)?.props?.pageProps?.dehydratedState?.queries || [];
          const question = queries.map((q) => q?.state?.data?.question).find((q) => q && q.titleSlug === slug);
          if (question) {
            return {
              num: question.questionFrontendId || "",
              title: question.title || question.questionTitle || "",
              difficulty: question.difficulty || "",
              topics: (question.topicTags || []).map((t) => t?.name).filter(Boolean),
              descriptionHtml: question.content || "",
              source: "leetcode"
            };
          }
        } catch (_err) {}
        return null;
      }

      // Legacy: regex over inline scripts.
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
    },

    extractFromDom() {
      const titleAnchor =
        document.querySelector('[data-e2e-locator="question-title"] a[href^="/problems/"]') ||
        document.querySelector('.text-title-large a[href^="/problems/"]') ||
        document.querySelector('a.no-underline[href^="/problems/"]') ||
        document.querySelector('a[href^="/problems/"]');
      const titleText = text(titleAnchor);
      const titleMatch = titleText.match(/^(\d+)\.\s*(.+)$/);

      const difficulty =
        text(Array.from(document.querySelectorAll("div,span")).find((el) => /^(Easy|Medium|Hard)$/.test(text(el)))) ||
        "";

      const descriptionRoot =
        document.querySelector('[data-track-load="description_content"]') ||
        document.querySelector("[data-qd-rendered-description]") ||
        document.querySelector('[class*="HTMLContent_html"]');
      let descriptionHtml = "";
      if (descriptionRoot) {
        const clone = descriptionRoot.cloneNode(true);
        // Drop injected UI (e.g. the "Original / Python3" example language toggle).
        clone.querySelectorAll("[data-example-lang-controls], button").forEach((n) => n.remove());
        descriptionHtml = clone.innerHTML.trim();
      }

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
        source: "leetcode"
      };
    },

    isLikelyBadTitle(value) {
      if (!value) return true;
      const t = value.trim();
      return /^\d+$/.test(t);
    }
  },

  cses: {
    extractFromDom() {
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
        source: "cses"
      };
    },

    isLikelyBadTitle() {
      return false;
    }
  }
};

// CSES-specific helpers
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

// LeetCode-specific helper
function getSlugFromLocation() {
  const m = location.pathname.match(/^\/problems\/([^/]+)\/?/);
  return m ? m[1] : "";
}

// Core extraction logic
function cleanPayload(raw, source) {
  const cleanedHtml = normalizeDescriptionHtml(raw.descriptionHtml || "");

  return {
    num: raw.num || "",
    title: raw.title || "",
    slug: raw.slug || (source === "leetcode" ? getSlugFromLocation() : ""),
    difficulty: raw.difficulty || "",
    topics: Array.from(new Set((raw.topics || []).filter(Boolean))),
    descriptionHtml: cleanedHtml,
    descriptionMarkdown: "",
    code: raw.code || "",
    language: raw.language || "python",
    source: raw.source || source,
    url: location.href,
    solved: Boolean(raw.solved),
    scrapedAt: new Date().toISOString()
  };
}

function extractProblemPayload() {
  const source = detectSourceFromLocation();
  const extractor = EXTRACTORS[source];

  if (!extractor) {
    return {
      mode: EXTRACTION_MODES.PARTIAL,
      diagnostics: { source, hasStructured: false, hasTitle: false, hasDescription: false, topicCount: 0 },
      payload: cleanPayload({}, source)
    };
  }

  const structured = extractor.extractFromStructuredData ? extractor.extractFromStructuredData() : null;
  const dom = extractor.extractFromDom();

  const merged = cleanPayload({
    num: dom.num || structured?.num || "",
    title: !extractor.isLikelyBadTitle?.(dom.title) ? dom.title : (structured?.title || slugToTitle(dom.slug)),
    slug: dom.slug,
    difficulty: structured?.difficulty || dom.difficulty || "",
    topics: dom.topics?.length ? dom.topics : (structured?.topics || []),
    descriptionHtml: dom.descriptionHtml || structured?.descriptionHtml || "",
    solved: dom.solved
  }, source);

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
