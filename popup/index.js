const SOURCES = {
  leetcode: {
    label: "LeetCode",
    domain: "leetcode.com",
    placeholder: "leetcode/problems"
  },
  cses: {
    label: "CSES",
    domain: "cses.fi",
    placeholder: "cses/problems"
  }
};

const state = {
  payload: null,
  markdown: "",
  source: "leetcode",
  storedSubfolders: {}
};

const el = {
  chips: document.getElementById("chips"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  diag: document.getElementById("diag"),
  domain: document.querySelector(".domain"),
  vault: document.getElementById("vault"),
  subfolder: document.getElementById("subfolder"),
  copyBtn: document.getElementById("copyBtn"),
  sendBtn: document.getElementById("sendBtn"),
  leetcodeTab: document.getElementById("leetcodeTab"),
  csesTab: document.getElementById("csesTab")
};

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.style.color = isError ? "#ef7d7d" : "#98a2b3";
}

function getSourceConfig(source = state.source) {
  return SOURCES[source] || SOURCES.leetcode;
}

function detectSourceFromUrl(url = "") {
  if (url.includes("leetcode.com/problems/")) return "leetcode";
  if (url.includes("cses.fi/problemset/task/")) return "cses";
  return "";
}

function renderSourceTabs() {
  const source = state.source;
  const config = getSourceConfig(source);

  el.domain.textContent = config.domain;
  el.leetcodeTab.classList.toggle("active", source === "leetcode");
  el.csesTab.classList.toggle("active", source === "cses");
  el.leetcodeTab.setAttribute("aria-selected", String(source === "leetcode"));
  el.csesTab.setAttribute("aria-selected", String(source === "cses"));
  el.subfolder.placeholder = config.placeholder;
}

function renderChips(payload) {
  const chips = [];
  if (payload.source) chips.push(`source:${payload.source}`);
  if (payload.num) chips.push(`num:${payload.num}`);
  if (payload.difficulty) chips.push(`difficulty:${payload.difficulty}`);
  if (payload.slug) chips.push(`slug:${payload.slug}`);
  (payload.topics || []).slice(0, 8).forEach((t) => chips.push(`topic:${t}`));

  el.chips.innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join("");
}

function callTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function callRuntime(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

async function getEditorCodeFromMainWorld(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const normalizeFenceLanguage = (lang) => {
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
        };

        const detectLanguage = () => {
          const selectors = [
            '[data-cy="lang-select"]',
            '[id*="lang"] button',
            'button[aria-haspopup="listbox"]',
            ".ant-select-selection-item"
          ];
          for (const s of selectors) {
            const t = (document.querySelector(s)?.textContent || "").trim();
            if (t && t.length <= 24) return normalizeFenceLanguage(t);
          }
          return "python";
        };

        try {
          if (window.monaco?.editor?.getModels) {
            const models = window.monaco.editor.getModels();
            if (models?.length) {
              const best = models
                .map((m) => ({ value: m.getValue?.() || "" }))
                .sort((a, b) => b.value.length - a.value.length)[0];
              if (best?.value?.trim()) {
                return { code: best.value.trimEnd(), language: detectLanguage(), source: "monaco-model" };
              }
            }
          }
        } catch (_err) {}

        const lines = Array.from(document.querySelectorAll(".monaco-editor .view-lines .view-line"));
        if (lines.length) {
          const code = lines.map((line) => line.innerText ?? "").join("\n").replace(/\u00a0/g, " ").trimEnd();
          if (code.trim()) {
            return { code, language: detectLanguage(), source: "monaco-dom" };
          }
        }

        return { code: "", language: detectLanguage(), source: "none" };
      }
    });

    return results?.[0]?.result || { code: "", language: "python", source: "none" };
  } catch (_err) {
    return { code: "", language: "python", source: "error" };
  }
}

async function loadVaultSetting() {
  const stored = await chrome.storage.local.get(["vaultName", "subfolder", "subfolderBySource", "problemSource"]);
  state.storedSubfolders = stored.subfolderBySource || {};

  if (stored.vaultName) {
    el.vault.value = stored.vaultName;
  }

  const sourceSubfolder = state.storedSubfolders[state.source] || stored.subfolder || "";
  if (sourceSubfolder) {
    el.subfolder.value = sourceSubfolder;
  }
}

