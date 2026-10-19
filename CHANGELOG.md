# Changelog

## 1.0.0

首个公开版本。三个节点：`MOSSLayoutCanvas` / `MOSSLayoutElements` / `MOSSLayoutStandardPrompt`。

- 画布：tag 画笔、框内拖动移动、四角缩放、Alt 轮选重叠元素、撤销 / 重做（60 步）、新框模板提示词、清空画布
- 画布按生成宽高等比显示，节点变宽变矮不会拉伸布局
- 宽高可接 `PrimitiveInt` / 前端 `PrimitiveNode` / `Reroute` 联动；断开连线后仍可直接改本节点宽高
- 元素面板：搜索、tag 筛选、名称 / tag / 生成类型 / 提示词 / 四个百分比坐标编辑，上移 / 下移 / 复制 / 删除
- 标准提示词面板：全局提示词、导入新布局、合并并保留修改、导出回输入框、当前标准 JSON 与最终生成词双 tab、一键复制
- 输出官方 `summary` + `items`（`abs_centralized` / `yxyx`）紧凑 JSON，直接接 `CLIPTextEncode.text`
- 布局用百分比坐标保存，改画布尺寸不需要重排元素
- 后端同时输出 `preview` 图（PIL 绘制），便于在没有前端的场景下核对布局

### 修复记录

- 拖动位移累加：修复前预期移动 `[5%, 2%]` 实际移动到 `[32.5%, 13%]`，且宽度从 `63.9%` 缩到 `48.5%`；现在始终以按下时的原始框计算位移，1 / 12 / 40 次移动事件结果一致
- 尺寸联动：连接整数节点后画布会读上游当前值，同步比例、三节点保存数据与生成坐标；序列化前再同步一次，避免刚改完尺寸就运行拿到旧值
- 示例工作流中的 `ModelSamplingSD3` 已置为 bypass：MOSS 在当前 ComfyUI 里原生带 `shift=5`，再叠一个 SD3 会替换 sigma/timestep 映射并产生彩噪
