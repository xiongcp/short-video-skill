// Semantic stage auto-layout and pure-vector renderer for `layout: "stage"` (画面与同台互动设计 §4.2, §5.1–§5.4).
// Pure deterministic functions without <text>, sharing geometry with project.mjs and scene.mjs.
import { clamp01, easeOutBack, lerp } from './ease.mjs';
import { COMMON_STATES, customPropMeta, drawCustomProp, drawIcon, isCountState, PROP_META } from './icons.mjs';
import { inkStroke, num, resample } from './ink.mjs';
import { GROUND_Y, resolveStyle } from './world.mjs';

export const STAGE_SLOTS = {
  left: 240,
  'mid-left': 600,
  center: 960,
  'mid-right': 1320,
  right: 1680,
};

export const SIZE_MULTIPLIERS = { sm: 0.75, md: 1, lg: 1.3 };

export const STAGE_BOUNDS = {
  minX: 120,
  maxX: 1800,
  titleTop: 48,
  titleBottom: 150,
  airTopMin: 160,
  airBottomMax: 470,
  midDefaultBottom: 762,
  subtitleSafeY: 950,
  gap: 40,
  hostClearWidth: 200,
  minScale: 0.6,
};

const HOST_MIN_X = 200;
const HOST_MAX_X = 1720;
const HOST_MOVING_DO = new Set(['move', 'open', 'carry', 'push', 'pull', 'hold_up', 'draw', 'sit_on']);
const escAttr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
const isOverlayState = (s) => COMMON_STATES.includes(s) || isCountState(s);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const boxesOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const boxesOverlapStrict = (a, b) => (
  a.x < b.x + b.w - 1e-6
  && a.x + a.w - 1e-6 > b.x
  && a.y < b.y + b.h - 1e-6
  && a.y + a.h - 1e-6 > b.y
);

function unwrapVisualData(visualData) {
  if (visualData && !Array.isArray(visualData.objects) && visualData.data) {
    return visualData.data;
  }
  return visualData ?? {};
}

function resolveAtX(at, fallback = STAGE_SLOTS.center) {
  if (typeof at === 'string' && Object.hasOwn(STAGE_SLOTS, at)) return STAGE_SLOTS[at];
  if (typeof at === 'number' && Number.isFinite(at)) return at * 1920;
  return fallback;
}

function resolveHostPreferredX(hostAt, prevHostX) {
  if (hostAt !== undefined && hostAt !== null) {
    if (typeof hostAt === 'string' && Object.hasOwn(STAGE_SLOTS, hostAt)) return STAGE_SLOTS[hostAt];
    if (typeof hostAt === 'number' && Number.isFinite(hostAt)) {
      return hostAt > 2 ? hostAt : hostAt * 1920;
    }
  }
  return Number.isFinite(prevHostX) ? prevHostX : 320;
}

function resolveProp(propId, customProps) {
  if (Object.hasOwn(PROP_META, propId)) {
    return { meta: PROP_META[propId], customDef: null };
  }
  const customDef = Array.isArray(customProps) ? customProps.find((p) => p?.id === propId) : null;
  if (customDef) {
    return { meta: customPropMeta(customDef), customDef };
  }
  throw new Error(`unknown prop: ${String(propId)}`);
}

/**
 * Exact 1D minimum-displacement placement with [minX, maxX] bounds and minimum inter-item `gap`
 * using Pool Adjacent Violators (PAVA). Keeps symmetric items centered on their target.
 */
function spreadLayer(items, minX, maxX, gap) {
  if (items.length === 0) return { ok: true, positions: new Map() };
  const sorted = [...items].sort((a, b) => a.targetX - b.targetX || a.index - b.index);
  const totalRequired = sorted.reduce((sum, it) => sum + it.w, 0) + (sorted.length - 1) * gap;
  const avail = maxX - minX;

  if (totalRequired > avail + 1e-6) {
    // Packed fallback so crowded layouts still yield deterministic positions
    const positions = new Map();
    const scale = avail / Math.max(1, totalRequired);
    let cursor = minX;
    for (const it of sorted) {
      positions.set(it.index, cursor);
      cursor += (it.w + gap) * scale;
    }
    return { ok: false, positions };
  }

  const blocks = [];
  let prefix = 0;
  for (const it of sorted) {
    const z = it.targetX - it.w / 2 - prefix;
    blocks.push({ sum: z, count: 1 });
    while (blocks.length >= 2) {
      const b = blocks.at(-1);
      const a = blocks.at(-2);
      if (a.sum / a.count > b.sum / b.count) {
        a.sum += b.sum;
        a.count += b.count;
        blocks.pop();
      } else {
        break;
      }
    }
    prefix += it.w + gap;
  }

  const lo = minX;
  const hi = maxX - totalRequired;
  const positions = new Map();
  let idx = 0;
  let xPrefix = 0;
  for (const blk of blocks) {
    const zVal = clamp(blk.sum / blk.count, lo, hi);
    for (let k = 0; k < blk.count; k += 1) {
      const it = sorted[idx];
      positions.set(it.index, zVal + xPrefix);
      xPrefix += it.w + gap;
      idx += 1;
    }
  }
  return { ok: true, positions };
}

function findHostX(groundRects, preferredX) {
  const halfClear = STAGE_BOUNDS.hostClearWidth / 2;
  const forbidden = groundRects
    .map((g) => [g.x - halfClear, g.x + g.w + halfClear])
    .sort((a, b) => a[0] - b[0]);

  let intervals = [[HOST_MIN_X, HOST_MAX_X]];
  for (const [f0, f1] of forbidden) {
    const next = [];
    for (const [a, b] of intervals) {
      if (f1 <= a || f0 >= b) {
        next.push([a, b]);
      } else {
        if (f0 >= a) next.push([a, f0]);
        if (f1 <= b) next.push([f1, b]);
      }
    }
    intervals = next;
  }
  if (intervals.length === 0) return null;

  const pref = clamp(preferredX, HOST_MIN_X, HOST_MAX_X);
  let bestX = null;
  let bestDist = Infinity;
  for (const [a, b] of intervals) {
    const cand = clamp(pref, a, b);
    const dist = Math.abs(cand - pref);
    if (dist < bestDist - 1e-9) {
      bestDist = dist;
      bestX = cand;
    }
  }
  return bestX;
}

