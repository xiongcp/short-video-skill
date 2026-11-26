// Continuous-time scene evaluator, shot-to-shot continuity, same-element morph transitions,
// layout-switch trot in/out, camera push + parallax, and frame-number-free shot cache keys
// (出片质量设计 §4.1, §7.1-7.2, 火柴人主持人设计 §7.4-7.5, 超越路线图 §5.3).
import { createHash } from 'node:crypto';
import { clamp01, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp } from './ease.mjs';
import { evaluateHostAt, walkFrame } from './motion.mjs';
import { drawHost } from './rig.mjs';
import { DIAGRAM_ZONES, layoutElements, paperBackgroundSvg, renderDiagram, THEME_PALETTE } from './templates.mjs';
import { resolveCueTiming, splitClauses } from './timing.mjs';

export const SCENE_VERSION = 2;

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
export function buildShotPlans(project, timeline, manifest) {
  const theme = project.settings?.theme ?? 'light';
  const outfit = project.settings?.outfit ?? 'none';
  let lastHostEnd = { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
  let prevPlan = null;
  const plans = [];

  for (let i = 0; i < project.shots.length; i += 1) {
    const shot = project.shots[i];
    const tl = timeline.shots[i];
    const cues = resolveCueTiming(tl, shot.cues ?? []);
    const elements = layoutElements(shot.visual, shot.layout);
    const reenteringFromFull = prevPlan?.shot.layout === 'full';
    const startState = shot.layout === 'host-left'
      ? {
          x: reenteringFromFull ? 320 : lastHostEnd.x,
          view: reenteringFromFull ? 'three_quarter' : lastHostEnd.view,
          facing: reenteringFromFull ? 1 : lastHostEnd.facing,
          gesture: shot.host?.gesture ?? lastHostEnd.gesture,
          expr: shot.host?.expr ?? lastHostEnd.expr,
          prop: lastHostEnd.prop,
        }
      : null;

    // If the host wandered away from the left column in the previous host-left shot, smoothly walk back
    // to x=320 at the start of the new shot so she never lingers underneath the right-side diagram/title.
    if (
      shot.layout === 'host-left'
      && prevPlan?.shot.layout === 'host-left'
      && Math.abs(startState.x - 320) > 80
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
      const bothHost = prevPlan.shot.layout === 'host-left' && shot.layout === 'host-left';
      if (shared.length > 0 || bothHost || layoutSwitch) {
        transition = {
          kind: 'morph',
          durationSec: layoutSwitch === 'full->host-left' ? 0.6 : 0.4,
          layoutSwitch,
          shared,
        };
      } else {
        transition = { kind: 'crossfade', durationSec: 0.3, layoutSwitch: null, shared: [] };
      }
    }

    const relSentences = tl.sentenceRanges.map((r) => ({
      ...r,
      startMs: r.startMs - tl.startMs,
      endMs: r.endMs - tl.startMs,
    }));

    const plan = {
      index: i,
      id: shot.id,
      shot,
      theme,
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
        elements: prevPlan.elements,
        endHostState: prevPlan.endHostState,
        durationSec: prevPlan.durationSec,
        cues: prevPlan.cues,
      } : null,
    };

    if (shot.layout === 'host-left') {
      const endEval = evaluateHostAt(manifest, {
        seed: shot.id,
        theme,
        outfit,
        durationSec: tl.durationSec,
        startState,
        cues,
        elements,
        sentences: relSentences,
      }, tl.durationSec);
      plan.endHostState = endEval.endState;
      lastHostEnd = endEval.endState;
    } else {
      plan.endHostState = lastHostEnd;
    }

    plans.push(plan);
    prevPlan = plan;
  }

  return plans;
}

/** Deterministic cache key for one shot — intentionally excludes absolute frame offsets (出片质量设计 §4.1). */
export function shotCacheKey(shotPlan, { fps = 60, width = 1920, height = 1080, motionBlur = false, rigVersion = 2 } = {}) {
  return createHash('sha256').update(JSON.stringify({
    v: SCENE_VERSION,
    rigVersion,
    shot: shotPlan.shot,
    durationSec: Number(shotPlan.durationSec.toFixed(4)),
    frameCount: shotPlan.frameCount,
    theme: shotPlan.theme,
    outfit: shotPlan.outfit ?? 'none',
    audioHashes: shotPlan.audioHashes,
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
  })).digest('hex').slice(0, 16);
}

