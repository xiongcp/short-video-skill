// Per-ratio layout geometry (竖屏设计 §4). The 16:9 values are the constants every module used before the portrait
// work; 9:16 is the native 1080×1920 frame with the text-safe box that keeps titles, labels and subtitles clear of the
// Douyin, TikTok and Shorts overlays (third-party estimates, 竖屏设计 §4.1). Pure data and pure geometry, no imports.

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

const LANDSCAPE = {
  ratio: '16:9',
  width: 1920,
  height: 1080,
  center: [960, 540],
  textSafe: { x: 0, y: 0, w: 1920, h: 1080 },
  ground: 930,
  hostHome: 320,
  spots: { left: 320, center: 960, right: 1600 },
  walk: { minX: 120, maxX: 1800 },
  focusDefault: [1240, 320],
  zones: {
    'host-left': { x: 640, y: 48, w: 1200, h: 400 },
    full: { x: 120, y: 120, w: 1680, h: 740 },
  },
  stage: {
    slots: { left: 240, 'mid-left': 600, center: 960, 'mid-right': 1320, right: 1680 },
    bounds: { minX: 120, maxX: 1800, titleTop: 48, titleBottom: 150, airTopMin: 160, airBottomMax: 470, midDefaultBottom: 762, subtitleSafeY: 950, gap: 40, hostClearWidth: 200, minScale: 0.6 },
    hostMinX: 200,
    hostMaxX: 1720,
    heading: { x: 960, y: 92, underlineY: 130, fontSize: 52 },
  },
  subtitle: { x: 960, y: 1012, fontSize: 44, maxChars: null, maxLines: 1, lineHeight: 0 },
  draftBadge: { x: 32, y: 30 },
};

const PORTRAIT = {
  ratio: '9:16',
  width: 1080,
  height: 1920,
  center: [540, 960],
  textSafe: { x: 64, y: 250, w: 846, h: 1190 },
  ground: 1180,
  hostHome: 200,
  spots: { left: 200, center: 490, right: 780 },
  walk: { minX: 110, maxX: 970 },
  focusDefault: [487, 580],
  zones: {
    'host-left': { x: 64, y: 260, w: 846, h: 440 },
    full: { x: 64, y: 260, w: 846, h: 940 },
  },
  stage: {
    slots: { left: 160, 'mid-left': 325, center: 490, 'mid-right': 655, right: 820 },
    bounds: { minX: 90, maxX: 880, titleTop: 260, titleBottom: 370, airTopMin: 400, airBottomMax: 720, midDefaultBottom: 1012, subtitleSafeY: 1200, gap: 32, hostClearWidth: 200, minScale: 0.6 },
    hostMinX: 140,
    hostMaxX: 860,
    heading: { x: 540, y: 300, underlineY: 340, fontSize: 52 },
  },
  subtitle: { x: 540, y: 1330, fontSize: 60, maxChars: 12, maxLines: 2, lineHeight: 80 },
  // Outside the text-safe box on purpose: a draft is for review, not for upload.
  draftBadge: { x: 32, y: 120 },
};

export const FRAMES = deepFreeze({ '16:9': LANDSCAPE, '9:16': PORTRAIT });
export const RATIOS = Object.keys(FRAMES);

export function frameFor(ratio = '16:9') {
  if (ratio === null || ratio === undefined) return FRAMES['16:9'];
  if (!Object.hasOwn(FRAMES, ratio)) throw new Error(`未知画幅 ${ratio}，可选 ${RATIOS.join('、')}`);
  return FRAMES[ratio];
}

export const isPortrait = (frame) => frame.height > frame.width;

/** '' when rendering the project's own ratio (out/), otherwise '9x16' or '16x9' (out/9x16/). */
export function outputSubdir(projectRatio, renderRatio) {
  return (projectRatio ?? '16:9') === renderRatio ? '' : renderRatio.replace(':', 'x');
}

/** Resolution specs are landscape; a portrait frame swaps them (1080p → 1080×1920). */
export function sizeFor(spec, frame) {
  return isPortrait(frame) ? { width: spec.height, height: spec.width } : { width: spec.width, height: spec.height };
}

const WIDE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u;

/** Approximate box of one text item, matching how encode.mjs anchors the raster (x by align, y at the middle). */
export function textBox(item) {
  const fs = item.fontSize;
  const w = [...String(item.text)].reduce((s, ch) => s + (WIDE.test(ch) ? fs : 0.6 * fs), 0);
  const align = item.align ?? 'middle';
  const x = align === 'start' ? item.x : align === 'end' ? item.x - w : item.x - w / 2;
  return { x, y: item.y - fs / 2, w, h: fs };
}

/** Keys of visible text items that leave the text-safe box; always [] for landscape. */
export function textOutsideSafe(items, frame) {
  if (!isPortrait(frame)) return [];
  const s = frame.textSafe;
  return items
    .filter((it) => (it.opacity ?? 1) > 0.02 && it.text)
    .filter((it) => {
      const b = textBox(it);
      return b.x < s.x - 1 || b.y < s.y - 1 || b.x + b.w > s.x + s.w + 1 || b.y + b.h > s.y + s.h + 1;
    })
    .map((it) => it.key);
}

/** Arrow ends between two flow nodes: vertical when the next node sits below, otherwise left to right. */
export function flowArrowEnds(prev, curr) {
  if (curr.y >= prev.y + prev.h - 1e-6) {
    return { from: [prev.x + prev.w / 2, prev.y + prev.h + 8], to: [curr.x + curr.w / 2, curr.y - 8], bend: [14, 0] };
  }
  return { from: [prev.x + prev.w + 8, prev.y + prev.h / 2], to: [curr.x - 8, curr.y + curr.h / 2], bend: [0, -14] };
}