function rayBoxExit(b, dx, dy, pad = 12) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const tx = Math.abs(dx) > 1e-6 ? (b.w / 2 + pad) / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-6 ? (b.h / 2 + pad) / Math.abs(dy) : Infinity;
  const k = Math.min(tx, ty);
  return [cx + dx * k, cy + dy * k];
}

function sameLayerGapOk(items, boxes, gap) {
  for (const layer of ['ground', 'mid', 'air']) {
    const rects = items
      .map((it, i) => ({ layer: it.layer, b: boxes[i] }))
      .filter((r) => r.layer === layer)
      .sort((a, b) => a.b.x - b.b.x);
    for (let k = 1; k < rects.length; k += 1) {
      if (rects[k].b.x - (rects[k - 1].b.x + rects[k - 1].b.w) < gap - 1e-6) return false;
    }
  }
  return true;
}

function no2DOverlap(boxes) {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxesOverlapStrict(boxes[i], boxes[j])) return false;
    }
  }
  return true;
}

function buildAttempt(specs, scale, preferredHostX, hostHeight) {
  const scaled = specs.map((sp) => {
    const h = hostHeight * sp.meta.height * sp.sizeMult * scale;
    const w = h * sp.meta.aspect;
    return { ...sp, w, h };
  });

  const byLayer = { ground: [], mid: [], air: [] };
  for (const item of scaled) byLayer[item.layer].push(item);

  const initGroundSpread = spreadLayer(byLayer.ground, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX, STAGE_BOUNDS.gap);
  const initGroundRects = byLayer.ground.map((g) => {
    const x = initGroundSpread.positions.get(g.index);
    return { index: g.index, x, y: GROUND_Y - g.h, w: g.w, h: g.h };
  });

  const stackedBySupporter = new Map();
  const freestandingMid = [];
  for (const m of byLayer.mid) {
    const sup = initGroundRects.find((g) => m.targetX >= g.x - 1e-6 && m.targetX <= g.x + g.w + 1e-6);
    if (sup) {
      const list = stackedBySupporter.get(sup.index) ?? [];
      list.push({ ...m, offsetFromSupporter: m.targetX - (sup.x + sup.w / 2) });
      stackedBySupporter.set(sup.index, list);
    } else {
      freestandingMid.push(m);
    }
  }

  // Freestanding mid shares the lower stage height band with ground objects
  const lowerItems = [...byLayer.ground, ...freestandingMid];
  const lowerSpread = spreadLayer(lowerItems, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX, STAGE_BOUNDS.gap);
  const airSpread = spreadLayer(byLayer.air, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX, STAGE_BOUNDS.gap);

  const xMap = new Map([...lowerSpread.positions, ...airSpread.positions]);
  const groundRects = byLayer.ground.map((g) => {
    const x = xMap.get(g.index);
    return { index: g.index, x, y: GROUND_Y - g.h, w: g.w, h: g.h };
  });
  const groundByIndex = new Map(groundRects.map((g) => [g.index, g]));

  let stackedOk = true;
  for (const [supIdx, group] of stackedBySupporter.entries()) {
    const sup = groundByIndex.get(supIdx);
    const supCx = sup.x + sup.w / 2;
    const shiftedGroup = group.map((m) => ({ ...m, targetX: supCx + m.offsetFromSupporter }));
    const groupSpread = spreadLayer(shiftedGroup, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX, STAGE_BOUNDS.gap);
    if (!groupSpread.ok) stackedOk = false;
    for (const [idx, x] of groupSpread.positions.entries()) xMap.set(idx, x);
  }

  const airMidY = (STAGE_BOUNDS.airTopMin + STAGE_BOUNDS.airBottomMax) / 2;
  const boxes = scaled.map((item) => {
    const x = xMap.get(item.index);
    let y;
    if (item.layer === 'ground') {
      y = GROUND_Y - item.h;
    } else if (item.layer === 'air') {
      y = airMidY - item.h / 2;
    } else {
      const cx = x + item.w / 2;
      const supporter = groundRects.find((g) => cx >= g.x - 1e-6 && cx <= g.x + g.w + 1e-6);
      y = supporter ? supporter.y - item.h : STAGE_BOUNDS.midDefaultBottom - item.h;
    }
    return { x, y, w: item.w, h: item.h };
  });

  // Host 200px corridor avoids all objects vertically intersecting [GROUND_Y - hostHeight, GROUND_Y]
  const hostTop = GROUND_Y - hostHeight;
  const hostBlockingRects = boxes.filter((b) => b.y < GROUND_Y - 1e-6 && b.y + b.h > hostTop + 1e-6);
  const hostX = findHostX(hostBlockingRects, preferredHostX);

  const layersFit = initGroundSpread.ok && lowerSpread.ok && airSpread.ok && stackedOk;
  const boundsOk = scaled.every((item, i) => {
    const b = boxes[i];
    if (b.x < STAGE_BOUNDS.minX - 1e-6 || b.x + b.w > STAGE_BOUNDS.maxX + 1e-6) return false;
    if (b.y < STAGE_BOUNDS.airTopMin - 1e-6 || b.y + b.h > GROUND_Y + 1e-6) return false;
    if (item.layer === 'air' && b.y + b.h > STAGE_BOUNDS.airBottomMax + 1e-6) return false;
    return true;
  });
  const spacingOk = sameLayerGapOk(scaled, boxes, STAGE_BOUNDS.gap) && no2DOverlap(boxes);

  return {
    ok: layersFit && boundsOk && spacingOk && hostX !== null,
    scale,
    hostX: hostX ?? clamp(preferredHostX, HOST_MIN_X, HOST_MAX_X),
    boxes,
  };
}

