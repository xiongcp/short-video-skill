// Six hand-drawn explainer diagram templates (火柴人主持人设计 §3.5-3.6, 出片质量设计 §6.2, §7.1).
// Returns pure vectorSvg (no <text>, fast resvg) + textItems (cached CJK layer) + elements with bboxes.
import { clamp01, easeOutBack, easeOutCubic, lerp } from './ease.mjs';
import { drawIcon } from './icons.mjs';
import { circlePoints, inkStroke, markerFill, num, resample } from './ink.mjs';

export const DIAGRAM_ZONES = {
  'host-left': { x: 640, y: 80, w: 1200, h: 420 },
  full: { x: 120, y: 120, w: 1680, h: 740 },
};

export const THEME_PALETTE = {
  light: {
    paper: '#fbfaf6',
    grid: '#eeeae0',
    ink: '#1f1f1f',
    muted: '#575757',
    card: '#ffffff',
    teal: '#20a5a3',
    yellow: '#f6c945',
    red: '#e05a47',
    softTeal: '#d7f0ef',
    softYellow: '#fdf1c8',
    softRed: '#fadcd7',
    textStroke: '#1f1f1f',
  },
  dark: {
    paper: '#181b22',
    grid: '#232833',
    ink: '#f2f2f2',
    muted: '#adb5c2',
    card: '#222630',
    teal: '#2ec4c1',
    yellow: '#f6c945',
    red: '#eb6f5c',
    softTeal: '#1e3c3c',
    softYellow: '#3b341c',
    softRed: '#3d2421',
    textStroke: '#111318',
  },
};

