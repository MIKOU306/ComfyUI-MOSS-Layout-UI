// MOSS 构图布画 · Tag 画笔 — the drawing board of the layout poster workflow.
import {
  h, injectStyle, layoutStore, setGraphDirtyHook,
  TAG_IDS, TAG_COLORS, TAG_TYPE,
  createLayout, clampBox, elementLabel, nextElementName,
  tagColor, syncFooter,
} from "./moss_common.js";

const CLASS = "MOSSLayoutCanvas";
const STYLE_ID = "moss-layout-canvas-style";
const MIN_BOX = 0.8;
const HANDLE_SIZE = 8;
const HISTORY_LIMIT = 60;
const FONT = '600 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

function inputNumber(node, name, seen = new Set()) {
  if (seen.has(node)) return NaN;
  seen.add(node);
  const slot = node.inputs?.findIndex((input) => input.name === name) ?? -1;
  if (slot >= 0 && node.inputs[slot].link != null) {
    let source = node.getInputNode(slot);
    while (source?.type === "Reroute") {
      if (seen.has(source)) return NaN;
      seen.add(source);
      source = source.getInputNode(0);
    }
    const type = source?.comfyClass ?? source?.type;
    if (type === "PrimitiveInt" || type === "PrimitiveNode") {
      return inputNumber(source, "value", seen);
    }
    return NaN;
  }
  return Number(node.widgets?.find((widget) => widget.name === name)?.value);
}

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
  let template = { enabled: true, prompt: "" };
  const history = [];
  const redo = [];

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
    layoutStore.setSelection(Number(objectSelect.value), node.id);
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
      h("div", { class: "mlc-status-row" }, [
        status,
        h("span", { class: "ml-spacer" }),
        undoButton, redoButton,
      ]),
    ]),
    h("div", { class: "mlc-stage" }, [ ]),
    h("div", { class: "mlc-hint", text: "先选 tag，再拖出新框。选择模式可移动 / 缩放；重叠处 Alt 点击轮选。背景固定铺满。" }),
    syncFooter(),
    modal,
  ]);

  const stage = root.querySelector(".mlc-stage");
  const canvas = h("canvas", { class: "mlc-canvas" });
  stage.append(canvas);
  const context = canvas.getContext("2d");
  const view = { x: 0, y: 0, w: 1, h: 1 };

  node.addDOMWidget("moss_canvas_ui", "MOSSLayoutCanvas", root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 520,
  });

  setMode("draw");
  for (const button of tagButtons) if (button.textContent === activeTag) button.classList.add("is-active");

  const selectionCleanup = layoutStore.subscribeSelection(() => requestDraw());

  // ------------------------------------------------------------------
  // history
  // ------------------------------------------------------------------
  function snapshot() {
    return JSON.stringify(layoutStore.get());
  }

  function pushHistory(before) {
    history.push(before ?? snapshot());
    if (history.length > HISTORY_LIMIT) history.shift();
    redo.length = 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    undoButton.disabled = history.length === 0;
    redoButton.disabled = redo.length === 0;
  }

  function undo() {
    if (!history.length) return;
    redo.push(snapshot());
    const previous = history.pop();
    layoutStore.replace(previous, node.id);
    updateHistoryButtons();
  }

  function redoAction() {
    if (!redo.length) return;
    history.push(snapshot());
    const next = redo.pop();
    layoutStore.replace(next, node.id);
    updateHistoryButtons();
  }

  // ------------------------------------------------------------------
  // geometry
  // ------------------------------------------------------------------
  function canvasSize() {
    const layout = layoutStore.get();
    return layout.canvas;
  }

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
    return true;
  }

  function toPercent(event) {
    const rect = canvas.getBoundingClientRect();
    const zoom = canvas.clientWidth ? rect.width / canvas.clientWidth : 1;
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    return {
      x: ((x - view.x) / view.w) * 100,
      y: ((y - view.y) / view.h) * 100,
    };
  }

  function foregroundElements() {
    const layout = layoutStore.get();
    return layout.elements.map((element, index) => ({ element, index }))
      .filter((entry) => entry.element.type !== "background");
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
    const layout = layoutStore.get();
    const thresholdX = (HANDLE_SIZE / view.w) * 100;
    const thresholdY = (HANDLE_SIZE / view.h) * 100;
    for (let index = layout.elements.length - 1; index >= 1; index -= 1) {
      const [left, top, width, height] = layout.elements[index].box;
      const corners = [
        [left, top], [left + width, top], [left, top + height], [left + width, top + height],
      ];
      for (let corner = 0; corner < corners.length; corner += 1) {
        if (Math.abs(point.x - corners[corner][0]) <= thresholdX
          && Math.abs(point.y - corners[corner][1]) <= thresholdY) {
          return { index, corner };
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
      const live = drag && drag.index === index
        && (drag.type === "move" || drag.type === "resize");
      drawElement(element, index, live ? drag.box : element.box);
    });

    if (drag?.type === "create") drawPreview(drag.box);
  }

  function boxToScreen(box) {
    const layout = layoutStore.get();
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
    const label = elementLabel(element, index);
    context.font = FONT;
    const metrics = context.measureText(label);
    const padding = 6;
    const chipWidth = Math.min(metrics.width + padding * 2, Math.max(screen.w, 40));
    const chipHeight = 18;
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
    const active = index === selectedIndex();
    context.fillStyle = `${color}24`;
    context.fillRect(screen.x, screen.y, screen.w, screen.h);
    context.lineWidth = active ? 2 : 1.5;
    context.strokeStyle = color;
    context.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(0, screen.w - 1), Math.max(0, screen.h - 1));
    drawChip(box, index, element);
    if (active) {
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
    const layout = layoutStore.get();
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
    void layout;
  }

  function clearCanvas() {
    if (!window.confirm("清空画布？所有前景元素都会删除，只保留背景。")) return;
    const size = canvasSize();
    pushHistory();
    layoutStore.replace(createLayout(size.width, size.height), node.id);
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
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    const point = toPercent(event);
    if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return;
    const layout = layoutStore.get();
    const before = snapshot();

    if (event.altKey) {
      const index = cycleIndex(point);
      if (index >= 0) {
        layoutStore.setSelection(index, node.id);
        const [left, top, width, height] = layout.elements[index].box;
        drag = { type: "move", index, origin: point, startBox: [left, top, width, height],
          box: [left, top, width, height], before, pointerId: event.pointerId };
        requestDraw();
      }
      return;
    }

    // Corner handles and box dragging work in both modes: selecting a box and
    // dragging it always moves it, no matter whether the active tool is
    // "框选" (still draws new boxes on empty areas) or "选择 / 移动".
    const corner = cornerAt(point);
    if (corner) {
      layoutStore.setSelection(corner.index, node.id);
      drag = {
        type: "resize", index: corner.index, corner: corner.corner, origin: point,
        startBox: layout.elements[corner.index].box.slice(),
        box: layout.elements[corner.index].box.slice(), before, pointerId: event.pointerId,
      };
      requestDraw();
      return;
    }

    const index = itemAt(point);
    if (index >= 0) {
      layoutStore.setSelection(index, node.id);
      const [left, top, width, height] = layout.elements[index].box;
      drag = { type: "move", index, origin: point, startBox: [left, top, width, height],
        box: [left, top, width, height], before, pointerId: event.pointerId };
      requestDraw();
      return;
    }

    layoutStore.setSelection(-1, node.id);
    if (mode === "draw") {
      drag = { type: "create", origin: point, box: [point.x, point.y, MIN_BOX, MIN_BOX],
        before, pointerId: event.pointerId };
    }
    requestDraw();
  }

  function clampPoint(point) {
    return {
      x: Math.min(Math.max(point.x, 0), 100),
      y: Math.min(Math.max(point.y, 0), 100),
    };
  }

  function applyDrag(point) {
    if (!drag) return;
    const layout = layoutStore.get();
    if (drag.type === "create") {
      const start = clampPoint(drag.origin);
      const end = clampPoint(point);
      drag.box = [
        Math.min(start.x, end.x), Math.min(start.y, end.y),
        Math.max(MIN_BOX, Math.abs(end.x - start.x)), Math.max(MIN_BOX, Math.abs(end.y - start.y)),
      ];
      drag.box = clampBox(drag.box);
      requestDraw();
      return;
    }
    if (drag.type === "move") {
      const [left, top, width, height] = drag.startBox;
      drag.box = clampBox([
        Math.min(Math.max(left + point.x - drag.origin.x, 0), 100 - width),
        Math.min(Math.max(top + point.y - drag.origin.y, 0), 100 - height),
        width,
        height,
      ]);
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
      drag.box = clampBox([x1, y1, Math.max(MIN_BOX, x2 - x1), Math.max(MIN_BOX, y2 - y1)]);
      requestDraw();
      return;
    }
    void layout;
  }

  function commitDrag() {
    if (!drag) return;
    const finished = drag;
    drag = null;
    const layout = layoutStore.get();
    if (finished.type === "create") {
      const box = finished.box;
      if (!box || box[2] < 1 || box[3] < 1) {
        requestDraw();
        return;
      }
      addElement(box);
      return;
    }
    const element = layout.elements[finished.index];
    if (element && finished.box) {
      const changed = finished.box.some((value, position) => Math.abs(value - element.box[position]) > 0.001);
      if (changed) {
        history.push(finished.before);
        if (history.length > HISTORY_LIMIT) history.shift();
        redo.length = 0;
        updateHistoryButtons();
        layoutStore.update((draft) => {
          draft.elements[finished.index].box = finished.box;
        }, node.id);
        return;
      }
    }
    requestDraw();
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
      else if (hover >= 0) canvas.style.cursor = "move";
      else canvas.style.cursor = mode === "draw" ? "crosshair" : "default";
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyDrag(point);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    applyDrag(toPercent(event));
    commitDrag();
  }

  function cancelDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
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
      applyDrag(toPercent(event));
    }
  };
  const windowUp = (event) => {
    if (event.target !== canvas) onPointerUp(event);
  };
  window.addEventListener("pointermove", windowMove);
  window.addEventListener("pointerup", windowUp);
  window.addEventListener("pointercancel", cancelDrag);

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

  layoutStore.register(node, (layout, origin) => {
    if (origin !== node.id) {
      history.length = 0;
      redo.length = 0;
      syncSizeWidgets(layout);
    }
    refreshChrome(layout);
    requestDraw();
  });

  // Linked backend nodes don't call this node's widget callbacks. Read their
  // current values without replacing upstream widgets or their callbacks.
  const sizeTimer = setInterval(syncInputSize, 150);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestDraw()) : null;
  observer?.observe(stage);
  const originalRemoved = node.onRemoved;
  node.onRemoved = function (...args) {
    clearInterval(sizeTimer);
    observer?.disconnect();
    selectionCleanup();
    window.removeEventListener("pointermove", windowMove);
    window.removeEventListener("pointerup", windowUp);
    window.removeEventListener("pointercancel", cancelDrag);
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
