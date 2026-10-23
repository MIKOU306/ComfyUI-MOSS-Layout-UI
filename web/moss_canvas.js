// MOSS 构图布画 · Tag 画笔 — the drawing board of the layout poster workflow.
import {
  h, injectStyle, getLayoutStore, setGraphDirtyHook,
  TAG_IDS, TAG_COLORS, TAG_TYPE,
  clampBox, elementLabel, nextElementName,
  tagColor, syncFooter,
} from "./moss_common.js";
import { boundsOf, positionLocked, selectionUnits, translatedBoxes, resizedBoxes, arrangedBoxes, snapBox } from "./moss_edit.js";

import { inputNumber } from "./moss_checks.js";
import { drawTextPreview } from "./moss_text.js";

const CLASS = "MOSSLayoutCanvas";
const STYLE_ID = "moss-layout-canvas-style";
const MIN_BOX = 0.8;
const HANDLE_SIZE = 8;
const HISTORY_LIMIT = 60;
const FONT = '600 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const CSS = `
.mlc-root{position:relative}
.mlc-tools{padding:9px 11px;gap:7px;display:flex;flex-direction:column}
.mlc-tool-row{display:flex;align-items:center;gap:6px}
.mlc-tool-row .mlc-object{margin-left:2px;min-width:92px;padding:4px 8px}
.mlc-clear{margin-left:auto;color:#ff9a9a;border-color:#5a3b45;background:#2e2731}
.mlc-clear:hover{background:#3a2c36;border-color:#764752;color:#ffc0c0}
.mlc-tags{display:flex;flex-wrap:wrap;gap:6px}
.mlc-tag{position:relative;border:1px solid #39424f;background:#232a37;color:#c9d0da;border-radius:6px;
  padding:4px 11px 4px 13px;font:inherit;cursor:pointer;transition:background .12s,border-color .12s,color .12s}
.mlc-tag::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;
  border-radius:6px 0 0 6px;background:var(--mlc-tag,#8a8f98)}
.mlc-tag:hover{background:#2b3343;border-color:#4a5566;color:#e6e9ef}
.mlc-tag.is-active{background:#2b3f5c;border-color:#4a86c7;color:#eaf2ff}
.mlc-template{display:flex;align-items:center;gap:8px;color:#c9d0da}
.mlc-check{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.mlc-check input{accent-color:#3b7dd8;width:13px;height:13px;margin:0;cursor:pointer}
.mlc-template-hint{color:#6b7380;font-size:11px}
.mlc-status-row{display:flex;align-items:center;gap:6px}
.mlc-status{color:#8b93a1;font-size:11px}
.mlc-edit-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mlc-selection{font-size:11px;color:#9facbf;min-width:72px}
.mlc-snap{margin-left:auto}
.mlc-align .ml-btn{padding:4px 8px;font-size:11px}
.mlc-root .ml-btn:disabled{opacity:.35;cursor:default}
.mlc-canvas:focus{outline:none}
.mlc-stage{position:relative;flex:1 1 0;min-height:300px;border:1px solid #2f3847;border-radius:10px;
  background:#12161d;overflow:hidden}
.mlc-canvas{display:block;width:100%;height:100%;touch-action:none}
.mlc-hint{color:#6b7380;font-size:11px;line-height:1.5;padding:0 2px}
.mlc-modal{position:absolute;inset:0;background:rgba(6,8,12,.68);display:flex;align-items:center;
  justify-content:center;z-index:20;border-radius:10px}
.mlc-modal-body{width:min(420px,88%);background:#202634;border:1px solid #3a4452;border-radius:10px;
  padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 40px rgba(0,0,0,.5)}
.mlc-modal-title{font-size:14px;font-weight:600;color:#e6e9ef}
.mlc-modal textarea{min-height:96px}
.mlc-modal-actions{display:flex;justify-content:flex-end;gap:8px}
`;

function mountCanvas(node) {
  const layoutStore = getLayoutStore(node);
  injectStyle(STYLE_ID, CSS);
  const sizeWidgets = {
    width: node.widgets?.find((widget) => widget.name === "width"),
    height: node.widgets?.find((widget) => widget.name === "height"),
  };
  let activeTag = "主体";
  let mode = "draw";
  let hover = -1;
  let drag = null;
  let frame = 0;
  let guides = [];
  let template = { enabled: true, prompt: "" };
  const history = [];
  const redo = [];
  const nudgeBurst = { before: null, at: 0 };

  const status = h("span", { class: "mlc-status", text: "" });
  const undoButton = h("button", { type: "button", class: "ml-btn ml-btn-sm", text: "撤销", disabled: "disabled" });
  const redoButton = h("button", { type: "button", class: "ml-btn ml-btn-sm", text: "重做", disabled: "disabled" });
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redoAction);

  const modeDraw = h("button", { type: "button", class: "ml-btn mlc-mode-btn", text: "框选" });
  const modeSelect = h("button", { type: "button", class: "ml-btn mlc-mode-btn", text: "选择 / 移动" });
  modeDraw.addEventListener("click", () => setMode("draw"));
  modeSelect.addEventListener("click", () => setMode("select"));

  const objectSelect = h("select", { class: "ml-select mlc-object", onchange: () => {
    if (objectSelect.value === "") return;
    layoutStore.selectElement(Number(objectSelect.value), node.id);
    objectSelect.value = "";
  } }, [h("option", { value: "", text: "对象" })]);

  const clearButton = h("button", {
    type: "button",
    class: "ml-btn mlc-clear ml-btn-sm",
    text: "清空画布",
    onclick: clearCanvas,
  });

  const tagButtons = TAG_IDS.filter((tag) => tag !== "固定").map((tag) => {
    const button = h("button", {
      type: "button",
      class: "mlc-tag",
      text: tag,
      style: { "--mlc-tag": TAG_COLORS[tag] },
      onclick: () => {
        activeTag = tag;
        for (const entry of tagButtons) entry.classList.toggle("is-active", entry === button);
      },
    });
    return button;
  });

  const templateCheck = h("input", { type: "checkbox", onchange: () => {
    template.enabled = templateCheck.checked;
  } });
  templateCheck.checked = true;

  const modal = h("div", { class: "mlc-modal", style: { display: "none" } });
  const selectionLabel = h("span", { class: "mlc-selection" });
  const groupButton = h("button", { type: "button", class: "ml-btn ml-btn-sm", text: "编组", title: "整体选择、移动与缩放 · Ctrl+G", onclick: groupSelection });
  const ungroupButton = h("button", { type: "button", class: "ml-btn ml-btn-sm", text: "解组", title: "Ctrl+Shift+G", onclick: ungroupSelection });
  const lockButton = h("button", { type: "button", class: "ml-btn ml-btn-sm", text: "锁定位置", title: "锁定位置、大小并防止误删，文案仍可编辑", onclick: toggleLock });
  const snapCheck = h("input", { type: "checkbox" });
  snapCheck.checked = node.properties?.moss_snap === true;
  snapCheck.addEventListener("change", () => {
    node.properties = node.properties ?? {};
    node.properties.moss_snap = snapCheck.checked;
    guides = [];
    requestDraw();
  });
  const alignButtons = [
    ["start-x", "左对齐"], ["center-x", "水平居中"], ["end-x", "右对齐"],
    ["start-y", "顶对齐"], ["center-y", "垂直居中"], ["end-y", "底对齐"],
    ["distribute-x", "水平等距"], ["distribute-y", "垂直等距"],
  ].map(([action, text]) => h("button", { type: "button", class: "ml-btn ml-btn-sm", text,
    "data-action": action, title: action.startsWith("distribute") ? "至少选中三个对象或组，保持首尾位置，均分间距" : "多选时按选区对齐；单个对象或组按画布对齐",
    onclick: () => arrangeSelection(action) }));

  const root = h("div", { class: "ml-root mlc-root" }, [
    h("div", { class: "ml-card mlc-tools" }, [
      h("div", { class: "mlc-tool-row" }, [
        modeDraw, modeSelect, objectSelect, clearButton,
      ]),
      h("div", { class: "mlc-tags" }, tagButtons),
      h("div", { class: "mlc-template" }, [
        h("label", { class: "mlc-check" }, [templateCheck, h("span", { text: "新框模板" })]),
        h("button", { type: "button", class: "ml-btn ml-btn-sm", text: "编辑模板", onclick: openTemplate }),
        h("span", { class: "mlc-template-hint", text: "模板只在新建框时填入" }),
      ]),
      h("div", { class: "mlc-edit-row" }, [selectionLabel, groupButton, ungroupButton, lockButton,
        h("label", { class: "mlc-check mlc-snap", title: "吸附到画布、其他对象的边缘或中心，拖动时显示参考线" }, [snapCheck, h("span", { text: "吸附" })])]),
      h("div", { class: "mlc-edit-row mlc-align" }, alignButtons),
      h("div", { class: "mlc-status-row" }, [
        status,
        h("span", { class: "ml-spacer" }),
        undoButton, redoButton,
      ]),
    ]),
    h("div", { class: "mlc-stage" }, [ ]),
    h("div", { class: "mlc-hint", text: "Shift 点选多选；选择模式空白拖动框选。Alt 轮选重叠框。方向键微调 0.1%，Shift 为 1%；Ctrl+G 编组。" }),
    h("div", { class: "mlc-hint", text: "模型只识别 物体 / 人物 / 文字：图片、装饰、版式都按物体下发；需要额外语义请填元素的 tags。" }),
    syncFooter(),
    modal,
  ]);

  const stage = root.querySelector(".mlc-stage");
  const canvas = h("canvas", { class: "mlc-canvas", tabindex: "0", "aria-label": "布局画布，可使用方向键微调选区" });
  stage.append(canvas);
  const context = canvas.getContext("2d");
  const view = { x: 0, y: 0, w: 1, h: 1 };
  let viewStale = true;

  const domWidget = node.addDOMWidget("moss_canvas_ui", "MOSSLayoutCanvas", root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 520,
  });
  domWidget.serialize = false;

  setMode("draw");
  for (const button of tagButtons) if (button.textContent === activeTag) button.classList.add("is-active");

  const selectionCleanup = layoutStore.subscribeSelection(() => { refreshEditButtons(); requestDraw(); });

  // ------------------------------------------------------------------
  // history
  // ------------------------------------------------------------------
  function snapshot() {
    return JSON.stringify(layoutStore.get());
  }

  function pushHistory(before) {
    // A held arrow key nudges many times; the whole run stays one undo step.
    if (before !== nudgeBurst.before) nudgeBurst.before = null;
    history.push({ layout: before ?? snapshot(), selection: layoutStore.selections });
    if (history.length > HISTORY_LIMIT) history.shift();
    redo.length = 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    undoButton.disabled = history.length === 0;
    redoButton.disabled = redo.length === 0;
  }

  function undo() {
    drag = null;
    guides = [];
    if (!history.length) return;
    redo.push({ layout: snapshot(), selection: layoutStore.selections });
    const previous = history.pop();
    layoutStore.replace(previous.layout, node.id);
    layoutStore.setSelections(previous.selection, node.id);
    updateHistoryButtons();
  }

  function redoAction() {
    drag = null;
    guides = [];
    if (!redo.length) return;
    history.push({ layout: snapshot(), selection: layoutStore.selections });
    const next = redo.pop();
    layoutStore.replace(next.layout, node.id);
    layoutStore.setSelections(next.selection, node.id);
    updateHistoryButtons();
  }

  // ------------------------------------------------------------------
  // geometry
  // ------------------------------------------------------------------
  function fitView() {
    const layout = layoutStore.get();
    const cssWidth = stage.clientWidth;
    const cssHeight = stage.clientHeight;
    if (cssWidth < 2 || cssHeight < 2) return false;
    const pad = 8;
    const scale = Math.min((cssWidth - pad * 2) / layout.canvas.width,
      (cssHeight - pad * 2) / layout.canvas.height);
    view.w = Math.max(1, layout.canvas.width * scale);
    view.h = Math.max(1, layout.canvas.height * scale);
    view.x = (cssWidth - view.w) / 2;
    view.y = (cssHeight - view.h) / 2;
    viewStale = false;
    return true;
  }

  function toPercent(event) {
    // fitView() reads the stage size, so only redo it after the stage changed.
    if (viewStale) fitView();
    const rect = canvas.getBoundingClientRect();
    const zoom = canvas.clientWidth ? rect.width / canvas.clientWidth : 1;
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    return {
      x: ((x - view.x) / view.w) * 100,
      y: ((y - view.y) / view.h) * 100,
    };
  }

  function itemAt(point) {
    const layout = layoutStore.get();
    for (let index = layout.elements.length - 1; index >= 1; index -= 1) {
      const [left, top, width, height] = layout.elements[index].box;
      if (point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height) {
        return index;
      }
    }
    return -1;
  }

  function cornerAt(point) {
    const thresholdX = (HANDLE_SIZE / view.w) * 100;
    const thresholdY = (HANDLE_SIZE / view.h) * 100;
    const layout = layoutStore.get();
    const selected = editableIndices();
    const candidates = selected.length ? [{ indices: selected, box: boundsOf(selected.map(i => layout.elements[i].box)) }] : [];
    if (layoutStore.selections.length <= 1) candidates.push(...selectionUnits(layout, layout.elements.map((_, i) => i), true).reverse());
    for (const candidate of candidates) {
      const [left, top, width, height] = candidate.box;
      const corners = [
        [left, top], [left + width, top], [left, top + height], [left + width, top + height],
      ];
      for (let corner = 0; corner < corners.length; corner += 1) {
        if (Math.abs(point.x - corners[corner][0]) <= thresholdX
          && Math.abs(point.y - corners[corner][1]) <= thresholdY) {
          return { ...candidate, corner };
        }
      }
    }
    return null;
  }

  function selectedIndex() {
    const index = layoutStore.selection;
    const layout = layoutStore.get();
    return index >= 1 && index < layout.elements.length ? index : -1;
  }

  // ------------------------------------------------------------------
  // drawing
  // ------------------------------------------------------------------
  function requestDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function textColor(color) {
    const value = parseInt(color.slice(1), 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.58 ? "#101318" : "#f4f6fa";
  }

  function roundedRect(x, y, width, height, radius) {
    const radiusValue = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + radiusValue, y);
    context.arcTo(x + width, y, x + width, y + height, radiusValue);
    context.arcTo(x + width, y + height, x, y + height, radiusValue);
    context.arcTo(x, y + height, x, y, radiusValue);
    context.arcTo(x, y, x + width, y, radiusValue);
    context.closePath();
  }

  function draw() {
    const layout = layoutStore.get();
    if (!fitView()) return;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = stage.clientWidth;
    const cssHeight = stage.clientHeight;
    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round(cssHeight * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = "#12161d";
    context.fillRect(0, 0, cssWidth, cssHeight);

    context.fillStyle = "#1c2129";
    context.fillRect(view.x, view.y, view.w, view.h);

    let step = 12;
    while ((step / layout.canvas.width) * view.w < 10) step *= 2;
    context.strokeStyle = "rgba(255,255,255,0.055)";
    context.lineWidth = 1;
    for (let x = step; x < layout.canvas.width; x += step) {
      const screenX = Math.round(view.x + (x / layout.canvas.width) * view.w) + 0.5;
      context.beginPath();
      context.moveTo(screenX, view.y);
      context.lineTo(screenX, view.y + view.h);
      context.stroke();
    }
    for (let y = step; y < layout.canvas.height; y += step) {
      const screenY = Math.round(view.y + (y / layout.canvas.height) * view.h) + 0.5;
      context.beginPath();
      context.moveTo(view.x, screenY);
      context.lineTo(view.x + view.w, screenY);
      context.stroke();
    }
    context.strokeStyle = "rgba(255,255,255,0.09)";
    context.lineWidth = 1;
    context.strokeRect(view.x + 0.5, view.y + 0.5, view.w - 1, view.h - 1);

    const background = layout.elements[0];
    if (background) {
      context.fillStyle = "rgba(170,178,190,0.72)";
      context.font = FONT;
      context.textAlign = "left";
      context.textBaseline = "top";
      const label = elementLabel(background, 0);
      context.fillText(label, view.x + 8, view.y + 7, Math.max(40, view.w - 16));
    }

    layout.elements.forEach((element, index) => {
      if (index === 0) return;
      // While moving or resizing, draw the box from the live drag rectangle so
      // the selected box itself follows the cursor instead of a dashed ghost.
      const at = drag?.indices?.indexOf(index) ?? -1;
      drawElement(element, index, at >= 0 ? drag.boxes[at] : element.box);
    });

    if (drag?.type === "create") drawPreview(drag.box);
    if (drag?.type === "marquee") drawMarquee(drag.box);
    const selected = editableIndices();
    if (selected.length > 1) {
      const boxes = selected.map(i => {
        const at = drag?.indices?.indexOf(i) ?? -1;
        return at >= 0 ? drag.boxes[at] : layout.elements[i].box;
      });
      drawSelectionBounds(boundsOf(boxes));
    }
    context.save();
    context.strokeStyle = "#67e8f9";
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    for (const guide of guides) {
      const at = (guide.axis === 0 ? view.x : view.y) + guide.value / 100 * (guide.axis === 0 ? view.w : view.h);
      context.beginPath();
      context.moveTo(guide.axis === 0 ? at : view.x, guide.axis === 0 ? view.y : at);
      context.lineTo(guide.axis === 0 ? at : view.x + view.w, guide.axis === 0 ? view.y + view.h : at);
      context.stroke();
    }
    context.restore();
  }

  function boxToScreen(box) {
    return {
      x: view.x + (box[0] / 100) * view.w,
      y: view.y + (box[1] / 100) * view.h,
      w: (box[2] / 100) * view.w,
      h: (box[3] / 100) * view.h,
    };
  }

  function drawChip(box, index, element) {
    const color = tagColor(element);
    const screen = boxToScreen(box);
    if (screen.w < 34 || screen.h < 14) return;
    const label = `${element.locked ? "🔒 " : ""}${element.group_id ? "▦ " : ""}${elementLabel(element, index)}`;
    context.font = FONT;
    const metrics = context.measureText(label);
    const padding = 6;
    const chipWidth = Math.min(metrics.width + padding * 2, Math.max(screen.w, 40));
    const chipHeight = 18;
    if (element.type === "text") {
      if (screen.y - view.y < chipHeight + 2) return;
      screen.y -= chipHeight + 2;
    }
    context.fillStyle = color;
    roundedRect(screen.x, screen.y, chipWidth, chipHeight, 4);
    context.fill();
    context.fillStyle = textColor(color);
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(label, screen.x + padding, screen.y + chipHeight / 2 + 0.5,
      Math.max(10, chipWidth - padding * 2));
  }

  function drawElement(element, index, box = element.box) {
    const screen = boxToScreen(box);
    const color = tagColor(element);
    const active = layoutStore.selections.includes(index);
    context.fillStyle = `${color}24`;
    context.fillRect(screen.x, screen.y, screen.w, screen.h);
    context.lineWidth = active ? 2 : 1.5;
    context.strokeStyle = color;
    context.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(0, screen.w - 1), Math.max(0, screen.h - 1));
    drawTextPreview(context, element, screen, layoutStore.get().canvas);
    drawChip(box, index, element);
    if (active && !positionLocked(layoutStore.get(), index) && editableIndices().length === 1) {
      context.fillStyle = "#f2f4f7";
      context.strokeStyle = "rgba(16,19,24,0.65)";
      context.lineWidth = 1;
      const corners = [
        [screen.x, screen.y], [screen.x + screen.w, screen.y],
        [screen.x, screen.y + screen.h], [screen.x + screen.w, screen.y + screen.h],
      ];
      for (const [x, y] of corners) {
        const size = HANDLE_SIZE;
        context.fillRect(x - size / 2, y - size / 2, size, size);
        context.strokeRect(x - size / 2 + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
      }
    } else if (index === hover) {
      context.lineWidth = 2.5;
      context.strokeStyle = color;
      context.strokeRect(screen.x + 1, screen.y + 1, Math.max(0, screen.w - 2), Math.max(0, screen.h - 2));
    }
  }

  function drawSelectionBounds(box) {
    const s = boxToScreen(box);
    context.save();
    context.strokeStyle = "#dbeafe";
    context.lineWidth = 1.5;
    context.setLineDash([5, 3]);
    context.strokeRect(s.x, s.y, s.w, s.h);
    context.setLineDash([]);
    context.fillStyle = "#f2f4f7";
    for (const [x, y] of [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]) {
      context.fillRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
    context.restore();
  }

  function drawMarquee(box) {
    const s = boxToScreen(box);
    context.save();
    context.fillStyle = "#60a5fa20";
    context.fillRect(s.x, s.y, s.w, s.h);
    context.strokeStyle = "#93c5fd";
    context.setLineDash([4, 3]);
    context.strokeRect(s.x, s.y, s.w, s.h);
    context.restore();
  }

  function drawPreview(box) {
    if (!box) return;
    const screen = boxToScreen(box);
    context.save();
    context.setLineDash([5, 4]);
    context.lineWidth = 1.5;
    context.strokeStyle = TAG_COLORS[activeTag] ?? "#8a8f98";
    context.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(0, screen.w - 1), Math.max(0, screen.h - 1));
    context.restore();
  }

  // ------------------------------------------------------------------
  // editing
  // ------------------------------------------------------------------
  function setMode(next) {
    mode = next;
    modeDraw.classList.toggle("ml-btn-active", mode === "draw");
    modeSelect.classList.toggle("ml-btn-active", mode === "select");
    canvas.style.cursor = mode === "draw" ? "crosshair" : "default";
  }

  function addElement(box) {
    const type = TAG_TYPE[activeTag] ?? "object";
    const element = {
      name: nextElementName(type),
      tag: activeTag,
      type,
      box: clampBox(box),
      prompt: template.enabled ? template.prompt : "",
    };
    if (type === "text") element.text = "";
    pushHistory();
    layoutStore.update((draft) => {
      draft.elements.push(element);
    }, node.id);
    const index = layoutStore.get().elements.length - 1;
    layoutStore.setSelection(index, node.id);
  }

  function selectedIndices() {
    return layoutStore.selections.filter(i => i > 0);
  }

  function editableIndices() {
    return selectionUnits(layoutStore.get(), selectedIndices(), true).flatMap(unit => unit.indices);
  }

  function editLayout(mutate) {
    const next = JSON.parse(snapshot());
    mutate(next);
    if (JSON.stringify(next) === snapshot()) return;
    pushHistory();
    layoutStore.replace(next, node.id);
  }

  function applyBoxes(updates, before, record = true) {
    const layout = layoutStore.get();
    const changes = [...updates].map(([i, box]) => [i, clampBox(box)])
      .filter(([i, box]) => !positionLocked(layout, i) && box.some((v, p) => v !== layout.elements[i].box[p]));
    if (!changes.length) { requestDraw(); return; }
    if (record) pushHistory(before);
    layoutStore.update(draft => {
      for (const [i, box] of changes) draft.elements[i].box = box;
    }, node.id);
  }

  function groupSelection() {
    const indices = selectionUnits(layoutStore.get(), selectedIndices()).flatMap(u => u.indices);
    if (indices.length < 2) return;
    const id = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    editLayout(layout => { for (const i of indices) layout.elements[i].group_id = id; });
    layoutStore.setSelections(indices, node.id);
  }

  function ungroupSelection() {
    const layout = layoutStore.get();
    const ids = new Set(selectedIndices().map(i => layout.elements[i].group_id).filter(Boolean));
    if (!ids.size) return;
    editLayout(draft => {
      for (const element of draft.elements) if (ids.has(element.group_id)) delete element.group_id;
    });
  }

  function toggleLock() {
    const layout = layoutStore.get();
    const indices = selectionUnits(layout, selectedIndices()).flatMap(u => u.indices);
    if (!indices.length) return;
    const lock = !indices.every(i => positionLocked(layout, i));
    editLayout(draft => {
      for (const i of indices) {
        if (lock) draft.elements[i].locked = true;
        else delete draft.elements[i].locked;
      }
    });
  }

  function arrangeSelection(action) {
    applyBoxes(arrangedBoxes(layoutStore.get(), selectedIndices(), action));
  }

  function refreshEditButtons() {
    const layout = layoutStore.get();
    const indices = selectedIndices();
    const units = selectionUnits(layout, indices);
    const editable = selectionUnits(layout, indices, true);
    const locked = indices.filter(i => positionLocked(layout, i)).length;
    selectionLabel.textContent = `已选 ${indices.length}${locked ? ` · 锁定 ${locked}` : ""}`;
    groupButton.disabled = units.length < 2;
    ungroupButton.disabled = !indices.some(i => layout.elements[i].group_id);
    lockButton.disabled = !indices.length;
    lockButton.textContent = indices.length && locked === indices.length ? "解锁位置" : "锁定位置";
    for (const button of alignButtons) {
      button.disabled = editable.length < (button.dataset.action.startsWith("distribute") ? 3 : 1);
    }
  }

  function deleteSelection() {
    const indices = new Set(editableIndices());
    if (!indices.size) return;
    editLayout(layout => { layout.elements = layout.elements.filter((_, i) => !indices.has(i)); });
    layoutStore.setSelection(-1, node.id);
  }

  function clearCanvas() {
    if (!window.confirm("清空画布？删除未锁定的前景元素，保留背景与已锁定元素。")) return;
    const layout = layoutStore.get();
    editLayout(draft => { draft.elements = draft.elements.filter((_, i) => positionLocked(layout, i)); });
    layoutStore.setSelection(-1, node.id);
    requestDraw();
  }

  function openTemplate() {
    const textarea = h("textarea", { class: "ml-textarea ml-scroll", spellcheck: "false" });
    textarea.value = template.prompt;
    const close = () => {
      modal.style.display = "none";
      modal.replaceChildren();
    };
    const save = h("button", {
      type: "button", class: "ml-btn ml-btn-primary", text: "保存",
      onclick: () => {
        template.prompt = textarea.value;
        close();
      },
    });
    const cancel = h("button", { type: "button", class: "ml-btn", text: "取消", onclick: close });
    modal.replaceChildren(h("div", { class: "mlc-modal-body" }, [
      h("span", { class: "mlc-modal-title", text: "新框模板" }),
      h("span", { class: "ml-label", text: "模板提示词 · 新建框时填入 prompt，之后可以逐框修改" }),
      textarea,
      h("div", { class: "mlc-modal-actions" }, [cancel, save]),
    ]));
    modal.style.display = "flex";
    textarea.focus();
  }

  // ------------------------------------------------------------------
  // pointer interaction
  // ------------------------------------------------------------------
  function cycleIndex(point) {
    const layout = layoutStore.get();
    const hits = [];
    layout.elements.forEach((element, index) => {
      if (index === 0) return;
      const [left, top, width, height] = element.box;
      if (point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height) {
        hits.push(index);
      }
    });
    if (!hits.length) return -1;
    const current = selectedIndex();
    const position = hits.indexOf(current);
    return position >= 0 ? hits[(position + 1) % hits.length] : hits[hits.length - 1];
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    const point = toPercent(event);
    if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return;
    const layout = layoutStore.get();
    const before = snapshot();

    const index = event.altKey ? cycleIndex(point) : itemAt(point);
    if (event.shiftKey && index >= 0) {
      layoutStore.selectElement(index, node.id, { toggle: true });
      return;
    }

    if (event.altKey) {
      if (index >= 0) {
        layoutStore.selectElement(index, node.id);
        startTransform("move", editableIndices(), point, before, event.pointerId);
      }
      return;
    }

    // Corner handles and box dragging work in both modes: selecting a box and
    // dragging it always moves it, no matter whether the active tool is
    // "框选" (still draws new boxes on empty areas) or "选择 / 移动".
    const corner = cornerAt(point);
    if (corner) {
      if (!corner.indices.every(i => layoutStore.selections.includes(i))) layoutStore.setSelections(corner.indices, node.id);
      startTransform("resize", corner.indices, point, before, event.pointerId, corner.corner);
      return;
    }

    if (index >= 0) {
      if (!layoutStore.selections.includes(index)) layoutStore.selectElement(index, node.id);
      if (!positionLocked(layout, index)) startTransform("move", editableIndices(), point, before, event.pointerId);
      return;
    }

    const baseSelection = event.shiftKey ? layoutStore.selections : [];
    if (!event.shiftKey) layoutStore.setSelection(-1, node.id);
    drag = { type: mode === "draw" && !event.shiftKey ? "create" : "marquee", origin: point,
      box: [point.x, point.y, 0, 0], before, pointerId: event.pointerId, baseSelection };
    requestDraw();
  }

  function startTransform(type, indices, point, before, pointerId, corner) {
    if (!indices.length) return;
    const startBoxes = indices.map(i => layoutStore.get().elements[i].box.slice());
    drag = { type, indices, corner, origin: point, before, pointerId,
      startBoxes, boxes: startBoxes.map(b => b.slice()), startBox: boundsOf(startBoxes) };
    requestDraw();
  }

  function clampPoint(point) {
    return {
      x: Math.min(Math.max(point.x, 0), 100),
      y: Math.min(Math.max(point.y, 0), 100),
    };
  }

  function applyDrag(point, bypassSnap = false) {
    if (!drag) return;
    const layout = layoutStore.get();
    guides = [];
    const zoom = canvas.getBoundingClientRect().width / canvas.clientWidth || 1;
    const tolerance = [600 / (view.w * zoom), 600 / (view.h * zoom)];
    if (snapCheck.checked && !bypassSnap && drag.type !== "move" && drag.type !== "marquee") {
      const snapped = snapBox(layout, [point.x, point.y, 0, 0], drag.indices ?? [], tolerance, false);
      point = { x: point.x + snapped.delta[0], y: point.y + snapped.delta[1] };
      guides = snapped.guides;
    }
    if (drag.type === "create" || drag.type === "marquee") {
      const start = clampPoint(drag.origin);
      const end = clampPoint(point);
      drag.box = [
        Math.min(start.x, end.x), Math.min(start.y, end.y),
        Math.abs(end.x - start.x), Math.abs(end.y - start.y),
      ];
      requestDraw();
      return;
    }
    if (drag.type === "move") {
      let dx = point.x - drag.origin.x, dy = point.y - drag.origin.y;
      drag.boxes = translatedBoxes(drag.startBoxes, dx, dy);
      if (snapCheck.checked && !bypassSnap) {
        const snapped = snapBox(layout, boundsOf(drag.boxes), drag.indices, tolerance);
        const bounds = boundsOf(drag.boxes);
        dx = bounds[0] - drag.startBox[0] + snapped.delta[0];
        dy = bounds[1] - drag.startBox[1] + snapped.delta[1];
        drag.boxes = translatedBoxes(drag.startBoxes, dx, dy);
        guides = snapped.guides;
      }
      requestDraw();
      return;
    }
    if (drag.type === "resize") {
      const [left, top, width, height] = drag.startBox;
      point = clampPoint(point);
      const right = left + width;
      const bottom = top + height;
      let box = [left, top, right, bottom];
      const { corner } = drag;
      if (corner === 0) box = [point.x, point.y, right, bottom];
      else if (corner === 1) box = [left, point.y, point.x, bottom];
      else if (corner === 2) box = [point.x, top, right, point.y];
      else box = [left, top, point.x, point.y];
      const x1 = Math.min(box[0], box[2]);
      const y1 = Math.min(box[1], box[3]);
      const x2 = Math.max(box[0], box[2]);
      const y2 = Math.max(box[1], box[3]);
      const minWidth = Math.max(...drag.startBoxes.map(b => Math.min(MIN_BOX, b[2]) / b[2] * width));
      const minHeight = Math.max(...drag.startBoxes.map(b => Math.min(MIN_BOX, b[3]) / b[3] * height));
      const target = clampBox([x1, y1, Math.max(minWidth, x2 - x1), Math.max(minHeight, y2 - y1)]);
      drag.boxes = resizedBoxes(drag.startBoxes, target);
      requestDraw();
      return;
    }
  }

  function commitDrag() {
    if (!drag) return;
    const finished = drag;
    drag = null;
    guides = [];
    const layout = layoutStore.get();
    if (finished.type === "marquee") {
      const [x, y, w, h] = finished.box;
      const hits = [];
      if (w > 0.3 && h > 0.3) layout.elements.forEach((element, i) => {
        const b = element.box;
        if (i > 0 && b[0] < x + w && b[0] + b[2] > x && b[1] < y + h && b[1] + b[3] > y) {
          hits.push(...selectionUnits(layout, [i]).flatMap(u => u.indices));
        }
      });
      layoutStore.setSelections([...finished.baseSelection, ...hits], node.id);
      requestDraw();
      return;
    }
    if (finished.type === "create") {
      const box = finished.box;
      // A click without a drag would add a box nobody can see; anything dragged
      // past the resize limit is a real box and is kept.
      if (!box || box[2] < MIN_BOX || box[3] < MIN_BOX) {
        requestDraw();
        return;
      }
      addElement(box);
      return;
    }
    applyBoxes(new Map(finished.indices.map((i, at) => [i, finished.boxes[at]])), finished.before);
  }

  function onPointerMove(event) {
    if (drag && event.pointerId !== drag.pointerId) return;
    const point = toPercent(event);
    if (!drag) {
      const previous = hover;
      hover = itemAt(point);
      if (hover !== previous) requestDraw();
      const corner = cornerAt(point);
      if (corner) canvas.style.cursor = "nwse-resize";
      else if (hover >= 0) canvas.style.cursor = positionLocked(layoutStore.get(), hover) ? "not-allowed" : "move";
      else canvas.style.cursor = mode === "draw" ? "crosshair" : "default";
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyDrag(point, event.ctrlKey || event.metaKey);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    applyDrag(toPercent(event), event.ctrlKey || event.metaKey);
    commitDrag();
  }

  function cancelDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    guides = [];
    requestDraw();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", cancelDrag);
  canvas.addEventListener("pointerleave", () => {
    if (drag || hover < 0) return;
    hover = -1;
    requestDraw();
  });
  const windowMove = (event) => {
    if (drag && event.target !== canvas && event.pointerId === drag.pointerId) {
      applyDrag(toPercent(event), event.ctrlKey || event.metaKey);
    }
  };
  const windowUp = (event) => {
    if (event.target !== canvas) onPointerUp(event);
  };
  window.addEventListener("pointermove", windowMove);
  window.addEventListener("pointerup", windowUp);
  window.addEventListener("pointercancel", cancelDrag);

  function onCanvasKeyDown(event) {
    if (!root.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    const handled = key === "escape" || key === "delete" || key === "backspace"
      || (!event.altKey && key in arrows) || (modifier && ["a", "g"].includes(key));
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "escape") {
      drag = null;
      guides = [];
      layoutStore.setSelection(-1, node.id);
      requestDraw();
      return;
    }
    if (drag) return;
    if (modifier && key === "a") {
      layoutStore.setSelections(layoutStore.get().elements.map((_, i) => i).filter(i => i > 0), node.id);
    } else if (modifier && key === "g") {
      if (!event.repeat) (event.shiftKey ? ungroupSelection : groupSelection)();
    } else if (key === "delete" || key === "backspace") {
      deleteSelection();
    } else if (key in arrows) {
      const indices = editableIndices();
      const step = event.shiftKey ? 1 : 0.1;
      const [dx, dy] = arrows[key].map(v => v * step);
      const boxes = translatedBoxes(indices.map(i => layoutStore.get().elements[i].box), dx, dy);
      const burst = nudgeBurst.before && Date.now() - nudgeBurst.at < 600;
      const before = burst ? nudgeBurst.before : snapshot();
      nudgeBurst.before = before;
      nudgeBurst.at = Date.now();
      applyBoxes(new Map(indices.map((i, at) => [i, boxes[at]])), before, !burst);
    }
  }
  // Run before LiteGraph's document shortcuts so Delete and selection affect
  // layout elements while this editor has focus. Workflow undo remains native.
  window.addEventListener("keydown", onCanvasKeyDown, true);
  root.addEventListener("keyup", event => event.stopPropagation());

  // ------------------------------------------------------------------
  // store sync
  // ------------------------------------------------------------------
  function syncSizeWidgets(layout) {
    for (const name of ["width", "height"]) {
      const widget = sizeWidgets[name];
      if (!widget) continue;
      const value = layout.canvas[name];
      if (Number(widget.value) !== value) widget.value = value;
    }
  }

  function syncInputSize() {
    if (!node.graph) return;
    const current = layoutStore.get().canvas;
    const next = { ...current };
    for (const name of ["width", "height"]) {
      const value = inputNumber(node, name);
      if (Number.isFinite(value)) next[name] = Math.min(16384, Math.max(16, Math.round(value)));
    }
    if (next.width === current.width && next.height === current.height) return;
    drag = null;
    syncSizeWidgets({ canvas: next });
    layoutStore.update((layout) => { layout.canvas = next; }, node.id);
  }

  function refreshObjectOptions(layout) {
    const current = objectSelect.value;
    const options = [h("option", { value: "", text: "对象" })];
    layout.elements.forEach((element, index) => {
      options.push(h("option", { value: String(index), text: elementLabel(element, index) }));
    });
    objectSelect.replaceChildren(...options);
    objectSelect.value = current && Number(current) < layout.elements.length ? current : "";
  }

  function refreshChrome(layout) {
    const foreground = layout.elements.filter((element) => element.type !== "background").length;
    status.textContent = `${layout.canvas.width} × ${layout.canvas.height} · ${foreground} 个前景元素`;
    refreshObjectOptions(layout);
    updateHistoryButtons();
    refreshEditButtons();
  }

  for (const name of ["width", "height"]) {
    const widget = sizeWidgets[name];
    if (!widget) continue;
    const original = widget.callback;
    widget.callback = function (...args) {
      const result = original?.apply(this, args);
      syncInputSize();
      return result;
    };
  }

  let lastSnapshot = null;
  let lastSelection = [];
  layoutStore.register(node, (layout, origin) => {
    const current = snapshot();
    if (origin !== node.id) {
      drag = null;
      guides = [];
      // A template or an import replaces the whole layout: keep that step
      // undoable instead of dropping the history the user built up. A selection
      // notification carries the same layout and must not add an empty step.
      if (typeof origin === "number" && lastSnapshot && lastSnapshot !== current) {
        history.push({ layout: lastSnapshot, selection: lastSelection });
        if (history.length > HISTORY_LIMIT) history.shift();
        redo.length = 0;
        nudgeBurst.before = null;
        updateHistoryButtons();
      }
      syncSizeWidgets(layout);
    }
    lastSnapshot = current;
    lastSelection = layoutStore.selections;
    if (origin === "configure") snapCheck.checked = node.properties?.moss_snap === true;
    refreshChrome(layout);
    requestDraw();
  });

  // Linked backend nodes don't call this node's widget callbacks. Read their
  // current values without replacing upstream widgets or their callbacks.
  const sizeTimer = setInterval(syncInputSize, 150);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    viewStale = true;
    requestDraw();
  }) : null;
  observer?.observe(stage);
  const originalRemoved = node.onRemoved;
  node.onRemoved = function (...args) {
    clearInterval(sizeTimer);
    observer?.disconnect();
    selectionCleanup();
    window.removeEventListener("pointermove", windowMove);
    window.removeEventListener("pointerup", windowUp);
    window.removeEventListener("pointercancel", cancelDrag);
    window.removeEventListener("keydown", onCanvasKeyDown, true);
    if (frame) cancelAnimationFrame(frame);
    return originalRemoved?.apply(this, args);
  };

  const originalResize = node.onResize;
  node.onResize = function (size) {
    const result = originalResize?.apply(this, arguments);
    if (size) {
      size[0] = Math.max(size[0], 560);
      size[1] = Math.max(size[1], 720);
    }
    return result;
  };
  node.setSize([Math.max(node.size?.[0] ?? 0, 660), Math.max(node.size?.[1] ?? 0, 880)]);
  requestDraw();

  return { draw: requestDraw, rerender: refreshChrome, syncSize: syncInputSize };
}

export default mountCanvas;
export { mountCanvas };

if (!window.__MOSS_LAYOUT_HARNESS__) {
  import("../../scripts/app.js").then(({ app }) => {
    setGraphDirtyHook(() => app.graph?.setDirtyCanvas(true, false));
    app.registerExtension({
      name: "MossLayout.Canvas",
      setup() {
        const original = app.graphToPrompt;
        app.graphToPrompt = function (graph, ...args) {
          // Sync before both workflow serialization and prompt construction,
          // including when Run is pressed before the live-size timer ticks.
          for (const node of (graph ?? app.rootGraph ?? app.graph)?._nodes ?? []) {
            node.__mossCanvasUI?.syncSize();
          }
          return original.call(this, graph, ...args);
        };
      },
      nodeCreated(node) {
        if (node.comfyClass !== CLASS && node.type !== CLASS) return;
        if (node.__mossCanvasUI) return;
        try {
          node.__mossCanvasUI = mountCanvas(node);
        } catch (error) {
          console.error("[moss-layout-ui] canvas UI failed", error);
        }
      },
    });
  }).catch((error) => console.error("[moss-layout-ui] cannot register canvas extension", error));
}
