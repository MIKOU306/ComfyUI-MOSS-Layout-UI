// Shared schema, store and look for the three MOSS layout poster nodes.
// Plain ES module: no ComfyUI imports, so the same file also runs in the
// static harness pages under tools/moss-layout-ui/harness/.

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
const HIDDEN_WIDGETS = new Set(["state", "layout", "elements", "character_boxes"]);

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

export function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

export function clampBox(box) {
  const values = Array.isArray(box) ? box.map(Number) : [];
  while (values.length < 4) values.push(0);
  const x = clamp(Number.isFinite(values[0]) ? values[0] : 0, 0, 100);
  const y = clamp(Number.isFinite(values[1]) ? values[1] : 0, 0, 100);
  const width = clamp(Number.isFinite(values[2]) ? values[2] : 1, 0.1, 100 - x);
  const height = clamp(Number.isFinite(values[3]) ? values[3] : 1, 0.1, 100 - y);
  return [round1(x), round1(y), round1(width), round1(height)];
}

function canvasSize(canvas) {
  const width = clamp(Math.round(Number(canvas?.width) || DEFAULT_WIDTH), MIN_CANVAS, MAX_CANVAS);
  const height = clamp(Math.round(Number(canvas?.height) || DEFAULT_HEIGHT), MIN_CANVAS, MAX_CANVAS);
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
    elements: [backgroundElement()],
  };
}

function normalizeElement(raw, index) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const tag = TAG_IDS.includes(source.tag) ? source.tag : "主体";
  let type = TYPE_IDS.includes(source.type) ? source.type : TAG_TYPE[tag] ?? "object";
  if (type === "background" && index > 0) type = "object";
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
  if (type === "text") element.text = typeof source.text === "string" ? source.text : "";
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
    elements: normalized,
  };
}

export function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

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

function candidateLayout(value) {
  if (Array.isArray(value)) return { elements: value };
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value.elements)) return value;
  if (Array.isArray(value.items)) return null;
  return null;
}

