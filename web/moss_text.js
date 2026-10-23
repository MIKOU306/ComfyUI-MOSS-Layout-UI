// Optional typography is editor data; the compiler turns it into caption text.
export const FONT_STYLES = { sans: "无衬线 / 黑体", serif: "衬线 / 宋体", handwritten: "手写体", display: "粗体标题" };
const FAMILIES = { sans: '"Microsoft YaHei",sans-serif', serif: '"SimSun",serif', handwritten: '"KaiTi",cursive', display: '"Microsoft YaHei",sans-serif' };

export function normalizeTypography(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result = {};
  if (Object.hasOwn(FONT_STYLES, raw.font_style)) result.font_style = raw.font_style;
  if (typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)) result.color = raw.color.toLowerCase();
  if (["left", "center", "right"].includes(raw.align)) result.align = raw.align;
  for (const [name, low, high] of [["font_size", 1, 2048], ["line_height", 0.5, 4]]) {
    if (!["number","string"].includes(typeof raw[name])) continue;
    if (typeof raw[name] === "string" && !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(raw[name].trim())) continue;
    const value = Number(raw[name]);
    if (Number.isFinite(value) && value > 0) result[name] = Math.round(Math.min(high, Math.max(low, value)) * 10) / 10;
  }
  return Object.keys(result).length ? result : null;
}

export function textCaption(element) {
  const style = normalizeTypography(element.typography);
  const parts = [element.prompt || ""];
  if (!style || element.type !== "text") return parts[0];
  const fonts = { sans: "Sans-serif lettering.", serif: "Serif lettering.", handwritten: "Handwritten lettering.", display: "Bold display lettering." };
  if (style.font_style) parts.push(fonts[style.font_style]);
  if (style.color) parts.push(`Text color ${style.color}.`);
  if (style.align) parts.push(`${style.align[0].toUpperCase() + style.align.slice(1)}-aligned text.`);
  if (style.font_size) parts.push(`Approximate font size ${style.font_size} px.`);
  if (style.line_height) parts.push(`Line height ${style.line_height} times the font size.`);
  return parts.filter(Boolean).join(" ");
}

const units = text => Array.from(text).reduce((sum, char) => sum + (/^[\x00-\x7f]$/.test(char) ? 0.55 : 1), 0);
export function textMetrics(element, canvas) {
  const width = element.box[2] / 100 * canvas.width;
  const height = element.box[3] / 100 * canvas.height;
  const lines = (element.text || "").replace(/\r\n?/g, "\n").split("\n");
  const style = normalizeTypography(element.typography) || {};
  const fontSize = style.font_size || Math.max(1, Math.min(64, height / (lines.length * 1.2) * 0.8));
  const lineHeight = style.line_height || 1.2;
  const available = width * 0.96;
  return {width, height, lines, style, fontSize, lineHeight,
    charsPerLine: Math.max(0, Math.floor(available / fontSize)),
    maxLines: Math.max(0, Math.floor(height * 0.96 / (fontSize * lineHeight))),
    overflow: lines.some(line => units(line) * fontSize > available) || lines.length * fontSize * lineHeight > height * 0.96};
}

export function wrapText(element, canvas) {
  const m = textMetrics(element, canvas), capacity = Math.max(1, m.width * 0.96 / m.fontSize);
  return m.lines.map(line => {
    const rows = []; let row = "", used = 0;
    for (const char of Array.from(line)) {
      const next = units(char);
      if (row && used + next > capacity) { rows.push(row); row = ""; used = 0; }
      row += char; used += next;
    }
    rows.push(row); return rows.join("\n");
  }).join("\n");
}

export function drawTextPreview(ctx, element, rect, canvas) {
  if (element.type !== "text" || !element.text?.trim() || rect.w < 2 || rect.h < 2) return;
  const m = textMetrics(element, canvas), scale = rect.w / m.width;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = m.style.color || "#f4f4f5";
  ctx.font = `${m.style.font_style === "display" ? 800 : 400} ${m.fontSize * scale}px ${FAMILIES[m.style.font_style] || FAMILIES.sans}`;
  ctx.textAlign = m.style.align || "center"; ctx.textBaseline = "top";
  const x = rect.x + (ctx.textAlign === "left" ? rect.w * .02 : ctx.textAlign === "right" ? rect.w * .98 : rect.w / 2);
  m.lines.forEach((line, index) => ctx.fillText(line, x, rect.y + rect.h * .02 + index * m.fontSize * m.lineHeight * scale));
  ctx.restore();
}
