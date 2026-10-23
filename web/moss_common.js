// Shared schema, store and look for the three MOSS layout poster nodes.
// Plain ES module: no ComfyUI imports, so the same file also runs in the
// static harness pages under tools/moss-layout-ui/harness/.
import { elementIndices } from "./moss_edit.js";
import { normalizeTypography, textCaption } from "./moss_text.js";

export const SCHEMA = "moss-layout/v1";
export const COORDINATE_SYSTEM = "percent_xywh";
export const SYNC_LABEL = "moss_layout_ui_sync";

export const TAGS = [
  { id: "主体", color: "#4a9eff" },
  { id: "人物", color: "#e985ce" },
  { id: "文字", color: "#facc15" },
  { id: "图片", color: "#59d97f" },
  { id: "装饰", color: "#c084fc" },
  { id: "版式", color: "#ff9147" },
  { id: "固定", color: "#8a8f98" },
];
export const TAG_IDS = TAGS.map((tag) => tag.id);
export const TAG_COLORS = Object.fromEntries(TAGS.map((tag) => [tag.id, tag.color]));
export const TAG_TYPE = {
  主体: "object", 人物: "character", 文字: "text", 图片: "object",
  装饰: "object", 版式: "object", 固定: "background",
};

export const TYPES = [
  { id: "character", label: "人物" },
  { id: "object", label: "物体" },
  { id: "text", label: "文字" },
  { id: "background", label: "背景" },
];
export const TYPE_IDS = TYPES.map((type) => type.id);
export const TYPE_LABEL = Object.fromEntries(TYPES.map((type) => [type.id, type.label]));

// The model only knows these three item labels; every other tag is editor-only and
// rides along in the optional item.tags array instead.
export const LABELS = ["object", "character", "text"];
export const CANVAS_KINDS = [
  { id: "", label: "未指定" },
  { id: "single", label: "单图" },
  { id: "multi_panel", label: "多格" },
  { id: "collage", label: "拼贴" },
];

const DEFAULT_WIDTH = 1088;
const DEFAULT_HEIGHT = 1920;
const MIN_CANVAS = 16;
const MAX_CANVAS = 16384;

