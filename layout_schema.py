"""moss-layout/v1 poster drafts and the MOSS-Image prompt they compile into.

Coordinates in a draft are percentages ([left, top, width, height]); the
compiled prompt uses absolute pixels centred on the canvas, because that is
what the MOSS-Image text encoder expects.
"""

import json
import math
import re

from PIL import Image, ImageDraw, ImageFont

SCHEMA = "moss-layout/v1"
COORDINATE_SYSTEM = "percent_xywh"
DEFAULT_WIDTH = 1088
DEFAULT_HEIGHT = 1920
MIN_CANVAS = 16
MAX_CANVAS = 16384

TAGS = ("主体", "人物", "文字", "图片", "装饰", "版式", "固定")
TAG_COLORS = {
    "主体": (74, 158, 255),
    "人物": (233, 133, 206),
    "文字": (250, 204, 21),
    "图片": (89, 217, 127),
    "装饰": (192, 132, 252),
    "版式": (255, 145, 71),
    "固定": (138, 143, 152),
}
TAG_TYPE = {
    "主体": "object", "人物": "character", "文字": "text", "图片": "object",
    "装饰": "object", "版式": "object", "固定": "background",
}
TYPES = ("character", "object", "text", "background")


def _clamp(value, low, high):
    return min(max(value, low), high)


def _round1(value):
    rounded = math.floor(value * 10 + 0.5) / 10
    return int(rounded) if rounded == int(rounded) else rounded


def _number(value, fallback=0):
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        return fallback
    if isinstance(value, str) and not re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", value.strip()):
        return fallback
    try:
        number = float(value)
    except (ValueError, OverflowError):
        return fallback
    return number if math.isfinite(number) else fallback


def _clamp_box(box):
    values = list(box[:4]) if isinstance(box, (list, tuple)) else []
    while len(values) < 4:
        values.append(0.0)
    x = _round1(_clamp(_number(values[0]), 0, 99.9))
    y = _round1(_clamp(_number(values[1]), 0, 99.9))
    width = _clamp(_number(values[2], 1), 0.1, 100 - x)
    height = _clamp(_number(values[3], 1), 0.1, 100 - y)
    return [_round1(x), _round1(y), _round1(width), _round1(height)]


def _background(prompt=""):
    return {"name": "背景 · 固定铺满", "tag": "固定", "type": "background",
            "box": [0, 0, 100, 100], "prompt": prompt}


def default_layout(width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT):
    return {
        "schema": SCHEMA,
        "coordinate_system": COORDINATE_SYSTEM,
        "canvas": _canvas_size({}, width, height),
        "global_prompt": "",
        "elements": [_background()],
    }


def _normalize_element(raw, index):
    source = raw if isinstance(raw, dict) else {}
    tag = source.get("tag") if source.get("tag") in TAGS else "主体"
    element_type = source.get("type") if source.get("type") in TYPES else TAG_TYPE.get(tag, "object")
    name = source.get("name")
    if not (isinstance(name, str) and name.strip()):
        name = f"元素 {index + 1:02d}"
    element = {
        "name": name.strip(),
        "tag": "固定" if element_type == "background" else tag,
        "type": element_type,
        "box": [0, 0, 100, 100] if element_type == "background" else _clamp_box(source.get("box")),
        "prompt": source.get("prompt") if isinstance(source.get("prompt"), str) else "",
    }
    if element_type == "text":
        element["text"] = source.get("text") if isinstance(source.get("text"), str) else ""
        typography = _typography(source.get("typography"))
        if typography:
            element["typography"] = typography
    if element_type != "background":
        if source.get("locked") is True:
            element["locked"] = True
        if isinstance(source.get("group_id"), str) and source["group_id"].strip():
            element["group_id"] = source["group_id"].strip()
    return element


def _canvas_size(canvas, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT):
    result = {}
    for name, fallback in (("width", width), ("height", height)):
        value = _number(canvas.get(name), fallback) or fallback
        result[name] = int(_clamp(math.floor(value + 0.5), MIN_CANVAS, MAX_CANVAS))
    return result