/**
 * Deterministic semantic stage layout: resolves slots/ratios, spreads same-layer overlaps >= 40 px,
 * stacks `mid` objects onto same-slot `ground` objects, reserves a 200 px host corridor, and auto-scales down to 0.6.
 */
export function layoutStage(visualData, { hostAt, prevHostX = 320, customProps = [], hostHeight = 400 } = {}) {
  const data = unwrapVisualData(visualData);
  const rawObjects = Array.isArray(data.objects) ? data.objects : [];
  const rawLinks = Array.isArray(data.links) ? data.links : [];
  const preferredHostX = resolveHostPreferredX(hostAt, prevHostX);

  if (rawObjects.length === 0) {
    return {
      ok: true,
      crowded: false,
      scale: 1,
      hostX: clamp(preferredHostX, HOST_MIN_X, HOST_MAX_X),
      elements: [],
      links: [],
    };
  }

  const specs = rawObjects.map((obj, index) => {
    const { meta, customDef } = resolveProp(obj.prop, customProps);
    const layer = ['ground', 'mid', 'air'].includes(obj.layer) ? obj.layer : meta.layer;
    const sizeMult = SIZE_MULTIPLIERS[obj.size ?? 'md'] ?? 1;
    const label = typeof obj.label === 'string' ? obj.label : (customDef?.label ?? '');
    return {
      index,
      prop: obj.prop,
      label,
      layer,
      state: obj.state ?? 'normal',
      meta,
      sizeMult,
      targetX: resolveAtX(obj.at, STAGE_SLOTS.center),
    };
  });

  let chosen = null;
  for (let step = 0; step <= 8; step += 1) {
    const s = Math.round((1 - step * 0.05) * 100) / 100;
    const attempt = buildAttempt(specs, s, preferredHostX, hostHeight);
    chosen = attempt;
    if (attempt.ok) break;
  }

  const elements = specs.map((sp, i) => {
    const bbox = chosen.boxes[i];
    const anchors = {};
    for (const [k, uv] of Object.entries(sp.meta.anchors)) {
      anchors[k] = [bbox.x + uv[0] * bbox.w, bbox.y + uv[1] * bbox.h];
    }
    return {
      index: sp.index,
      prop: sp.prop,
      label: sp.label,
      layer: sp.layer,
      state: sp.state,
      bbox,
      anchors,
      standSpots: {
        left: clamp(bbox.x - 70, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX),
        right: clamp(bbox.x + bbox.w + 70, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX),
      },
    };
  });

  const links = rawLinks.map((lnk, index) => {
    const fromEl = elements[lnk.from];
    const toEl = elements[lnk.to];
    if (!fromEl || !toEl || lnk.from === lnk.to) {
      const pt = fromEl ? [fromEl.bbox.x + fromEl.bbox.w / 2, fromEl.bbox.y + fromEl.bbox.h / 2] : [960, 540];
      return {
        index,
        from: lnk.from,
        to: lnk.to,
        style: lnk.style ?? 'solid',
        label: lnk.label ?? '',
        fromPt: pt,
        toPt: pt,
      };
    }
    const fb = fromEl.bbox;
    const tb = toEl.bbox;
    const fc = [fb.x + fb.w / 2, fb.y + fb.h / 2];
    const tc = [tb.x + tb.w / 2, tb.y + tb.h / 2];
    const dx = tc[0] - fc[0];
    const dy = tc[1] - fc[1];
    const dist = Math.hypot(dx, dy);
    const f0 = rayBoxExit(fb, dx, dy, 0);
    const t0 = rayBoxExit(tb, -dx, -dy, 0);
    const clearGap = dist - Math.hypot(f0[0] - fc[0], f0[1] - fc[1]) - Math.hypot(t0[0] - tc[0], t0[1] - tc[1]);
    const pad = clearGap >= 28 ? 12 : Math.max(0, clearGap * 0.3);
    return {
      index,
      from: lnk.from,
      to: lnk.to,
      style: lnk.style ?? 'solid',
      label: lnk.label ?? '',
      fromPt: rayBoxExit(fb, dx, dy, pad),
      toPt: rayBoxExit(tb, -dx, -dy, pad),
    };
  });

  return {
    ok: chosen.ok,
    crowded: !chosen.ok,
    scale: chosen.scale,
    hostX: chosen.hostX,
    elements,
    links,
  };
}

