// Geometry shared by canvas editing and the element inspector. All boxes use
// percent XYWH, independently of the displayed canvas size and graph zoom.
export function boundsOf(boxes) {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map(b => b[0]));
  const top = Math.min(...boxes.map(b => b[1]));
  return [left, top, Math.max(...boxes.map(b => b[0] + b[2])) - left,
    Math.max(...boxes.map(b => b[1] + b[3])) - top];
}

export function elementIndices(layout, index) {
  const element = layout.elements[index];
  if (!element || index < 1) return element ? [index] : [];
  return element.group_id
    ? layout.elements.flatMap((e, i) => i > 0 && e.group_id === element.group_id ? [i] : [])
    : [index];
}

export function positionLocked(layout, index) {
  return index === 0 || elementIndices(layout, index).some(i => layout.elements[i].locked);
}

export function selectionUnits(layout, indices, editableOnly = false) {
  const seen = new Set();
  const units = [];
  for (const index of indices) {
    if (index < 1 || !layout.elements[index] || seen.has(index)) continue;
    const members = elementIndices(layout, index);
    members.forEach(i => seen.add(i));
    if (editableOnly && members.some(i => layout.elements[i].locked)) continue;
    units.push({ indices: members, box: boundsOf(members.map(i => layout.elements[i].box)) });
  }
  return units;
}

export function translatedBoxes(boxes, dx, dy) {
  const bounds = boundsOf(boxes);
  if (!bounds) return [];
  dx = Math.min(Math.max(dx, -bounds[0]), 100 - bounds[0] - bounds[2]);
  dy = Math.min(Math.max(dy, -bounds[1]), 100 - bounds[1] - bounds[3]);
  return boxes.map(b => [b[0] + dx, b[1] + dy, b[2], b[3]]);
}

export function resizedBoxes(boxes, target) {
  const source = boundsOf(boxes);
  if (!source) return [];
  return boxes.map(b => [
    target[0] + (b[0] - source[0]) / source[2] * target[2],
    target[1] + (b[1] - source[1]) / source[3] * target[3],
    b[2] / source[2] * target[2], b[3] / source[3] * target[3],
  ]);
}

export function arrangedBoxes(layout, indices, action) {
  const units = selectionUnits(layout, indices, true);
  if (!units.length) return new Map();
  const boxes = units.map(u => u.box);
  const bounds = units.length === 1 ? [0, 0, 100, 100] : boundsOf(boxes);
  const axis = action.endsWith("x") ? 0 : 1;
  const size = axis + 2;
  const updates = new Map();
  if (action.startsWith("distribute")) {
    if (units.length < 3) return updates;
    units.sort((a, b) => a.box[axis] - b.box[axis]);
    const gap = (bounds[size] - units.reduce((sum, u) => sum + u.box[size], 0)) / (units.length - 1);
    let at = bounds[axis];
    for (const unit of units) {
      for (const i of unit.indices) {
        const b = layout.elements[i].box.slice();
        b[axis] += at - unit.box[axis];
        updates.set(i, b);
      }
      at += unit.box[size] + gap;
    }
    return updates;
  }
  for (const unit of units) {
    let at = bounds[axis];
    if (action.startsWith("center")) at += (bounds[size] - unit.box[size]) / 2;
    if (action.startsWith("end")) at += bounds[size] - unit.box[size];
    for (const i of unit.indices) {
      const b = layout.elements[i].box.slice();
      b[axis] += at - unit.box[axis];
      updates.set(i, b);
    }
  }
  return updates;
}

export function snapBox(layout, box, excluded, tolerance, moving = true) {
  const guides = [];
  const delta = [0, 0];
  for (const axis of [0, 1]) {
    const targets = [0, 50, 100];
    layout.elements.forEach((element, i) => {
      if (i < 1 || excluded.includes(i)) return;
      const b = element.box;
      targets.push(b[axis], b[axis] + b[axis + 2] / 2, b[axis] + b[axis + 2]);
    });
    const anchors = moving ? [box[axis], box[axis] + box[axis + 2] / 2, box[axis] + box[axis + 2]] : [box[axis]];
    let distance = tolerance[axis];
    let guide = null;
    for (const target of targets) for (const anchor of anchors) {
      const d = target - anchor;
      if (Math.abs(d) <= distance) {
        delta[axis] = d;
        distance = Math.abs(d);
        guide = target;
      }
    }
    if (guide !== null) guides.push({ axis, value: guide });
  }
  return { delta, guides };
}