/** Paper background with subtle wide grid (no fine grain texture, avoiding H.264 mosquito noise). */
export function paperBackgroundSvg(theme = 'light', width = 1920, height = 1080, parallax = [0, 0]) {
  const pal = THEME_PALETTE[theme] ?? THEME_PALETTE.light;
  const [px, py] = parallax;
  const step = 96;
  const lines = [];
  for (let x = ((px % step) + step) % step; x < width; x += step) {
    lines.push(`<line x1="${num(x)}" y1="0" x2="${num(x)}" y2="${height}" stroke="${pal.grid}" stroke-width="2"/>`);
  }
  for (let y = ((py % step) + step) % step; y < height; y += step) {
    lines.push(`<line x1="0" y1="${num(y)}" x2="${width}" y2="${num(y)}" stroke="${pal.grid}" stroke-width="2"/>`);
  }
  return `<rect width="${width}" height="${height}" fill="${pal.paper}"/><g opacity="0.7">${lines.join('')}</g>`;
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

function handArrow(x1, y1, x2, y2, { seed, color, progress = 1 }) {
  const p = clamp01(progress);
  if (p <= 0.02) return '';
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 14;
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

/** Computes element bounding boxes inside `zone` for any of the 6 templates. */
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
 * `elementStates[i]` may specify `{ opacity, scale, dy, highlight, arrowProgress, tapShake, overrideBbox }`.
 */
export function renderDiagram(visual, {
  layout = 'full',
  theme = 'light',
  seed = 'sh01',
  t = 1,
  duration = 4,
  elementStates = [],
  zoneOverride = null,
} = {}) {
  const pal = THEME_PALETTE[theme] ?? THEME_PALETTE.light;
  const elements = layoutElements(visual, layout, zoneOverride);
  const vectors = [];
  const textItems = [];
  const d = visual.data;
  const getState = (i) => ({ opacity: 1, scale: 1, dy: 0, highlight: 0, arrowProgress: 1, tapShake: 0, ...elementStates[i] });
  const wrapTransform = (bbox, st, inner) => {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const pulse = st.highlight > 0 && st.highlight < 1 ? 1 + 0.06 * Math.sin(Math.PI * clamp01(st.highlight)) : 1;
    const sc = (st.scale ?? 1) * pulse;
    const rot = st.tapShake ? st.tapShake * 2 : 0;
    const op = clamp01(st.opacity ?? 1);
    if (op <= 0.005) return '';
    return `<g opacity="${num(op)}" transform="translate(${num(cx)} ${num(cy + (st.dy ?? 0))}) rotate(${num(rot)}) scale(${num(sc)}) translate(${num(-cx)} ${num(-cy)})">${inner}</g>`;
  };

  switch (visual.template) {
    case 'title': {
      const el = elements[0];
      const st = getState(0);
      const b = st.overrideBbox ?? el.bbox;
      const chars = [...d.heading];
      const shownCount = Math.max(1, Math.min(chars.length, Math.ceil((t / Math.max(0.25, Math.min(0.5, chars.length * 0.03))) * chars.length)));
      const heading = chars.slice(0, shownCount).join('');
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2 + (d.sub ? -24 : 8);
      const card = handCard(b, { seed: `${seed}:title`, fill: pal.softYellow, ink: pal.ink });
      const underline = `<path d="${inkStroke([[cx - Math.min(b.w * 0.36, 320), cy + 44], [cx + Math.min(b.w * 0.36, 320), cy + 44]], { seed: `${seed}:title-ul`, width: [6, 8], wobble: 2.5 }).d}" fill="${pal.teal}"/>`;
      vectors.push(wrapTransform(b, st, card + underline));
      textItems.push({
        key: 'title-heading',
        text: heading,
        x: cx,
        y: cy,
        fontSize: layout === 'host-left' ? 68 : 88,
        color: pal.ink,
        align: 'middle',
        weight: 'bold',
        opacity: st.opacity,
        isTitle: true,
      });
      if (d.sub) {
        const subOp = clamp01((t - 0.2) / 0.35) * st.opacity;
        textItems.push({
          key: 'title-sub',
          text: d.sub,
          x: cx,
          y: cy + 92,
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
        const iconName = d.icons?.[i];
        const card = handCard(b, { seed: `${seed}:b${i}`, fill: st.highlight > 0 ? pal.softYellow : fills[i % fills.length], ink: pal.ink });
        const iconSvg = iconName
          ? drawIcon(iconName, { x: b.x + 48, y: b.y + b.h / 2, size: Math.min(54, b.h * 0.58), theme, seed: `${seed}:bi${i}` })
          : `<path d="${inkStroke(circlePoints(b.x + 40, b.y + b.h / 2, 11, { seed: `${seed}:bd${i}`, overdraw: 0.2, count: 16 }), { seed: `${seed}:bd${i}`, width: [4, 5], wobble: 0.8 }).d}" fill="${pal.teal}"/>`;
        const hl = st.highlight > 0 ? handHighlight(b, i, { seed, color: pal.teal, progress: st.highlight }) : '';
        vectors.push(wrapTransform(b, st, card + iconSvg + hl));
        textItems.push({
          key: `bullet-${i}`,
          text: el.label,
          x: b.x + (iconName ? 94 : 72),
          y: b.y + b.h / 2 + (st.dy ?? 0),
          fontSize: layout === 'host-left' ? 38 : 48,
          color: pal.ink,
          align: 'start',
          weight: st.highlight > 0 ? 'bold' : 'normal',
          opacity: st.opacity,
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
        const iconName = d.icons?.[i];
        const card = handCard(b, { seed: `${seed}:f${i}`, fill: st.highlight > 0 ? pal.softYellow : fills[i % fills.length], ink: pal.ink });
        const iconSvg = iconName
          ? drawIcon(iconName, { x: b.x + b.w / 2, y: b.y + b.h * 0.34, size: Math.min(64, b.h * 0.36), theme, seed: `${seed}:fi${i}` })
          : '';
        const hl = st.highlight > 0 ? handHighlight(b, i, { seed, color: pal.red, progress: st.highlight }) : '';
        vectors.push(wrapTransform(b, st, card + iconSvg + hl));
        textItems.push({
          key: `flow-${i}`,
          text: el.label,
          x: b.x + b.w / 2,
          y: b.y + (iconName ? b.h * 0.75 : b.h / 2) + (st.dy ?? 0),
          fontSize: layout === 'host-left' ? 38 : 46,
          color: pal.ink,
          align: 'middle',
          weight: 'bold',
          opacity: st.opacity,
        });
        if (i > 0) {
          const prevB = getState(i - 1).overrideBbox ?? elements[i - 1].bbox;
          const arrow = handArrow(prevB.x + prevB.w + 8, prevB.y + prevB.h / 2, b.x - 8, b.y + b.h / 2, {
            seed: `${seed}:arr${i}`,
            color: st.highlight > 0 ? pal.red : pal.teal,
            progress: st.arrowProgress * st.opacity,
          });
          if (arrow) vectors.push(arrow);
        }
      });
      break;
    }

    case 'compare': {
      const cols = [d.left, d.right];
      const headerFills = [pal.softTeal, pal.softYellow];
      elements.forEach((el, i) => {
        const st = getState(i);
        const b = st.overrideBbox ?? el.bbox;
        if (st.opacity <= 0.005) return;
        const headerH = Math.min(84, b.h * 0.28);
        const card = handCard(b, { seed: `${seed}:c${i}`, fill: pal.card, ink: pal.ink });
        const header = `<path d="${markerFill([[b.x + 4, b.y + 4], [b.x + b.w - 4, b.y + 4], [b.x + b.w - 4, b.y + headerH], [b.x + 4, b.y + headerH]], { seed: `${seed}:ch${i}`, shift: 3 })}" fill="${headerFills[i]}"/>`
          + `<path d="${inkStroke([[b.x, b.y + headerH], [b.x + b.w, b.y + headerH]], { seed: `${seed}:cs${i}`, width: [3.5, 5], wobble: 1.5 }).d}" fill="${pal.ink}"/>`;
        const hl = st.highlight > 0 ? handHighlight(b, i, { seed, color: pal.teal, progress: st.highlight }) : '';
        vectors.push(wrapTransform(b, st, card + header + hl));
        textItems.push({
          key: `compare-label-${i}`,
          text: cols[i].label,
          x: b.x + b.w / 2,
          y: b.y + headerH / 2 + (st.dy ?? 0),
          fontSize: layout === 'host-left' ? 40 : 48,
          color: pal.ink,
          align: 'middle',
          weight: 'bold',
          opacity: st.opacity,
        });
        const rowH = (b.h - headerH - 20) / Math.max(1, cols[i].rows.length);
        cols[i].rows.forEach((row, r) => {
          textItems.push({
            key: `compare-${i}-row-${r}`,
            text: row,
            x: b.x + b.w / 2,
            y: b.y + headerH + 10 + rowH * (r + 0.5) + (st.dy ?? 0),
            fontSize: layout === 'host-left' ? 34 : 42,
            color: pal.ink,
            align: 'middle',
            opacity: st.opacity,
          });
        });
      });
      break;
    }

    case 'number': {
      const el = elements[0];
      const st = getState(0);
      const b = st.overrideBbox ?? el.bbox;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const card = handCard(b, { seed: `${seed}:num`, fill: pal.softTeal, ink: pal.ink });
      const ring = `<path d="${inkStroke(circlePoints(cx, cy - 34, Math.min(b.w, b.h) * 0.34, { seed: `${seed}:num-ring`, overdraw: 0.3, count: 40 }), { seed: `${seed}:num-ring`, width: [5, 7], wobble: 2.5 }).d}" fill="${pal.teal}"/>`;
      vectors.push(wrapTransform(b, st, card + ring));
      textItems.push({
        key: 'number-value',
        text: formatAnimatedNumber(d.value, t),
        x: cx,
        y: cy - 30,
        fontSize: layout === 'host-left' ? 116 : 164,
        color: pal.teal,
        stroke: pal.textStroke,
        align: 'middle',
        weight: 'bold',
        opacity: st.opacity,
        isTitle: true,
      });
      textItems.push({
        key: 'number-label',
        text: d.label,
        x: cx,
        y: cy + (layout === 'host-left' ? 105 : 145),
        fontSize: layout === 'host-left' ? 42 : 52,
        color: pal.ink,
        align: 'middle',
        weight: 'bold',
        opacity: st.opacity,
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
        const bar = handCard(barRect, { seed: `${seed}:bar${i}`, fill: fills[i % fills.length], ink: pal.ink, strokeWidth: [3.5, 5], overshoot: 3 });
        const hl = st.highlight > 0 ? handHighlight(barRect, i, { seed, color: pal.red, progress: st.highlight }) : '';
        vectors.push(wrapTransform(barRect, st, bar + hl));
        const valStr = `${d.items[i].value}${d.unit ?? ''}`;
        textItems.push({
          key: `bar-val-${i}`,
          text: valStr,
          x: b.x + b.w / 2,
          y: barRect.y - 24,
          fontSize: layout === 'host-left' ? 32 : 38,
          color: pal.ink,
          align: 'middle',
          weight: 'bold',
          opacity: st.opacity * clamp01(grow * 2),
        });
        textItems.push({
          key: `bar-label-${i}`,
          text: el.label,
          x: b.x + b.w / 2,
          y: baseLineY + 34,
          fontSize: layout === 'host-left' ? 32 : 38,
          color: pal.ink,
          align: 'middle',
          opacity: st.opacity,
        });
      });
      break;
    }

    default:
      throw new Error(`unknown template ${visual.template}`);
  }

  return { vectorSvg: vectors.join(''), textItems, elements };
}