const BASE_CSS = `
.ml-root{display:flex;flex-direction:column;gap:8px;width:100%;height:100%;box-sizing:border-box;
  padding:2px;font:12px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  color:#dbe0e8;min-height:0}
.ml-card{background:#202634;border:1px solid #2f3847;border-radius:10px;padding:10px 12px;
  box-sizing:border-box;min-height:0}
.ml-row{display:flex;align-items:center;gap:6px}
.ml-col{display:flex;flex-direction:column;gap:6px;min-height:0}
.ml-grow{flex:1 1 0;min-width:0}
.ml-spacer{flex:1}
.ml-label{display:block;margin:0 0 4px;font-size:11px;letter-spacing:.02em;color:#8b93a1}
.ml-muted{color:#6b7380;font-size:11px}
.ml-title{font-weight:600;font-size:15px;color:#e6e9ef}
.ml-input,.ml-textarea,.ml-select{box-sizing:border-box;width:100%;border:1px solid #39424f;
  background:#151a22;color:#dbe0e8;border-radius:6px;padding:6px 9px;font:inherit;outline:none;
  transition:border-color .12s,box-shadow .12s}
.ml-input:focus,.ml-textarea:focus,.ml-select:focus{border-color:#4a9eff;
  box-shadow:0 0 0 2px rgba(74,158,255,.16)}
.ml-textarea{resize:vertical;line-height:1.55;overflow:auto}
.ml-select{width:auto;min-width:110px;padding:4px 8px;cursor:pointer}
.ml-num{width:100%;box-sizing:border-box;border:1px solid #39424f;background:#151a22;color:#dbe0e8;
  border-radius:6px;padding:5px 6px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;
  text-align:center;outline:none;transition:border-color .12s,box-shadow .12s}
.ml-num:focus{border-color:#4a9eff;box-shadow:0 0 0 2px rgba(74,158,255,.16)}
.ml-num-cell small{display:block;margin-bottom:2px;font-size:10px;color:#6b7380;font-weight:400}
.ml-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid #3a4452;
  background:#262d3a;color:#dbe0e8;border-radius:6px;padding:5px 11px;font:inherit;cursor:pointer;
  transition:background .12s,border-color .12s,opacity .12s;white-space:nowrap}
.ml-btn:hover{background:#2f3847;border-color:#4a5566}
.ml-btn:disabled{opacity:.42;cursor:default}
.ml-btn:disabled:hover{background:#262d3a;border-color:#3a4452}
.ml-btn-primary{background:#245c9e;border-color:#2d6fbd;color:#fff}
.ml-btn-primary:hover{background:#2c6cb6;border-color:#3a82d6}
.ml-btn-active{background:#2b4f7d;border-color:#4a86c7;color:#eaf2ff}
.ml-btn-danger{background:#2e2731;border-color:#5a3b45;color:#ff9a9a}
.ml-btn-danger:hover{background:#3a2c36;border-color:#764752;color:#ffc0c0}
.ml-btn-ghost{border-color:transparent;background:transparent}
.ml-btn-ghost:hover{background:#2a3140;border-color:#3a4452}
.ml-btn-sm{padding:3px 8px;font-size:11px}
.ml-tabs{display:flex;align-items:center;gap:6px}
.ml-tab{border:1px solid #39424f;background:#232a37;color:#aab3c2;border-radius:6px;padding:5px 12px;
  font:inherit;cursor:pointer;transition:background .12s,border-color .12s,color .12s}
.ml-tab:hover{background:#2b3343;border-color:#4a5566}
.ml-tab.is-active{background:#2b4f7d;border-color:#4a86c7;color:#eaf2ff}
.ml-footer{margin-top:auto;padding-top:4px;display:flex;align-items:center}
.ml-sync{color:#6b7380;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
.ml-scroll::-webkit-scrollbar{width:7px;height:7px}
.ml-scroll::-webkit-scrollbar-track{background:transparent}
.ml-scroll::-webkit-scrollbar-thumb{background:#3a4452;border-radius:4px}
.ml-scroll::-webkit-scrollbar-thumb:hover{background:#4a5566}
`;

const BASE_STYLE_ID = "moss-layout-common-style";
// The saved blob is never edited by hand, so it stays off the canvas entirely.
const HIDDEN_WIDGETS = new Set(["state"]);
// These three carry links between the nodes: their row has to stay on the canvas
// or the input socket disappears with it, so the row is kept and flattened.
const LINKED_WIDGETS = new Set(["layout", "elements", "character_boxes"]);
const LAYOUT_OUTPUTS = new Set(["layout", "standard_prompt", "elements", "character_boxes"]);
const LINK_ROW_HEIGHT = 22;

// Hiding a widget removes its whole row, and the input socket goes with it.
// Keep a narrow row that shows the connection state instead of the JSON payload.
function drawLinkedRowLabel(ctx, node, widget, y, height) {
  const slot = node.inputs?.findIndex((input) => input.widget?.name === widget.name) ?? -1;
  const linked = slot >= 0 && node.inputs[slot].link != null;
  const label = widget.label ?? widget.displayName ?? widget.name;
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = linked ? "#9fd3ff" : "#8b93a1";
  ctx.fillText(`${label} · ${linked ? "已连线" : "未连线"}`, 15, y + height / 2);
  ctx.restore();
}

function compactLinkedWidget(widget) {
  widget.hidden = false;
  widget.computeSize = () => [0, LINK_ROW_HEIGHT];
  widget.draw = function (ctx, node, width, y, height) {
    drawLinkedRowLabel(ctx, node, widget, y, height);
  };
}

export function injectStyle(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}

function ensureBaseStyle() {
  injectStyle(BASE_STYLE_ID, BASE_CSS);
}

export function h(tag, attrs, children) {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (key === "text") element.textContent = value;
      else if (key === "class") element.className = value;
      else if (key === "style") {
        for (const [name, styleValue] of Object.entries(value)) {
          if (name.startsWith("--")) element.style.setProperty(name, styleValue);
          else element.style[name] = styleValue;
        }
      } else if (key.startsWith("on") && typeof value === "function") {
        element.addEventListener(key.slice(2), value);
      } else element.setAttribute(key, value);
    }
  }
  if (children) for (const child of children) if (child) element.append(child);
  return element;
}

