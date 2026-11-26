// Eight hand-drawn explainer diagram templates (火柴人主持人设计 §3.5-3.6, 出片质量设计 §6.2, §7.1, 个性化路线图 S).
// Returns pure vectorSvg (no <text>, fast resvg) + textItems (cached CJK layer) + elements with bboxes.
import { clamp01, easeOutCubic, lerp } from './ease.mjs';
import { drawIcon, drawStateOverlay, isCountState } from './icons.mjs';
import { circlePoints, inkStroke, markerFill, num, resample } from './ink.mjs';
import { renderSendPacket } from './stage.mjs';
import { resolveStyle, STYLE_PALETTES, styleBackgroundSvg } from './world.mjs';

export const DIAGRAM_ZONES = {
  'host-left': { x: 640, y: 48, w: 1200, h: 400 },
  full: { x: 120, y: 120, w: 1680, h: 740 },
};

export const THEME_PALETTE = {
  light: STYLE_PALETTES.paper,
  dark: STYLE_PALETTES.night,
};

/** Paper background with subtle wide grid (no fine grain texture, avoiding H.264 mosquito noise). */
export function paperBackgroundSvg(theme = 'light', width = 1920, height = 1080, parallax = [0, 0]) {
  const style = theme === 'dark' ? 'night' : STYLE_PALETTES[theme] ? theme : 'paper';
  return styleBackgroundSvg(style, width, height, parallax);
}

function handCard({ x, y, w, h }, { seed, fill, ink, strokeWidth = [4, 5.5], overshoot = 6 }) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const fillPath = fill ? `<path d="${markerFill(pts, { seed: `${seed}:fill`, shift: 5 })}" fill="${fill}"/>` : '';
  const edges = [
    [[x - overshoot, y], [x + w + overshoot, y]],
    [[x + w, y - overshoot], [x + w, y + h + overshoot]],
    [[x + w + overshoot, y + h], [x - overshoot, y + h]],
    [[x, y + h + overshoot], [x, y - overshoot]],
  ].map((seg, i) => `<path d="${inkStroke(seg, { seed: `${seed}:e${i}`, width: strokeWidth, wobble: 2.2 }).d}" fill="${ink}"/>`).join('');
  return fillPath + edges;
}

function handRoundedCard({ x, y, w, h, r = 14 }, { seed, fill, ink, strokeWidth = [4, 5.5] }) {
  const rad = Math.max(4, Math.min(r, w / 4, h / 4));
  const corners = [
    [x + w - rad, y + rad, -Math.PI / 2, 0],
    [x + w - rad, y + h - rad, 0, Math.PI / 2],
    [x + rad, y + h - rad, Math.PI / 2, Math.PI],
    [x + rad, y + rad, Math.PI, (3 * Math.PI) / 2],
  ];
  const pts = [];
  for (const [cx, cy, a0, a1] of corners) {
    for (let k = 0; k <= 3; k += 1) {
      const a = a0 + ((a1 - a0) * k) / 3;
      pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
  }
  const fillPath = fill ? `<path d="${markerFill(pts, { seed: `${seed}:fill`, shift: 4 })}" fill="${fill}"/>` : '';
  const outline = `<path d="${inkStroke([...pts, pts[0]], { seed: `${seed}:edge`, width: strokeWidth, wobble: 1.8 }).d}" fill="${ink}"/>`;
  return fillPath + outline;
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

function handArrow(x1, y1, x2, y2, { seed, color, progress = 1, bend = null }) {
  const p = clamp01(progress);
  if (p <= 0.02) return '';
  const mx = (x1 + x2) / 2 + (bend ? bend[0] : 0);
  const my = (y1 + y2) / 2 + (bend ? bend[1] : -14);
  const curve = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    const u = 1 - t;
    return [u * u * x1 + 2 * u * t * mx + t * t * x2, u * u * y1 + 2 * u * t * my + t * t * y2];
  });
  const drawn = resample(curve, 24).slice(0, Math.max(2, Math.round(24 * p)));
  const shaft = `<path d="${inkStroke(drawn, { seed: `${seed}:shaft`, width: [4.5, 6], wobble: 1.6, taper: 'start' }).d}" fill="${color}"/>`;
  if (p < 0.72) return shaft;
  const tip = drawn.at(-1);
  const prev = drawn.at(-2);
  const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const headLen = 18;
  const wing = (delta) => [tip[0] - headLen * Math.cos(ang + delta), tip[1] - headLen * Math.sin(ang + delta)];
  const head = `<path d="${inkStroke([wing(0.55), tip, wing(-0.55)], { seed: `${seed}:head`, width: [4.5, 5.5], wobble: 0.8 }).d}" fill="${color}"/>`;
  return shaft + head;
}