export function parseLayout(raw) {
  if (raw && typeof raw === "object") {
    const candidate = candidateLayout(raw);
    return candidate ? normalizeLayout(candidate) : null;
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  const candidates = [text, ...jsonObjects(text)];
  for (const candidateText of candidates) {
    let value;
    try {
      value = JSON.parse(candidateText);
    } catch (error) {
      continue;
    }
    const candidate = candidateLayout(value);
    if (candidate) return normalizeLayout(candidate);
  }
  return null;
}

export function serializeLayout(layout) {
  return JSON.stringify(layout);
}

export function serializePretty(layout) {
  return JSON.stringify(layout, null, 2);
}

export function elementsJson(layout) {
  return JSON.stringify(layout.elements);
}

export function characterBoxesJson(layout) {
  const boxes = layout.elements
    .filter((element) => element.type === "character")
    .map((element) => ({ name: element.name, box: element.box }));
  return JSON.stringify(boxes);
}

function compiledItem(element, width, height) {
  const [left, top, boxWidth, boxHeight] = element.box;
  const x1 = (left / 100) * width;
  const y1 = (top / 100) * height;
  const x2 = ((left + boxWidth) / 100) * width;
  const y2 = ((top + boxHeight) / 100) * height;
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const hasText = element.type === "text" && (element.text ?? "").trim();
  const item = {
    label: hasText ? "text" : element.type === "character" ? "character" : "object",
    caption: element.prompt ?? "",
    bbox: [
      Math.floor(y1) - halfHeight,
      Math.floor(x1) - halfWidth,
      Math.ceil(y2) - halfHeight,
      Math.ceil(x2) - halfWidth,
    ],
  };
  if (item.label === "text") item.text = element.text;
  return item;
}

export function compilePrompt(layout) {
  const normalized = normalizeLayout(layout);
  const { width, height } = normalized.canvas;
  const foreground = normalized.elements.filter((element) => element.type !== "background");
  const caption = normalized.global_prompt.trim();
  let prompt = caption;
  if (foreground.length) {
    prompt = JSON.stringify({
      summary: { caption },
      items: foreground.map((element) => compiledItem(element, width, height)),
      bbox_coord_space: "abs_centralized",
      bbox_format: "yxyx",
    });
  }
  return { prompt, standard: serializePretty(normalized) };
}

// ---------------------------------------------------------------------------
// Shared layout store: every MOSS layout node edits the same object.
// ---------------------------------------------------------------------------

const state = {
  layout: null,
  seeded: false,
  selection: -1,
};

const listeners = new Set();
const selectionListeners = new Set();
const registered = new Map();
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

function notify(origin) {
  if (!state.layout) return;
  for (const entry of registered.values()) {
    if (entry.widget) entry.widget.value = serializeLayout(state.layout);
    try {
      entry.onChange?.(state.layout, origin);
    } catch (error) {
      console.error("[moss-layout-ui] node update failed", error);
    }
  }
  for (const listener of [...listeners]) {
    try {
      listener(state.layout, origin);
    } catch (error) {
      console.error("[moss-layout-ui] store listener failed", error);
    }
  }
  dirty();
}

function defaultSize(node) {
  const widthWidget = node?.widgets?.find((widget) => widget.name === "width");
  const heightWidget = node?.widgets?.find((widget) => widget.name === "height");
  return canvasSize({
    width: Number(widthWidget?.value),
    height: Number(heightWidget?.value),
  });
}

function ensureLayout(node) {
  if (!state.layout) state.layout = createLayout(defaultSize(node).width, defaultSize(node).height);
  return state.layout;
}

export const layoutStore = {
  get() {
    return state.layout ?? createLayout();
  },
  get seeded() {
    return state.seeded;
  },
  get selection() {
    return state.selection;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  subscribeSelection(listener) {
    selectionListeners.add(listener);
    return () => selectionListeners.delete(listener);
  },
  setSelection(index, origin = "selection") {
    const next = Number.isInteger(index) ? index : -1;
    if (state.selection === next) return;
    state.selection = next;
    for (const listener of [...selectionListeners]) {
      try {
        listener(next, origin);
      } catch (error) {
        console.error("[moss-layout-ui] selection listener failed", error);
      }
    }
    dirty();
  },
  update(mutator, origin) {
    const layout = ensureLayout();
    mutator(layout);
    state.layout = normalizeLayout(layout);
    notify(origin);
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
    const layout = parseLayout(next) ?? normalizeLayout(next);
    state.layout = layout;
    state.seeded = true;
    if (state.selection >= layout.elements.length) state.selection = -1;
    notify(origin);
    return layout;
  },
  reset() {
    state.layout = null;
    state.seeded = false;
    state.selection = -1;
  },
  register(node, onChange) {
    // Every text widget of these nodes is replaced by the DOM editor; keep the
    // serialized values but shrink them to nothing so the node body is all UI.
    for (const entry of node.widgets ?? []) {
      if (!HIDDEN_WIDGETS.has(entry.name)) continue;
      entry.hidden = true;
      entry.computeSize = () => [0, -4];
      entry.options = entry.options ?? {};
      entry.options.getMinHeight = () => 0;
      entry.options.getMaxHeight = () => 0;
    }
    const widget = node.widgets?.find((entry) => entry.name === "state");
    ensureLayout(node);
    const entry = { node, widget, onChange };
    registered.set(node, entry);

    function syncWidget() {
      if (widget && state.layout) widget.value = serializeLayout(state.layout);
    }
    syncWidget();
    onChange?.(state.layout, "init");

    const originalConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
      const result = originalConfigure?.apply(this, args);
      const saved = parseLayout(widget?.value);
      if (!state.seeded && saved) {
        state.layout = saved;
        state.seeded = true;
      }
      ensureLayout(node);
      if (state.selection < 0 && state.layout.elements.length > 1) state.selection = 1;
      syncWidget();
      onChange?.(state.layout, "configure");
      return result;
    };

    const originalRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
      registered.delete(node);
      if (!registered.size) layoutStore.reset();
      return originalRemoved?.apply(this, args);
    };

    return {
      syncWidget,
      get layout() {
        return state.layout;
      },
    };
  },
};

ensureBaseStyle();
