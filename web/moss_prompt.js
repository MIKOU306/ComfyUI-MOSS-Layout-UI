// MOSS 标准提示词节点 UI: 全局提示词 + 标准 JSON 导入/合并/导出 + 最终生成词预览.
// 与 harness 页面共用按连线分组的数据层，不依赖 ComfyUI 模块 (除底部注册扩展).

import {
  h, injectStyle, getLayoutStore, syncFooter, button, compilePrompt, parseLayout,
  serializePretty, readRawLayout, officialDraft, splitList, CANVAS_KINDS,
} from "./moss_common.js";

import { mountTemplates } from "./moss_templates.js";
import { workflowWarnings, duplicateInstallWarning } from "./moss_checks.js";

const CLASS = "MOSSLayoutStandardPrompt";
const STYLE_ID = "moss-layout-prompt-style";

const CSS = `
.mls-card{display:flex;flex-direction:column;height:100%;min-height:0;padding:13px 12px 10px;
  border-color:#333e52;overflow-y:auto}
.mls-title{margin:0 0 9px;font-size:15px;font-weight:700;line-height:1.3;color:#e6e9ef}
.mls-label{display:block;margin:0 0 5px;font-size:12px;color:#8b93a1}
.mls-editor{margin:0 0 10px;flex:0 0 auto;background:#252e3f;border-color:#35415a;font-size:13px}
.mls-global{height:92px;resize:none}
.mls-standard{height:168px;resize:none}
.mls-actions{display:flex;gap:9px;margin:0 0 8px;flex:0 0 auto}
.mls-actions .ml-btn{height:34px;padding:0 14px;font-size:13px}
.mls-meta{display:flex;gap:8px;margin:0 0 8px;flex:0 0 auto;flex-wrap:wrap}
.mls-meta-field{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8b93a1;flex:1 1 120px;min-width:0}
.mls-meta-input,.mls-meta-select{height:28px;font-size:12px;padding:0 8px;min-width:0}
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

export function mountPrompt(node) {
  const layoutStore = getLayoutStore(node);
  injectStyle(STYLE_ID, CSS);

  let tab = "json";
  let copyTimer = 0;
  let editingGlobal = false;
  let duplicateWarning = "";
  const checks = h("div", {class:"mls-checks", role:"status", style:{whiteSpace:"pre-wrap",color:"#f5cf8a",fontSize:"11px",maxHeight:"90px",overflowY:"auto",flex:"0 0 auto",marginBottom:"6px"}});
  function refreshChecks() {
    const issues = workflowWarnings(node, layoutStore.get());
    if (duplicateWarning) issues.unshift(duplicateWarning);
    const text = issues.join("\n");
    if(checks.textContent !== text) checks.textContent=text;
    checks.hidden = !text;
  }

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
    placeholder: "粘贴布局、官方草稿或模型的布局提示词，然后点击「导入新布局」或「合并并保留修改」。",
  });
  const statusEl = h("p", { class: "mls-status" });
  const metaInput = h("input", { class: "ml-input mls-meta-input", placeholder: "媒介 / 体裁，如 poster, photography" });
  const paletteInput = h("input", { class: "ml-input mls-meta-input", placeholder: "整体色板，如 warm ivory, dark green" });
  const canvasKind = h("select", { class: "ml-select mls-meta-select" },
    CANVAS_KINDS.map((kind) => h("option", { value: kind.id, text: kind.label })));
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
    return tab === "prompt" ? compilePrompt(layout, characterPositions()).prompt : serializePretty(layout);
  }

  // Same "1, 3" list the backend reads, so the preview matches the queued prompt.
  // A linked input only has a value at execution time; the element types already
  // encode that case, so the preview falls back to them.
  function characterPositions() {
    const linked = node.inputs?.some((input) => input.name === "character_boxes" && input.link != null);
    const raw = linked ? "" : node.widgets?.find((widget) => widget.name === "character_boxes")?.value;
    return typeof raw === "string" && /^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(raw)
      ? raw.match(/\d+/g).map(Number)
      : [];
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

  function refreshSummary(layout) {
    const meta = (layout.meta ?? []).join(", ");
    if (document.activeElement !== metaInput && metaInput.value !== meta) metaInput.value = meta;
    const palette = (layout.palette ?? []).join(", ");
    if (document.activeElement !== paletteInput && paletteInput.value !== palette) paletteInput.value = palette;
    if (canvasKind.value !== (layout.canvas_kind ?? "")) canvasKind.value = layout.canvas_kind ?? "";
  }

  function refreshStatus(layout) {
    const foreground = Math.max(0, layout.elements.length - 1);
    statusEl.textContent = foreground
      ? `已导入 ${foreground} 个前景元素，背景已铺满。`
      : "当前画布没有前景元素，只有背景。";
  }

  function render(layout) {
    refreshGlobal(layout);
    refreshSummary(layout);
    refreshPreview();
    refreshStatus(layout);
    refreshChecks();
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
    alert("无法解析布局。可粘贴本插件的 moss-layout 布局、官方的 width/height + abs/xyxy 草稿，或模型用的 abs_centralized/yxyx 布局提示词（按当前画布尺寸换算）。");
  }

  function importLayout() {
    const parsed = parseLayout(standardArea.value, layoutStore.get().canvas);
    if (!parsed) {
      invalidBuffer();
      return;
    }
    layoutStore.importLayout(parsed, node.id);
  }

  function mergeLayout() {
    const raw = readRawLayout(standardArea.value, layoutStore.get().canvas);
    if (!raw) {
      invalidBuffer();
      return;
    }
    const layout = JSON.parse(serializePretty(layoutStore.get()));
    if (raw.canvas && typeof raw.canvas === "object") layout.canvas = {...layout.canvas, ...raw.canvas};
    if (typeof raw.global_prompt === "string") layout.global_prompt = raw.global_prompt;
    for (const key of ["meta", "palette", "canvas_kind"]) {
      if (raw[key] !== undefined) layout[key] = raw[key];
    }
    let index = 1;
    for (const source of raw.elements) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const background = source.type === "background" || (!source.type && source.tag === "固定");
      const at = background ? 0 : index++;
      const target = layout.elements[at];
      if (!target) { layout.elements.push(source); continue; }
      for (const key of ["name", "tag", "type", "box", "prompt", "text", "locked", "group_id", "typography", "tags", "palette"]) {
        if (Object.hasOwn(source, key)) target[key] = source[key];
      }
    }
    layoutStore.importLayout(layout, node.id);
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
      preview.value = text;
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

  function patchSummary(patch) {
    layoutStore.update((layout) => Object.assign(layout, patch), node.id);
  }
  metaInput.addEventListener("input", () => patchSummary({ meta: splitList(metaInput.value) }));
  paletteInput.addEventListener("input", () => patchSummary({ palette: splitList(paletteInput.value) }));
  canvasKind.addEventListener("change", () => patchSummary({ canvas_kind: canvasKind.value }));

  const importButton = button("导入新布局", { className: "mls-import", onClick: importLayout });
  const mergeButton = button("合并并保留修改", { className: "mls-merge", onClick: mergeLayout });
  const exportButton = button("导出回输入框", { className: "mls-export", onClick: exportToBuffer });
  const draftButton = button("导出官方草稿", {
    className: "mls-draft",
    onClick: () => {
      standardArea.value = JSON.stringify(officialDraft(layoutStore.get()), null, 2);
      statusEl.textContent = "已按官方 abs / xyxy 草稿格式导出到输入框。";
    },
  });

  const root = h("div", { class: "ml-root mls-root" }, [
    h("div", { class: "ml-card mls-card" }, [
      h("div", { class: "mls-title", text: "标准提示词 → 画布 → 最终生成词" }),
      h("span", { class: "mls-label", text: "全局提示词 · 当前画布的生成依据" }),
      globalArea,
      h("div", { class: "mls-meta" }, [
        h("label", { class: "mls-meta-field" }, [
          h("span", { text: "画面类型" }),
          canvasKind,
        ]),
        h("label", { class: "mls-meta-field" }, [
          h("span", { text: "meta" }),
          metaInput,
        ]),
        h("label", { class: "mls-meta-field" }, [
          h("span", { text: "调色板" }),
          paletteInput,
        ]),
      ]),
      h("p", {
        class: "mls-note",
        text: "画面类型写入 summary.canvas（单图 / 多格 / 拼贴），meta 与调色板写入 summary.meta 与 summary.palette；三项都直接进模型输入，不填则不下发。多个值用逗号分隔。",
      }),
      mountTemplates(node, layoutStore),
      h("span", { class: "mls-label", text: "标准输入 · 粘贴后点击导入" }),
      standardArea,
      h("div", { class: "mls-actions" }, [importButton, mergeButton, exportButton, draftButton]),
      h("p", {
        class: "mls-note",
        text: "导入只在点击按钮时执行。支持三种输入：本插件的 moss-layout 布局、官方 width/height + abs/xyxy 草稿、模型用的 abs_centralized/yxyx 布局提示词（无宽高，按当前画布尺寸换算）。运行和导出始终读取当前画布。",
      }),
      statusEl,
      checks,
      h("div", { class: "mls-tabs" }, [jsonTab, promptTab, copyButton]),
      preview,
      syncFooter(),
    ]),
  ]);

  root.addEventListener("keydown", event => event.stopPropagation());
  root.addEventListener("keyup", event => event.stopPropagation());
  const checkTimer = setInterval(refreshChecks, 1000);
  duplicateInstallWarning().then(warning => { duplicateWarning=warning; if(root.isConnected)refreshChecks(); });
  const removed = node.onRemoved;
  node.onRemoved = function(...args) { clearInterval(checkTimer); clearTimeout(copyTimer); return removed?.apply(this,args); };

  const domWidget = node.addDOMWidget("moss_prompt_ui", CLASS, root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 620,
  });
  domWidget.serialize = false;

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
