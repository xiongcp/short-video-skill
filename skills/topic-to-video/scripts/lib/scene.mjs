// Continuous-time scene evaluator, shot-to-shot continuity, same-element morph transitions,
// layout-switch trot in/out, camera push + parallax, and frame-number-free shot cache keys
// (出片质量设计 §4.1, §7.1-7.2, 火柴人主持人设计 §7.4-7.5, 超越路线图 §5.3).
import { createHash } from 'node:crypto';
import { clamp01, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from './ease.mjs';
import { FRAMES, frameFor, isPortrait, textBox, textOutsideSafe } from './frame.mjs';
import { captionKeywords } from './match.mjs';
import { evaluateHostAt, hostEventTimeline, walkFrame } from './motion.mjs';
import { drawHost } from './rig.mjs';
import { chooseLinkLabelT, evaluateStageObjects, layoutStage, linkControlPoint, renderStage } from './stage.mjs';
import { layoutElements, renderDiagram } from './templates.mjs';
import { captionPages, resolveCueTiming } from './timing.mjs';
import { resolveStyle, sceneBackgroundSvg, styleBackgroundSvg } from './world.mjs';

export const SCENE_VERSION = 6;

const LANDSCAPE = FRAMES['16:9'];
const MAX_SCENE_BG_CACHE = 64;
const sceneBgCache = new Map();
const evalPlanCache = new WeakMap();
// 先退后进: the share of a transition the old shot takes to leave (字幕与转场设计 §5.2).
const EXIT_SHARE = 0.45;
const fadeLayer = (svg, op) => (op >= 0.999 ? svg : op <= 0.005 ? '' : `<g opacity="${op.toFixed(3)}">${svg}</g>`);

function getCachedSceneBg(sceneName, styleName, seed, frame) {
  const key = `${sceneName}|${styleName}|${seed}|${frame.ground}|${frame.ratio}`;
  if (sceneBgCache.has(key)) return sceneBgCache.get(key);
  const svg = sceneBackgroundSvg(sceneName, { style: styleName, seed, ground: frame.ground, width: frame.width, height: frame.height, frame });
  if (sceneBgCache.size >= MAX_SCENE_BG_CACHE) {
    sceneBgCache.delete(sceneBgCache.keys().next().value);
  }
  sceneBgCache.set(key, svg);
  return svg;
}

function getCachedEvalPlan(shotPlan, styleName, duration) {
  const frame = shotPlan.frame ?? LANDSCAPE;
  const prev = evalPlanCache.get(shotPlan);
  if (
    prev
    && prev.style === styleName
    && prev.durationSec === duration
    && prev.startState === shotPlan.startState
    && prev.cues === shotPlan.cues
    && prev.elements === shotPlan.elements
    && prev.sentences === shotPlan.sentences
    && prev.outfit === shotPlan.outfit
    && prev.theme === shotPlan.theme
    && prev.frame === frame
  ) {
    return prev;
  }
  const ep = {
    seed: shotPlan.id,
    theme: shotPlan.theme,
    style: styleName,
    outfit: shotPlan.outfit,
    ground: frame.ground,
    frame,
    durationSec: duration,
    startState: shotPlan.startState,
    cues: shotPlan.cues,
    elements: shotPlan.elements,
    sentences: shotPlan.sentences,
  };
  if (typeof shotPlan === 'object' && shotPlan !== null) evalPlanCache.set(shotPlan, ep);
  return ep;
}

/** The host plan `evaluateFrame` uses for a shot (same cached object), for the sound layer. */
export function hostPlanForShot(shotPlan) {
  return getCachedEvalPlan(shotPlan, resolveStyle(shotPlan.style ?? shotPlan.theme).name, Math.max(0.1, shotPlan.durationSec));
}

export const isHostLayout = (layout) => layout === 'host-left' || layout === 'stage';

const lerpBox = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
});

function matchSharedElements(prevElems, nextElems) {
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const pairs = [];
  const usedPrev = new Set();
  nextElems.forEach((ne, ni) => {
    const key = norm(ne.label);
    if (!key) return;
    const pi = prevElems.findIndex((pe, idx) => !usedPrev.has(idx) && norm(pe.label) === key);
    if (pi >= 0) {
      usedPrev.add(pi);
      pairs.push({ prevIndex: pi, nextIndex: ni });
    }
  });
  return pairs;
}

