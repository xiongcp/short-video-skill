// Five standard easing curves for L1 animation (出片质量设计 §7.1). Pure functions without dependencies.

export const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
export const lerp = (a, b, t) => a + (b - a) * t;

export const linear = (t) => clamp01(t);

export const easeOutCubic = (t) => {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
};

export const easeInOutCubic = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};

export const easeOutBack = (t) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * ((x - 1) ** 3) + c1 * ((x - 1) ** 2);
};

export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

export const CURVES = { linear, easeOutCubic, easeInOutCubic, easeOutBack, easeInOutSine };

export function ease(name, t) {
  const fn = CURVES[name];
  if (!fn) throw new Error(`unknown easing ${name}`);
  return fn(t);
}