def _typography(raw):
    if not isinstance(raw, dict):
        return {}
    style = {}
    if raw.get("font_style") in ("sans", "serif", "handwritten", "display"):
        style["font_style"] = raw["font_style"]
    if isinstance(raw.get("color"), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", raw["color"]):
        style["color"] = raw["color"].lower()
    if raw.get("align") in ("left", "center", "right"):
        style["align"] = raw["align"]
    for name, low, high in (("font_size", 1, 2048), ("line_height", 0.5, 4)):
        value = _number(raw.get(name))
        if value > 0:
            style[name] = _round1(_clamp(value, low, high))
    return style


def _text_caption(element):
    style = _typography(element.get("typography")) if element["type"] == "text" else {}
    parts = [element.get("prompt") or ""]
    fonts = {"sans": "Sans-serif lettering.", "serif": "Serif lettering.",
             "handwritten": "Handwritten lettering.", "display": "Bold display lettering."}
    if "font_style" in style:
        parts.append(fonts[style["font_style"]])
    if "color" in style:
        parts.append(f"Text color {style['color']}.")
    if "align" in style:
        parts.append(f"{style['align'].capitalize()}-aligned text.")
    if "font_size" in style:
        parts.append(f"Approximate font size {style['font_size']} px.")
    if "line_height" in style:
        parts.append(f"Line height {style['line_height']} times the font size.")
    return " ".join(part for part in parts if part)


def normalize_layout(raw, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT):
    source = raw if isinstance(raw, dict) else {}
    canvas = source.get("canvas") if isinstance(source.get("canvas"), dict) else {}
    elements = []
    background = None
    entries = source.get("elements") if isinstance(source.get("elements"), list) else []
    for entry in entries:
        element = _normalize_element(entry, len(elements))
        if element["type"] == "background":
            background = background or element
            continue
        elements.append(element)
    return {
        "schema": SCHEMA,
        "coordinate_system": COORDINATE_SYSTEM,
        "canvas": _canvas_size(canvas, width, height),
        "global_prompt": source.get("global_prompt") if isinstance(source.get("global_prompt"), str) else "",
        "elements": [background or _background(), *elements],
    }


def _candidates(text):
    yield text
    yield re.sub(r"\s*```$", "", re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE))
    for start, char in enumerate(text):
        if char != "{":
            continue
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            current = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif current == "\\":
                    escaped = True
                elif current == '"':
                    in_string = False
                continue
            if current == '"':
                in_string = True
            elif current == "{":
                depth += 1
            elif current == "}":
                depth -= 1
                if depth == 0:
                    yield text[start:index + 1]
                    break


def _layout_value(value):
    if isinstance(value, list):
        return {"elements": value}
    if isinstance(value, dict) and isinstance(value.get("elements"), list):
        if value.get("schema", SCHEMA) != SCHEMA or value.get("coordinate_system", COORDINATE_SYSTEM) != COORDINATE_SYSTEM:
            raise ValueError("布局格式不兼容：需要 moss-layout/v1 和 percent_xywh 坐标。")
        return value
    return None


def parse_layout(raw, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT):
    """Read a draft from text or mapping; an empty input yields a fresh layout."""
    if isinstance(raw, (dict, list)):
        value = _layout_value(raw)
        if value is None:
            raise ValueError("布局必须包含 elements 数组。")
        return normalize_layout(value, width, height)
    text = raw.strip() if isinstance(raw, str) else ""
    if not text:
        return default_layout(width, height)
    for candidate in _candidates(text):
        try:
            value = json.loads(candidate)
        except ValueError:
            continue
        layout = _layout_value(value)
        if layout:
            return normalize_layout(layout, width, height)
    raise ValueError("layout is not a moss-layout JSON object")


def apply_canvas(layout, width, height):
    layout = dict(layout)
    layout["canvas"] = _canvas_size({"width": width, "height": height})
    return layout


def _foreground(layout):
    """Elements that become items: the background and empty text boxes are skipped."""
    return [element for element in layout["elements"] if element["type"] != "background"
            and (element["type"] != "text" or element.get("text", "").strip())]


