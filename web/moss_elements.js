// Element manager DOM widget for the MOSSLayoutElements node: browse / filter
// the shared MOSS layout, and edit the selected element's prompt and box.
// All state lives in layoutStore so the canvas and prompt nodes stay in sync.

import {
  TAGS, TYPES, TAG_TYPE, h, injectStyle, tagColor, padIndex, autosizeTextarea,
  getLayoutStore, syncFooter, button, upstreamCanvas, splitList,
} from "./moss_common.js";
import { positionLocked, selectionUnits } from "./moss_edit.js";
import { FONT_STYLES, normalizeTypography, textMetrics, wrapText, drawTextPreview } from "./moss_text.js";

const CLASS = "MOSSLayoutElements";
const STYLE_ID = "moss-layout-elements-style";
const TAG_IDS = TAGS.map((tag) => tag.id);
const BOX_LABELS = ["左 %", "上 %", "宽 %", "高 %"];
const PROMPT_PLACEHOLDER = "描述该元素的画面内容、外观、材质、光线…";
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const oneDecimal = (value) => (Math.round(Number(value) * 10) / 10).toFixed(1);
const twoDecimals = (value) => String(Math.round(Number(value) * 100) / 100);

const CSS = `
.mle-root{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;box-sizing:border-box;
  padding:2px;font:12px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#dbe0e8;
  color-scheme:dark}
.mle-root .mle-card{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;
  box-sizing:border-box;padding:12px 14px 10px;background:#202938;border:1px solid #2b3546;
  border-radius:10px;overflow-y:auto;overflow-x:hidden}
.mle-root .mle-card::-webkit-scrollbar{width:9px}
.mle-root .mle-card::-webkit-scrollbar-track{background:#1c2533}
.mle-root .mle-card::-webkit-scrollbar-thumb{background:#4d5869;border-radius:5px}
.mle-head{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.mle-title{font-size:15px;font-weight:700;color:#e7eaf0;letter-spacing:.01em}
.mle-spacer{flex:1 1 auto}
.mle-root .mle-locate{padding:4px 10px;font-size:12px}
.mle-subtitle{flex:0 0 auto;margin-top:-1px;font-size:11px;color:#8b93a1}
.mle-search{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.mle-root .mle-search-input{flex:1 1 auto;min-width:0}
.mle-root .ml-select{min-width:0;padding:5px 8px}
.mle-root .mle-filter{flex:0 0 100px;width:100px}
.mle-root .ml-input,.mle-root .ml-textarea,.mle-root .ml-select,.mle-root .ml-num{
  background:#273243;border-color:#3b4657;color:#dbe0e8}
.mle-root .ml-input:focus,.mle-root .ml-textarea:focus,.mle-root .ml-select:focus,
.mle-root .ml-num:focus{border-color:#4a9eff;box-shadow:0 0 0 2px rgba(74,158,255,.16)}
.mle-root .ml-input::placeholder,.mle-root .ml-textarea::placeholder{color:#6f7a8c}
.mle-root .ml-select option{background:#1d2634;color:#dbe0e8}
.mle-root .ml-btn{background:#2a3445;border-color:#3d4a60}
.mle-root .ml-btn:hover{background:#343f54;border-color:#4b5972}
.mle-root .ml-btn-danger{background:#312734;border-color:#6b4150;color:#ff9d9d}
.mle-root .ml-btn-danger:hover{background:#3c2d3b;border-color:#874f60;color:#ffbcbc}
.mle-list{position:relative;flex:0 1 300px;display:flex;flex-direction:column;gap:4px;
  height:300px;min-height:120px;max-height:300px;box-sizing:border-box;padding:1px 2px 1px 0;
  overflow-y:auto;overflow-x:hidden}
.mle-list::-webkit-scrollbar{width:8px}
.mle-list::-webkit-scrollbar-track{background:#1c2533;border-radius:4px}
.mle-list::-webkit-scrollbar-thumb{background:#97a0af;border-radius:4px}
.mle-list::-webkit-scrollbar-thumb:hover{background:#aeb6c2}
.mle-row{display:flex;align-items:center;gap:8px;flex:0 0 auto;width:100%;height:46px;
  box-sizing:border-box;margin:0;padding:0 10px 0 8px;background:#273243;
  border:1px solid #39465c;border-left:3px solid #8a8f98;border-radius:8px;color:#dbe0e8;
  font:inherit;text-align:left;cursor:pointer;outline:none;
  transition:background .12s,border-color .12s}
.mle-row:hover{background:#2d384b;border-color:#46546c}
.mle-row.is-active{background:#324664;border-color:#5c8ccb}
.mle-row.is-active:hover{background:#354a6c;border-color:#6f9cd9}
.mle-row:focus-visible{box-shadow:0 0 0 2px rgba(74,158,255,.35)}
.mle-row.is-locate{animation:mle-locate .65s ease-out}
@keyframes mle-locate{0%{box-shadow:0 0 0 0 rgba(74,158,255,.55)}100%{box-shadow:0 0 0 7px rgba(74,158,255,0)}}
.mle-idx{flex:0 0 20px;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b93a1;
  letter-spacing:.03em}
.mle-pill{flex:0 0 auto;min-width:40px;box-sizing:border-box;padding:2px 8px;border-radius:6px;
  background:#2f3b4f;border:1px solid #3f4c63;color:#d3dae6;font-size:11px;line-height:16px;
  text-align:center}
.mle-row.is-active .mle-pill{background:#3b4f70;border-color:#55739c;color:#e3eaf5}
.mle-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:13px;color:#dfe4ec}
.mle-list-empty{margin:2px 0;padding:18px 10px;border:1px dashed #35415a;border-radius:8px;
  color:#6b7380;font-size:11px;text-align:center;line-height:1.6}
.mle-divider{flex:0 0 auto;border-top:1px solid #2b3648}
.mle-detail{display:flex;flex-direction:column;gap:8px;flex:0 0 auto;min-height:0}
.mle-detail-head{font-size:15px;font-weight:700;color:#eef1f5;letter-spacing:.01em;line-height:1.35}
.mle-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.mle-root .mle-field .ml-label{margin:0;font-size:11px;color:#8b93a1}
.mle-grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.mle-grid2 .mle-field{align-items:flex-start}
.mle-root .mle-select{width:auto}
.mle-root .mle-grid2 .ml-select{width:104px}
.mle-nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.mle-num-cell{display:flex;flex-direction:column;gap:4px;min-width:0}
.mle-num-label{font-size:11px;color:#8b93a1}
.mle-root .ml-num{padding:6px 4px;font-size:12px}
.mle-root .mle-prompt{height:104px;min-height:84px;max-height:220px;flex:0 1 auto;resize:vertical}
.mle-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:2px}
.mle-placeholder{margin:2px 0;padding:16px 12px;border:1px dashed #35415a;border-radius:8px;
  color:#6b7380;font-size:11px;text-align:center;line-height:1.7}
.mle-hidden{display:none!important}
.mle-root .ml-footer{flex:0 0 auto;margin-top:auto}
`;