/**
 * Builds self-contained per-shot plans with chained host continuity and transition metadata.
 * Every shot plan carries only its own data plus `prevShot` summary (no absolute frame numbers).
 */
export function buildShotPlans(project, timeline, manifest, { frame = frameFor(project.settings?.ratio) } = {}) {
  const theme = project.settings?.theme ?? 'light';
  const hasWorld = Boolean(project.world);
  const style = resolveStyle(project.world?.style ?? theme).name;
  const defaultScene = project.world?.scene ?? 'blank';
  const customProps = project.world?.custom_props ?? [];
  const outfit = project.settings?.outfit ?? 'none';
  let lastHostEnd = { x: frame.hostHome, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none', autoSnaps: 0 };
  let prevPlan = null;
  const plans = [];

  for (let i = 0; i < project.shots.length; i += 1) {
    const shot = project.shots[i];
    const tl = timeline.shots[i];
    const cues = resolveCueTiming(tl, shot.cues ?? []);
    const isStage = shot.layout === 'stage';
    const isHost = isHostLayout(shot.layout);
    const scene = isStage ? (shot.scene ?? defaultScene) : null;
    const reenteringFromFull = prevPlan?.shot.layout === 'full';
    const stageLayout = isStage
      ? layoutStage(shot.visual.data, {
          hostAt: shot.host?.at,
          prevHostX: reenteringFromFull ? frame.hostHome : lastHostEnd.x,
          customProps,
          hostHeight: manifest.height_px,
          frame,
        })
      : null;
    const elements = isStage ? stageLayout.elements : layoutElements(shot.visual, shot.layout, null, frame);
    const startState = isHost
      ? {
          x: isStage ? stageLayout.hostX : (reenteringFromFull ? frame.hostHome : lastHostEnd.x),
          view: reenteringFromFull ? 'three_quarter' : lastHostEnd.view,
          facing: reenteringFromFull ? 1 : lastHostEnd.facing,
          gesture: shot.host?.gesture ?? lastHostEnd.gesture,
          expr: shot.host?.expr ?? lastHostEnd.expr,
          prop: lastHostEnd.prop,
          autoSnaps: lastHostEnd.autoSnaps ?? 0,
        }
      : null;

    // If the host wandered away from the left column in the previous host-left shot, smoothly walk back
    // to x=320 at the start of the new host-left shot so she never lingers underneath the right-side diagram/title.
    if (
      shot.layout === 'host-left'
      && prevPlan?.shot.layout === 'host-left'
      && Math.abs(startState.x - frame.hostHome) > 80
      && !cues.some((c) => c.do === 'move' && c.timeMs <= 500)
    ) {
      cues.unshift({ sentence: shot.sentences[0], do: 'move', target: 'left', timeMs: 0, source: 'auto_return' });
    }

    let transition = { kind: 'cut', durationSec: 0, layoutSwitch: null, shared: [] };
    if (i > 0 && shot.transition !== 'cut' && prevPlan) {
      const shared = matchSharedElements(prevPlan.elements, elements);
      const layoutSwitch = prevPlan.shot.layout !== shot.layout
        ? `${prevPlan.shot.layout}->${shot.layout}`
        : null;
      const bothHost = isHostLayout(prevPlan.shot.layout) && isHostLayout(shot.layout);
      if (shared.length > 0 || bothHost || layoutSwitch) {
        const enterHost = layoutSwitch === 'full->host-left' || layoutSwitch === 'full->stage';
        transition = {
          kind: 'morph',
          durationSec: enterHost ? 0.6 : 0.4,
          layoutSwitch,
          shared,
        };
      } else {
        transition = { kind: 'crossfade', durationSec: 0.4, layoutSwitch: null, shared: [] };
      }
    }

    const S = frame.subtitle;
    const keywords = captionKeywords(project, shot);
    const relSentences = tl.sentenceRanges.map((r) => ({
      ...r,
      startMs: r.startMs - tl.startMs,
      endMs: r.endMs - tl.startMs,
      // Caption pages and when each shows, from the sentence start (字幕与转场设计 §4.4)
      captions: captionPages(r, { maxChars: S.maxChars, maxLines: S.maxLines, keywords }),
    }));

    const plan = {
      index: i,
      id: shot.id,
      shot,
      frame,
      hasWorld,
      theme,
      style,
      scene,
      customProps,
      stageLayout,
      outfit,
      durationSec: tl.durationSec,
      frameCount: tl.frameCount,
      audioHashes: tl.sentenceRanges.map((r) => r.sha256 ?? r.key),
      sentences: relSentences,
      cues,
      elements,
      startState,
      transition,
      prevShot: prevPlan ? {
        id: prevPlan.id,
        shot: prevPlan.shot,
        frame: prevPlan.frame,
        hasWorld: prevPlan.hasWorld,
        style: prevPlan.style,
        scene: prevPlan.scene,
        customProps: prevPlan.customProps,
        stageLayout: prevPlan.stageLayout,
        elements: prevPlan.elements,
        endHostState: prevPlan.endHostState,
        endHostMeta: prevPlan.endHostMeta ?? null,
        durationSec: prevPlan.durationSec,
        cues: prevPlan.cues,
      } : null,
    };

    if (isHost) {
      const hostPlan = {
        seed: shot.id,
        theme,
        style,
        outfit,
        ground: frame.ground,
        frame,
        durationSec: tl.durationSec,
        startState,
        cues,
        elements,
        sentences: relSentences,
      };
      const endEval = evaluateHostAt(manifest, hostPlan, tl.durationSec);
      if (isStage) placeLinkLabels(stageLayout, manifest, hostPlan, [startState.x, endEval.endState.x], frame);
      plan.endHostState = endEval.endState;
      plan.endHostMeta = endEval;
      lastHostEnd = endEval.endState;
    } else {
      plan.endHostState = lastHostEnd;
      plan.endHostMeta = null;
    }

    plans.push(plan);
    prevPlan = plan;
  }

  return plans;
}

/**
 * Moves each stage link label along its curve so it clears every spot the host stands or walks through in this shot
 * (body half-width 70 px, one body height above the ground). Stored as stageLayout.links[i].labelT.
 */
function placeLinkLabels(stageLayout, manifest, hostPlan, extraXs, frame) {
  const labelled = stageLayout.links.filter((lnk) => lnk.label && lnk.from !== lnk.to);
  if (!labelled.length) return;
  const ev = hostEventTimeline(manifest, hostPlan);
  const xs = [...extraXs, ...ev.walks.flatMap((w) => [w.fromX, w.toX]), ...ev.interactions.map((it) => it.x)];
  const span = { x0: Math.min(...xs) - 70, x1: Math.max(...xs) + 70, y0: frame.ground - manifest.height_px, y1: frame.ground };
  for (const lnk of labelled) {
    const m = linkControlPoint(lnk.fromPt[0], lnk.fromPt[1], lnk.toPt[0], lnk.toPt[1]);
    const { w } = textBox({ text: lnk.label, fontSize: 30, x: 0, y: 0 });
    lnk.labelT = chooseLinkLabelT({ p1: lnk.fromPt, m, p2: lnk.toPt }, { w, h: 34 }, span);
  }
}

/** Deterministic cache key for one shot — intentionally excludes absolute frame offsets (出片质量设计 §4.1). */
/** Whether any visible stage link label in `textItems` overlaps the host's body box (QA LINK_LABEL_OVER_HOST). */
export function linkLabelsOverHost(textItems, hb) {
  return textItems.some((it) => {
    if (!it.key?.startsWith('stage-link-') || (it.opacity ?? 1) <= 0.02) return false;
    const b = textBox(it);
    return b.x < hb.x + hb.w && b.x + b.w > hb.x && b.y < hb.y + hb.h && b.y + b.h > hb.y;
  });
}

const labelTs = (shotPlan) => (shotPlan.stageLayout?.links ?? []).map((lnk) => lnk.labelT ?? 0.5);

export function shotCacheKey(shotPlan, { fps = 60, width = 1920, height = 1080, motionBlur = false, rigVersion = 2 } = {}) {
  return createHash('sha256').update(JSON.stringify({
    v: SCENE_VERSION,
    rigVersion,
    shot: shotPlan.shot,
    durationSec: Number(shotPlan.durationSec.toFixed(4)),
    frameCount: shotPlan.frameCount,
    hasWorld: Boolean(shotPlan.hasWorld),
    theme: shotPlan.theme,
    style: shotPlan.style,
    scene: shotPlan.scene ?? null,
    customProps: shotPlan.customProps ?? [],
    outfit: shotPlan.outfit ?? 'none',
    audioHashes: shotPlan.audioHashes,
    captions: shotPlan.sentences.map((s) => s.captions),
    startState: shotPlan.startState,
    transition: shotPlan.transition,
    prevShot: shotPlan.prevShot ? {
      shot: shotPlan.prevShot.shot,
      endHostState: shotPlan.prevShot.endHostState,
    } : null,
    fps,
    width,
    height,
    motionBlur,
    ...(shotPlan.frame && shotPlan.frame.ratio !== '16:9' ? { ratio: shotPlan.frame.ratio } : {}),
    ...(shotPlan.draft ? { draft: true } : {}),
    ...(labelTs(shotPlan).some((t) => t !== 0.5) ? { labelTs: labelTs(shotPlan) } : {}),
  })).digest('hex').slice(0, 16);
}

function buildElementStates(shotPlan, t, tapFocusIdx, tapImpact) {
  const revealed = new Map();
  const focusChanges = [];
  for (const c of shotPlan.cues) {
    if (c.do === 'reveal' && Number.isInteger(c.target)) {
      if (!revealed.has(c.target)) revealed.set(c.target, c.timeMs / 1000);
      focusChanges.push({ do: 'reveal', target: c.target, t: c.timeMs / 1000 });
    }
    if (c.do === 'highlight' && Number.isInteger(c.target)) {
      focusChanges.push({ do: 'highlight', target: c.target, t: c.timeMs / 1000 });
    }
  }
  focusChanges.sort((a, b) => a.t - b.t);
  let fastMotion = false;
  const states = shotPlan.elements.map((_, i) => {
    let opacity = 1;
    let scale = 1;
    let dy = 0;
    let arrowProgress = 1;
    if (revealed.has(i)) {
      const start = revealed.get(i);
      const dt = t - start;
      if (dt < 0) {
        opacity = 0;
        arrowProgress = 0;
      } else if (dt < 0.35) {
        const u = easeOutCubic(dt / 0.35);
        opacity = u;
        dy = lerp(24, 0, u);
        scale = lerp(0.96, 1, u);
        arrowProgress = easeInOutCubic(clamp01(dt / 0.4));
        fastMotion = true;
      } else if (dt < 0.4) {
        arrowProgress = easeInOutCubic(dt / 0.4);
      }
    }
    let highlight = 0;
    const lastHl = focusChanges.filter((e) => e.do === 'highlight' && e.target === i && e.t <= t).at(-1);
    if (lastHl) {
      const nextFocus = focusChanges.find((e) => e.t > lastHl.t && e.target !== i);
      if (!nextFocus || t < nextFocus.t) {
        const dt = t - lastHl.t;
        highlight = dt < 0.25 ? easeOutBack(dt / 0.25) : 1;
      } else if (t - nextFocus.t < 0.25) {
        highlight = 1 - easeOutCubic((t - nextFocus.t) / 0.25);
      }
    }
    const tapShake = tapFocusIdx === i ? tapImpact : 0;
    return { opacity, scale, dy, highlight, arrowProgress, tapShake };
  });
  return { states, fastMotion };
}

// The caption page on screen at shot time t (字幕与转场设计 §4.4) and the cue.at keyword in effect.
function captionAt(shotPlan, t) {
  const ms = t * 1000;
  const sent = shotPlan.sentences.find((s) => ms >= s.startMs && ms <= s.endMs + 120);
  if (!sent?.captions?.length) return null;
  const page = sent.captions.findLast((pg) => ms - sent.startMs >= pg.startMs) ?? sent.captions[0];
  const activeAnchor = shotPlan.cues
    .filter((c) => c.sentence === sent.index && c.at && ms >= c.anchorMs - 50)
    .at(-1)?.at;
  return { sent, lines: page.lines, activeAnchor };
}

function subtitleAt(shotPlan, t, pal) {
  const cap = captionAt(shotPlan, t);
  if (!cap) return null;
  const { sent, activeAnchor } = cap;
  const display = cap.lines[0];
  return {
    key: `sub-${sent.key}-${display}-${activeAnchor ?? ''}`,
    text: display,
    highlightWord: activeAnchor && display.includes(activeAnchor) ? activeAnchor : null,
    x: (shotPlan.frame ?? LANDSCAPE).subtitle.x,
    y: (shotPlan.frame ?? LANDSCAPE).subtitle.y,
    fontSize: (shotPlan.frame ?? LANDSCAPE).subtitle.fontSize, // >= 40 px clarity requirement (超越路线图 §5.2)
    color: pal.ink,
    highlightColor: pal.teal,
    stroke: pal.paper,
    align: 'middle',
    weight: 'bold',
    opacity: 1,
  };
}

/** Subtitle text items for one moment: the landscape single line, or a portrait page of up to two lines. */
function subtitleItems(shotPlan, t, pal) {
  const frame = shotPlan.frame ?? LANDSCAPE;
  if (!isPortrait(frame)) {
    const sub = subtitleAt(shotPlan, t, pal);
    return sub ? [sub] : [];
  }
  const cap = captionAt(shotPlan, t);
  if (!cap) return [];
  const { sent, lines: page, activeAnchor } = cap;
  const S = frame.subtitle;
  const y0 = S.y - ((page.length - 1) * S.lineHeight) / 2;
  return page.map((line, i) => ({
    key: `sub-${sent.key}-${i}-${line}-${activeAnchor ?? ''}`,
    text: line,
    highlightWord: activeAnchor && line.includes(activeAnchor) ? activeAnchor : null,
    x: S.x,
    y: y0 + i * S.lineHeight,
    fontSize: S.fontSize,
    color: pal.ink,
    highlightColor: pal.teal,
    stroke: pal.paper,
    align: 'middle',
    weight: 'bold',
    opacity: 1,
  }));
}

function renderPrevLayer(shotPlan, prevStates, fadeOut, headingOpacity = fadeOut) {
  const prev = shotPlan.prevShot;
  const frame = shotPlan.frame ?? LANDSCAPE;
  const { objectStates: prevObjStates } = evaluateStageObjects(prev, prev.durationSec, prev.endHostMeta ?? null);
  const mergedPrevStates = prevStates.map((st, pi) => {
    const obj = prevObjStates[pi];
    return obj ? { ...obj, ...st, inFront: false } : st;
  });
  const res = prev.shot.layout === 'stage'
    ? renderStage(prev.shot.visual, {
        style: shotPlan.style ?? 'paper',
        seed: prev.id,
        t: prev.durationSec,
        duration: prev.durationSec,
        elementStates: mergedPrevStates,
        headingOpacity,
        customProps: prev.customProps ?? shotPlan.customProps ?? [],
        layoutResult: prev.stageLayout,
        frame,
      })
    : renderDiagram(prev.shot.visual, {
        layout: prev.shot.layout,
        theme: shotPlan.theme,
        style: (prev.hasWorld ?? shotPlan.hasWorld) ? shotPlan.style : undefined,
        seed: prev.id,
        t: prev.durationSec,
        duration: prev.durationSec,
        elementStates: mergedPrevStates,
        customProps: prev.customProps ?? shotPlan.customProps ?? [],
        frame,
      });
  return {
    vectorSvg: res.vectorSvg,
    textItems: res.textItems.filter((ti) => (ti.opacity ?? 1) > 0.02),
  };
}

/**
 * Evaluates a single frame at continuous time `t` (in seconds relative to shot start).
 * Returns `{ vectorSvg, textItems, isFastMotion, hostMeta }` ready for layered resvg rendering.
 */
// 未审核初稿 corner badge: a paper plate with bold red text, outside the camera push so it never moves.
const BADGE_TEXT = '未审核初稿';
function draftBadge(frame, pal) {
  const { x, y } = frame.draftBadge;
  const fontSize = 30;
  const w = [...BADGE_TEXT].length * fontSize + 28;
  const h = fontSize + 20;
  return {
    svg: `<rect data-badge="draft" x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${pal.paper}" fill-opacity="0.8" stroke="${pal.red}" stroke-width="2" opacity="0.9"/>`,
    text: { key: 'draft-badge', text: BADGE_TEXT, x: x + 14, y: y + h / 2, fontSize, color: pal.red, stroke: pal.paper, align: 'start', weight: 'bold', opacity: 0.9 },
  };
}

export function evaluateFrame(manifest, shotPlan, t, audioFrame = { open: 0, width: 0.5, nod: 0 }) {
  const frame = shotPlan.frame ?? LANDSCAPE;
  const [cx, cy] = frame.center;
  const resolvedStyle = resolveStyle(shotPlan.style ?? shotPlan.theme);
  const styleName = resolvedStyle.name;
  const pal = resolvedStyle.palette;
  const duration = Math.max(0.1, shotPlan.durationSec);
  const tr = shotPlan.transition;
  const inTr = tr.kind !== 'cut' && t < tr.durationSec && shotPlan.prevShot;
  const trU = inTr ? clamp01(t / tr.durationSec) : 1;

  // Camera gentle slow push 1.00 -> 1.03 with background parallax
  const camScale = lerp(1, 1.03, easeInOutSine(clamp01(t / duration)));
  const bgParallax = [(camScale - 1) * -420, (camScale - 1) * -220];

  // Host evaluation
  let hostSvg = '';
  let hostMeta = null;
  let isFastMotion = false;

  if (isHostLayout(shotPlan.shot.layout)) {
    const evalPlan = getCachedEvalPlan(shotPlan, styleName, duration);
    const hostState = evaluateHostAt(manifest, evalPlan, t, audioFrame);
    hostMeta = hostState;
    if (inTr && (tr.layoutSwitch === 'full->host-left' || tr.layoutSwitch === 'full->stage')) {
      // Trot in from left edge during [0, 0.6s]
      const u = easeOutCubic(trU);
      const enterX = lerp(-120, hostState.x, u);
      const wf = walkFrame(manifest, t * 2, { x: enterX, ground: frame.ground, facing: 1, trot: true });
      hostSvg = drawHost(manifest, {
        ...hostState,
        x: enterX,
        facing: 1,
        view: 'side',
        angles: wf.angles,
        lift: wf.lift,
      });
      isFastMotion = true;
    } else {
      hostSvg = drawHost(manifest, hostState);
      if (hostState.isFastMotion) isFastMotion = true;
    }
  } else if (inTr && (tr.layoutSwitch === 'host-left->full' || tr.layoutSwitch === 'stage->full') && shotPlan.prevShot?.endHostState) {
    // Trot out off the left edge during [0, 0.4s]
    const prevHost = shotPlan.prevShot.endHostState;
    const u = easeInOutCubic(trU);
    const exitX = lerp(prevHost.x, -140, u);
    const wf = walkFrame(manifest, t * 2, { x: exitX, ground: frame.ground, facing: -1, trot: true });
    hostSvg = drawHost(manifest, {
      gesture: 'idle',
      expr: prevHost.expr ?? 'explaining',
      prop: prevHost.prop ?? 'none',
      view: 'side',
      facing: -1,
      x: exitX,
      ground: frame.ground,
      theme: shotPlan.theme,
      style: styleName,
      outfit: shotPlan.outfit,
      seed: shotPlan.prevShot.id,
      angles: wf.angles,
      lift: wf.lift,
    });
    isFastMotion = true;
  }

  // Diagram zone interpolation during layout switch (only between host-left and full)
  let zoneOverride = null;
  if (inTr && tr.layoutSwitch) {
    const zFrom = frame.zones[shotPlan.prevShot.shot.layout];
    const zTo = frame.zones[shotPlan.shot.layout];
    if (zFrom && zTo) zoneOverride = lerpBox(zFrom, zTo, easeInOutCubic(trU));
    isFastMotion = true;
  }

  // Element states with reveal / highlight / tap shake + stage/diagram interactions & morph overrides
  const camScaleStr = camScale.toFixed(4);
  const camZoom = Number(camScaleStr);
  const unscalePt = (pt) => (Array.isArray(pt) ? [cx + (pt[0] - cx) / camZoom, cy + (pt[1] - cy) / camZoom] : pt);
  // Inverse-scale live hand coords so frontVectorSvg inside camOpen tracks unscaled hostSvg l_hand pixel-tight
  const objHostMeta = hostMeta?.interaction
    ? {
        ...hostMeta,
        interaction: {
          ...hostMeta.interaction,
          handPos: unscalePt(hostMeta.interaction.handPos),
          carriedPos: unscalePt(hostMeta.interaction.carriedPos),
        },
      }
    : hostMeta;
  const { objectStates, sends, fastMotion: objFast } = evaluateStageObjects(shotPlan, t, objHostMeta);
  if (objFast) isFastMotion = true;

  const { states: revealStates, fastMotion: revealFast } = buildElementStates(shotPlan, t, hostMeta?.focusIdx ?? null, hostMeta?.tapImpact ?? 0);
  if (revealFast) isFastMotion = true;

  const states = revealStates.map((st, i) => {
    const obj = objectStates[i];
    if (!obj) return st;
    return {
      ...st,
      ...obj,
      dy: (st.dy ?? 0) + (obj.dy ?? 0),
    };
  });

  let prevDiagSvg = '';
  const prevTextItems = [];
  let headingOpacity = 1;

  let exitOp = 1;
  let enterOp = 1;
  if (inTr) {
    // 先退后进 (字幕与转场设计 §5.2): old-only content leaves in the first 45%, new-only content enters in the rest,
    // shared elements move from their old box to the new one over the whole transition.
    exitOp = 1 - easeInOutCubic(clamp01(trU / EXIT_SHARE));
    enterOp = easeOutCubic(clamp01((trU - EXIT_SHARE) / (1 - EXIT_SHARE)));
    const sharedByNext = new Map(tr.shared.map((s) => [s.nextIndex, s.prevIndex]));
    const sharedPrev = new Set(tr.shared.map((s) => s.prevIndex));
    const move = easeInOutCubic(trU);
    // A stage heading both shots share stays put: only the new one is drawn, at full opacity.
    const heading = (pl) => (pl.shot.layout === 'stage' ? pl.shot.visual?.data?.heading : undefined);
    const keepHeading = heading(shotPlan) !== undefined && heading(shotPlan) === heading(shotPlan.prevShot);
    headingOpacity = keepHeading ? 1 : enterOp;
    states.forEach((st, ni) => {
      if (sharedByNext.has(ni)) {
        st.overrideBbox = lerpBox(shotPlan.prevShot.elements[sharedByNext.get(ni)].bbox, shotPlan.elements[ni].bbox, move);
      } else {
        st.opacity *= enterOp;
        st.scale = (st.scale ?? 1) * lerp(0.96, 1, enterOp);
      }
    });
    if (exitOp > 0.005) {
      const prevStates = shotPlan.prevShot.elements.map((_, pi) => ({
        opacity: sharedPrev.has(pi) ? 0 : exitOp,
        scale: lerp(0.96, 1, exitOp),
      }));
      const prevRes = renderPrevLayer(shotPlan, prevStates, exitOp, keepHeading ? 0 : exitOp);
      prevDiagSvg = prevRes.vectorSvg;
      prevTextItems.push(...prevRes.textItems);
    }
    isFastMotion = true;
  }

  const isStage = shotPlan.shot.layout === 'stage';
  // The scene follows the content: a new scene enters with it, the old one leaves with it; the same scene stays.
  const prevStage = inTr && shotPlan.prevShot.shot.layout === 'stage';
  const sameScene = isStage && prevStage && shotPlan.prevShot.scene === shotPlan.scene;
  const sceneBg = (prevStage && !sameScene ? fadeLayer(getCachedSceneBg(shotPlan.prevShot.scene ?? 'blank', styleName, shotPlan.prevShot.id, frame), exitOp) : '')
    + (isStage ? fadeLayer(getCachedSceneBg(shotPlan.scene ?? 'blank', styleName, shotPlan.id, frame), sameScene ? 1 : enterOp) : '');
  const diag = isStage
    ? renderStage(shotPlan.shot.visual, {
        style: styleName,
        seed: shotPlan.id,
        t,
        duration,
        elementStates: states,
        sends,
        headingOpacity,
        customProps: shotPlan.customProps ?? [],
        layoutResult: shotPlan.stageLayout,
        frame,
      })
    : renderDiagram(shotPlan.shot.visual, {
        layout: shotPlan.shot.layout,
        theme: shotPlan.theme,
        style: shotPlan.hasWorld ? styleName : undefined,
        seed: shotPlan.id,
        t,
        duration,
        elementStates: states,
        sends,
        customProps: shotPlan.customProps ?? [],
        zoneOverride,
        frame,
      });

  // Camera transform around center (960, 540) for scene and diagram/stage layers
  const camOpen = `<g transform="translate(${cx} ${cy}) scale(${camScaleStr}) translate(${-cx} ${-cy})">`;
  const backLayer = isStage ? diag.backVectorSvg : diag.vectorSvg;
  const frontLayer = isStage && diag.frontVectorSvg ? `${camOpen}${diag.frontVectorSvg}</g>` : '';
  const badge = shotPlan.draft ? draftBadge(frame, pal) : null;
  const vectorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`
    + styleBackgroundSvg(styleName, frame.width, frame.height, bgParallax)
    + camOpen + sceneBg + prevDiagSvg + backLayer + '</g>'
    + hostSvg
    + frontLayer
    + (badge?.svg ?? '')
    + '</svg>';

  // Apply gentle camera scale to diagram/stage text items (not subtitle)
  const scaledText = [...prevTextItems, ...diag.textItems].map((ti) => ({
    ...ti,
    x: cx + (ti.x - cx) * camScale,
    y: cy + (ti.y - cy) * camScale,
  }));
  scaledText.push(...subtitleItems(shotPlan, t, pal));
  if (badge) scaledText.push(badge.text);

  const objectBoxes = isStage
    ? shotPlan.elements.map((el, i) => {
        const st = states[i];
        if (!st || (st.opacity ?? 1) <= 0.005 || st.inFront) return null;
        const b = st.overrideBbox ?? el.bbox;
        return { x: b.x + (st.dx ?? 0), y: b.y + (st.dy ?? 0), w: b.w, h: b.h };
      })
    : null;

  return { vectorSvg, textItems: scaledText, isFastMotion, hostMeta, objectBoxes };
}

/** Portrait-only layout problems (竖屏设计 §7.1): crowded stages and text leaving the safe box on sampled frames. */
export function portraitLayoutIssues(manifest, plans, { fps = 60, step = 6 } = {}) {
  const issues = [];
  for (const plan of plans) {
    const frame = plan.frame ?? LANDSCAPE;
    if (!isPortrait(frame)) continue;
    if (plan.stageLayout?.crowded) {
      issues.push({ code: 'STAGE_CROWDED', shotId: plan.id, message: `竖屏镜头 ${plan.id} 的同台物件缩到 0.6 倍仍排不下；减少物件或拆成两个镜头` });
    }
    let frames = 0;
    const keys = new Set();
    for (let f = 0; f < plan.frameCount; f += step) {
      const items = evaluateFrame(manifest, plan, f / fps).textItems.filter((it) => it.key !== 'draft-badge');
      const out = textOutsideSafe(items, frame);
      if (out.length) {
        frames += 1;
        out.forEach((k) => keys.add(k));
      }
    }
    if (frames) {
      const list = [...keys];
      issues.push({ code: 'SAFE_ZONE_TEXT', shotId: plan.id, frames, keys: list.slice(0, 5), message: `竖屏镜头 ${plan.id} 有 ${frames} 个抽样帧的文字超出安全框（${list.slice(0, 3).join('、')}）` });
    }
  }
  return issues;
}