async function persistSourceSubfolder(value) {
  const next = { ...(state.storedSubfolders || {}) };
  next[state.source] = value;
  state.storedSubfolders = next;
  await chrome.storage.local.set({
    subfolderBySource: next,
    subfolder: value
  });
}

async function setSource(nextSource, { rerender = true } = {}) {
  if (!SOURCES[nextSource]) return;
  state.source = nextSource;
  await chrome.storage.local.set({ problemSource: nextSource });

  const stored = await chrome.storage.local.get(["subfolderBySource", "subfolder"]);
  state.storedSubfolders = stored.subfolderBySource || state.storedSubfolders || {};
  el.subfolder.value = state.storedSubfolders[nextSource] || stored.subfolder || "";
  renderSourceTabs();

  if (rerender) {
    await scrapeAndRender();
  }
}

async function scrapeAndRender() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const actualSource = detectSourceFromUrl(tab?.url || "");

  if (!tab?.id || actualSource !== state.source) {
    const config = getSourceConfig(state.source);
    setStatus(`Open a ${config.label} problem page first.`, true);
    el.diag.textContent = "partial";
    return;
  }

  const scrape = await callTab(tab.id, { type: "SCRAPE_PROBLEM_REQUEST" });
  if (!scrape?.ok) {
    if ((scrape?.error || "").includes("Receiving end does not exist")) {
      const config = getSourceConfig(state.source);
      setStatus(`This tab is not ready yet. Refresh the ${config.label} page and open the popup again.`, true);
    } else {
      setStatus("Failed to scrape this page.", true);
    }
    el.diag.textContent = "partial";
    return;
  }

  state.payload = scrape.payload;
  const codeFromMainWorld = await getEditorCodeFromMainWorld(tab.id);
  if (codeFromMainWorld.code) {
    state.payload.code = codeFromMainWorld.code;
    state.payload.language = codeFromMainWorld.language || state.payload.language || "python";
  }

  renderChips(state.payload);
  el.diag.textContent = `${scrape.mode || "partial"}${codeFromMainWorld.source ? ` • ${codeFromMainWorld.source}` : ""}`;

  const rendered = await callRuntime({ type: "RENDER_TEMPLATE_REQUEST", payload: state.payload });
  if (!rendered?.ok) {
    setStatus("Failed to render template.", true);
    return;
  }

  state.markdown = rendered.markdown;
  el.preview.textContent = state.markdown;

  const minimalValid = Boolean(state.payload.title && state.payload.descriptionHtml);
  el.sendBtn.disabled = !minimalValid;

  if (!minimalValid) {
    setStatus("Missing required fields (title/description).", true);
  } else {
    setStatus("Ready to clip.");
  }
}

el.copyBtn.addEventListener("click", async () => {
  if (!state.markdown) return;
  await navigator.clipboard.writeText(state.markdown);
  setStatus("Markdown copied to clipboard.");
});

el.vault.addEventListener("change", async () => {
  await chrome.storage.local.set({ vaultName: el.vault.value.trim() });
});

el.subfolder.addEventListener("change", async () => {
  await persistSourceSubfolder(el.subfolder.value.trim());
});

el.sendBtn.addEventListener("click", async () => {
  if (!state.payload || !state.markdown) return;

  const vault = el.vault.value.trim();
  const subfolder = el.subfolder.value.trim();
  const fileName = state.payload.title || "Problem";

  const built = await callRuntime({
    type: "BUILD_OBSIDIAN_URI_REQUEST",
    vault,
    subfolder,
    fileName,
    content: state.markdown,
    append: true
  });

  if (!built?.ok || !built.uri) {
    setStatus("Failed to build Obsidian URI.", true);
    return;
  }

  chrome.tabs.create({ url: built.uri });
  setStatus("Sent to Obsidian URI.");
});

el.leetcodeTab.addEventListener("click", () => setSource("leetcode"));
el.csesTab.addEventListener("click", () => setSource("cses"));

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabSource = detectSourceFromUrl(tab?.url || "");
  const stored = await chrome.storage.local.get(["problemSource"]);
  state.source = tabSource || stored.problemSource || "leetcode";

  renderSourceTabs();
  await loadVaultSetting();
  renderSourceTabs();
  await scrapeAndRender();
})();