function buildElementStates(shotPlan, t, tapFocusIdx, tapImpact) {
  const revealed = new Map();
  const highlighted = new Map();
  for (const c of shotPlan.cues) {
    if (c.do === 'reveal' && Number.isInteger(c.target)) {
      if (!revealed.has(c.target)) revealed.set(c.target, c.timeMs / 1000);
    }
    if (c.do === 'highlight' && Number.isInteger(c.target)) {
      highlighted.set(c.target, c.timeMs / 1000);
    }
  }
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
    if (highlighted.has(i)) {
      const dt = t - highlighted.get(i);
      if (dt >= 0) highlight = dt < 0.25 ? easeOutBack(dt / 0.25) : 1;
    }
    const tapShake = tapFocusIdx === i ? tapImpact : 0;
    return { opacity, scale, dy, highlight, arrowProgress, tapShake };
  });
  return { states, fastMotion };
}

function subtitleAt(shotPlan, t, pal) {
  const ms = t * 1000;
  const sent = shotPlan.sentences.find((s) => ms >= s.startMs && ms <= s.endMs + 120);
  if (!sent || !sent.text) return null;
  // Find active cue.at keyword for this sentence to color-highlight in sync with diagram
  const activeAnchor = shotPlan.cues
    .filter((c) => c.sentence === sent.index && c.at && ms >= c.anchorMs - 50)
    .at(-1)?.at;
  let display = sent.text;
  // Split into natural breath clauses synced proportionally to the sentence's spoken window
  const parts = splitClauses(display);
  if (parts.length > 1 && [...display].length > 12) {
    const totalChars = [...display].length;
    const sp0 = sent.startMs + (sent.speech?.[0] ?? 0);
    const sp1 = sent.startMs + (sent.speech?.[1] ?? (sent.endMs - sent.startMs));
    const frac = clamp01((ms - sp0) / Math.max(1, sp1 - sp0));
    let acc = 0;
    for (const p of parts) {
      const len = [...p].length;
      if (frac <= (acc + len) / totalChars || p === parts.at(-1)) {
        display = p.replace(/[，、；：,:;]$/, '');
        break;
      }
      acc += len;
    }
  }
  return {
    key: `sub-${sent.key}-${display}-${activeAnchor ?? ''}`,
    text: display,
    highlightWord: activeAnchor && display.includes(activeAnchor) ? activeAnchor : null,
    x: 960,
    y: 1012,
    fontSize: 44, // >= 40 px clarity requirement (超越路线图 §5.2)
    color: pal.ink,
    highlightColor: pal.teal,
    stroke: pal.paper,
    align: 'middle',
    weight: 'bold',
    opacity: 1,
  };
}

/**
 * Evaluates a single frame at continuous time `t` (in seconds relative to shot start).
 * Returns `{ vectorSvg, textItems, isFastMotion, hostMeta }` ready for layered resvg rendering.
 */
