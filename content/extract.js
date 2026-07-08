const EXTRACTION_MODES = {
  STRUCTURED: "structured",
  DOM_FALLBACK: "dom-fallback",
  PARTIAL: "partial"
};

const SOURCES = {
  LEETCODE: "leetcode",
  CSES: "cses"
};

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
  if (location.hostname.includes("leetcode.com")) return SOURCES.LEETCODE;
  if (location.hostname.includes("cses.fi")) return SOURCES.CSES;
  return "";
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
    source: SOURCES.LEETCODE
  };
}

function extractFromDom() {
  const source = getSourceFromLocation();

  if (source === SOURCES.CSES) {
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
  const { code, language } = extractCodeFromEditor();

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
    code,
    language,
    source
  };
}

function extractCodeFromEditor() {
  // Monaco (current LeetCode UI)
  const monacoLines = Array.from(document.querySelectorAll(".monaco-editor .view-lines .view-line"));
  if (monacoLines.length) {
    const code = monacoLines.map((line) => line.innerText ?? "").join("\n").replace(/\u00a0/g, " ");
    const language = detectLanguageFromUi();
    return { code: code.trimEnd(), language };
  }

  // Older CodeMirror fallback
  const codeMirrorLines = Array.from(document.querySelectorAll(".CodeMirror-code pre"));
  if (codeMirrorLines.length) {
    const code = codeMirrorLines.map((line) => line.innerText ?? "").join("\n");
    const language = detectLanguageFromUi();
    return { code: code.trimEnd(), language };
  }

  return { code: "", language: detectLanguageFromUi() };
}

function detectLanguageFromUi() {
  const candidates = [
    '[data-cy="lang-select"]',
    '[id*="lang"] button',
    'button[aria-haspopup="listbox"]',
    ".ant-select-selection-item"
  ];

  for (const selector of candidates) {
    const el = document.querySelector(selector);
    const t = text(el);
    if (t && t.length <= 24) return normalizeFenceLanguage(t);
  }
  return "python";
}

function normalizeFenceLanguage(lang) {
  const raw = (lang || "").toLowerCase();
  if (raw.includes("python")) return "python";
  if (raw.includes("c++")) return "cpp";
  if (raw === "c") return "c";
  if (raw.includes("java")) return "java";
  if (raw.includes("javascript")) return "javascript";
  if (raw.includes("typescript")) return "typescript";
  if (raw.includes("go")) return "go";
  if (raw.includes("rust")) return "rust";
  if (raw.includes("kotlin")) return "kotlin";
  if (raw.includes("swift")) return "swift";
  return raw || "python";
}

function normalizeDescriptionHtml(html, source) {
  const base = (html || "").replace(/<div[^>]*>\s*Advertisement[\s\S]*?<\/div>/gi, "").trim();
  return base;
}

function cleanPayload(raw) {
  const cleanedHtml = normalizeDescriptionHtml(raw.descriptionHtml || "", raw.source);

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
  if (message?.type === "SCRAPE_PROBLEM_REQUEST") {
    try {
      sendResponse({ ok: true, type: "SCRAPE_PROBLEM_RESULT", ...extractProblemPayload() });
    } catch (error) {
      sendResponse({ ok: false, type: "SCRAPE_PROBLEM_RESULT", error: String(error) });
    }
    return true;
  }
  return false;
});
