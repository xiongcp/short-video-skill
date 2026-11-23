// One timebase for every stage: 30 fps, 48 kHz, 1,600 samples per frame. Shared boundaries round to the nearest frame
// ((sample + 800) // 1600: 2,399 → 1, 2,400 → 2); the program end rounds up so the last real sample is covered.
export const RATE = 48000, FPS = 30, SAMPLES_PER_FRAME = RATE / FPS;
export const toFrame = (sample: number) => Math.floor((sample + SAMPLES_PER_FRAME / 2) / SAMPLES_PER_FRAME);
export const totalFrames = (samples: number) => Math.floor((samples + SAMPLES_PER_FRAME - 1) / SAMPLES_PER_FRAME);
