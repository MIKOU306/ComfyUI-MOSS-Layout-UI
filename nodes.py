import json

import numpy as np
import torch
from comfy_api.latest import ComfyExtension, io

from . import layout_schema

CATEGORY = "MOSS Layout"
STATE_TOOLTIP = "Layout JSON written by the node UI and saved with the workflow."


def _to_image(image):
    array = np.asarray(image, dtype=np.float32) / 255.0
    return torch.from_numpy(array)[None,]


def _layout_from(*raw_values, width=layout_schema.DEFAULT_WIDTH, height=layout_schema.DEFAULT_HEIGHT):
    for raw in raw_values:
        if isinstance(raw, str) and raw.strip():
            return layout_schema.parse_layout(raw, width, height)
    return layout_schema.default_layout(width, height)


class MOSSLayoutCanvas(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSLayoutCanvas",
            display_name="MOSS 构图布画 · Tag 画笔",
            category=CATEGORY,
            description="Draw the percent XYWH poster layout and emit it as moss-layout JSON "
                        "together with a rendered preview.",
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
                        "character boxes.",
            inputs=[
                io.String.Input("layout", multiline=True, default=""),
                io.String.Input("state", multiline=True, default="", tooltip=STATE_TOOLTIP),
            ],
            outputs=[io.String.Output("elements"), io.String.Output("character_boxes")],
        )

    @classmethod
    def execute(cls, layout, state):
        draft = _layout_from(layout, state)
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
            inputs=[
                io.String.Input("layout", multiline=True, default=""),
                io.String.Input("elements", multiline=True, default=""),
                io.String.Input("character_boxes", multiline=True, default=""),
                io.String.Input("state", multiline=True, default="", tooltip=STATE_TOOLTIP),
            ],
            outputs=[io.String.Output("prompt"), io.String.Output("standard_prompt")],
        )

    @classmethod
    def execute(cls, layout, elements, character_boxes, state):
        draft = _layout_from(layout, state)
        if isinstance(elements, str) and elements.strip():
            value = json.loads(elements)
            if isinstance(value, list) and value:
                draft = layout_schema.normalize_layout(
                    {**draft, "elements": value},
                    draft["canvas"]["width"], draft["canvas"]["height"])
        prompt, standard = layout_schema.compile_prompt(draft)
        return io.NodeOutput(prompt, standard)


class MOSSLayoutExtension(ComfyExtension):
    async def get_node_list(self):
        return [MOSSLayoutCanvas, MOSSLayoutElements, MOSSLayoutStandardPrompt]


async def comfy_entrypoint():
    return MOSSLayoutExtension()