def _compiled_item(element, width, height, character=False):
    left, top, box_width, box_height = element["box"]
    x1 = left / 100 * width
    y1 = top / 100 * height
    x2 = (left + box_width) / 100 * width
    y2 = (top + box_height) / 100 * height
    half_width = width // 2
    half_height = height // 2
    has_text = element["type"] == "text" and bool((element.get("text") or "").strip())
    if has_text:
        label = "text"
    elif character or element["type"] == "character":
        label = "character"
    else:
        label = "object"
    item = {
        "label": label,
        "caption": _text_caption(element),
        "bbox": [
            math.floor(y1) - half_height,
            math.floor(x1) - half_width,
            math.ceil(y2) - half_height,
            math.ceil(x2) - half_width,
        ],
    }
    if label == "text":
        item["text"] = element["text"]
    return item


def compile_prompt(layout, characters=()):
    """Return (prompt, standard_prompt) exactly as the two STRING outputs.

    ``characters`` holds 1-based item positions that must compile as characters,
    so an element typed as an object can be relabelled without editing the layout.
    """
    layout = normalize_layout(layout)
    width = layout["canvas"]["width"]
    height = layout["canvas"]["height"]
    foreground = _foreground(layout)
    background = layout["elements"][0]["prompt"].strip()
    caption = "\n".join(dict.fromkeys(part for part in (layout["global_prompt"].strip(), background) if part))
    if foreground:
        prompt = {
            "summary": {"caption": caption},
            "items": [_compiled_item(element, width, height, position in characters)
                      for position, element in enumerate(foreground, start=1)],
            "bbox_coord_space": "abs_centralized",
            "bbox_format": "yxyx",
        }
        prompt = json.dumps(prompt, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    else:
        prompt = caption
    standard = json.dumps(layout, ensure_ascii=False, indent=2, allow_nan=False)
    return prompt, standard


def layout_json(layout):
    return json.dumps(layout, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def elements_json(layout):
    return json.dumps(layout["elements"], ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def character_boxes_json(layout):
    """1-based item positions of the characters, as the "1, 3" list nodes accept."""
    return ", ".join(str(position) for position, element in enumerate(_foreground(layout), start=1)
                     if element["type"] == "character")


FONT_CANDIDATES = (
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/segoeui.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def _font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _text_color(color):
    red, green, blue = color
    luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
    return (16, 19, 24) if luminance > 0.58 else (245, 247, 250)


def render_preview(layout):
    """Draw the layout the way the canvas shows it; returns a PIL image."""
    width = layout["canvas"]["width"]
    height = layout["canvas"]["height"]
    scale = min(512 / width, 1024 / height)
    image_width = max(1, round(width * scale))
    image_height = max(1, round(height * scale))
    image = Image.new("RGB", (image_width, image_height), (20, 23, 29))
    draw = ImageDraw.Draw(image, "RGBA")

    draw.rectangle([0, 0, image_width - 1, image_height - 1], fill=(28, 33, 41, 255))
    step = 16 * scale
    while step < 11:
        step *= 2
    x = step
    while x < image_width:
        draw.line([(round(x), 0), (round(x), image_height)], fill=(255, 255, 255, 16))
        x += step
    y = step
    while y < image_height:
        draw.line([(0, round(y)), (image_width, round(y))], fill=(255, 255, 255, 16))
        y += step

    font = _font(max(10, round(image_width / 42)))
    for index, element in enumerate(layout["elements"]):
        color = TAG_COLORS.get(element["tag"], TAG_COLORS["固定"])
        left, top, box_width, box_height = element["box"]
        x1 = round(left / 100 * image_width)
        y1 = round(top / 100 * image_height)
        x2 = round((left + box_width) / 100 * image_width)
        y2 = round((top + box_height) / 100 * image_height)
        label = f"{index + 1:02d} {element['name']}"
        if element["type"] == "background":
            draw.text((max(6, x1 + 8), max(6, y1 + 8)), label, font=font, fill=(150, 157, 170, 210))
            continue
        draw.rectangle([x1, y1, x2, y2], fill=(*color, 36))
        draw.rectangle([x1, y1, x2, y2], outline=(*color, 255), width=2)
        bounds = draw.textbbox((0, 0), label, font=font)
        chip_width = bounds[2] - bounds[0] + 10
        chip_height = bounds[3] - bounds[1] + 6
        if chip_width < x2 - x1 and chip_height < y2 - y1:
            draw.rectangle([x1, y1, x1 + chip_width, y1 + chip_height], fill=(*color, 255))
            draw.text((x1 + 5, y1 + 2), label, font=font, fill=_text_color(color))
    return image