export function evaluateFrame(manifest, shotPlan, t, audioFrame = { open: 0, width: 0.5, nod: 0 }) {
  const pal = THEME_PALETTE[shotPlan.theme] ?? THEME_PALETTE.light;
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

  if (shotPlan.shot.layout === 'host-left') {
    const evalPlan = {
      seed: shotPlan.id,
      theme: shotPlan.theme,
      outfit: shotPlan.outfit,
      durationSec: duration,
      startState: shotPlan.startState,
      cues: shotPlan.cues,
      elements: shotPlan.elements,
      sentences: shotPlan.sentences,
    };
    const hostState = evaluateHostAt(manifest, evalPlan, t, audioFrame);
    hostMeta = hostState;
    if (inTr && tr.layoutSwitch === 'full->host-left') {
      // Trot in from left edge during [0, 0.6s]
      const u = easeOutCubic(trU);
      const enterX = lerp(-120, hostState.x, u);
      const wf = walkFrame(manifest, t * 2, { x: enterX, ground: 930, facing: 1, trot: true });
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
  } else if (inTr && tr.layoutSwitch === 'host-left->full' && shotPlan.prevShot?.endHostState) {
    // Trot out off the left edge during [0, 0.4s]
    const prevHost = shotPlan.prevShot.endHostState;
    const u = easeInOutCubic(trU);
    const exitX = lerp(prevHost.x, -140, u);
    const wf = walkFrame(manifest, t * 2, { x: exitX, ground: 930, facing: -1, trot: true });
    hostSvg = drawHost(manifest, {
      gesture: 'idle',
      expr: prevHost.expr ?? 'explaining',
      prop: prevHost.prop ?? 'none',
      view: 'side',
      facing: -1,
      x: exitX,
      ground: 930,
      theme: shotPlan.theme,
      outfit: shotPlan.outfit,
      seed: shotPlan.prevShot.id,
      angles: wf.angles,
      lift: wf.lift,
    });
    isFastMotion = true;
  }

  // Diagram zone interpolation during layout switch
  let zoneOverride = null;
  if (inTr && tr.layoutSwitch) {
    const zFrom = DIAGRAM_ZONES[shotPlan.prevShot.shot.layout];
    const zTo = DIAGRAM_ZONES[shotPlan.shot.layout];
    zoneOverride = lerpBox(zFrom, zTo, easeInOutCubic(trU));
    isFastMotion = true;
  }

  // Element states with reveal / highlight / tap shake + morph overrides
  const { states, fastMotion: revealFast } = buildElementStates(shotPlan, t, hostMeta?.focusIdx ?? null, hostMeta?.tapImpact ?? 0);
  if (revealFast) isFastMotion = true;

  let prevDiagSvg = '';
  const prevTextItems = [];

  if (inTr && tr.kind === 'morph') {
    const sharedByNext = new Map(tr.shared.map((s) => [s.nextIndex, s.prevIndex]));
    const sharedPrevSet = new Set(tr.shared.map((s) => s.prevIndex));
    const u = easeInOutCubic(trU);
    states.forEach((st, ni) => {
      if (sharedByNext.has(ni)) {
        const pi = sharedByNext.get(ni);
        st.overrideBbox = lerpBox(shotPlan.prevShot.elements[pi].bbox, shotPlan.elements[ni].bbox, u);
      } else {
        // New-only elements fade in during [0.15s, duration]
        const fade = clamp01((t - 0.15) / Math.max(0.1, tr.durationSec - 0.15));
        st.opacity *= fade;
      }
    });
    // Old-only elements shrink & fade out during [0, 0.2s]
    if (t < 0.2) {
      const fadeOut = 1 - easeOutCubic(t / 0.2);
      const prevStates = shotPlan.prevShot.elements.map((_, pi) => ({
        opacity: sharedPrevSet.has(pi) ? 0 : fadeOut,
        scale: lerp(0.92, 1, fadeOut),
      }));
      const prevRes = renderDiagram(shotPlan.prevShot.shot.visual, {
        layout: shotPlan.prevShot.shot.layout,
        theme: shotPlan.theme,
        seed: shotPlan.prevShot.id,
        t: shotPlan.prevShot.durationSec,
        duration: shotPlan.prevShot.durationSec,
        elementStates: prevStates,
      });
      prevDiagSvg = prevRes.vectorSvg;
      prevTextItems.push(...prevRes.textItems.filter((ti) => ti.opacity > 0.02));
    }
    isFastMotion = true;
  } else if (inTr && tr.kind === 'crossfade') {
    const u = easeInOutCubic(trU);
    states.forEach((st) => { st.opacity *= u; });
    const prevStates = shotPlan.prevShot.elements.map(() => ({ opacity: 1 - u }));
    const prevRes = renderDiagram(shotPlan.prevShot.shot.visual, {
      layout: shotPlan.prevShot.shot.layout,
      theme: shotPlan.theme,
      seed: shotPlan.prevShot.id,
      t: shotPlan.prevShot.durationSec,
      duration: shotPlan.prevShot.durationSec,
      elementStates: prevStates,
    });
    prevDiagSvg = prevRes.vectorSvg;
    prevTextItems.push(...prevRes.textItems.filter((ti) => ti.opacity > 0.02));
    isFastMotion = true;
  }

  const diag = renderDiagram(shotPlan.shot.visual, {
    layout: shotPlan.shot.layout,
    theme: shotPlan.theme,
    seed: shotPlan.id,
    t,
    duration,
    elementStates: states,
    zoneOverride,
  });

  // Camera transform around center (960, 540) for diagram layer
  const camOpen = `<g transform="translate(960 540) scale(${camScale.toFixed(4)}) translate(-960 -540)">`;
  const vectorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">`
    + paperBackgroundSvg(shotPlan.theme, 1920, 1080, bgParallax)
    + camOpen + prevDiagSvg + diag.vectorSvg + '</g>'
    + hostSvg
    + '</svg>';

  // Apply gentle camera scale to diagram text items (not subtitle)
  const scaledText = [...prevTextItems, ...diag.textItems].map((ti) => ({
    ...ti,
    x: 960 + (ti.x - 960) * camScale,
    y: 540 + (ti.y - 540) * camScale,
  }));
  const sub = subtitleAt(shotPlan, t, pal);
  if (sub) scaledText.push(sub);

  return { vectorSvg, textItems: scaledText, isFastMotion, hostMeta };
}
