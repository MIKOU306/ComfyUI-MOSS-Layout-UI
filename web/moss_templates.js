import { h, button, createLayout, parseLayout, serializePretty, tagColor } from "./moss_common.js";
import { drawTextPreview } from "./moss_text.js";

const make = (id, name, width, height, prompt, entries) => ({id, name, layout: {
  ...createLayout(width, height), global_prompt: prompt,
  elements: [createLayout().elements[0], ...entries.map(([type, name, box, prompt, text, typography]) => ({
    type, name, tag: type === "text" ? "文字" : type === "character" ? "人物" : "主体", box, prompt,
    ...(type === "text" ? {text, ...(typography ? {typography} : {})} : {}),
  }))],
}});
export const BUILTIN_TEMPLATES = [
  make("builtin-movie", "电影海报 · 月港夜航", 1088, 1920, "原创科幻电影海报，雨后的未来港口，冷蓝夜色与暖金灯光，电影级写实质感，前景人物清晰。指定文案各出现一次。", [
    ["text", "系列标识", [10,5,80,5], "Small restrained silver lettering.", "远航计划 · 第一章"],
    ["character", "领航员", [18,18,64,55], "A young adult astronaut in a white flight suit holding a navigation device, full body."],
    ["object", "港口飞船", [65,38,27,25], "A compact shuttle parked on a rain-soaked landing platform."],
    ["text", "片名", [8,78,84,10], "Large polished cinematic title.", "月港夜航", {font_style:"display",color:"#e2e8f0",align:"center",font_size:128}],
    ["text", "宣传语", [12,91,76,4], "Clean small subtitle.", "穿越漫长夜色，奔赴下一颗星。"],
  ]),
  make("builtin-shop", "电商促销 · 夏日气泡", 1024, 1024, "清爽饮品促销海报，薄荷绿背景，柠檬切片与水珠，明亮商业摄影，产品标签简洁。价格与活动文案清晰且不重复。", [
    ["text", "活动标题", [7,6,86,12], "Bold fresh promotional headline.", "夏日清爽计划", {font_style:"display",color:"#155e75",align:"center",font_size:92}],
    ["object", "饮料主商品", [24,24,52,48], "One chilled glass bottle of citrus sparkling water, condensation droplets, product photography."],
    ["text", "卖点", [8,76,84,7], "Clear dark green sans-serif slogan.", "清新柠檬味 · 冰爽一整夏"],
    ["text", "活动价格", [9,85,42,10], "Large orange price text.", "¥19.9", {font_style:"display",color:"#ea580c",align:"left",font_size:72}],
    ["text", "活动时间", [55,88,38,6], "Small dark green date text.", "限时活动 07.01—07.15", {font_size:24}],
  ]),
  make("builtin-magazine", "杂志封面 · 城市漫游", 1088, 1536, "原创城市生活杂志封面，米白与暖灰配色，现代建筑前的人物摄影，纸质印刷质感，标题层次分明。", [
    ["text", "刊名", [6,5,88,12], "Elegant large magazine masthead.", "城市漫游", {font_style:"serif",color:"#ece5d4",align:"center",font_size:132}],
    ["character", "封面人物", [22,21,65,69], "An adult urban traveler in a tailored beige coat, standing in front of minimalist architecture."],
    ["text", "主专题", [7,34,34,18], "Three lines of elegant editorial headline.", "寻找\n城市的\n另一面", {font_style:"serif",color:"#f8fafc",align:"left",font_size:60}],
    ["text", "期号", [7,20,50,4], "Small magazine issue line.", "VOL. 08 / AUTUMN 2026"],
    ["text", "底部专题", [8,92,84,4], "Small clear editorial footer.", "建筑 · 旅行 · 日常灵感"],
  ]),
  make("builtin-profile", "人物介绍卡 · 创作者", 1344, 768, "极简创作者介绍卡，深蓝背景，柔和侧光，左侧半身肖像，右侧清晰文字区，专业平面设计。", [
    ["character", "人物肖像", [5,10,39,82], "Half-body portrait of an adult illustrator in a dark casual jacket, friendly calm expression."],
    ["text", "姓名", [51,17,43,15], "Large clean name.", "林知远", {font_style:"display",color:"#f8fafc",align:"left",font_size:88}],
    ["text", "职业", [52,37,40,8], "Light blue professional subtitle.", "插画师 / 视觉设计师"],
    ["text", "简介", [52,53,40,22], "Readable three-line introduction with generous spacing.", "用色彩记录日常\n用图像讲述故事\n专注品牌与出版插画", {font_style:"sans",color:"#cbd5e1",align:"left",font_size:38,line_height:1.35}],
    ["text", "联系说明", [52,85,40,6], "Small discreet footer.", "作品集 · PORTFOLIO 2026"],
  ]),
];

