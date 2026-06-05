function formatDateLocal(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizeFileName(name) {
  return (name || "LeetCode Problem")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFilePath(filePath) {
  return (filePath || "LeetCode Problem")
    .split("/")
    .map((segment) => sanitizeFileName(segment))
    .filter(Boolean)
    .join("/");
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, "");
}

function decodeBasicEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToMarkdown(html) {
  if (!html) return "";

  let out = html;

  // Keep code/pre readable, but avoid trying to deeply parse every example block.
  out = out.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code) => {
    const c = decodeBasicEntities(stripTags(code)).trimEnd();
    return `\n\`\`\`\n${c}\n\`\`\`\n`;
  });

  out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, code) => `\`${decodeBasicEntities(stripTags(code)).trim()}\``);
  out = out.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  out = out.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  out = out.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  out = out.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");

  out = out.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
    return `[${decodeBasicEntities(stripTags(label)).trim()}](${href})`;
  });

  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, item) => `${decodeBasicEntities(stripTags(item)).trim()}\n`);
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/h[1-6]>/gi, "\n\n");
  out = out.replace(/<h[1-6][^>]*>/gi, "");
  out = out.replace(/<\/p>/gi, "\n\n");
  out = out.replace(/<p[^>]*>/gi, "");
  out = out.replace(/<\/ul>|<\/ol>/gi, "\n");
  out = out.replace(/<ul[^>]*>|<ol[^>]*>/gi, "\n");

  out = decodeBasicEntities(stripTags(out));
  out = out.replace(/\n{3,}/g, "\n\n").trim();

  // Keep only the core description body; drop examples/constraints sections.
  out = out
    .split(/\n\s*(?:\*\*)?\s*Example(?:s)?\s*\d*\s*:?\s*(?:\*\*)?\s*\n/i)[0]
    .split(/\n\s*(?:\*\*)?\s*Constraints\s*:?\s*(?:\*\*)?\s*\n/i)[0]
    .trim();

  return out;
}

function buildTemplate(context) {
  const topicLines = (context.topics || []).length
    ? context.topics.map((topic) => `  - ${topic}`).join("\n")
    : "  -";

  const contestPrefill = context.contest ? `[[${context.contest}]]\n\n` : "";
  const problemLabel = context.num ? `${context.num}. ${context.title}` : context.title;

  const fenceLanguage = context.language || "python";
  const codeBlock = context.code ? `${context.code}\n` : "";

  return `---\ndate: ${formatDateLocal(new Date(context.scrapedAt || Date.now()))}\ndifficulty: ${context.difficulty || "Unknown"}\nnum: ${context.num || ""}\nrelated_topics:\n${topicLines}\nreturn:\n---\n\n# Problem: ${problemLabel}\n\n## Description\n${context.descriptionMarkdown || ""}\n\n## Approach / Thoughts\n${contestPrefill}\n\n## Solution\n\`\`\`${fenceLanguage}\n${codeBlock}\`\`\``;
}

export function renderTemplate(payload) {
  const descriptionMarkdown = payload.descriptionMarkdown || htmlToMarkdown(payload.descriptionHtml || "");
  const context = { ...payload, descriptionMarkdown };
  const markdown = buildTemplate(context);
  return { markdown, context };
}

export function buildObsidianUri({ vault, fileName, content, append = true }) {
  const normalizedPath = sanitizeFilePath(fileName);
  const file = normalizedPath.endsWith(".md") ? normalizedPath : `${normalizedPath}.md`;
  const entries = [];
  const pushParam = (k, v) => entries.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);

  if (vault) pushParam("vault", vault);
  pushParam("file", file);
  pushParam("content", content);
  pushParam("append", String(Boolean(append)));

  return `obsidian://new?${entries.join("&")}`;
}