export function mountElements(node) {
  const layoutStore = getLayoutStore(node);
  injectStyle(STYLE_ID, CSS);

  let query = "";
  let filterTag = "";
  let renderedSelection = -2;
  let renderFrame = 0;
  let pulseTimer = 0;

  const layoutOf = () => layoutStore.get();
  const selectedIndex = () => {
    const index = layoutStore.selection;
    return index >= 0 && index < layoutOf().elements.length ? index : -1;
  };
  const selectedElement = () => {
    const index = selectedIndex();
    return index >= 0 ? layoutOf().elements[index] : null;
  };

  // ---- header -------------------------------------------------------------
  const locateButton = button("定位画布", {
    className: "mle-locate",
    title: "在画布上定位当前选中的元素",
    onClick: () => locateSelection(),
  });
  const cardHead = h("div", { class: "mle-head" }, [
    h("span", { class: "mle-title", text: "元素导航与提示词" }),
    h("span", { class: "mle-spacer" }),
    locateButton,
  ]);
  const subtitle = h("div", { class: "mle-subtitle" });

  // ---- search + tag filter ------------------------------------------------
  const searchInput = h("input", {
    class: "ml-input mle-search-input", type: "text", spellcheck: "false",
    placeholder: "搜索编号 / 名称 / tag / 提示词",
  });
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim().toLowerCase();
    renderList();
  });
  const tagFilter = h("select", { class: "ml-select mle-filter", title: "按 tag 筛选" }, [
    h("option", { value: "", text: "全部 tag" }),
    ...TAGS.map((tag) => h("option", { value: tag.id, text: tag.id })),
  ]);
  tagFilter.addEventListener("change", () => {
    filterTag = tagFilter.value;
    renderList();
  });
  const searchRow = h("div", { class: "mle-search" }, [searchInput, tagFilter]);

  // ---- element list -------------------------------------------------------
  const list = h("div", { class: "mle-list" });

  // ---- detail editor ------------------------------------------------------
  const detailEmpty = h("div", { class: "mle-placeholder" });
  const detailHead = h("div", { class: "mle-detail-head" });

  const nameInput = h("input", {
    class: "ml-input", type: "text", spellcheck: "false", placeholder: "元素名称",
  });
  const tagSelect = h("select", { class: "ml-select" },
    TAG_IDS.map((id) => h("option", { value: id, text: id })));
  const typeSelect = h("select", { class: "ml-select" },
    TYPES.map((type) => h("option", { value: type.id, text: type.label })));
  const promptInput = h("textarea", {
    class: "ml-textarea mle-prompt", rows: "5", spellcheck: "false",
    placeholder: PROMPT_PLACEHOLDER,
  });
  const textInput = h("textarea", {
    class: "ml-textarea mle-text", rows: "3", spellcheck: "false", placeholder: "海报上显示的文字内容",
  });
  const textField = labelled("文字内容", textInput);
  textField.classList.add("mle-hidden");

  const fontStyle = h("select", {class:"ml-select mle-font", "aria-label":"字体风格"}, [h("option",{value:"",text:"沿用提示词"}), ...Object.entries(FONT_STYLES).map(([value,text])=>h("option",{value,text}))]);
  const align = h("select", {class:"ml-select mle-text-align", "aria-label":"文字对齐"}, [["","沿用提示词"],["left","左对齐"],["center","居中"],["right","右对齐"]].map(([value,text])=>h("option",{value,text})));
  const fontSize = h("input", {class:"ml-num mle-font-size",type:"number",min:1,max:2048,step:1,placeholder:"自动估算", "aria-label":"参考字号"});
  const lineHeight = h("input", {class:"ml-num mle-line-height",type:"number",min:.5,max:4,step:.1,placeholder:"1.2", "aria-label":"参考行距"});
  const color = h("input", {class:"mle-text-color",type:"color",value:"#ffffff", "aria-label":"文字颜色"});
  const useColor = h("input", {class:"mle-use-color",type:"checkbox"});
  const textPreview = h("canvas", {class:"mle-text-preview",width:420,height:150,style:{width:"100%",height:"150px",objectFit:"contain",background:"#151b25",borderRadius:"6px"}});
  const capacity = h("div", {class:"ml-muted mle-capacity",role:"status"});
  let wrapped = null;
  const undoWrap = button("撤回分行",{className:"mle-undo-wrap",onClick:()=>{
    if(!wrapped || selectedIndex()!==wrapped.index || selectedElement()?.text!==wrapped.after)return;
    const before=wrapped.before;wrapped=null;patchSelected(element=>{element.text=before;});
  }});
  const wrapButton = button("按框宽分行",{className:"mle-wrap-text",onClick:()=>{
    const element=selectedElement();if(element?.type!=="text")return;
    const after=wrapText(element,layoutOf().canvas);wrapped={index:selectedIndex(),before:element.text,after};
    patchSelected(next=>{next.text=after;});
  }});
  const textAssistant = h("div",{class:"mle-text-assistant mle-hidden"},[
    h("span",{class:"ml-label",text:"文字排版助手 · Enter 手动换行"}),
    h("div",{class:"mle-grid2"},[labelled("字体风格",fontStyle),labelled("文字对齐",align),labelled("参考字号 / 生成像素",fontSize),labelled("行距倍数",lineHeight)]),
    h("label",{class:"ml-row",style:{margin:"8px 0"}},[useColor,h("span",{text:"指定文字颜色"}),color]),
    textPreview,capacity,h("div",{class:"mle-actions"},[wrapButton,undoWrap,button("清除样式",{onClick:()=>patchSelected(element=>{delete element.typography;})})]),
    h("div",{class:"ml-muted",text:"容量为近似值，预览采用本机字体。样式转为生成描述，最终字体、换行和位置以模型输出为准。"}),
  ]);
  function updateTypography() {
    patchSelected(element=>{
      if(element.type!=="text")return;
      const style=normalizeTypography({font_style:fontStyle.value,align:align.value,font_size:fontSize.value,line_height:lineHeight.value,color:useColor.checked?color.value:null});
      if(style)element.typography=style;else delete element.typography;
    });
  }
  for(const input of [fontStyle,align,fontSize,lineHeight,useColor])input.addEventListener("change",updateTypography);
  color.addEventListener("input",()=>{useColor.checked=true;updateTypography();});

  const numInputs = BOX_LABELS.map(() => h("input", {
    class: "ml-num", type: "text", inputmode: "decimal", spellcheck: "false",
  }));
  const numRow = h("div", { class: "mle-nums" }, BOX_LABELS.map((label, part) =>
    h("div", { class: "mle-num-cell" }, [
      h("span", { class: "mle-num-label", text: label }),
      numInputs[part],
    ])));

  const tagsInput = h("input", {
    class: "ml-input mle-tags", type: "text", spellcheck: "false",
    placeholder: "补充类别，进入 item.tags，如 logo, icon",
  });
  const paletteInput = h("input", {
    class: "ml-input mle-palette", type: "text", spellcheck: "false",
    placeholder: "该项配色，进入 item.palette",
  });
  tagsInput.addEventListener("input", () => patchSelected((element) => {
    const tags = splitList(tagsInput.value);
    if (tags.length) element.tags = tags; else delete element.tags;
  }));
  paletteInput.addEventListener("input", () => patchSelected((element) => {
    const palette = splitList(paletteInput.value);
    if (palette.length) element.palette = palette; else delete element.palette;
  }));

  const moveUp = button("上移", { title: "与上一个元素交换位置", onClick: () => moveSelected(-1) });
  const moveDown = button("下移", { title: "与下一个元素交换位置", onClick: () => moveSelected(1) });
  const copyButton = button("复制元素", { title: "复制当前元素并插入到它后面", onClick: () => copySelected() });
  const deleteButton = button("删除元素", {
    variant: "danger", title: "删除当前元素", onClick: () => deleteSelected(),
  });
  const actionRow = h("div", { class: "mle-actions" }, [moveUp, moveDown, copyButton, deleteButton]);

  const detailBody = h("div", { class: "mle-detail" }, [
    detailHead,
    labelled("名称 · 仅用于管理", nameInput),
    h("div", { class: "mle-grid2" }, [
      labelled("Tag · 仅用于框色", tagSelect),
      labelled("生成类型", typeSelect),
    ]),
    labelled("提示词 / 内容描述", promptInput),
    textField,
    textAssistant,
    numRow,
    h("div", { class: "mle-grid2" }, [
      labelled("附加 tags · 进模型", tagsInput),
      labelled("配色 palette · 进模型", paletteInput),
    ]),
    actionRow,
  ]);

  const card = h("div", { class: "ml-card mle-card" }, [
    cardHead,
    subtitle,
    searchRow,
    list,
    h("div", { class: "mle-divider" }),
    detailEmpty,
    detailBody,
    syncFooter(),
  ]);
  const root = h("div", { class: "mle-root" }, [card]);

  // Keep ComfyUI canvas shortcuts from stealing keys typed in the widget.
  root.addEventListener("keydown", (event) => event.stopPropagation());
  root.addEventListener("keyup", (event) => event.stopPropagation());

  const domWidget = node.addDOMWidget("moss_elements_ui", "MOSSLayoutElements", root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 520,
  });
  domWidget.serialize = false;

  // ---- editing ------------------------------------------------------------
  function patchSelected(mutate) {
    const index = selectedIndex();
    if (index < 0) return;
    layoutStore.update((layout) => {
      const element = layout.elements[index];
      if (element) mutate(element, index, layout);
    }, node.id);
  }

  nameInput.addEventListener("input", () => patchSelected((element) => {
    element.name = nameInput.value;
  }));
  nameInput.addEventListener("blur", () => {
    const element = selectedElement();
    if (element) nameInput.value = element.name;
  });

  promptInput.addEventListener("input", () => {
    patchSelected((element) => {
      element.prompt = promptInput.value;
    });
    autosizeTextarea(promptInput);
  });
  promptInput.addEventListener("blur", () => {
    const element = selectedElement();
    if (element) promptInput.value = element.prompt;
  });

  textInput.addEventListener("input", () => patchSelected((element) => {
    element.text = textInput.value;
  }));
  textInput.addEventListener("blur", () => {
    const element = selectedElement();
    if (element) textInput.value = element.text ?? "";
  });

  tagSelect.addEventListener("change", () => {
    const value = tagSelect.value;
    const index = selectedIndex();
    if (index < 0) return;
    layoutStore.update((layout) => {
      const element = layout.elements[index];
      if (!element || element.type === "background") return;
      const followsDefault = element.type === TAG_TYPE[element.tag];
      element.tag = value;
      const mapped = TAG_TYPE[value];
      if (followsDefault && mapped && mapped !== "background") element.type = mapped;
    }, node.id);
  });

  typeSelect.addEventListener("change", () => {
    const value = typeSelect.value;
    if (value === "background") return;
    patchSelected((element) => {
      if (element.type === "background") return;
      element.type = value;
    });
  });

  numInputs.forEach((input, part) => {
    input.addEventListener("input", () => {
      if (input.value.trim() === "") return;
      const value = Number(input.value);
      const index = selectedIndex();
      if (!Number.isFinite(value) || index < 0) return;
      const source = selectedElement();
      if (!source || positionLocked(layoutOf(), index)) return;
      const box = source.box.slice();
      if (part === 0) box[0] = clamp(value, 0, 100 - box[2]);
      else if (part === 1) box[1] = clamp(value, 0, 100 - box[3]);
      else if (part === 2) box[2] = clamp(value, 0.1, 100 - box[0]);
      else box[3] = clamp(value, 0.1, 100 - box[1]);
      layoutStore.update((layout) => {
        const element = layout.elements[index];
        if (element && element.type !== "background") element.box = box;
      }, node.id);
    });
    input.addEventListener("blur", () => {
      const element = selectedElement();
      if (element) input.value = twoDecimals(element.box[part]);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
    });
  });

  function moveSelected(delta) {
    const index = selectedIndex();
    const layout = layoutOf();
    const target = index + delta;
    if (index <= 0 || target < 1 || target >= layout.elements.length) return;
    layoutStore.update((next) => {
      const [element] = next.elements.splice(index, 1);
      next.elements.splice(target, 0, element);
    }, node.id);
    layoutStore.selectElement(target, node.id);
  }

  function copySelected() {
    const index = selectedIndex();
    const element = selectedElement();
    if (!element || element.type === "background") return;
    const copy = JSON.parse(JSON.stringify(element));
    delete copy.locked;
    delete copy.group_id;
    const [left, top, width, height] = element.box;
    copy.name = `${element.name} · 副本`;
    copy.box = [
      Number(oneDecimal(Math.min(left + 2, 100 - width))),
      Number(oneDecimal(Math.min(top + 2, 100 - height))),
      width,
      height,
    ];
    const at = index + 1;
    layoutStore.update((layout) => {
      layout.elements.splice(at, 0, copy);
    }, node.id);
    layoutStore.setSelection(at, node.id);
  }

  function deleteSelected() {
    const index = selectedIndex();
    const element = selectedElement();
    if (!element || element.type === "background") return;
    if (layoutStore.selections.length > 1) {
      const indices = new Set(selectionUnits(layoutOf(), layoutStore.selections, true).flatMap(u => u.indices));
      if (!indices.size) return;
      layoutStore.update(layout => { layout.elements = layout.elements.filter((_, i) => !indices.has(i)); }, node.id);
      layoutStore.setSelection(-1, node.id);
      return;
    }
    if (positionLocked(layoutOf(), index)) return;
    layoutStore.update((layout) => {
      layout.elements.splice(index, 1);
    }, node.id);
    const remaining = layoutOf().elements.length;
    layoutStore.setSelection(Math.min(index, remaining - 1), node.id);
  }

  function locateSelection() {
    const layout = layoutOf();
    let index = layoutStore.selection;
    if (!(index >= 0 && index < layout.elements.length)) {
      index = layout.elements.length > 1 ? 1 : 0;
    }
    if (!visibleEntries(layout).some((entry) => entry.index === index)) {
      query = "";
      filterTag = "";
      searchInput.value = "";
      tagFilter.value = "";
      renderList();
    }
    layoutStore.selectElement(index, node.id);
    pulseRow(index);
  }

  function pulseRow(index) {
    const row = list.querySelector(`.mle-row[data-index="${index}"]`);
    if (!row) return;
    clearTimeout(pulseTimer);
    row.classList.remove("is-locate");
    void row.offsetWidth;
    row.classList.add("is-locate");
    pulseTimer = window.setTimeout(() => row.classList.remove("is-locate"), 700);
  }

  // ---- rendering ----------------------------------------------------------
  function matches(element, index) {
    if (filterTag && element.tag !== filterTag) return false;
    if (!query) return true;
    const haystack = [
      padIndex(index), String(index + 1), element.name, element.tag,
      element.prompt ?? "", element.text ?? "",
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function visibleEntries(layout = layoutOf()) {
    const entries = [];
    layout.elements.forEach((element, index) => {
      if (matches(element, index)) entries.push({ element, index });
    });
    return entries;
  }

  function rowFor(element, index, active) {
    const idx = h("span", { class: "mle-idx", text: padIndex(index) });
    const pill = h("span", { class: "mle-pill", text: element.tag });
    const name = h("span", { class: "mle-name", text: rowLabel(element, index) });
    const row = h("button", {
      type: "button",
      class: active ? "mle-row is-active" : "mle-row",
      "data-index": String(index),
      style: { borderLeftColor: tagColor(element) },
      title: element.prompt || element.name,
    }, [idx, pill, name]);
    row.__moss = { pill, name };
    row.addEventListener("click", event => {
      layoutStore.selectElement(index, node.id, { toggle: event.shiftKey });
    });
    return row;
  }

  function rowLabel(element, index) {
    return `${positionLocked(layoutOf(), index) && index > 0 ? "🔒 " : ""}${element.group_id ? "▦ " : ""}${element.name}`;
  }

  // Typing in the prompt field reruns the whole panel; refresh the row in place
  // instead of rebuilding the list (and losing its scroll and focus) every key.
  function paintRow(row, element, index, active) {
    row.__moss.pill.textContent = element.tag;
    row.__moss.name.textContent = rowLabel(element, index);
    row.title = element.prompt || element.name;
    row.style.borderLeftColor = tagColor(element);
    row.classList.toggle("is-active", active);
  }

  function renderHeader() {
    const foreground = Math.max(0, layoutOf().elements.length - 1);
    subtitle.textContent = `${upstreamCanvas(node) ? "已连接画布" : "未连接画布 · 当前独立编辑"} · 背景 + ${foreground} 个元素`;
  }

  let renderedEntries = null;

  function renderList() {
    const scrollTop = list.scrollTop;
    const entries = visibleEntries();
    const signature = entries.map((entry) => entry.index).join(",");
    if (signature === renderedEntries) {
      const rows = list.querySelectorAll(".mle-row");
      entries.forEach((entry, at) => {
        if (rows[at]) paintRow(rows[at], entry.element, entry.index, layoutStore.selections.includes(entry.index));
      });
      list.scrollTop = scrollTop;
      return;
    }
    renderedEntries = signature;
    if (!entries.length) {
      list.replaceChildren(h("div", {
        class: "mle-list-empty",
        text: "没有匹配的元素 · 调整搜索或 tag 筛选",
      }));
    } else {
      list.replaceChildren(...entries.map((entry) => rowFor(entry.element, entry.index, layoutStore.selections.includes(entry.index))));
    }
    list.scrollTop = scrollTop;
  }

  function renderDetail() {
    const layout = layoutOf();
    const index = selectedIndex();
    const element = index >= 0 ? layout.elements[index] : null;
    const force = index !== renderedSelection;
    renderedSelection = index;

    detailEmpty.classList.toggle("mle-hidden", Boolean(element));
    detailBody.classList.toggle("mle-hidden", !element);
    if (!element) {
      detailEmpty.textContent = layout.elements.length > 1
        ? "未选择元素 · 点击上方条目查看名称、提示词与坐标"
        : "当前画布只有背景 · 运行工作流或在标准提示词节点导入布局后会显示元素";
      return;
    }

    const isBackground = element.type === "background";
    const locked = positionLocked(layout, index);
    detailHead.textContent = `${padIndex(index)} ${element.name}${locked && !isBackground ? " · 位置已锁定" : ""}`;
    if (force || document.activeElement !== nameInput) nameInput.value = element.name;
    if (force || document.activeElement !== tagSelect) tagSelect.value = element.tag;
    if (force || document.activeElement !== typeSelect) typeSelect.value = element.type;
    if (force || document.activeElement !== promptInput) {
      if (promptInput.value !== element.prompt) promptInput.value = element.prompt;
      autosizeTextarea(promptInput);
    }
    tagSelect.disabled = isBackground;
    typeSelect.disabled = isBackground;
    for (const option of typeSelect.options) {
      if (option.value === "background") option.disabled = !isBackground;
    }

    const isText = element.type === "text";
    textField.classList.toggle("mle-hidden", !isText);
    textAssistant.classList.toggle("mle-hidden", !isText);
    if (isText && (force || document.activeElement !== textInput)) {
      textInput.value = element.text ?? "";
    }
    if(isText) {
      const style=element.typography||{};
      for(const [input,value] of [[fontStyle,style.font_style||""],[align,style.align||""],[fontSize,style.font_size||""],[lineHeight,style.line_height||""]]) {
        if(force||document.activeElement!==input)input.value=value;
      }
      useColor.checked=Boolean(style.color);color.value=style.color||"#ffffff";
      const m=textMetrics(element,layout.canvas),ctx=textPreview.getContext("2d"),scale=Math.min(410/m.width,140/m.height);
      ctx.clearRect(0,0,420,150);const rect={x:(420-m.width*scale)/2,y:(150-m.height*scale)/2,w:m.width*scale,h:m.height*scale};
      ctx.strokeStyle=m.overflow?"#f59e0b":"#61718b";ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
      drawTextPreview(ctx,element,rect,layout.canvas);
      capacity.textContent=!element.text.trim()?"文字内容为空：此框不会加入生成提示词。":`约可容纳每行 ${m.charsPerLine} 个全角字、${m.maxLines} 行；当前 ${m.lines.length} 行。${m.overflow?"可能溢出，请调整字号、分行或框大小。":""}`;
      wrapButton.disabled=!element.text.trim();undoWrap.disabled=!(wrapped&&wrapped.index===index&&wrapped.after===element.text&&wrapped.before!==wrapped.after);
    }

    numInputs.forEach((input, part) => {
      input.disabled = locked;
      if (force || document.activeElement !== input) input.value = twoDecimals(element.box[part]);
    });

    const tagsText = (element.tags ?? []).join(", ");
    if (document.activeElement !== tagsInput && tagsInput.value !== tagsText) tagsInput.value = tagsText;
    const paletteText = (element.palette ?? []).join(", ");
    if (document.activeElement !== paletteInput && paletteInput.value !== paletteText) paletteInput.value = paletteText;
    tagsInput.disabled = isBackground;
    paletteInput.disabled = isBackground;

    moveUp.disabled = isBackground || index <= 1;
    moveDown.disabled = isBackground || index >= layout.elements.length - 1;
    copyButton.disabled = isBackground;
    deleteButton.disabled = isBackground || !selectionUnits(layout, layoutStore.selections, true).length;
    deleteButton.textContent = layoutStore.selections.length > 1 ? "删除选中" : "删除元素";
  }

  function render() {
    renderHeader();
    renderList();
    renderDetail();
  }

  // One repaint per frame keeps typing smooth; the store notifies on every key.
  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      render();
    });
  }

  function revealSelection() {
    const index = selectedIndex();
    if (index < 0) return;
    const row = list.querySelector(`.mle-row[data-index="${index}"]`);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 4);
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + 4;
    }
  }

  const unsubscribeSelection = layoutStore.subscribeSelection(() => {
    renderList();
    renderDetail();
    revealSelection();
  });

  layoutStore.register(node, () => {
    scheduleRender();
  });

  // Show the first foreground element by default so the editor is never empty
  // when the layout already has content (selection stays shared with the canvas).
  if (layoutStore.selection < 0 && layoutOf().elements.length > 1) {
    layoutStore.setSelection(1, node.id);
  }

  const originalRemoved = node.onRemoved;
  node.onRemoved = function (...args) {
    unsubscribeSelection();
    clearTimeout(pulseTimer);
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    return originalRemoved?.apply(this, args);
  };

  node.onResize = ((original) => function (size) {
    const result = original?.apply(this, arguments);
    if (size) {
      size[0] = Math.max(size[0], 420);
      size[1] = Math.max(size[1], 560);
    }
    return result;
  })(node.onResize);
  node.setSize([
    Math.max(node.size?.[0] ?? 0, 420),
    Math.max(node.size?.[1] ?? 0, 560),
  ]);

  return { render, list, root };
}

function labelled(label, control) {
  return h("div", { class: "mle-field" }, [
    h("span", { class: "ml-label", text: label }),
    control,
  ]);
}

export default mountElements;

if (!window.__MOSS_LAYOUT_HARNESS__) {
  import("../../scripts/app.js").then(({ app }) => {
    app.registerExtension({
      name: "MossLayout.Elements",
      nodeCreated(node) {
        if (node.comfyClass !== CLASS && node.type !== CLASS) return;
        if (node.__mossElementsUI) return;
        try {
          node.__mossElementsUI = mountElements(node);
        } catch (error) {
          console.error("[moss-layout-ui] elements UI failed", error);
        }
      },
    });
  }).catch(() => {});
}