const STORAGE_KEY = "moss-layout-ui.templates.v1";
export function readTemplates(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error("本地模板库格式损坏，请先导出当前布局，再重置本地库。");
  const ids = new Set();
  return list.map(entry => {
    const layout = parseLayout(entry?.layout);
    if (!layout || typeof entry.id !== "string" || !entry.id.startsWith("user-") || ids.has(entry.id)
        || typeof entry.name !== "string" || !entry.name.trim()) throw new Error("本地模板库包含无效条目，原数据已保留。");
    ids.add(entry.id); return {id:entry.id,name:entry.name.trim(),layout};
  });
}

export function mountTemplates(node, store) {
  let custom = [], storageError = false;
  const select = h("select", {class:"ml-select mlt-select", "aria-label":"布局模板"});
  const name = h("input", {class:"ml-input mlt-name",placeholder:"自定义模板名称", "aria-label":"模板名称"});
  const status = h("div", {class:"ml-muted mlt-status",role:"status"});
  const preview = h("canvas", {class:"mlt-preview",width:260,height:170,style:{width:"100%",height:"130px",objectFit:"contain"}});
  const selected = () => [...BUILTIN_TEMPLATES,...custom].find(item => item.id === select.value);
  const message = text => { status.textContent = text; };
  function refresh() {
    const current = select.value;
    try { custom = readTemplates(localStorage); storageError = false; }
    catch (error) { custom = []; storageError = true; message(`无法读取模板库：${error.message}`); }
    select.replaceChildren(...[...BUILTIN_TEMPLATES,...custom].map(item => h("option", {value:item.id,text:`${item.id.startsWith("builtin-") ? "内置" : "我的"} · ${item.name}`})));
    select.value = [...BUILTIN_TEMPLATES,...custom].some(item => item.id === current) ? current : BUILTIN_TEMPLATES[0].id;
    draw();
  }
  function persist(next, id) {
    if (storageError) throw new Error("本地库未能读取，未覆盖原数据。请先处理或重置本地库。");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("moss-templates-changed"));
    select.value = id || BUILTIN_TEMPLATES[0].id; draw();
  }
  function action(fn) { try { fn(); } catch(error) { message(`操作失败：${error.message}`); } }
  function draw() {
    const item = selected(); if (!item) return;
    update.disabled = remove.disabled = !item.id.startsWith("user-");
    const ctx = preview.getContext("2d"), layout = item.layout, scale = Math.min(252/layout.canvas.width,162/layout.canvas.height);
    const w=layout.canvas.width*scale, hh=layout.canvas.height*scale, x=(260-w)/2, y=(170-hh)/2;
    ctx.clearRect(0,0,260,170);ctx.fillStyle="#141c29";ctx.fillRect(x,y,w,hh);
    for(const element of layout.elements.slice(1)) {
      const rect={x:x+element.box[0]/100*w,y:y+element.box[1]/100*hh,w:element.box[2]/100*w,h:element.box[3]/100*hh};
      ctx.strokeStyle=tagColor(element);ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
      drawTextPreview(ctx,element,rect,layout.canvas);
    }
    caption.textContent=`${item.name} · ${layout.canvas.width} × ${layout.canvas.height} · ${layout.elements.length-1} 个元素`;
  }
  const apply=button("应用模板",{className:"mlt-apply",onClick:()=>action(()=>{
    const item=selected(),before=store.get().canvas;
    store.importLayout(item.layout,node.id);
    const after=store.get().canvas;
    const resized=before.width!==after.width||before.height!==after.height;
    message(`已应用「${item.name}」。${resized
      ? `画布尺寸改为 ${after.width} × ${after.height}，生成分辨率会跟着变`
      : `尺寸保持 ${after.width} × ${after.height}（已连接的尺寸输入优先）`}；画布「撤销」可回退，文案在元素管理中修改。`);
  })});
  const save=button("保存当前为新模板",{className:"mlt-save",onClick:()=>action(()=>{
    if(!name.value.trim())throw new Error("请填写模板名称。");
    const id=`user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
    persist([...custom,{id,name:name.value.trim(),layout:parseLayout(store.get())}],id);message("已保存到此浏览器。分享或换电脑请导出模板文件。");
  })});
  const update=button("更新所选模板",{className:"mlt-update",onClick:()=>action(()=>{
    const item=selected();if(!item?.id.startsWith("user-"))return;
    persist(custom.map(t=>t.id===item.id?{...t,name:name.value.trim()||t.name,layout:parseLayout(store.get())}:t),item.id);message("已更新所选自定义模板。");
  })});
  const remove=button("删除模板",{variant:"danger",className:"mlt-remove",onClick:()=>action(()=>{
    const item=selected();if(!item?.id.startsWith("user-")||!confirm(`删除模板「${item.name}」？当前画布会保留。`))return;
    persist(custom.filter(t=>t.id!==item.id));message("已删除模板，当前画布未改变。");
  })});
  const exportButton=button("导出模板",{className:"mlt-export",onClick:()=>action(()=>{
    const item=selected(), url=URL.createObjectURL(new Blob([serializePretty(item.layout)],{type:"application/json"}));
    const link=h("a",{href:url,download:`${item.name.replace(/[\\/:*?"<>|]/g,"_")}.moss-layout.json`});
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message("已导出所选模板，可在其他电脑导入。");
  })});
  const file=h("input",{type:"file",accept:".json,application/json",class:"mlt-file",style:{display:"none"}});
  file.addEventListener("change",async()=>{
    const picked=file.files?.[0];if(!picked)return;
    try{
      const layout=parseLayout(await picked.text());if(!layout)throw new Error("需要 moss-layout/v1 布局 JSON，模型的 summary/items 不是模板文件。");
      action(()=>{const id=`user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;persist([...custom,{id,name:picked.name.replace(/(?:\.moss-layout)?\.json$/i,""),layout}],id);message("已导入模板库，点击「应用模板」放到画布。");});
    }catch(error){message(`导入失败：${error.message}`);}finally{file.value="";}
  });
  const reset=button("重置本地库",{variant:"danger",onClick:()=>action(()=>{
    if(!confirm("删除此浏览器的全部自定义模板？内置模板与当前画布保留。"))return;
    localStorage.removeItem(STORAGE_KEY);window.dispatchEvent(new Event("moss-templates-changed"));message("已重置自定义模板库。");
  })});
  const caption=h("div",{class:"ml-muted"});
  const root=h("details",{class:"mlt-library",style:{flex:"0 0 auto",marginBottom:"8px"}},[
    h("summary",{text:"布局模板库",style:{cursor:"pointer",color:"#9fc5ef"}}),
    h("div",{class:"ml-col",style:{paddingTop:"8px"}},[select,preview,caption,
      h("div",{class:"ml-row",style:{flexWrap:"wrap"}},[apply,exportButton,button("导入模板文件",{onClick:()=>file.click()}),file]),
      name,h("div",{class:"ml-row",style:{flexWrap:"wrap"}},[save,update,remove,reset]),status]),
  ]);
  select.addEventListener("change",()=>{name.value=selected()?.name||"";draw();});
  window.addEventListener("moss-templates-changed",refresh);
  const storageChanged=event=>{if(event.key===STORAGE_KEY||event.key===null)refresh();};
  window.addEventListener("storage",storageChanged);refresh();
  const removed=node.onRemoved;
  node.onRemoved=function(...args){window.removeEventListener("moss-templates-changed",refresh);window.removeEventListener("storage",storageChanged);return removed?.apply(this,args);};
  return root;
}
