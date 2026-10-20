// MOSS 标准提示词节点 UI: 全局提示词 + 标准 JSON 导入/合并/导出 + 最终生成词预览.
// 与 harness 页面共用按连线分组的数据层，不依赖 ComfyUI 模块 (除底部注册扩展).

import {
  h, injectStyle, getLayoutStore, syncFooter, button, compilePrompt, parseLayout,
  serializePretty,
} from "./moss_common.js";

const CLASS = "MOSSLayoutStandardPrompt";
const STYLE_ID = "moss-layout-prompt-style";

const CSS = `
.mls-card{display:flex;flex-direction:column;height:100%;min-height:0;padding:13px 12px 10px;
  border-color:#333e52;overflow:hidden}
.mls-title{margin:0 0 9px;font-size:15px;font-weight:700;line-height:1.3;color:#e6e9ef}
.mls-label{display:block;margin:0 0 5px;font-size:12px;color:#8b93a1}
.mls-editor{margin:0 0 10px;flex:0 0 auto;background:#252e3f;border-color:#35415a;font-size:13px}
.mls-global{height:92px;resize:none}
.mls-standard{height:168px;resize:none}
.mls-actions{display:flex;gap:9px;margin:0 0 8px;flex:0 0 auto}
.mls-actions .ml-btn{height:34px;padding:0 14px;font-size:13px}
.mls-note{margin:0 0 2px;font-size:12.5px;line-height:1.55;color:#8b93a1;flex:0 0 auto}
.mls-status{margin:0 0 8px;font-size:12.5px;line-height:1.5;color:#8b93a1;flex:0 0 auto}
.mls-tabs{display:flex;align-items:center;margin:0 0 8px;flex:0 0 auto}
.mls-tab{height:31px;padding:0 14px;font-size:13px}
.mls-copy{margin-left:auto;height:31px;font-size:13px}
.mls-preview{flex:1 1 auto;min-height:110px;margin:0;resize:none;background:#1c2230;
  border-color:#33405a;color:#9fb4cc;
  font:12.5px/1.55 ui-monospace,"Cascadia Mono",Consolas,"Liberation Mono",monospace;
  white-space:pre-wrap;word-break:break-word;overflow:auto}
.mls-card .ml-footer{padding-top:8px;flex:0 0 auto}
`;

// Same extraction pass as parseLayout, but keeps the raw objects so a merge can
// tell "field missing from the pasted layout" apart from "field set to default".
function jsonObjects(text) {
  const found = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          found.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return found;
}

function readRawLayout(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  for (const candidate of [trimmed, ...jsonObjects(trimmed)]) {
    let value;
    try {
      value = JSON.parse(candidate);
    } catch (error) {
      continue;
    }
    if (Array.isArray(value)) return { elements: value };
    if (value && typeof value === "object" && Array.isArray(value.elements)) return value;
  }
  return null;
}

