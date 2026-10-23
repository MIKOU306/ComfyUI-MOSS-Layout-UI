import { upstreamCanvas } from "./moss_common.js";
import { textMetrics } from "./moss_text.js";

export function inputNumber(node, name, seen = new Set()) {
  if (!node || seen.has(node)) return NaN;
  seen.add(node);
  const slot = node.inputs?.findIndex(input => input.name === name) ?? -1;
  if (slot >= 0 && node.inputs[slot].link != null) {
    let source = node.getInputNode?.(slot);
    while ((source?.comfyClass ?? source?.type) === "Reroute") {
      if (seen.has(source)) return NaN;
      seen.add(source); source = source.getInputNode?.(0);
    }
    const type = source?.comfyClass ?? source?.type;
    return type === "PrimitiveInt" || type === "PrimitiveNode" ? inputNumber(source, "value", seen) : NaN;
  }
  const raw = node.widgets?.find(widget => widget.name === name)?.value;
  return typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
}

export function layoutWarnings(layout) {
  const issues = [];
  layout.elements.forEach((element, index) => {
    if (element.type !== "text") return;
    if (!element.text.trim()) issues.push(`${index+1}「${element.name}」文字内容为空，未加入生成提示词。`);
    else if (textMetrics(element, layout.canvas).overflow) issues.push(`${index+1}「${element.name}」文案可能超出文字框，建议分行、减小字号或扩大框。`);
  });
  if (layout.canvas.width % 16 || layout.canvas.height % 16) issues.push("画布尺寸不是 16 的倍数，请核对模型和潜空间节点的尺寸要求。");
  return issues;
}

function ancestors(node, seen = new Set()) {
  if (!node || seen.has(node)) return seen;
  seen.add(node);
  for (let i=0;i<(node.inputs?.length||0);i++) if(node.inputs[i].link != null) ancestors(node.getInputNode?.(i),seen);
  return seen;
}

export function workflowWarnings(node, layout) {
  const issues = layoutWarnings(layout), canvas = upstreamCanvas(node);
  const type = node.comfyClass ?? node.type;
  if (type !== "MOSSLayoutCanvas" && !canvas) issues.unshift("未连接布局画布：修改仅保存在此节点，请连接画布的 layout 输出。");
  const owners = new Set();
  for (const [slot,input] of (node.inputs||[]).entries()) {
    if(!["layout","elements","character_boxes"].includes(input.name)||input.link == null)continue;
    const owner=upstreamCanvas(node.getInputNode?.(slot));if(owner)owners.add(owner);
  }
  if(owners.size>1)issues.unshift("连线冲突：输入来自不同画布，请将 layout、elements 与 character_boxes 接到同一套节点。");
  if (canvas) for (const name of ["width","height"]) {
    if(canvas.inputs?.some(input=>input.name===name&&input.link!=null)&&!Number.isFinite(inputNumber(canvas,name)))
      issues.push(`无法预读画布 ${name} 的上游值，当前预览尺寸可能与运行时不同。`);
  }
  // Only inspect samplers downstream of this prompt, not unrelated workflows.
  if(type === "MOSSLayoutStandardPrompt")for(const sampler of node.graph?._nodes||[]) {
    const slot=sampler.inputs?.findIndex(input=>input.name==="latent_image")??-1;
    if(slot<0||!ancestors(sampler).has(node))continue;
    const sources=[...ancestors(sampler.getInputNode?.(slot))].filter(source => {
      const name=source.comfyClass??source.type??"";
      return /Latent/i.test(name)&&["width","height"].every(key=>source.widgets?.some(w=>w.name===key)||source.inputs?.some(i=>i.name===key));
    });
    if(!sources.length)issues.push(`采样器 ${sampler.id} 的图像尺寸无法预读，请核对与画布 ${layout.canvas.width} × ${layout.canvas.height} 一致。`);
    for(const source of sources) {
      const width=inputNumber(source,"width"),height=inputNumber(source,"height");
      if(!Number.isFinite(width)||!Number.isFinite(height))issues.push(`潜空间节点 ${source.id} 的尺寸无法预读，请运行前核对。`);
      else if(width!==layout.canvas.width||height!==layout.canvas.height)issues.push(`尺寸不一致：画布 ${layout.canvas.width} × ${layout.canvas.height}，潜空间节点 ${source.id} 为 ${width} × ${height}。`);
    }
  }
  return [...new Set(issues)];
}

let duplicatePromise;
export function duplicateInstallWarning() {
  duplicatePromise ??= fetch("/extensions").then(response=>{
    if(!response.ok)throw new Error("无法读取扩展列表");return response.json();
  }).then(extensions=>{
    const copies=extensions.filter(url=>/\/moss_canvas\.js(?:\?|$)/.test(url));
    return copies.length>1?"检测到重复安装：请只保留一份 MOSS Layout UI，将旧目录移出 custom_nodes 后重启。":"";
  }).catch(()=>"无法检查重复安装，可手动确认 custom_nodes 中只保留一份 MOSS Layout UI。");
  return duplicatePromise;
}
