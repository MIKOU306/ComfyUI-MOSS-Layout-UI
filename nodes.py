import json
import re

import numpy as np
import torch
from comfy_api.latest import ComfyExtension, io

from . import layout_schema

CATEGORY = "MOSS Layout"
STATE_TOOLTIP = "Layout JSON written by the node UI and saved with the workflow."
CHARACTER_BOXES = re.compile(r"\s*\d+(?:\s*,\s*\d+)*\s*")


def _to_image(image):
    array = np.asarray(image, dtype=np.float32) / 255.0
    return torch.from_numpy(array)[None,]


def _characters(raw):
    """Positions from a "1, 3" list; any other text is ignored."""
    if not isinstance(raw, str) or CHARACTER_BOXES.fullmatch(raw) is None:
        return set()
    return {int(value) for value in re.findall(r"\d+", raw)}


def _layout_from(*raw_values, width=layout_schema.DEFAULT_WIDTH, height=layout_schema.DEFAULT_HEIGHT):
    for raw in raw_values:
        if isinstance(raw, str) and raw.strip():
            return layout_schema.parse_layout(raw, width, height)
    return layout_schema.default_layout(width, height)


def _size_kwargs(state):
    """Canvas size saved with the workflow; a compiled prompt has no size of its own."""
    if not isinstance(state, str) or not state.strip():
        return {}
    try:
        return dict(layout_schema.parse_layout(state)["canvas"])
    except ValueError:
        return {}


class MOSSLayoutCanvas(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSLayoutCanvas",
            display_name="MOSS 构图布画 · Tag 画笔",
            category=CATEGORY,
            description="Draw the percent XYWH poster layout and emit it as moss-layout JSON "
                        "together with a rendered preview.",
            search_aliases=["MOSS layout", "layout canvas", "poster layout"],
            inputs=[
                io.Int.Input("width", default=layout_schema.DEFAULT_WIDTH,
                             min=layout_schema.MIN_CANVAS, max=layout_schema.MAX_CANVAS, step=16),
                io.Int.Input("height", default=layout_schema.DEFAULT_HEIGHT,
                             min=layout_schema.MIN_CANVAS, max=layout_schema.MAX_CANVAS, step=16),
                io.String.Input("state", multiline=True, default="", tooltip=STATE_TOOLTIP),
            ],
            outputs=[io.String.Output("layout"), io.Image.Output("preview")],
        )

    @classmethod
    def execute(cls, width, height, state):
        layout = _layout_from(state, width=width, height=height)
        layout = layout_schema.apply_canvas(layout, width, height)
        return io.NodeOutput(layout_schema.layout_json(layout),
                             _to_image(layout_schema.render_preview(layout)))


class MOSSLayoutElements(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSLayoutElements",
            display_name="MOSS 元素管理 · 定位 / 提示词",
            category=CATEGORY,
            description="Inspect and edit every layout element; emits the element list and the "
                        "1-based item positions of the characters.",
            search_aliases=["MOSS layout", "layout elements", "element editor"],
            inputs=[
                io.String.Input("layout", multiline=True, default=""),
                io.String.Input("state", multiline=True, default="", tooltip=STATE_TOOLTIP),
            ],
            outputs=[io.String.Output("elements"), io.String.Output("character_boxes")],
        )

    @classmethod
    def execute(cls, layout, state):
        draft = _layout_from(layout, state, **_size_kwargs(state))
        return io.NodeOutput(layout_schema.elements_json(draft),
                             layout_schema.character_boxes_json(draft))


class MOSSLayoutStandardPrompt(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSLayoutStandardPrompt",
            display_name="MOSS 标准提示词 · 导入 / 整理 / 导出",
            category=CATEGORY,
            description="Merge the canvas layout and the element list into the standard "
                        "moss-layout JSON and the final MOSS-Image prompt.",
            search_aliases=["MOSS layout", "layout prompt", "poster prompt"],
            inputs=[
                io.String.Input("layout", multiline=True, default=""),
                io.String.Input("elements", multiline=True, default=""),
                io.String.Input("character_boxes", multiline=True, default="",
                                tooltip="Item positions to compile as characters, e.g. \"1, 3\". "
                                        "Empty keeps the element types."),
                io.String.Input("state", multiline=True, default="", tooltip=STATE_TOOLTIP),
            ],
            outputs=[io.String.Output("prompt"), io.String.Output("standard_prompt")],
        )

    @classmethod
    def execute(cls, layout, elements, character_boxes, state):
        draft = _layout_from(layout, state, **_size_kwargs(state))
        if isinstance(elements, str) and elements.strip():
            value = json.loads(elements)
            if not isinstance(value, list):
                raise ValueError("elements 必须是 JSON 数组。")
            draft = layout_schema.normalize_layout(
                {**draft, "elements": value},
                draft["canvas"]["width"], draft["canvas"]["height"])
        prompt, standard = layout_schema.compile_prompt(draft, _characters(character_boxes))
        return io.NodeOutput(prompt, standard)


class MOSSLayoutExtension(ComfyExtension):
    async def get_node_list(self):
        return [MOSSLayoutCanvas, MOSSLayoutElements, MOSSLayoutStandardPrompt]


async def comfy_entrypoint():
    return MOSSLayoutExtension()