function rayBoxExit(b, dx, dy, pad = 10) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const tx = Math.abs(dx) > 1e-6 ? (b.w / 2 + pad) / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-6 ? (b.h / 2 + pad) / Math.abs(dy) : Infinity;
  const k = Math.min(tx, ty);
  return [cx + dx * k, cy + dy * k];
}

/** Computes element bounding boxes inside `zone` for any of the 8 templates. */
export function layoutElements(visual, layout = 'full', zoneOverride = null) {
  const z = zoneOverride ?? DIAGRAM_ZONES[layout] ?? DIAGRAM_ZONES.full;
  const d = visual.data;
  switch (visual.template) {
    case 'title':
      return [{ index: 0, label: d.heading, bbox: { x: z.x + 20, y: z.y + 20, w: z.w - 40, h: z.h - 40 } }];
    case 'bullets': {
      const n = d.items.length;
      const cols = layout === 'host-left' && n > 2 ? 2 : 1;
      const rows = Math.ceil(n / cols);
      const gapX = 28;
      const gapY = 20;
      const pad = 16;
      const w = (z.w - pad * 2 - gapX * (cols - 1)) / cols;
      const h = Math.min(132, (z.h - pad * 2 - gapY * (rows - 1)) / rows);
      const totalH = rows * h + (rows - 1) * gapY;
      const topY = z.y + (z.h - totalH) / 2;
      return d.items.map((label, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return { index, label, bbox: { x: z.x + pad + col * (w + gapX), y: topY + row * (h + gapY), w, h } };
      });
    }
    case 'flow': {
      const n = d.nodes.length;
      const gap = Math.min(72, Math.max(44, (z.w * 0.14) / Math.max(1, n - 1)));
      const pad = 16;
      const w = Math.min(340, (z.w - pad * 2 - gap * (n - 1)) / n);
      const h = Math.min(220, z.h - 48);
      const totalW = n * w + (n - 1) * gap;
      const startX = z.x + (z.w - totalW) / 2;
      const y = z.y + (z.h - h) / 2;
      return d.nodes.map((label, index) => ({ index, label, bbox: { x: startX + index * (w + gap), y, w, h } }));
    }
    case 'compare': {
      const gap = 36;
      const pad = 16;
      const w = (z.w - pad * 2 - gap) / 2;
      const h = Math.min(460, z.h - 32);
      const y = z.y + (z.h - h) / 2;
      return [
        { index: 0, label: d.left.label, bbox: { x: z.x + pad, y, w, h } },
        { index: 1, label: d.right.label, bbox: { x: z.x + pad + w + gap, y, w, h } },
      ];
    }
    case 'number':
      return [{ index: 0, label: `${d.value} ${d.label}`, bbox: { x: z.x + 24, y: z.y + 24, w: z.w - 48, h: z.h - 48 } }];
    case 'bars': {
      const n = d.items.length;
      const padX = 36;
      const gap = Math.min(48, Math.max(20, z.w / (n * 5)));
      const w = Math.min(180, (z.w - padX * 2 - gap * (n - 1)) / n);
      const totalW = n * w + (n - 1) * gap;
      const startX = z.x + (z.w - totalW) / 2;
      const h = z.h - 48;
      const y = z.y + 24;
      return d.items.map((item, index) => ({ index, label: item.label, bbox: { x: startX + index * (w + gap), y, w, h } }));
    }
    case 'timeline': {
      const n = d.items.length;
      const padX = 36;
      const gapX = Math.min(36, Math.max(16, (z.w * 0.08) / Math.max(1, n - 1)));
      const w = Math.min(280, (z.w - padX * 2 - gapX * (n - 1)) / n);
      const totalW = n * w + (n - 1) * gapX;
      const startX = z.x + (z.w - totalW) / 2;
      const axisY = z.y + z.h / 2;
      const stemGap = 22;
      const h = Math.min(210, z.h / 2 - stemGap - 12);
      return d.items.map((item, index) => {
        const isTop = index % 2 === 0;
        const x = startX + index * (w + gapX);
        const y = isTop ? axisY - stemGap - h : axisY + stemGap;
        return { index, label: item.label, bbox: { x, y, w, h } };
      });
    }
    case 'cycle': {
      const n = d.items.length;
      const cardW = layout === 'host-left'
        ? Math.min(220, ((z.w - 120) / Math.max(3, n)) * 0.95)
        : Math.min(270, ((z.w - 160) / Math.max(3, n)) * 0.95);
      const cardH = layout === 'host-left' ? (n >= 5 ? 92 : 98) : (n >= 5 ? 124 : 134);
      const cx = z.x + z.w / 2;
      const cy = z.y + z.h / 2;
      const ry = Math.max(60, (z.h - cardH) / 2 - 14);
      const maxRx = (z.w - cardW) / 2 - 24;
      const rx = Math.min(maxRx, ry * (layout === 'host-left' ? 2.25 : 1.55));
      return d.items.map((item, index) => {
        const a = -Math.PI / 2 + (2 * Math.PI * index) / n;
        const nx = cx + rx * Math.cos(a);
        const ny = cy + ry * Math.sin(a);
        return {
          index,
          label: item.label,
          bbox: { x: nx - cardW / 2, y: ny - cardH / 2, w: cardW, h: cardH },
        };
      });
    }
    default:
      throw new Error(`unknown template ${visual.template}`);
  }
}