function handHighlight({ x, y, w, h }, index, { seed, color, progress = 1 }) {
  const pad = 12;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 + pad;
  const ry = h / 2 + pad;
  const count = 44;
  const pts = Array.from({ length: count + 1 }, (_, i) => {
    const a = -Math.PI * 0.85 + ((2 * Math.PI + 0.35) * i) / count;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  const take = Math.max(2, Math.round(pts.length * clamp01(progress)));
  const sub = pts.slice(0, take);
  const d = inkStroke(sub, { seed: `${seed}:hl${index}`, width: [5, 7], wobble: 3 }).d;
  return `<g data-highlight="${index}"><path d="${d}" fill="${color}"/></g>`;
}

function wrapTransform(bbox, st, inner) {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const pulse = st.highlight > 0 && st.highlight < 1 ? 1 + 0.06 * Math.sin(Math.PI * clamp01(st.highlight)) : 1;
  const bumpScale = st.bump ? 1 + 0.08 * st.bump : 1;
  const sc = (st.scale ?? 1) * pulse * bumpScale;
  const rot = st.tapShake ? st.tapShake * 2 : 0;
  const op = clamp01(st.opacity ?? 1);
  if (op <= 0.005) return '';
  return `<g opacity="${num(op)}" transform="translate(${num(cx + (st.dx ?? 0))} ${num(cy + (st.dy ?? 0))}) rotate(${num(rot)}) scale(${num(sc)}) translate(${num(-cx)} ${num(-cy)})">${inner}</g>`;
}

function resolveCueStart(cue, cueIdx, interactionStarts) {
  if (interactionStarts instanceof Map) {
    if (interactionStarts.has(cueIdx)) return interactionStarts.get(cueIdx);
    if (interactionStarts.has(String(cueIdx))) return interactionStarts.get(String(cueIdx));
    if (interactionStarts.has(cue)) return interactionStarts.get(cue);
    if (cue?.id !== undefined && interactionStarts.has(cue.id)) return interactionStarts.get(cue.id);
    const k1 = `${cueIdx}:${cue?.do}`;
    if (interactionStarts.has(k1)) return interactionStarts.get(k1);
    const k2 = `${cue?.do}:${cue?.target}:${cue?.timeMs ?? ''}`;
    if (interactionStarts.has(k2)) return interactionStarts.get(k2);
  } else if (interactionStarts && typeof interactionStarts === 'object') {
    if (Object.hasOwn(interactionStarts, cueIdx)) return interactionStarts[cueIdx];
    if (Object.hasOwn(interactionStarts, String(cueIdx))) return interactionStarts[String(cueIdx)];
    if (cue?.id !== undefined && Object.hasOwn(interactionStarts, cue.id)) return interactionStarts[cue.id];
    const k1 = `${cueIdx}:${cue?.do}`;
    if (Object.hasOwn(interactionStarts, k1)) return interactionStarts[k1];
    const k2 = `${cue?.do}:${cue?.target}:${cue?.timeMs ?? ''}`;
    if (Object.hasOwn(interactionStarts, k2)) return interactionStarts[k2];
  }
  return cue?.timeMs != null ? cue.timeMs / 1000 : (cue?.t0 ?? 0);
}

function simResolveStandX(target, currentX, elements) {
  if (typeof target === 'string') {
    if (target === 'left') return 320;
    if (target === 'center') return 960;
    if (target === 'right') return 1600;
    return currentX;
  }
  if (Number.isInteger(target)) {
    const el = elements[target];
    if (!el) return currentX;
    if (el.standSpots) {
      const { left, right } = el.standSpots;
      const isClear = (sx) => !elements.some((other) => {
        const b = other?.bbox;
        if (!b || b.y >= GROUND_Y - 1e-6 || b.y + b.h <= 530 + 1e-6) return false;
        return sx - 47 < b.x + b.w && sx + 47 > b.x;
      });
      const leftOk = Number.isFinite(left) && isClear(left);
      const rightOk = Number.isFinite(right) && isClear(right);
      if (leftOk && !rightOk) return left;
      if (rightOk && !leftOk) return right;
      return Math.abs(currentX - left) <= Math.abs(currentX - right) ? left : right;
    }
    const cx = el.bbox.x + el.bbox.w / 2;
    return currentX <= cx ? el.bbox.x - 60 : el.bbox.x + el.bbox.w + 60;
  }
  return currentX;
}

/**
 * Draws a mini hand-drawn prop (~48 px) at parameter `u` along the quadratic Bezier matching
 * `stage` links or `flow` arrows (when `bend` is provided). Returns `''` outside `(0, 1)`.
 */
export function renderSendPacket(fromPt, toPt, propName, u, {
  style = 'paper',
  seed = 'send',
  customProps = [],
  bend,
} = {}) {
  if (!Array.isArray(fromPt) || !Array.isArray(toPt) || !propName) return '';
  if (!Number.isFinite(u) || u <= 0 || u >= 1) return '';
  const [x1, y1] = fromPt;
  const [x2, y2] = toPt;
  let mx;
  let my;
  if (Array.isArray(bend) && bend.length >= 2) {
    mx = (x1 + x2) / 2 + bend[0];
    my = (y1 + y2) / 2 + bend[1];
  } else {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const bendAmt = Math.min(44, dist * 0.12);
    mx = (x1 + x2) / 2 + (dy / dist) * bendAmt;
    my = (y1 + y2) / 2 - (dx / dist) * bendAmt;
  }
  const inv = 1 - u;
  const px = inv * inv * x1 + 2 * inv * u * mx + u * u * x2;
  const py = inv * inv * y1 + 2 * inv * u * my + u * u * y2;

  const customDef = !Object.hasOwn(PROP_META, propName) && Array.isArray(customProps)
    ? customProps.find((p) => p?.id === propName)
    : null;
  const iconSvg = customDef
    ? drawCustomProp(customDef, { x: px, y: py, width: 48, height: 48, style, seed: `${seed}:${propName}` })
    : drawIcon(propName, { x: px, y: py, size: 48, style, seed: `${seed}:${propName}` });
  return `<g data-send-packet="${escAttr(propName)}">${iconSvg}</g>`;
}

/**
 * Evaluates dynamic runtime states for stage objects (and `flow` nodes/sends) at time `t` seconds.
 * Combines `state`, `open`, `push`/`pull`, `draw`, and `send` cues with live `hostMeta` interactions.
 */
export function evaluateStageObjects(shotPlan, t, hostMeta = null) {
  const rawVisual = shotPlan?.shot?.visual;
  const rawData = unwrapVisualData(rawVisual?.data ?? shotPlan);
  const customProps = shotPlan?.customProps ?? [];
  const isStage = shotPlan?.shot?.layout === 'stage'
    || rawVisual?.template === 'stage'
    || Boolean(shotPlan?.stageLayout)
    || Array.isArray(rawData?.objects);

  let elements = Array.isArray(shotPlan?.elements) ? shotPlan.elements : null;
  let links = shotPlan?.stageLayout?.links ?? null;
  if (isStage && (!elements || !links)) {
    const laid = shotPlan?.stageLayout ?? layoutStage(rawData, {
      hostAt: shotPlan?.shot?.host?.at,
      prevHostX: shotPlan?.startState?.x ?? 320,
      customProps,
    });
    elements = elements ?? laid.elements;
    links = links ?? laid.links;
  }
  elements = elements ?? [];
  links = links ?? [];

  const rawObjects = Array.isArray(rawData?.objects) ? rawData.objects : [];
  const rawCues = Array.isArray(shotPlan?.cues)
    ? shotPlan.cues
    : (Array.isArray(shotPlan?.shot?.cues) ? shotPlan.shot.cues : []);

  const interactionStarts = hostMeta?.interactionStarts;
  const resolvedCues = rawCues
    .map((cue, cueIdx) => ({
      cue,
      cueIdx,
      t0: resolveCueStart(cue, cueIdx, interactionStarts),
    }))
    .sort((a, b) => a.t0 - b.t0 || a.cueIdx - b.cueIdx);

  // Track simulated host X before each cue so push/pull directions remain consistent across later moves
  let simHostX = shotPlan?.startState?.x ?? shotPlan?.stageLayout?.hostX ?? 320;
  const hostXBeforeCue = new Map();
  for (const entry of resolvedCues) {
    hostXBeforeCue.set(entry.cueIdx, simHostX);
    if (HOST_MOVING_DO.has(entry.cue.do) && !(entry.cue.do === 'carry' && entry.cue.target === 'none')) {
      simHostX = simResolveStandX(entry.cue.target, simHostX, elements);
    }
  }

  let fastMotion = false;
  const inter = hostMeta?.interaction ?? null;

  const objectStates = elements.map((el, i) => {
    const initialState = el?.state ?? rawObjects[i]?.state ?? 'normal';
    let state = initialState;
    let prevState = initialState;
    let stateProgress = 1;

    // 1. State and open transitions
    for (const entry of resolvedCues) {
      if (entry.t0 > t) break;
      if (entry.cue.target !== i) continue;
      if (entry.cue.do !== 'state' && entry.cue.do !== 'open') continue;
      const nextState = entry.cue.do === 'open' ? 'open' : entry.cue.value;
      if (!nextState) continue;
      const dur = entry.cue.do === 'open' ? 0.6 : 0.3;
      prevState = state;
      state = nextState;
      const dt = t - entry.t0;
      if (prevState !== state && dt < dur) {
        stateProgress = clamp01(dt / dur);
        fastMotion = true;
      } else {
        stateProgress = 1;
      }
    }

    // 2. Draw progress (1.0 s progressive character reveal)
    const drawCues = resolvedCues.filter((entry) => entry.cue.do === 'draw' && entry.cue.target === i);
    let drawProgress = 1;
    if (drawCues.length > 0) {
      const started = drawCues.filter((entry) => entry.t0 <= t);
      if (started.length === 0) {
        drawProgress = 0;
      } else {
        const lastDraw = started.at(-1);
        const dt = t - lastDraw.t0;
        if (dt < 1.0) {
          drawProgress = clamp01(dt / 1.0);
          fastMotion = true;
        } else {
          drawProgress = 1;
        }
      }
    }

    // 3. Push / pull horizontal displacement (0.7 s with easeOutBack overshoot, clamped to [120, 1800])
    const bbox = el.bbox ?? { x: 0, y: 0, w: 0, h: 0 };
    const minDx = STAGE_BOUNDS.minX - bbox.x;
    const maxDx = STAGE_BOUNDS.maxX - (bbox.x + bbox.w);
    const computePushPullDx = (sinceTime) => {
      let curDx = 0;
      for (const entry of resolvedCues) {
        if (entry.t0 > t || entry.t0 < sinceTime) continue;
        if (entry.cue.target !== i || (entry.cue.do !== 'push' && entry.cue.do !== 'pull')) continue;
        const laterHostMove = resolvedCues.some((other) => (
          other.cueIdx !== entry.cueIdx
          && other.t0 > entry.t0
          && other.t0 <= t
          && HOST_MOVING_DO.has(other.cue.do)
          && !(other.cue.do === 'carry' && other.cue.target === 'none')
        ));
        const hostX = !laterHostMove && Number.isFinite(hostMeta?.x)
          ? hostMeta.x
          : (hostXBeforeCue.get(entry.cueIdx) ?? 320);
        const preObjCx = bbox.x + bbox.w / 2 + curDx;
        const awayDir = preObjCx >= hostX ? 1 : -1;
        const dir = entry.cue.do === 'push' ? awayDir : -awayDir;
        const targetDx = clamp(curDx + dir * 160, minDx, maxDx);
        const dt = t - entry.t0;
        if (dt < 0.7) {
          const u = clamp01(dt / 0.7);
          curDx = clamp(lerp(curDx, targetDx, easeOutBack(u)), minDx, maxDx);
          fastMotion = true;
        } else {
          curDx = targetDx;
        }
      }
      return curDx;
    };

    let dx = computePushPullDx(-Infinity);
    let dy = 0;
    let liftY = 0;
    let carried = false;
    let heldUp = false;
    let inFront = false;

    // 4. Dropped spots / active carry / active hold_up
    const isHeldUpNow = inter?.kind === 'hold_up' && inter?.targetIdx === i;
    const isCarriedNow = inter?.carriedIdx === i;

    if (isHeldUpNow) {
      const pos = inter.handPos ?? inter.carriedPos;
      if (Array.isArray(pos) && pos.length >= 2 && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
        dx = pos[0] - (bbox.x + bbox.w / 2);
        dy = pos[1] - (bbox.y + bbox.h);
      }
      heldUp = true;
      carried = isCarriedNow;
      inFront = true;
      liftY = -dy;
      fastMotion = true;
    } else if (isCarriedNow) {
      const pos = inter.carriedPos ?? inter.handPos;
      if (Array.isArray(pos) && pos.length >= 2 && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
        const handle = el.anchors?.handle ?? [bbox.x + bbox.w * 0.2, bbox.y + bbox.h * 0.5];
        dx = pos[0] - handle[0];
        dy = pos[1] - handle[1];
      }
      carried = true;
      inFront = true;
      liftY = -dy;
      fastMotion = true;
    } else if (inter?.droppedSpots && Object.hasOwn(inter.droppedSpots, i) && inter.droppedSpots[i]) {
      const spot = inter.droppedSpots[i];
      const sx = Array.isArray(spot) ? spot[0] : spot.x;
      const sy = Array.isArray(spot) ? spot[1] : spot.y;
      const lastDropCue = resolvedCues
        .filter((e) => e.t0 <= t && e.cue.do === 'carry' && e.cue.target === 'none')
        .at(-1);
      const postDropDx = lastDropCue ? computePushPullDx(lastDropCue.t0) : 0;
      if (Number.isFinite(sx)) {
        dx = clamp(sx - (bbox.x + bbox.w / 2) + postDropDx, minDx, maxDx);
      }
      if (Number.isFinite(sy)) {
        dy = sy - (bbox.y + bbox.h);
      }
    }

    return {
      state,
      prevState,
      stateProgress,
      dx,
      dy,
      liftY,
      carried,
      heldUp,
      inFront,
      drawProgress,
      bump: 0,
    };
  });

  // 5. Send packet trajectories (0.8 s) and destination arrival bump (0.3 s)
  const sends = [];
  for (const entry of resolvedCues) {
    if (entry.cue.do !== 'send') continue;
    const dt = t - entry.t0;
    if (dt < 0 || dt > 1.1) continue;

    let sendIndex;
    let targetIdx;
    let fromPt;
    let toPt;
    let bend;

    if (isStage) {
      const lnk = links[entry.cue.target];
      if (!lnk) continue;
      sendIndex = lnk.index ?? entry.cue.target;
      targetIdx = lnk.to;
      const fromSt = objectStates[lnk.from];
      const toSt = objectStates[lnk.to];
      fromPt = [lnk.fromPt[0] + (fromSt?.dx ?? 0), lnk.fromPt[1] + (fromSt?.dy ?? 0)];
      toPt = [lnk.toPt[0] + (toSt?.dx ?? 0), lnk.toPt[1] + (toSt?.dy ?? 0)];
    } else {
      const dstIdx = entry.cue.target;
      if (!Number.isInteger(dstIdx) || dstIdx < 1 || dstIdx >= elements.length) continue;
      sendIndex = dstIdx;
      targetIdx = dstIdx;
      const prevB = elements[dstIdx - 1].bbox;
      const currB = elements[dstIdx].bbox;
      fromPt = [
        prevB.x + prevB.w + 8 + (objectStates[dstIdx - 1]?.dx ?? 0),
        prevB.y + prevB.h / 2 + (objectStates[dstIdx - 1]?.dy ?? 0),
      ];
      toPt = [
        currB.x - 8 + (objectStates[dstIdx]?.dx ?? 0),
        currB.y + currB.h / 2 + (objectStates[dstIdx]?.dy ?? 0),
      ];
      bend = [0, -14];
    }

    const u = dt / 0.8;
    if (u > 0 && u < 1) {
      sends.push({
        index: sendIndex,
        prop: entry.cue.value,
        fromPt,
        toPt,
        u,
        targetIdx,
        ...(bend ? { bend } : {}),
      });
      fastMotion = true;
    } else if (dt >= 0.8 && dt <= 1.1 && objectStates[targetIdx]) {
      const bu = clamp01((dt - 0.8) / 0.3);
      const bVal = Math.sin(bu * Math.PI);
      objectStates[targetIdx].bump = Math.max(objectStates[targetIdx].bump, bVal);
      if (bVal > 1e-4) fastMotion = true;
    }
  }

  return { objectStates, sends, fastMotion };
}

function drawStageLink(x1, y1, x2, y2, mx, my, { index, style = 'solid', seed, color, progress = 1, opacity = 1 }) {
  const p = clamp01(progress);
  if (p <= 0.02 || opacity <= 0.005) return '';
  const curve = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    const u = 1 - t;
    return [u * u * x1 + 2 * u * t * mx + t * t * x2, u * u * y1 + 2 * u * t * my + t * t * y2];
  });
  const totalSamples = 32;
  const resampled = resample(curve, totalSamples);
  const takeCount = Math.max(2, Math.round(totalSamples * p));
  const drawn = resampled.slice(0, takeCount);

  let shaftSvg = '';
  if (style === 'dashed') {
    const dashPts = 4;
    const stepPts = 6;
    let dashIdx = 0;
    for (let s = 0; s < drawn.length - 1; s += stepPts) {
      const seg = drawn.slice(s, Math.min(drawn.length, s + dashPts));
      if (seg.length >= 2) {
        shaftSvg += `<path d="${inkStroke(seg, { seed: `${seed}:lnk${index}:d${dashIdx}`, width: [4.2, 5.5], wobble: 1.1, taper: 'both' }).d}" fill="${color}"/>`;
        dashIdx += 1;
      }
    }
  } else {
    shaftSvg = `<path d="${inkStroke(drawn, { seed: `${seed}:lnk${index}:shaft`, width: [4.5, 6], wobble: 1.5, taper: 'start' }).d}" fill="${color}"/>`;
  }

  let headSvg = '';
  if (p >= 0.72) {
    const tip = drawn.at(-1);
    const prev = drawn.at(-2);
    const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    const headLen = 18;
    const wing = (delta) => [tip[0] - headLen * Math.cos(ang + delta), tip[1] - headLen * Math.sin(ang + delta)];
    headSvg = `<path d="${inkStroke([wing(0.55), tip, wing(-0.55)], { seed: `${seed}:lnk${index}:head`, width: [4.5, 5.5], wobble: 0.8 }).d}" fill="${color}"/>`;
  }
  const opAttr = opacity < 0.999 ? ` opacity="${num(opacity)}"` : '';
  return `<g data-link="${index}" data-link-style="${style === 'dashed' ? 'dashed' : 'solid'}"${opAttr}>${shaftSvg}${headSvg}</g>`;
}

