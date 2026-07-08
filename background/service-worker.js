import { buildObsidianUri, renderTemplate } from "./uri.js";
import { MESSAGE_TYPES } from "../shared/types.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.RENDER_TEMPLATE_REQUEST) {
    try {
      const result = renderTemplate(message.payload);
      sendResponse({ ok: true, type: MESSAGE_TYPES.RENDER_TEMPLATE_RESULT, ...result });
    } catch (error) {
      sendResponse({ ok: false, type: MESSAGE_TYPES.RENDER_TEMPLATE_RESULT, error: String(error) });
    }
    return true;
  }

  if (message?.type === MESSAGE_TYPES.BUILD_OBSIDIAN_URI_REQUEST) {
    try {
      const { vault, fileName, subfolder, content, append } = message;
      const finalFileName = subfolder ? `${subfolder.replace(/^\/+|\/+$/g, "")}/${fileName}` : fileName;
      const uri = buildObsidianUri({ vault, fileName: finalFileName, content, append });
      sendResponse({ ok: true, type: MESSAGE_TYPES.BUILD_OBSIDIAN_URI_RESULT, uri });
    } catch (error) {
      sendResponse({ ok: false, type: MESSAGE_TYPES.BUILD_OBSIDIAN_URI_RESULT, error: String(error) });
    }
    return true;
  }

  return false;
});