function formatAnimatedNumber(valueStr, t) {
  const m = String(valueStr).match(/^([^0-9.-]*)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return String(valueStr);
  const [, prefix, rawNum, suffix] = m;
  const target = Number(rawNum);
  const decimals = rawNum.includes('.') ? rawNum.split('.')[1].length : 0;
  const prog = easeOutCubic(clamp01(t / 0.8));
  const cur = target * prog;
  const formatted = decimals > 0 ? cur.toFixed(decimals) : String(Math.round(cur));
  return `${prefix}${formatted}${suffix}`;
}

/**
 * Renders one diagram template into pure `vectorSvg` + cached `textItems` + `elements`.
 * `elementStates[i]` may specify `{ opacity, scale, dx, dy, highlight, arrowProgress, tapShake, overrideBbox, state, prevState, stateProgress, bump }`.
 */
export function renderDiagram(visual, {
  layout = 'full',
  theme = 'light',
  style,
  seed = 'sh01',
  t = 1,
  duration = 4,
  elementStates = [],
  sends = [],
  customProps = [],
  zoneOverride = null,
} = {}) {
  const { name: styleName, palette: pal } = resolveStyle(style ?? theme);
  const iconStyleOpts = style != null ? { style: styleName } : { theme };
  const zone = zoneOverride ?? DIAGRAM_ZONES[layout] ?? DIAGRAM_ZONES.full;
  const elements = layoutElements(visual, layout, zoneOverride);
  const vectors = [];
  const textItems = [];
  const d = visual.data;
  const escAttr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
  const getState = (i) => ({
    opacity: 1,
    scale: 1,
    dx: 0,
    dy: 0,
    highlight: 0,
    arrowProgress: 1,
    tapShake: 0,
    state: 'normal',
    prevState: 'normal',
    stateProgress: 1,
    bump: 0,
    ...elementStates[i],
  });
  const applyElementState = (bbox, st, i, keyPrefix) => {
    const effState = st.state ?? 'normal';
    const prevState = st.prevState ?? effState;
    const sp = clamp01(st.stateProgress ?? 1);
    let { opacity: stateOp, overlaySvg } = drawStateOverlay(effState, bbox, pal, `${seed}:el${i}`, sp);
    if (prevState === 'dim' && effState === 'normal' && sp < 1) {
      stateOp = lerp(0.45, 1, sp);
    }
    const effSt = { ...st, opacity: clamp01(st.opacity ?? 1) * stateOp };
    if (isCountState(effState) && effSt.opacity > 0.005) {
      const digits = effState.slice(6);
      const cx = bbox.x + bbox.w / 2;
      const cy = bbox.y + bbox.h / 2;
      const rad = Math.max(16, Math.min(28, Math.min(bbox.w, bbox.h) * 0.24));
      const bxLocal = bbox.x + bbox.w - rad * 0.25;
      const byLocal = bbox.y + rad * 0.25;
      const pulse = effSt.highlight > 0 && effSt.highlight < 1 ? 1 + 0.06 * Math.sin(Math.PI * clamp01(effSt.highlight)) : 1;
      const bumpScale = effSt.bump ? 1 + 0.08 * effSt.bump : 1;
      const sc = (effSt.scale ?? 1) * pulse * bumpScale;
      const len = [...digits].length;
      const countOp = prevState !== effState && sp < 1 && !isCountState(prevState) ? effSt.opacity * sp : effSt.opacity;
      textItems.push({
        key: `${keyPrefix}-count-${i}`,
        text: digits,
        x: cx + (bxLocal - cx) * sc + (effSt.dx ?? 0),
        y: cy + (byLocal - cy) * sc + (effSt.dy ?? 0),
        fontSize: Math.max(16, Math.round(rad * (len >= 3 ? 0.85 : len === 2 ? 1.05 : 1.2) * sc)),
        color: pal.isDark ? pal.paper : pal.card,
        align: 'middle',
        weight: 'bold',
        opacity: countOp,
      });
    }
    return { effSt, overlaySvg };
  };
  const wrapTransform = (bbox, st, inner) => {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const pulse = st.highlight > 0 && st.highlight < 1 ? 1 + 0.06 * Math.sin(Math.PI * clamp01(st.highlight)) : 1;
    const bumpScale = st.bump ? 1 + 0.08 * st.bump : 1;
    const sc = (st.scale ?? 1) * pulse * bumpScale;
    const rot = st.tapShake ? st.tapShake * 2 : 0;
    const op = clamp01(st.opacity ?? 1);
    if (op <= 0.005) return '';
    const stateAttr = st.state && st.state !== 'normal' ? ` data-state="${escAttr(st.state)}"` : '';
    return `<g${stateAttr} opacity="${num(op)}" transform="translate(${num(cx + (st.dx ?? 0))} ${num(cy + (st.dy ?? 0))}) rotate(${num(rot)}) scale(${num(sc)}) translate(${num(-cx)} ${num(-cy)})">${inner}</g>`;
  };

  switch (visual.template) {
    case 'title': {
      const el = elements[0];
      const st = getState(0);
      const b = st.overrideBbox ?? el.bbox;
      const { effSt, overlaySvg } = applyElementState(b, st, 0, 'title');
      const chars = [...d.heading];
      const shownCount = Math.max(1, Math.min(chars.length, Math.ceil((t / Math.max(0.25, Math.min(0.5, chars.length * 0.03))) * chars.length)));
      const heading = chars.slice(0, shownCount).join('');
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2 + (d.sub ? -24 : 8);
      const card = handCard(b, { seed: `${seed}:title`, fill: pal.softYellow, ink: pal.ink });
      const underline = `<path d="${inkStroke([[cx - Math.min(b.w * 0.36, 320), cy + 44], [cx + Math.min(b.w * 0.36, 320), cy + 44]], { seed: `${seed}:title-ul`, width: [6, 8], wobble: 2.5 }).d}" fill="${pal.teal}"/>`;
      vectors.push(wrapTransform(b, effSt, card + underline + overlaySvg));
      textItems.push({
        key: 'title-heading',
        text: heading,
        x: cx + (effSt.dx ?? 0),
        y: cy + (effSt.dy ?? 0),
        fontSize: layout === 'host-left' ? 68 : 88,
        color: pal.ink,
        align: 'middle',
        weight: 'bold',
        opacity: effSt.opacity,
        isTitle: true,
      });
      if (d.sub) {
        const subOp = clamp01((t - 0.2) / 0.35) * effSt.opacity;
        textItems.push({
          key: 'title-sub',
          text: d.sub,
          x: cx + (effSt.dx ?? 0),
          y: cy + 92 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 40 : 48,
          color: pal.muted,
          align: 'middle',
          opacity: subOp,
        });
      }
      break;
    }

    case 'bullets': {
      const fills = [pal.softTeal, pal.softYellow, pal.softRed, pal.softTeal];
      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const { effSt, overlaySvg } = applyElementState(b, st, i, 'bullet');
        const iconName = d.icons?.[i];
        const card = handCard(b, { seed: `${seed}:b${i}`, fill: effSt.highlight > 0 ? pal.softYellow : fills[i % fills.length], ink: pal.ink });
        const iconSvg = iconName
          ? drawIcon(iconName, { x: b.x + 48, y: b.y + b.h / 2, size: Math.min(54, b.h * 0.58), ...iconStyleOpts, seed: `${seed}:bi${i}` })
          : `<path d="${inkStroke(circlePoints(b.x + 40, b.y + b.h / 2, 11, { seed: `${seed}:bd${i}`, overdraw: 0.2, count: 16 }), { seed: `${seed}:bd${i}`, width: [4, 5], wobble: 0.8 }).d}" fill="${pal.teal}"/>`;
        const hl = effSt.highlight > 0 ? handHighlight(b, i, { seed, color: pal.teal, progress: effSt.highlight }) : '';
        vectors.push(wrapTransform(b, effSt, card + iconSvg + hl + overlaySvg));
        textItems.push({
          key: `bullet-${i}`,
          text: el.label,
          x: b.x + (iconName ? 94 : 72) + (effSt.dx ?? 0),
          y: b.y + b.h / 2 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 38 : 48,
          color: pal.ink,
          align: 'start',
          weight: effSt.highlight > 0 ? 'bold' : 'normal',
          opacity: effSt.opacity,
        });
      });
      break;
    }

    case 'flow': {
      const fills = [pal.softTeal, pal.softYellow, pal.softTeal, pal.softRed, pal.softYellow];
      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const { effSt, overlaySvg } = applyElementState(b, st, i, 'flow');
        const iconName = d.icons?.[i];
        const card = handCard(b, { seed: `${seed}:f${i}`, fill: effSt.highlight > 0 ? pal.softYellow : fills[i % fills.length], ink: pal.ink });
        const iconSvg = iconName
          ? drawIcon(iconName, { x: b.x + b.w / 2, y: b.y + b.h * 0.34, size: Math.min(64, b.h * 0.36), ...iconStyleOpts, seed: `${seed}:fi${i}` })
          : '';
        const hl = effSt.highlight > 0 ? handHighlight(b, i, { seed, color: pal.red, progress: effSt.highlight }) : '';
        vectors.push(wrapTransform(b, effSt, card + iconSvg + hl + overlaySvg));
        textItems.push({
          key: `flow-${i}`,
          text: el.label,
          x: b.x + b.w / 2 + (effSt.dx ?? 0),
          y: b.y + (iconName ? b.h * 0.75 : b.h / 2) + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 38 : 46,
          color: pal.ink,
          align: 'middle',
          weight: 'bold',
          opacity: effSt.opacity,
        });
        if (i > 0) {
          const prevSt = getState(i - 1);
          const prevB = prevSt.overrideBbox ?? elements[i - 1].bbox;
          const arrow = handArrow(
            prevB.x + prevB.w + 8 + (prevSt.dx ?? 0),
            prevB.y + prevB.h / 2 + (prevSt.dy ?? 0),
            b.x - 8 + (st.dx ?? 0),
            b.y + b.h / 2 + (st.dy ?? 0),
            {
              seed: `${seed}:arr${i}`,
              color: st.highlight > 0 ? pal.red : pal.teal,
              progress: st.arrowProgress * st.opacity,
            },
          );
          if (arrow) vectors.push(arrow);
        }
      });
      if (Array.isArray(sends)) {
        sends.forEach((s, idx) => {
          if (!s || !s.prop) return;
          const targetIdx = s.targetIdx ?? s.index;
          if (!Number.isInteger(targetIdx) || targetIdx < 1 || targetIdx >= elements.length) return;
          const prevSt = getState(targetIdx - 1);
          const currSt = getState(targetIdx);
          if (Math.min(clamp01(prevSt.opacity), clamp01(currSt.opacity)) <= 0.005) return;
          const prevB = prevSt.overrideBbox ?? elements[targetIdx - 1].bbox;
          const currB = currSt.overrideBbox ?? elements[targetIdx].bbox;
          const hasOverride = Boolean(zoneOverride || prevSt.overrideBbox || currSt.overrideBbox);
          const fromPt = !hasOverride && Array.isArray(s.fromPt)
            ? s.fromPt
            : [prevB.x + prevB.w + 8 + (prevSt.dx ?? 0), prevB.y + prevB.h / 2 + (prevSt.dy ?? 0)];
          const toPt = !hasOverride && Array.isArray(s.toPt)
            ? s.toPt
            : [currB.x - 8 + (currSt.dx ?? 0), currB.y + currB.h / 2 + (currSt.dy ?? 0)];
          const pktSvg = renderSendPacket(fromPt, toPt, s.prop, s.u, {
            style: styleName,
            seed: `${seed}:send:${s.index ?? idx}`,
            customProps,
            bend: s.bend ?? [0, -14],
          });
          if (pktSvg) vectors.push(pktSvg);
        });
      }
      break;
    }

    case 'compare': {
      const cols = [d.left, d.right];
      const headerFills = [pal.softTeal, pal.softYellow];
      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const { effSt, overlaySvg } = applyElementState(b, st, i, 'compare');
        const headerH = Math.min(84, b.h * 0.28);
        const card = handCard(b, { seed: `${seed}:c${i}`, fill: pal.card, ink: pal.ink });
        const header = `<path d="${markerFill([[b.x + 4, b.y + 4], [b.x + b.w - 4, b.y + 4], [b.x + b.w - 4, b.y + headerH], [b.x + 4, b.y + headerH]], { seed: `${seed}:ch${i}`, shift: 3 })}" fill="${headerFills[i]}"/>`
          + `<path d="${inkStroke([[b.x, b.y + headerH], [b.x + b.w, b.y + headerH]], { seed: `${seed}:cs${i}`, width: [3.5, 5], wobble: 1.5 }).d}" fill="${pal.ink}"/>`;
        const hl = effSt.highlight > 0 ? handHighlight(b, i, { seed, color: pal.teal, progress: effSt.highlight }) : '';
        vectors.push(wrapTransform(b, effSt, card + header + hl + overlaySvg));
        textItems.push({
          key: `compare-label-${i}`,
          text: cols[i].label,
          x: b.x + b.w / 2 + (effSt.dx ?? 0),
          y: b.y + headerH / 2 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 40 : 48,
          color: pal.ink,
          align: 'middle',
          weight: 'bold',
          opacity: effSt.opacity,
        });
        const rowH = (b.h - headerH - 20) / Math.max(1, cols[i].rows.length);
        cols[i].rows.forEach((row, r) => {
          textItems.push({
            key: `compare-${i}-row-${r}`,
            text: row,
            x: b.x + b.w / 2 + (effSt.dx ?? 0),
            y: b.y + headerH + 10 + rowH * (r + 0.5) + (effSt.dy ?? 0),
            fontSize: layout === 'host-left' ? 34 : 42,
            color: pal.ink,
            align: 'middle',
            opacity: effSt.opacity,
          });
        });
      });
      break;
    }

    case 'number': {
      const el = elements[0];
      const st = getState(0);
      const b = st.overrideBbox ?? el.bbox;
      const { effSt, overlaySvg } = applyElementState(b, st, 0, 'number');
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const card = handCard(b, { seed: `${seed}:num`, fill: pal.softTeal, ink: pal.ink });
      const ring = `<path d="${inkStroke(circlePoints(cx, cy - 34, Math.min(b.w, b.h) * 0.34, { seed: `${seed}:num-ring`, overdraw: 0.3, count: 40 }), { seed: `${seed}:num-ring`, width: [5, 7], wobble: 2.5 }).d}" fill="${pal.teal}"/>`;
      vectors.push(wrapTransform(b, effSt, card + ring + overlaySvg));
      textItems.push({
        key: 'number-value',
        text: formatAnimatedNumber(d.value, t),
        x: cx + (effSt.dx ?? 0),
        y: cy - 30 + (effSt.dy ?? 0),
        fontSize: layout === 'host-left' ? 116 : 164,
        color: pal.teal,
        stroke: pal.textStroke,
        align: 'middle',
        weight: 'bold',
        opacity: effSt.opacity,
        isTitle: true,
      });
      textItems.push({
        key: 'number-label',
        text: d.label,
        x: cx + (effSt.dx ?? 0),
        y: cy + (layout === 'host-left' ? 105 : 145) + (effSt.dy ?? 0),
        fontSize: layout === 'host-left' ? 42 : 52,
        color: pal.ink,
        align: 'middle',
        weight: 'bold',
        opacity: effSt.opacity,
      });
      break;
    }

    case 'bars': {
      const maxVal = Math.max(1, ...d.items.map((it) => it.value));
      const fills = [pal.teal, pal.yellow, pal.red, pal.teal, pal.yellow, pal.red];
      const baseLineY = elements[0].bbox.y + elements[0].bbox.h - 56;
      const maxBarH = Math.max(60, elements[0].bbox.h - 126);
      const axis = `<path d="${inkStroke([[elements[0].bbox.x - 20, baseLineY], [elements.at(-1).bbox.x + elements.at(-1).bbox.w + 20, baseLineY]], { seed: `${seed}:axis`, width: [4, 5.5], wobble: 1.5 }).d}" fill="${pal.ink}"/>`;
      vectors.push(axis);

      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const grow = easeOutCubic(clamp01((t - i * 0.08) / 0.6));
        const barH = Math.max(10, (d.items[i].value / maxVal) * maxBarH * grow);
        const barRect = { x: b.x + 8, y: baseLineY - barH, w: b.w - 16, h: barH };
        const { effSt, overlaySvg } = applyElementState(barRect, st, i, 'bar');
        const bar = handCard(barRect, { seed: `${seed}:bar${i}`, fill: fills[i % fills.length], ink: pal.ink, strokeWidth: [3.5, 5], overshoot: 3 });
        const hl = effSt.highlight > 0 ? handHighlight(barRect, i, { seed, color: pal.red, progress: effSt.highlight }) : '';
        vectors.push(wrapTransform(barRect, effSt, bar + hl + overlaySvg));
        const valStr = `${d.items[i].value}${d.unit ?? ''}`;
        textItems.push({
          key: `bar-val-${i}`,
          text: valStr,
          x: b.x + b.w / 2 + (effSt.dx ?? 0),
          y: barRect.y - 24 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 32 : 38,
          color: pal.ink,
          align: 'middle',
          weight: 'bold',
          opacity: effSt.opacity * clamp01(grow * 2),
        });
        textItems.push({
          key: `bar-label-${i}`,
          text: el.label,
          x: b.x + b.w / 2 + (effSt.dx ?? 0),
          y: baseLineY + 34 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 32 : 38,
          color: pal.ink,
          align: 'middle',
          opacity: effSt.opacity,
        });
      });
      break;
    }

    case 'timeline': {
      const fills = [pal.softTeal, pal.softYellow, pal.softRed, pal.softTeal, pal.softYellow];
      const axisY = zone.y + zone.h / 2;
      const axis = `<path d="${inkStroke([[zone.x + 24, axisY], [zone.x + zone.w - 24, axisY]], { seed: `${seed}:tl-axis`, width: [4.5, 6], wobble: 1.8 }).d}" fill="${pal.ink}"/>`;
      vectors.push(axis);

      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const { effSt, overlaySvg } = applyElementState(b, st, i, 'timeline');
        const item = d.items[i];
        const isTop = i % 2 === 0;
        const cx = b.x + b.w / 2;
        const stemY = isTop ? b.y + b.h : b.y;
        const stem = `<path d="${inkStroke([[cx, axisY], [cx, stemY]], { seed: `${seed}:tls${i}`, width: [3.5, 5], wobble: 1.2 }).d}" fill="${pal.ink}"/>`;
        const dotPts = circlePoints(cx, axisY, 10, { seed: `${seed}:tld${i}`, overdraw: 0.25, count: 18 });
        const dot = `<g opacity="${num(clamp01(effSt.opacity))}">`
          + `<path d="${markerFill(dotPts, { seed: `${seed}:tldf${i}`, shift: 2 })}" fill="${effSt.highlight > 0 ? pal.yellow : pal.softTeal}"/>`
          + `<path d="${inkStroke(dotPts, { seed: `${seed}:tlds${i}`, width: [4, 5], wobble: 0.9 }).d}" fill="${pal.ink}"/>`
          + '</g>';
        const card = handCard(b, { seed: `${seed}:tlc${i}`, fill: effSt.highlight > 0 ? pal.softYellow : fills[i % fills.length], ink: pal.ink });
        const iconSvg = item.icon
          ? drawIcon(item.icon, { x: b.x + 34, y: b.y + 36, size: Math.min(40, b.h * 0.28), ...iconStyleOpts, seed: `${seed}:tli${i}` })
          : '';
        const hl = effSt.highlight > 0 ? handHighlight(b, i, { seed, color: pal.teal, progress: effSt.highlight }) : '';
        vectors.push(dot + wrapTransform(b, effSt, stem + card + iconSvg + hl + overlaySvg));

        textItems.push({
          key: `timeline-time-${i}`,
          text: item.time,
          x: (item.icon ? b.x + 62 : cx) + (effSt.dx ?? 0),
          y: b.y + 36 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 28 : 34,
          color: pal.teal,
          align: item.icon ? 'start' : 'middle',
          weight: 'bold',
          opacity: effSt.opacity,
        });
        textItems.push({
          key: `timeline-label-${i}`,
          text: item.label,
          x: cx + (effSt.dx ?? 0),
          y: b.y + b.h * 0.68 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 32 : 38,
          color: pal.ink,
          align: 'middle',
          weight: effSt.highlight > 0 ? 'bold' : 'normal',
          opacity: effSt.opacity,
        });
      });
      break;
    }

    case 'cycle': {
      const n = d.items.length;
      const fills = [pal.softTeal, pal.softYellow, pal.softRed, pal.softTeal, pal.softYellow];
      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const { effSt, overlaySvg } = applyElementState(b, st, i, 'cycle');
        const item = d.items[i];
        const card = handRoundedCard(b, { seed: `${seed}:cyc${i}`, fill: effSt.highlight > 0 ? pal.softYellow : fills[i % fills.length], ink: pal.ink });
        const iconSvg = item.icon
          ? drawIcon(item.icon, { x: b.x + 40, y: b.y + b.h / 2, size: Math.min(48, b.h * 0.56), ...iconStyleOpts, seed: `${seed}:cyci${i}` })
          : '';
        const hl = effSt.highlight > 0 ? handHighlight(b, i, { seed, color: pal.red, progress: effSt.highlight }) : '';
        vectors.push(wrapTransform(b, effSt, card + iconSvg + hl + overlaySvg));
        textItems.push({
          key: `cycle-${i}`,
          text: item.label,
          x: (item.icon ? b.x + 74 : b.x + b.w / 2) + (effSt.dx ?? 0),
          y: b.y + b.h / 2 + (effSt.dy ?? 0),
          fontSize: layout === 'host-left' ? 34 : 42,
          color: pal.ink,
          align: item.icon ? 'start' : 'middle',
          weight: 'bold',
          opacity: effSt.opacity,
        });

        const prevIdx = (i - 1 + n) % n;
        const prevSt = getState(prevIdx);
        if (prevSt.opacity > 0.005) {
          const prevB = prevSt.overrideBbox ?? elements[prevIdx].bbox;
          const dx = (b.x + b.w / 2) - (prevB.x + prevB.w / 2);
          const dy = (b.y + b.h / 2) - (prevB.y + prevB.h / 2);
          const dist = Math.hypot(dx, dy) || 1;
          const [sx, sy] = rayBoxExit(prevB, dx, dy, 10);
          const [ex, ey] = rayBoxExit(b, -dx, -dy, 10);
          const bendAmt = Math.min(34, dist * 0.14);
          const arrow = handArrow(sx, sy, ex, ey, {
            seed: `${seed}:cyca${i}`,
            color: st.highlight > 0 ? pal.red : pal.teal,
            progress: st.arrowProgress * Math.min(st.opacity, prevSt.opacity),
            bend: [(dy / dist) * bendAmt, (-dx / dist) * bendAmt],
          });
          if (arrow) vectors.push(arrow);
        }
      });
      break;
    }

    default:
      throw new Error(`unknown template ${visual.template}`);
  }

  return { vectorSvg: vectors.join(''), textItems, elements };
}