export function button(label, options = {}) {
  const { variant = "", title = null, disabled = false, onClick = null, className = "" } = options;
  const classes = ["ml-btn"];
  if (variant) classes.push(`ml-btn-${variant}`);
  if (className) classes.push(className);
  return h("button", {
    type: "button",
    class: classes.join(" "),
    title,
    disabled: disabled ? "disabled" : null,
    text: label,
    onclick: onClick,
  });
}

export function field(label, control) {
  return h("div", { class: "ml-col" }, [h("span", { class: "ml-label", text: label }), control]);
}

export function syncFooter() {
  return h("div", { class: "ml-footer" }, [h("span", { class: "ml-sync", text: SYNC_LABEL })]);
}

export function tagColor(element) {
  return TAG_COLORS[element?.tag] ?? TAG_COLORS["固定"];
}

export function typeLabel(type) {
  return TYPE_LABEL[type] ?? "物体";
}

export function padIndex(index) {
  return String(index + 1).padStart(2, "0");
}

export function elementLabel(element, index) {
  const name = (element?.name ?? "").trim();
  return `${padIndex(index)} ${name || typeLabel(element?.type)}`;
}

export function nextElementName(type) {
  return `新${typeLabel(type)}`;
}

export function autosizeTextarea(element) {
  if (!element || !element.isConnected) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight + 2}px`;
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

// Percent boxes keep two decimals so a pixel edge survives the round trip.
export function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function clampBox(box) {
  const values = Array.isArray(box) ? box.slice(0, 4) : [];
  while (values.length < 4) values.push(0);
  const x = round2(clamp(finiteNumber(values[0], 0), 0, 99.99));
  const y = round2(clamp(finiteNumber(values[1], 0), 0, 99.99));
  const width = clamp(finiteNumber(values[2], 1), 0.01, 100 - x);
  const height = clamp(finiteNumber(values[3], 1), 0.01, 100 - y);
  return [round2(x), round2(y), round2(width), round2(height)];
}

export function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

export function splitList(text) {
  return stringList(String(text ?? "").split(","));
}

function finiteNumber(value, fallback) {
  if (!["number", "string"].includes(typeof value) || (typeof value === "string" && !value.trim())) return fallback;
  if (typeof value === "string" && !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value.trim())) return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function canvasSize(canvas) {
  const width = clamp(Math.round(finiteNumber(canvas?.width, DEFAULT_WIDTH) || DEFAULT_WIDTH), MIN_CANVAS, MAX_CANVAS);
  const height = clamp(Math.round(finiteNumber(canvas?.height, DEFAULT_HEIGHT) || DEFAULT_HEIGHT), MIN_CANVAS, MAX_CANVAS);
  return { width, height };
}

function backgroundElement(prompt = "") {
  return {
    name: "背景 · 固定铺满",
    tag: "固定",
    type: "background",
    box: [0, 0, 100, 100],
    prompt,
  };
}

export function createLayout(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
  const size = canvasSize({ width, height });
  return {
    schema: SCHEMA,
    coordinate_system: COORDINATE_SYSTEM,
    canvas: size,
    global_prompt: "",
    meta: [],
    canvas_kind: "",
    palette: [],
    elements: [backgroundElement()],
  };
}

function normalizeElement(raw, index) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const tag = TAG_IDS.includes(source.tag) ? source.tag : "主体";
  let type = TYPE_IDS.includes(source.type) ? source.type : TAG_TYPE[tag] ?? "object";
  const name = typeof source.name === "string" && source.name.trim()
    ? source.name.trim()
    : `元素 ${String(index + 1).padStart(2, "0")}`;
  const element = {
    name,
    tag: type === "background" ? "固定" : tag,
    type,
    box: type === "background" ? [0, 0, 100, 100] : clampBox(source.box),
    prompt: typeof source.prompt === "string" ? source.prompt : "",
  };
  if (type === "text") {
    element.text = typeof source.text === "string" ? source.text : "";
    const typography = normalizeTypography(source.typography);
    if (typography) element.typography = typography;
  }
  if (type !== "background") {
    if (source.locked === true) element.locked = true;
    if (typeof source.group_id === "string" && source.group_id.trim()) element.group_id = source.group_id.trim();
    const tags = stringList(source.tags);
    if (tags.length) element.tags = tags;
    const palette = stringList(source.palette);
    if (palette.length) element.palette = palette;
  }
  return element;
}

export function normalizeLayout(raw, fallback) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const size = canvasSize(source.canvas ?? fallback);
  const globalPrompt = typeof source.global_prompt === "string" ? source.global_prompt : "";
  const list = Array.isArray(source.elements) ? source.elements : [];
  const elements = [];
  let background = null;
  for (const entry of list) {
    const element = normalizeElement(entry, elements.length);
    if (element.type === "background") {
      if (!background) background = element;
      continue;
    }
    elements.push(element);
  }
  const normalized = [background ?? backgroundElement(), ...elements];
  return {
    schema: SCHEMA,
    coordinate_system: COORDINATE_SYSTEM,
    canvas: size,
    global_prompt: globalPrompt,
    meta: stringList(source.meta),
    canvas_kind: CANVAS_KINDS.some((kind) => kind.id === source.canvas_kind) ? source.canvas_kind : "",
    palette: stringList(source.palette),
    elements: normalized,
  };
}

export function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

function* jsonObjects(text) {
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
          yield text.slice(start, index + 1);
          break;
        }
      }
    }
  }
}

export function isOfficialDraft(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value.items)
    && value.bbox_coord_space === "abs" && value.bbox_format === "xyxy";
}

export function isCompiledPrompt(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value.items)
    && value.bbox_coord_space === "abs_centralized" && value.bbox_format === "yxyx";
}

function elementsFromItems(items, toBox) {
  return items
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => {
      const label = LABELS.includes(item.label) ? item.label : "object";
      const raw = Array.isArray(item.bbox) ? item.bbox.map((value) => finiteNumber(value, 0)) : [];
      const element = {
        name: `元素 ${String(index + 1).padStart(2, "0")}`,
        tag: label === "character" ? "人物" : label === "text" ? "文字" : "主体",
        type: label,
        box: toBox([raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0, raw[3] ?? 0]),
        prompt: typeof item.caption === "string" ? item.caption : "",
      };
      if (label === "text") element.text = typeof item.text === "string" ? item.text : "";
      if (Array.isArray(item.tags)) element.tags = stringList(item.tags);
      if (Array.isArray(item.palette)) element.palette = stringList(item.palette);
      return element;
    });
}

function summaryFields(summary, canvas) {
  const source = summary && typeof summary === "object" ? summary : {};
  return {
    canvas,
    global_prompt: typeof source.caption === "string" ? source.caption : "",
    meta: stringList(source.meta),
    canvas_kind: CANVAS_KINDS.some((kind) => kind.id === source.canvas) ? source.canvas : "",
    palette: stringList(source.palette),
  };
}

// Convert the official abs/xyxy draft into the percent layout this editor stores.
export function layoutFromOfficialDraft(draft) {
  const size = canvasSize({ width: draft.width, height: draft.height });
  const elements = elementsFromItems(draft.items, ([x1, y1, x2, y2]) => [
    x1 / size.width * 100, y1 / size.height * 100,
    (x2 - x1) / size.width * 100, (y2 - y1) / size.height * 100]);
  return { ...summaryFields(draft.summary, size), elements: [backgroundElement(), ...elements] };
}

// The compiled prompt carries no canvas size, so it is mapped onto the current one.
export function layoutFromCompiledPrompt(prompt, size) {
  const canvas = canvasSize(size);
  const halfWidth = canvas.width / 2;
  const halfHeight = canvas.height / 2;
  const elements = elementsFromItems(prompt.items, ([yMin, xMin, yMax, xMax]) => [
    (xMin + halfWidth) / canvas.width * 100, (yMin + halfHeight) / canvas.height * 100,
    (xMax - xMin) / canvas.width * 100, (yMax - yMin) / canvas.height * 100]);
  return { ...summaryFields(prompt.summary, canvas), elements: [backgroundElement(), ...elements] };
}

export function candidateLayout(value, size) {
  if (Array.isArray(value)) return { elements: value };
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value.elements) && (!Object.hasOwn(value, "schema") || value.schema === SCHEMA)
      && (!Object.hasOwn(value, "coordinate_system") || value.coordinate_system === COORDINATE_SYSTEM)) return value;
  if (isOfficialDraft(value)) return layoutFromOfficialDraft(value);
  if (isCompiledPrompt(value)) return layoutFromCompiledPrompt(value, size);
  return null;
}

export function readRawLayout(raw, size) {
  if (raw && typeof raw === "object") return candidateLayout(raw, size);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = function* () { yield text; yield unfenced; yield* jsonObjects(text); };
  for (const candidateText of candidates()) {
    let value;
    try { value = JSON.parse(candidateText); } catch { continue; }
    if (Array.isArray(value) || Array.isArray(value?.elements) || isOfficialDraft(value) || isCompiledPrompt(value)) {
      return candidateLayout(value, size);
    }
  }
  return null;
}

export function parseLayout(raw, size) {
  const candidate = readRawLayout(raw, size);
  return candidate ? normalizeLayout(candidate) : null;
}

export function serializeLayout(layout) {
  return JSON.stringify(layout);
}

export function serializePretty(layout) {
  return JSON.stringify(layout, null, 2);
}

function pixelEdges(low, high) {
  const start = Math.floor(low + 0.5);
  const end = Math.floor(high + 0.5);
  return end <= start ? [Math.floor(low), Math.ceil(high)] : [start, end];
}

function compiledItem(element, width, height, character = false) {
  const [left, top, boxWidth, boxHeight] = element.box;
  const x1 = (left / 100) * width;
  const y1 = (top / 100) * height;
  const x2 = ((left + boxWidth) / 100) * width;
  const y2 = ((top + boxHeight) / 100) * height;
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const [yMin, yMax] = pixelEdges(y1, y2);
  const [xMin, xMax] = pixelEdges(x1, x2);
  const hasText = element.type === "text" && (element.text ?? "").trim();
  const item = {
    label: hasText ? "text" : character || element.type === "character" ? "character" : "object",
    caption: textCaption(element),
    bbox: [yMin - halfHeight, xMin - halfWidth, yMax - halfHeight, xMax - halfWidth],
  };
  if (item.label === "text") item.text = element.text;
  for (const key of ["tags", "palette"]) {
    const values = stringList(element[key]);
    if (values.length) item[key] = values;
  }
  return item;
}

function summaryBlock(layout, caption) {
  const summary = { caption };
  if (layout.meta.length) summary.meta = layout.meta;
  if (layout.canvas_kind) summary.canvas = layout.canvas_kind;
  if (layout.palette.length) summary.palette = layout.palette;
  return summary;
}

export function compilePrompt(layout, characters = []) {
  const normalized = normalizeLayout(layout);
  const { width, height } = normalized.canvas;
  const foreground = normalized.elements.filter(element => element.type !== "background" && (element.type !== "text" || element.text.trim()));
  const background = normalized.elements[0].prompt.trim();
  const caption = [...new Set([normalized.global_prompt.trim(), background].filter(Boolean))].join("\n");
  let prompt = caption;
  if (foreground.length) {
    prompt = JSON.stringify({
      summary: summaryBlock(normalized, caption),
      items: foreground.map((element, index) => compiledItem(element, width, height, characters.includes(index + 1))),
      bbox_coord_space: "abs_centralized",
      bbox_format: "yxyx",
    });
  }
  return { prompt, standard: serializePretty(normalized) };
}

// The editable draft the official compiler takes: absolute pixels, xyxy.
export function officialDraft(layout) {
  const normalized = normalizeLayout(layout);
  const { width, height } = normalized.canvas;
  // Whole pixels: the same snapping the compiler applies, so a round trip is stable.
  const scale = (value, size) => Math.round(value / 100 * size);
  return {
    width,
    height,
    bbox_coord_space: "abs",
    bbox_format: "xyxy",
    summary: summaryBlock(normalized, normalized.global_prompt.trim() || normalized.elements[0].prompt.trim()),
    items: normalized.elements.slice(1).map((element) => {
      const [left, top, boxWidth, boxHeight] = element.box;
      const item = {
        label: LABELS.includes(element.type) ? element.type : "object",
        caption: textCaption(element) || element.name,
        bbox: [scale(left, width), scale(top, height),
          scale(left + boxWidth, width), scale(top + boxHeight, height)],
      };
      if (item.label === "text" && (element.text ?? "").trim()) item.text = element.text;
      if (element.tags?.length) item.tags = element.tags;
      if (element.palette?.length) item.palette = element.palette;
      return item;
    }),
  };
}

// ---------------------------------------------------------------------------
// Nodes share a layout only through their upstream layout connections. A
// separate canvas (including one in another graph) always owns a separate store.
// ---------------------------------------------------------------------------

const groups = new WeakMap();
const bindings = new Map();
const pendingGraphs = new WeakSet();
let dirtyHook = null;

export function setGraphDirtyHook(fn) {
  dirtyHook = fn;
}

function dirty() {
  if (dirtyHook) {
    try {
      dirtyHook();
    } catch (error) {
      console.warn("[moss-layout-ui] graph dirty hook failed", error);
    }
  }
}

function defaultSize(node) {
  const widthWidget = node?.widgets?.find((widget) => widget.name === "width");
  const heightWidget = node?.widgets?.find((widget) => widget.name === "height");
  return canvasSize({
    width: Number(widthWidget?.value),
    height: Number(heightWidget?.value),
  });
}

export function upstreamCanvas(node, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);
  const type = node.comfyClass ?? node.type;
  if (type === "MOSSLayoutCanvas") return node;
  if (type !== "Reroute" && type !== "MOSSLayoutElements" && type !== "MOSSLayoutStandardPrompt") return null;
  const names = type === "Reroute" ? [node.inputs?.[0]?.name] : ["layout", "elements", "character_boxes"];
  for (const name of names) {
    const slot = node.inputs?.findIndex((input) => input.name === name) ?? -1;
    if (slot < 0 || node.inputs[slot].link == null) continue;
    const source = node.getInputNode?.(slot);
    const sourceName = source?.outputs?.[node.getInputLink?.(slot)?.origin_slot ?? -1]?.name;
    // A link carrying something else (a compiled prompt, an image) is not a canvas.
    if (sourceName && !LAYOUT_OUTPUTS.has(sourceName)) continue;
    const canvas = upstreamCanvas(source, seen);
    if (canvas) return canvas;
  }
  return null;
}

function groupFor(entry) {
  const owner = upstreamCanvas(entry.node) ?? entry.node;
  let group = groups.get(owner);
  if (!group) {
    const saved = parseLayout(owner.widgets?.find((widget) => widget.name === "state")?.value);
    const size = defaultSize(owner);
    group = { layout: saved ?? createLayout(size.width, size.height), seeded: Boolean(saved), selection: -1, selections: [] };
    groups.set(owner, group);
  }
  // Disconnecting an editor preserves its last visible layout as a standalone
  // fallback. Reconnecting it uses the newly connected canvas as authority.
  if (entry.group && entry.group !== group && owner === entry.node && owner.comfyClass !== "MOSSLayoutCanvas" && owner.type !== "MOSSLayoutCanvas") {
    const saved = parseLayout(entry.widget?.value);
    if (saved) {
      group.layout = saved;
      group.seeded = true;
    }
  }
  entry.group = group;
  return group;
}

function callListener(listener, ...args) {
  try {
    listener?.(...args);
  } catch (error) {
    console.error("[moss-layout-ui] node update failed", error);
  }
}

function notify(group, origin, selectionOnly = false) {
  const entries = [];
  for (const entry of bindings.values()) if (groupFor(entry) === group) entries.push(entry);
  const edited = !selectionOnly && origin !== "configure" && origin !== "init";
  if (edited && entries.length) beginChange(entries[0].node.graph);
  for (const entry of entries) {
    if (!selectionOnly) {
      if (entry.widget) entry.widget.value = serializeLayout(group.layout);
      callListener(entry.onChange, group.layout, origin);
      for (const listener of [...entry.listeners]) callListener(listener, group.layout, origin);
    }
    for (const listener of [...entry.selectionListeners]) callListener(listener, group.selection, origin);
  }
  dirty();
}

let changeGraph = null;
let changeTimer = 0;

// ComfyUI marks a workflow modified and records undo steps only through the
// ChangeTracker, and writing widget.value never reaches it. Open one change for
// the whole edit and close it once the burst stops, so a run of keystrokes is a
// single undo step instead of sixty.
function beginChange(graph) {
  if (!graph?.beforeChange) return;
  if (changeGraph && changeGraph !== graph) commitChange();
  if (!changeGraph) {
    changeGraph = graph;
    graph.beforeChange();
  }
  clearTimeout(changeTimer);
  changeTimer = setTimeout(commitChange, 400);
}

export function commitChange() {
  if (!changeGraph) return;
  clearTimeout(changeTimer);
  const graph = changeGraph;
  changeGraph = null;
  graph.afterChange?.();
}

function refreshConnections(graph) {
  if (!graph || pendingGraphs.has(graph)) return;
  pendingGraphs.add(graph);
  // LiteGraph changes both ends of links in stages, including during import.
  queueMicrotask(() => {
    pendingGraphs.delete(graph);
    const changed = new Set();
    for (const entry of bindings.values()) {
      if (entry.node.graph !== graph) continue;
      const previous = entry.group;
      const group = groupFor(entry);
      if (previous !== group) changed.add(group);
    }
    for (const group of changed) notify(group, "connections");
  });
}

export function getLayoutStore(node) {
  const existing = bindings.get(node);
  if (existing) return existing.store;
  const entry = { node, widget: null, onChange: null, group: null, listeners: new Set(), selectionListeners: new Set() };
  const current = () => groupFor(entry);
  const store = {
    get() {
      return current().layout;
    },
    get seeded() {
      return current().seeded;
    },
    get selection() {
      return current().selection;
    },
    get selections() {
      return current().selections.slice();
    },
    subscribe(listener) {
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    subscribeSelection(listener) {
      entry.selectionListeners.add(listener);
      return () => entry.selectionListeners.delete(listener);
    },
    setSelection(index, origin = "selection") {
      this.setSelections(Number.isInteger(index) && index >= 0 ? [index] : [], origin);
    },
    setSelections(indices, origin = "selection") {
      const state = current();
      const next = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < state.layout.elements.length);
      if (next.length > 1 && next.includes(0)) next.splice(next.indexOf(0), 1);
      if (JSON.stringify(state.selections) === JSON.stringify(next)) return;
      state.selections = next;
      state.selection = next.at(-1) ?? -1;
      notify(state, origin, true);
    },
    selectElement(index, origin, { toggle = false } = {}) {
      const members = elementIndices(current().layout, index);
      if (!toggle || index < 1) return this.setSelections([...members.filter(i => i !== index), ...members.filter(i => i === index)], origin);
      const allSelected = members.every(i => current().selections.includes(i));
      const remaining = current().selections.filter(i => !members.includes(i));
      this.setSelections(allSelected ? remaining : [...remaining, ...members.filter(i => i !== index), index], origin);
    },
    update(mutator, origin) {
      const state = current();
      const layout = state.layout;
      mutator(layout);
      state.layout = normalizeLayout(layout);
      state.seeded = true;
      state.selections = state.selections.filter(i => i < state.layout.elements.length);
      state.selection = state.selections.at(-1) ?? -1;
      notify(state, origin);
      return state.layout;
    },
    mutateElement(index, patch, origin) {
      return this.update((layout) => {
        const element = layout.elements[index];
        if (!element || element.type === "background") return;
        Object.assign(element, patch);
        if (element.type === "text" && typeof element.text !== "string") element.text = "";
      }, origin);
    },
    replace(next, origin) {
      const state = current();
      const layout = parseLayout(next) ?? normalizeLayout(next);
      state.layout = layout;
      state.seeded = true;
      state.selections = state.selections.filter(i => i < layout.elements.length);
      state.selection = state.selections.at(-1) ?? -1;
      notify(state, origin);
      return layout;
    },
    importLayout(next, origin) {
      // The compiled prompt has no canvas size, so it maps onto the current one.
      const layout = parseLayout(next, current().layout.canvas);
      if (!layout) throw new Error("无法解析布局：需要 moss-layout/v1 的 elements 数组和 percent_xywh 坐标。");
      const canvas = upstreamCanvas(node);
      canvas?.__mossCanvasUI?.syncSize();
      for (const name of ["width", "height"]) {
        if (canvas?.inputs?.some(input => input.name === name && input.link != null)) layout.canvas[name] = current().layout.canvas[name];
      }
      this.replace(layout, origin);
      this.setSelection(-1, origin);
      return layout;
    },
    register(registeredNode, onChange) {
      if (registeredNode !== node) throw new Error("MOSS layout store belongs to a different node");
      // Every text widget of these nodes is replaced by the DOM editor; keep the
      // serialized values but shrink the rows so the node body is all UI.
      for (const entry of node.widgets ?? []) {
        if (HIDDEN_WIDGETS.has(entry.name)) {
          entry.hidden = true;
          entry.computeSize = () => [0, -4];
          entry.options = entry.options ?? {};
          entry.options.getMinHeight = () => 0;
          entry.options.getMaxHeight = () => 0;
          continue;
        }
        if (LINKED_WIDGETS.has(entry.name)) compactLinkedWidget(entry);
      }
      // A connected widget row is drawn by the frontend itself and never reaches
      // widget.draw. When it has no row height to draw its own dimmed label in,
      // paint the label here so the row is still readable.
      const previousForeground = node.onDrawForeground;
      node.onDrawForeground = function (ctx, canvas) {
        const result = previousForeground?.apply(this, arguments);
        for (const row of this.widgets ?? []) {
          if (!LINKED_WIDGETS.has(row.name) || row.height) continue;
          const slot = this.inputs?.findIndex((input) => input.widget?.name === row.name) ?? -1;
          if (slot < 0 || this.inputs[slot].link == null) continue;
          const y = row.last_y ?? row.y;
          if (!Number.isFinite(y)) continue;
          drawLinkedRowLabel(ctx, this, row, y, LINK_ROW_HEIGHT);
        }
        return result;
      };
      const widget = node.widgets?.find((entry) => entry.name === "state");
      if (!widget) console.warn("[moss-layout-ui] 找不到 state widget，画布修改不会被保存", node.type);
      entry.widget = widget;
      entry.onChange = onChange;

      function syncWidget() {
        if (widget) widget.value = serializeLayout(current().layout);
      }
      syncWidget();
      onChange?.(current().layout, "init");

      const originalConfigure = node.onConfigure;
      node.onConfigure = function (...args) {
        const result = originalConfigure?.apply(this, args);
        const saved = parseLayout(widget?.value);
        const state = current();
        const canvas = upstreamCanvas(node);
        // The owning canvas wins regardless of node configuration order. Editors
        // may seed an empty group, but cannot overwrite a connected canvas.
        if (saved && (canvas === node || !canvas || !state.seeded)) {
          state.layout = saved;
          state.seeded = true;
        }
        if (state.selection < 0 && state.layout.elements.length > 1) {
          state.selection = 1;
          state.selections = [...elementIndices(state.layout, 1).filter(i => i !== 1), 1];
        }
        notify(state, "configure");
        refreshConnections(node.graph);
        return result;
      };

      for (const hook of ["onConnectionsChange", "onAdded"]) {
        const original = node[hook];
        node[hook] = function (...args) {
          const result = original?.apply(this, args);
          dirty();
          refreshConnections(node.graph);
          return result;
        };
      }
      const originalRemoved = node.onRemoved;
      node.onRemoved = function (...args) {
        commitChange();
        bindings.delete(node);
        refreshConnections(node.graph);
        return originalRemoved?.apply(this, args);
      };

      return {
        syncWidget,
        get layout() {
          return current().layout;
        },
      };
    },
  };
  entry.store = store;
  bindings.set(node, entry);
  return store;
}

ensureBaseStyle();