export function mountPrompt(node) {
  const layoutStore = getLayoutStore(node);
  injectStyle(STYLE_ID, CSS);

  let tab = "json";
  let copyTimer = 0;
  let editingGlobal = false;

  const globalArea = h("textarea", {
    class: "ml-textarea mls-editor mls-global ml-scroll",
    rows: "4",
    spellcheck: "false",
    placeholder: "整张海报的总提示词……",
  });
  const standardArea = h("textarea", {
    class: "ml-textarea mls-editor mls-standard ml-scroll",
    rows: "7",
    spellcheck: "false",
    placeholder: "粘贴标准布局 JSON，然后点击「导入新布局」或「合并并保留修改」。",
  });
  const statusEl = h("p", { class: "mls-status" });
  const preview = h("textarea", {
    class: "ml-textarea mls-preview ml-scroll",
    readonly: "readonly",
    spellcheck: "false",
  });

  const jsonTab = h("button", {
    type: "button",
    class: "ml-tab mls-tab mls-tab-json is-active",
    text: "当前标准 JSON",
  });
  const promptTab = h("button", {
    type: "button",
    class: "ml-tab mls-tab mls-tab-prompt",
    text: "最终生成词",
  });
  const copyButton = button("复制输出", { className: "mls-copy", title: "复制当前标签页的完整输出" });

  function outputText() {
    const layout = layoutStore.get();
    return tab === "prompt" ? compilePrompt(layout).prompt : serializePretty(layout);
  }

  function refreshPreview() {
    const text = outputText();
    if (preview.value === text) return;
    const scrollTop = preview.scrollTop;
    preview.value = text;
    preview.scrollTop = scrollTop;
  }

  function refreshGlobal(layout) {
    if (editingGlobal) return;
    if (globalArea.value !== layout.global_prompt) globalArea.value = layout.global_prompt;
  }

  function refreshStatus(layout) {
    const foreground = Math.max(0, layout.elements.length - 1);
    statusEl.textContent = foreground
      ? `已导入 ${foreground} 个前景元素，背景已铺满。`
      : "当前画布没有前景元素，只有背景。";
  }

  function render(layout) {
    refreshGlobal(layout);
    refreshPreview();
    refreshStatus(layout);
  }

  function setTab(next) {
    if (tab === next) return;
    tab = next;
    jsonTab.classList.toggle("is-active", next === "json");
    promptTab.classList.toggle("is-active", next === "prompt");
    preview.scrollTop = 0;
    refreshPreview();
  }

  function invalidBuffer() {
    alert("无法解析标准布局 JSON。请粘贴包含 elements 数组的布局 JSON。");
  }

  function importLayout() {
    const parsed = parseLayout(standardArea.value);
    if (!parsed) {
      invalidBuffer();
      return;
    }
    layoutStore.replace(parsed, node.id);
  }

  function mergeLayout() {
    const raw = readRawLayout(standardArea.value);
    if (!raw) {
      invalidBuffer();
      return;
    }
    layoutStore.update((layout) => {
      const canvas = raw.canvas;
      if (canvas && typeof canvas === "object") {
        if (Number.isFinite(Number(canvas.width))) layout.canvas.width = Number(canvas.width);
        if (Number.isFinite(Number(canvas.height))) layout.canvas.height = Number(canvas.height);
      }
      if (typeof raw.global_prompt === "string") layout.global_prompt = raw.global_prompt;
      const incoming = Array.isArray(raw.elements) ? raw.elements : [];
      incoming.forEach((source, index) => {
        if (!source || typeof source !== "object" || Array.isArray(source)) return;
        const target = layout.elements[index];
        if (!target) {
          layout.elements.push(source);
          return;
        }
        for (const key of ["name", "tag", "type", "box", "prompt", "text"]) {
          if (key in source) target[key] = source[key];
        }
      });
    }, node.id);
  }

  function exportToBuffer() {
    standardArea.value = serializePretty(layoutStore.get());
  }

  function flashCopy(label) {
    copyButton.textContent = label;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyButton.textContent = "复制输出";
    }, 1200);
  }

  async function copyOutput() {
    const text = outputText();
    try {
      await navigator.clipboard.writeText(text);
      flashCopy("已复制");
    } catch (error) {
      preview.focus();
      preview.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (fallbackError) {
        copied = false;
      }
      flashCopy(copied ? "已复制" : "复制失败");
      if (!copied) alert("复制失败，已选中输出文本，请按 Ctrl+C。");
    }
  }

  globalArea.addEventListener("input", () => {
    editingGlobal = true;
    try {
      layoutStore.update((layout) => {
        layout.global_prompt = globalArea.value;
      }, node.id);
    } finally {
      editingGlobal = false;
    }
  });
  jsonTab.addEventListener("click", () => setTab("json"));
  promptTab.addEventListener("click", () => setTab("prompt"));
  copyButton.addEventListener("click", copyOutput);

  const importButton = button("导入新布局", { className: "mls-import", onClick: importLayout });
  const mergeButton = button("合并并保留修改", { className: "mls-merge", onClick: mergeLayout });
  const exportButton = button("导出回输入框", { className: "mls-export", onClick: exportToBuffer });

  const root = h("div", { class: "ml-root mls-root" }, [
    h("div", { class: "ml-card mls-card" }, [
      h("div", { class: "mls-title", text: "标准提示词 → 画布 → 最终生成词" }),
      h("span", { class: "mls-label", text: "全局提示词 · 当前画布的生成依据" }),
      globalArea,
      h("span", { class: "mls-label", text: "标准输入 · 粘贴后点击导入" }),
      standardArea,
      h("div", { class: "mls-actions" }, [importButton, mergeButton, exportButton]),
      h("p", {
        class: "mls-note",
        text: "导入只在点击按钮时执行。运行和导出始终读取当前画布。canvas 尺寸用于坐标语境，实际分辨率由选择器控制。",
      }),
      statusEl,
      h("div", { class: "mls-tabs" }, [jsonTab, promptTab, copyButton]),
      preview,
      syncFooter(),
    ]),
  ]);

  node.addDOMWidget("moss_prompt_ui", CLASS, root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 620,
  });

  layoutStore.register(node, (layout) => render(layout));

  const originalResize = node.onResize;
  node.onResize = function (size) {
    const result = originalResize?.apply(this, arguments);
    if (size) {
      size[0] = Math.max(size[0], 420);
      size[1] = Math.max(size[1], 700);
    }
    return result;
  };
  node.setSize([
    Math.max(node.size?.[0] ?? 0, 480),
    Math.max(node.size?.[1] ?? 0, 900),
  ]);
}

export default mountPrompt;

if (!window.__MOSS_LAYOUT_HARNESS__) {
  import("../../scripts/app.js").then(({ app }) => {
    app.registerExtension({
      name: "MossLayout.StandardPrompt",
      nodeCreated(node) {
        if (node.comfyClass !== CLASS && node.type !== CLASS) return;
        if (node.__mossPromptUI) return;
        try {
          mountPrompt(node);
          node.__mossPromptUI = true;
        } catch (error) {
          console.error("[moss-layout-ui] prompt UI failed", error);
        }
      },
    });
  }).catch(() => {});
}