/**
 * Renders a `stage` shot frame into layered pure vector SVG (`backVectorSvg`, `frontVectorSvg`, `vectorSvg`)
 * plus cached CJK `textItems` (heading, smart object labels, link labels, and `count:*` badge digits).
 */
export function renderStage(visualData, {
  style = 'paper',
  seed = 'sh01',
  t = 1,
  duration = 4,
  elementStates = [],
  sends = [],
  headingOpacity = 1,
  customProps = [],
  layoutResult,
} = {}) {
  void t;
  void duration;
  const data = unwrapVisualData(visualData);
  const { name: styleName, palette: pal } = resolveStyle(style);
  const layout = layoutResult ?? layoutStage(data, { customProps });
  const customById = new Map((Array.isArray(customProps) ? customProps : []).filter((p) => p?.id).map((p) => [p.id, p]));
  const getState = (i) => ({
    opacity: 1,
    scale: 1,
    dx: 0,
    dy: 0,
    highlight: 0,
    arrowProgress: 1,
    tapShake: 0,
    stateProgress: 1,
    drawProgress: 1,
    bump: 0,
    inFront: false,
    ...elementStates[i],
  });

  const backVectors = [];
  const frontVectors = [];
  const textItems = [];

  const headOp = clamp01(headingOpacity);
  if (data.heading && headOp > 0.005) {
    const halfUl = clamp([...String(data.heading)].length * 24, 110, 320);
    const hlOpAttr = headOp < 0.999 ? ` opacity="${num(headOp)}"` : '';
    backVectors.push(
      `<path${hlOpAttr} d="${inkStroke([[960 - halfUl, 130], [960 + halfUl, 130]], { seed: `${seed}:stage-hl`, width: [5, 7], wobble: 2 }).d}" fill="${pal.accent}"/>`,
    );
    textItems.push({
      key: 'stage-heading',
      text: data.heading,
      x: 960,
      y: 92,
      fontSize: 52,
      color: pal.ink,
      align: 'middle',
      weight: 'bold',
      opacity: headOp,
      isTitle: true,
    });
  }

  for (const lnk of layout.links) {
    if (lnk.from === lnk.to || !layout.elements[lnk.from] || !layout.elements[lnk.to]) continue;
    const fromSt = getState(lnk.from);
    const toSt = getState(lnk.to);
    const linkOpacity = Math.min(clamp01(fromSt.opacity), clamp01(toSt.opacity));
    if (linkOpacity <= 0.005) continue;

    const x1 = lnk.fromPt[0] + (fromSt.dx ?? 0);
    const y1 = lnk.fromPt[1] + (fromSt.dy ?? 0);
    const x2 = lnk.toPt[0] + (toSt.dx ?? 0);
    const y2 = lnk.toPt[1] + (toSt.dy ?? 0);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const bendAmt = Math.min(44, dist * 0.12);
    const mx = (x1 + x2) / 2 + (dy / dist) * bendAmt;
    const my = (y1 + y2) / 2 - (dx / dist) * bendAmt;

    const linkSvg = drawStageLink(x1, y1, x2, y2, mx, my, {
      index: lnk.index,
      style: lnk.style,
      seed,
      color: lnk.style === 'dashed' ? pal.muted : pal.accent,
      progress: (toSt.arrowProgress ?? 1) * linkOpacity,
      opacity: linkOpacity,
    });
    if (linkSvg) backVectors.push(linkSvg);

    if (lnk.label) {
      const midX = 0.25 * x1 + 0.5 * mx + 0.25 * x2;
      const midY = 0.25 * y1 + 0.5 * my + 0.25 * y2;
      textItems.push({
        key: `stage-link-${lnk.index}`,
        text: lnk.label,
        x: midX,
        y: clamp(midY - 20, STAGE_BOUNDS.airTopMin + 16, GROUND_Y - 24),
        fontSize: 30,
        color: pal.muted,
        stroke: pal.paper,
        align: 'middle',
        weight: 'bold',
        opacity: linkOpacity,
      });
    }
  }

  const effectiveBoxes = layout.elements.map((el, i) => {
    const st = getState(i);
    const b = st.overrideBbox ?? el.bbox;
    return {
      visible: clamp01(st.opacity) > 0.005,
      raw: b,
      shifted: { x: b.x + (st.dx ?? 0), y: b.y + (st.dy ?? 0), w: b.w, h: b.h },
    };
  });

  layout.elements.forEach((el, i) => {
    const st = getState(i);
    const op = clamp01(st.opacity);
    if (op <= 0.005) return;

    const b = effectiveBoxes[i].raw;
    const bEff = effectiveBoxes[i].shifted;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const effState = st.state ?? el.state ?? 'normal';
    const prevState = st.prevState ?? effState;
    const sp = clamp01(st.stateProgress ?? 1);
    const customDef = customById.get(el.prop);
    const drawPropState = (stateName, prog) => (customDef
      ? drawCustomProp(customDef, {
          x: cx,
          y: cy,
          width: b.w,
          height: b.h,
          style: styleName,
          seed: `${seed}:obj${i}`,
          state: stateName,
          stateProgress: prog,
        })
      : drawIcon(el.prop, {
          x: cx,
          y: cy,
          width: b.w,
          height: b.h,
          style: styleName,
          seed: `${seed}:obj${i}`,
          state: stateName,
          stateProgress: prog,
        }));

    let iconSvg;
    if (sp < 0.999 && prevState !== effState) {
      if (isCountState(prevState) && isCountState(effState)) {
        iconSvg = drawPropState(effState, 1);
      } else if (isOverlayState(prevState) && isOverlayState(effState)) {
        if (prevState === 'dim' && effState === 'normal') {
          iconSvg = `<g opacity="${num(lerp(0.45, 1, sp))}">${drawPropState('normal', 1)}</g>`;
        } else if (prevState === 'normal') {
          iconSvg = drawPropState(effState, sp);
        } else {
          iconSvg = `<g opacity="${num(1 - sp)}">${drawPropState(prevState, 1)}</g><g opacity="${num(sp)}">${drawPropState(effState, sp)}</g>`;
        }
      } else {
        iconSvg = `<g opacity="${num(1 - sp)}">${drawPropState(prevState, 1)}</g><g opacity="${num(sp)}">${drawPropState(effState, sp)}</g>`;
      }
    } else {
      iconSvg = drawPropState(effState, sp);
    }

    const hl = st.highlight > 0 ? handHighlight(b, i, { seed, color: pal.red, progress: st.highlight }) : '';
    const wrapped = wrapTransform(b, st, iconSvg + hl);
    if (wrapped) {
      if (st.inFront) frontVectors.push(wrapped);
      else backVectors.push(wrapped);
    }

    if (el.label) {
      const dp = clamp01(st.drawProgress ?? 1);
      if (dp > 0) {
        const chars = [...el.label];
        const maxPartial = chars.length > 1 ? chars.length - 1 : 1;
        const shownLabel = dp >= 0.999
          ? el.label
          : chars.slice(0, Math.min(maxPartial, Math.max(1, Math.ceil(dp * chars.length)))).join('');
        if (shownLabel) {
          const yAbove = bEff.y - 24;
          const halfW = Math.max(36, (chars.length * 36) / 2);
          const aboveBox = { x: bEff.x + bEff.w / 2 - halfW, y: yAbove - 18, w: halfW * 2, h: 36 };
          const conflicts = yAbove < STAGE_BOUNDS.airTopMin
            || effectiveBoxes.some((other, j) => j !== i && other.visible && boxesOverlap(aboveBox, other.shifted));
          textItems.push({
            key: `stage-label-${i}`,
            text: shownLabel,
            x: bEff.x + bEff.w / 2,
            y: conflicts ? bEff.y + bEff.h * 0.55 : yAbove,
            fontSize: 36,
            color: pal.ink,
            stroke: pal.paper,
            align: 'middle',
            weight: 'bold',
            opacity: op,
          });
        }
      }
    }

    if (isCountState(effState)) {
      const digits = effState.slice(6);
      const rad = Math.max(16, Math.min(28, Math.min(b.w, b.h) * 0.24));
      const bxLocal = b.x + b.w - rad * 0.25;
      const byLocal = b.y + rad * 0.25;
      const pulse = st.highlight > 0 && st.highlight < 1 ? 1 + 0.06 * Math.sin(Math.PI * clamp01(st.highlight)) : 1;
      const bumpScale = st.bump ? 1 + 0.08 * st.bump : 1;
      const flipScale = isCountState(prevState) && prevState !== effState && sp < 1 ? 1 + 0.12 * Math.sin(Math.PI * sp) : 1;
      const sc = (st.scale ?? 1) * pulse * bumpScale * flipScale;
      const bx = cx + (bxLocal - cx) * sc + (st.dx ?? 0);
      const by = cy + (byLocal - cy) * sc + (st.dy ?? 0);
      const showPrevDigits = isCountState(prevState) && prevState !== effState && sp < 0.5;
      const shownDigits = showPrevDigits ? prevState.slice(6) : digits;
      const len = [...shownDigits].length;
      const fontSize = Math.max(16, Math.round(rad * (len >= 3 ? 0.85 : len === 2 ? 1.05 : 1.2) * sc));
      const countOp = prevState !== effState && sp < 1 && !isCountState(prevState) ? op * sp : op;
      textItems.push({
        key: `stage-count-${i}`,
        text: shownDigits,
        x: bx,
        y: by,
        fontSize,
        color: pal.isDark ? pal.paper : pal.card,
        align: 'middle',
        weight: 'bold',
        opacity: countOp,
      });
    }
  });

  if (Array.isArray(sends)) {
    sends.forEach((s, idx) => {
      if (!s || !s.prop) return;
      const lnk = Number.isInteger(s.index) ? layout.links[s.index] : null;
      let fromPt = s.fromPt;
      let toPt = s.toPt;
      if (lnk) {
        const fromSt = getState(lnk.from);
        const toSt = getState(lnk.to);
        if (Math.min(clamp01(fromSt.opacity), clamp01(toSt.opacity)) <= 0.005) return;
        if (!fromPt) fromPt = [lnk.fromPt[0] + (fromSt.dx ?? 0), lnk.fromPt[1] + (fromSt.dy ?? 0)];
        if (!toPt) toPt = [lnk.toPt[0] + (toSt.dx ?? 0), lnk.toPt[1] + (toSt.dy ?? 0)];
      }
      const pktSvg = renderSendPacket(fromPt, toPt, s.prop, s.u, {
        style: styleName,
        seed: `${seed}:send:${s.index ?? idx}`,
        customProps,
        bend: s.bend,
      });
      if (pktSvg) frontVectors.push(pktSvg);
    });
  }

  const backVectorSvg = backVectors.join('');
  const frontVectorSvg = frontVectors.join('');
  return {
    vectorSvg: backVectorSvg + frontVectorSvg,
    backVectorSvg,
    frontVectorSvg,
    textItems,
    elements: layout.elements,
  };
}
