# V 声音人设实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每期可以选男声或女声：8 个 edge-tts 人设写进 `voice.preset`，出片前能试听，讲稿口吻跟着人设走。

**Architecture:** 人设表 `VOICE_PRESETS` 放在 `scripts/lib/project.mjs`，由测试保证它和 schema 的枚举一致；`check.mjs` 对不存在的人设报错，对不起作用的人设给提醒。`tts.mjs` 新增 `resolveVoice`，把人设解析成命令模板里的 `{voice}`、`{rate}`、`{pitch}`；没写人设时缓存键沿用旧公式，旧项目不重新合成。试听 `auditionVoices` 和正式配音走同一套合成与裁静音，入口是 `render.mjs --audition`，放在 L1 门槛之前，只需要 FFmpeg 和 edge-tts（或 uvx）。

**Tech Stack:** Node ≥ 20（ESM，`node --test`）、edge-tts（`edge-tts` 或 `uvx --from edge-tts edge-tts`）、FFmpeg；Ajv 只在测试里校验 schema。

**Spec:** [声音人设设计](声音人设设计.md)（展开 [个性化路线图](个性化路线图.md) §6.1）

## Global Constraints

- 不花钱：不接付费服务，不加 npm 依赖，skill 目录不加文件（现在 33 个文件，预算 45 个、5 MB）。
- 只做向后兼容的新增，`project.json` 的 `version` 仍为 1；旧项目照常渲染，已经合成好的配音缓存不失效。
- 8 个人设的 ID、音色和语速照抄设计 §3 的表；ID 和音色以后不改，语速只按 Task 7 的实测调整：`female-warm` 晓晓 0.96、`female-lively` 晓伊 0.96、`male-sunny` 云希 0.92、`male-passion` 云健 0.98、`male-pro` 云扬 0.92、`child-cute` 云夏 0.98、`female-dongbei` 晓北 1.02、`female-shaanxi` 晓妮 0.96。
- 默认女声晓晓（`female-warm`），男声默认云希（`male-sunny`）；人设不调音高，`voice.pitch` 只留给 owner 手动微调（整数，−20 到 20 Hz）。
- 试听只写 `out/audition/`，不改 `project.json`，也不动 `audio/`；只走 edge-tts，不改用 macOS `say`，不调用付费接口。
- `SKILL.md` 不超过 150 行，每份 reference 不超过 250 行；`SKILL.md` 和 `references/` 用中文；`README.md` 与 `README.en.md` 同步。
- 先写测试，看它失败，再写最少的实现；每个任务结束时 `npm test` 全部通过。
- 在分支 `lite/persona` 上提交，不提交到 `main`；不提交 `.DS_Store`。提交信息末尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 真正跑 agy 场景评测要花配额，跑之前先问 owner。
- 向 owner 汇报用中文。

## Review Focus

1. 手改 `project.json` 写出不存在的人设（例如 `male-deep`）却没跑自检就渲染：应该报错并点名这个人设，不能悄悄用晓晓合成整片。→ Task 2 的 `an unknown preset stops synthesis with its name instead of falling back to 晓晓`。
2. 升级前合成过配音的旧项目（没写 `preset`，或显式写了 `pitch: 0`）：缓存键和旧公式一致，不重新合成。→ Task 2 的 `without a preset or pitch the cache key is the one older projects stored`。
3. 把 `doctor.mjs` 推荐的配音照抄进已经选了人设的项目：人设照样生效，不被推荐里的音色和语速覆盖。→ Task 4 的 `doctor recommends edge-tts, then uvx, then say, then import`。
4. 先试听全部 8 个，再只试听一两个：`out/audition/` 里不留上一次的编号文件，也不删用户放进去的别的文件。→ Task 3 的 `a second, shorter audition leaves no clips from the first one and keeps other files`。
5. `--audition` 后面紧跟项目文件夹，或者人设拼错：文件夹不被当成人设列表；拼错的人设报错，而不是把它当成项目文件夹；原有的 `--preset`（编码预设）不受影响。→ Task 4 的 `render.mjs reads the word after --audition as a preset list only when it looks like one`。

## 文件一览

| 文件 | 改动 | 任务 |
| --- | --- | --- |
| `skills/topic-to-video/scripts/lib/project.mjs` | 新增 `VOICE_PRESETS`、`isEdgeVoiceCommand`、`lintVoice`；`SCHEMA_FIELDS.voice` 加两个字段；`checkProject` 报不存在的人设 | 1 |
| `skills/topic-to-video/schema/project.schema.json` | `$defs.voice` 加 `preset`、`pitch` | 1 |
| `skills/topic-to-video/scripts/check.mjs` | 提醒里加上 `lintVoice` | 1 |
| `skills/topic-to-video/scripts/lib/tts.mjs` | 新增 `pitchToEdge`、`resolveVoice`，导出 `sentenceHash`，命令模板支持 `{pitch}`；抽出 `trimSynthesized`；新增 `selectPresets`、`auditionCommand`、`auditionVoices` | 2、3 |
| `skills/topic-to-video/scripts/doctor.mjs` | 抽出 `recommendVoice`，edge-tts 推荐不再写 `voice`、`speed` | 4 |
| `skills/topic-to-video/scripts/render.mjs` | 导出 `parseArgs`，新增 `--audition` 和 `runAudition` | 4 |
| `SKILL.md`、`references/script.md`、`references/providers.md`（都在 `skills/topic-to-video/` 下） | 默认人设、人设表与口吻、`{pitch}`、试听 | 5 |
| `README.md`、`README.en.md`、`site/index.html` | 讲配音的那句 | 5 |
| `tests/voice.test.mjs` | 新建：人设解析、缓存键、试听、doctor 推荐、命令行 | 2、3、4 |
| `tests/project.test.mjs`、`tests/schema.test.mjs`、`tests/check-cli.test.mjs` | 人设表同步、自检 | 1 |
| `tests/references.test.mjs`、`tests/readme.test.mjs`、`tests/site.test.mjs` | 文档 | 5 |
| `tests/scenarios/07-male-voice.json`、`tests/scenario-specs.test.mjs` | 场景评测 07 | 6 |

Task 1–6 可以交给子 agent 逐个做；Task 7 要 owner 试听和拍板，由主会话来做。各任务写的行号都是开工前的行号；前面的任务改过同一个文件之后，按步骤里给出的原文找位置。

---

## 开工前：提交设计文档

- [ ] **Step 1: 把设计文档和本计划提交到 `lite/persona`**

先确认在 `lite/persona` 分支上（`git branch --show-current`），再提交：

```bash
git add AGENTS.md docs/lite/个性化路线图.md docs/lite/声音人设设计.md docs/lite/V声音人设实施计划.md
git commit -m "docs(lite): add personalization roadmap, voice preset design and V implementation plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: 人设表、schema 与自检

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/project.mjs`（`SCHEMA_FIELDS` 第 55 行；在 `SCHEMA_FIELDS` 之后加人设表；`checkProject` 第 113 行之后；`lintScript` 之后加 `lintVoice`）
- Modify: `skills/topic-to-video/schema/project.schema.json:76-84`
- Modify: `skills/topic-to-video/scripts/check.mjs:8,22`
- Test: `tests/project.test.mjs`、`tests/schema.test.mjs`、`tests/check-cli.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export const VOICE_PRESETS: Record<string, { voice: string, speed: number, name: string }>`，键的顺序就是设计 §3 表的顺序，也是 schema 枚举的顺序；`name` 是讲稿.md 和 script.md 里的叫法，例如 `女声·晓晓`。
  - `export function isEdgeVoiceCommand(command: unknown): boolean`：是字符串、含 `edge-tts`（或 `edge_tts`、`edgetts`）字样、并且带 `{voice}` 时为 true。
  - `export function lintVoice(project: object): { path: '/voice/preset', code: 'PRESET_UNUSED', message: string }[]`
  - `checkProject` 对不存在的人设报 `{ path: '/voice/preset', code: 'INVALID_VALUE' }`。

- [ ] **Step 1: 写失败的测试**

`tests/project.test.mjs` 第 5 行的 import 换成：

```js
import { checkProject, estimateReport, estimateSeconds, HOST_ID, isApproved, lintScript, lintVoice, SCHEMA_FIELDS, VISUAL_LIMITS, VOICE_PRESETS } from '../skills/topic-to-video/scripts/lib/project.mjs';
```

在文件末尾追加：

```js
test('VOICE_PRESETS matches the preset enum in the schema, with 晓晓 and 云希 as the female and male defaults', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/schema/project.schema.json'), 'utf8'));
  assert.deepEqual(Object.keys(VOICE_PRESETS), schema.$defs.voice.properties.preset.enum);
  assert.deepEqual(VOICE_PRESETS['female-warm'], { voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, name: '女声·晓晓' });
  assert.deepEqual(VOICE_PRESETS['male-sunny'], { voice: 'zh-CN-YunxiNeural', speed: 0.92, name: '男声·云希' });
});

test('reports an unknown voice preset', () => {
  const p = minimal();
  p.voice = { provider: 'undecided', preset: 'male-deep' };
  assert.deepEqual(placed(p), ['INVALID_VALUE /voice/preset']);
  assert.match(checkProject(p)[0].message, /male-deep.*female-warm/);
  p.voice = { provider: 'undecided', preset: 'male-sunny', pitch: -3 };
  assert.deepEqual(placed(p), []);
});

test('warns when the voice settings would ignore the preset', () => {
  const edge = 'edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}';
  const warned = (voice) => lintVoice({ ...minimal(), voice }).map((w) => `${w.code} ${w.path}`);
  for (const voice of [
    { provider: 'undecided' },
    { provider: 'undecided', preset: 'male-sunny' },
    { provider: 'command', preset: 'male-sunny', command: edge },
    { provider: 'command', preset: 'male-sunny', command: `uvx --from edge-tts ${edge}` },
    { provider: 'undecided', preset: 'male-deep' }, // already an INVALID_VALUE error, not also a warning
  ]) assert.deepEqual(warned(voice), [], JSON.stringify(voice));
  for (const voice of [
    { provider: 'command', preset: 'male-sunny', voice: 'zh-CN-YunjianNeural', command: edge },
    { provider: 'import', preset: 'male-sunny' },
    { provider: 'openai-compatible', preset: 'male-sunny', base_url: 'https://api.example.com/v1', model: 'm', voice: 'v', api_key_env: 'SVS_TTS_API_KEY' },
    { provider: 'command', preset: 'male-sunny', command: 'say -v Tingting -o {out} {text}' },
    { provider: 'command', preset: 'male-sunny', command: 'python3 my_tts.py --text {text} --out {out}' },
  ]) assert.deepEqual(warned(voice), ['PRESET_UNUSED /voice/preset'], JSON.stringify(voice));
});
```

`tests/schema.test.mjs`：在 `valid` 里加一项：

```js
  'a voice preset with a pitch tweak': (p) => { p.voice = { provider: 'undecided', preset: 'male-sunny', pitch: -3 }; },
```

在 `invalid` 里加三项：

```js
  'an unknown voice preset': (p) => { p.voice = { provider: 'undecided', preset: 'male-deep' }; },
  'a pitch past 20 Hz': (p) => { p.voice = { provider: 'undecided', pitch: 25 }; },
  'a fractional pitch': (p) => { p.voice = { provider: 'undecided', pitch: 1.5 }; },
```

`tests/check-cli.test.mjs` 末尾追加：

```js
test('check.mjs warns about a preset the voice command ignores and fails on an unknown preset', () => {
  const dir = copy();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const write = (voice) => writeFileSync(join(dir, 'project.json'), JSON.stringify({ ...project, voice }));
  write({ provider: 'command', preset: 'male-sunny', command: 'say -v Tingting -o {out} {text}' });
  const warned = run(dir);
  assert.equal(warned.status, 0);
  assert.deepEqual(warned.out.warnings.map((w) => `${w.code} ${w.path}`), ['PRESET_UNUSED /voice/preset']);
  write({ provider: 'undecided', preset: 'male-deep' });
  const failed = run(dir);
  assert.equal(failed.status, 1);
  assert.deepEqual(failed.out.errors.map((e) => `${e.code} ${e.path}`), ['INVALID_VALUE /voice/preset']);
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`node --test tests/project.test.mjs tests/schema.test.mjs tests/check-cli.test.mjs`
预期：失败。`project.test.mjs` 加载时报 `does not provide an export named 'lintVoice'`；schema 新加的 valid 用例失败（`preset`、`pitch` 现在是未知字段，被 `additionalProperties: false` 拒掉）；新加的 3 个 invalid 用例此时已经通过（同样因为是未知字段），实现后它们要继续通过；check-cli 新用例的 `warnings` 是空的。

- [ ] **Step 3: 写实现**

`skills/topic-to-video/scripts/lib/project.mjs`，`SCHEMA_FIELDS` 里 `voice` 一行换成（顺序要和 schema 的 `properties` 一致，已有测试会比对）：

```js
  voice: ['provider', 'model', 'voice', 'speed', 'base_url', 'api_key_env', 'command', 'preset', 'pitch'],
```

紧接在 `SCHEMA_FIELDS` 的右花括号之后加：

```js
// Voice presets from docs/lite/声音人设设计.md §3, in its table order, kept in sync with the schema enum by
// tests/project.test.mjs. `name` is how 讲稿.md and script.md call the preset; the speeds keep every preset
// within ±5% of 晓晓's pace.
export const VOICE_PRESETS = {
  'female-warm': { voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, name: '女声·晓晓' },
  'female-lively': { voice: 'zh-CN-XiaoyiNeural', speed: 0.96, name: '女声·晓伊' },
  'male-sunny': { voice: 'zh-CN-YunxiNeural', speed: 0.92, name: '男声·云希' },
  'male-passion': { voice: 'zh-CN-YunjianNeural', speed: 0.98, name: '男声·云健' },
  'male-pro': { voice: 'zh-CN-YunyangNeural', speed: 0.92, name: '男声·云扬' },
  'child-cute': { voice: 'zh-CN-YunxiaNeural', speed: 0.98, name: '童声·云夏' },
  'female-dongbei': { voice: 'zh-CN-liaoning-XiaobeiNeural', speed: 1.02, name: '东北话·晓北' },
  'female-shaanxi': { voice: 'zh-CN-shaanxi-XiaoniNeural', speed: 0.96, name: '陕西话·晓妮' },
};

/** True for an edge-tts command template that takes its voice from {voice}: the only kind of command a preset steers. */
export function isEdgeVoiceCommand(command) {
  return typeof command === 'string' && /edge[-_]?tts/i.test(command) && command.includes('{voice}');
}
```

`checkProject` 里，`checkFields(project, add);` 的下一行加：

```js
  const preset = project.voice?.preset;
  if (preset !== undefined && !Object.hasOwn(VOICE_PRESETS, preset)) {
    add('/voice/preset', 'INVALID_VALUE', `配音人设 ${preset} 不存在，可选 ${Object.keys(VOICE_PRESETS).join('、')}（见 script.md 的配音人设一节）`);
  }
```

`lintScript` 函数之后加：

```js
/** Advisory check from docs/lite/声音人设设计.md §7: a valid preset that the rest of the voice settings would ignore. */
export function lintVoice(project) {
  const v = project?.voice;
  if (!isObject(v) || !Object.hasOwn(VOICE_PRESETS, v.preset ?? '')) return [];
  const why = v.voice !== undefined ? `同时写了 voice.voice（${v.voice}），合成时用它，不用人设的音色`
    : v.provider === 'import' || v.provider === 'openai-compatible' ? `provider 是 ${v.provider}，人设只对 edge-tts 起作用`
      : v.provider === 'command' && !isEdgeVoiceCommand(v.command) ? 'command 不是带 {voice} 的 edge-tts 命令，人设的音色传不进去'
        : null;
  return why ? [{ path: '/voice/preset', code: 'PRESET_UNUSED', message: `配音人设 ${v.preset} 不起作用：${why}（见 providers.md 的配音来源）` }] : [];
}
```

`skills/topic-to-video/schema/project.schema.json`，`$defs.voice.properties` 里把

```json
        "command": { "$ref": "#/$defs/text" }
      },
```

换成

```json
        "command": { "$ref": "#/$defs/text" },
        "preset": {
          "enum": ["female-warm", "female-lively", "male-sunny", "male-passion", "male-pro", "child-cute", "female-dongbei", "female-shaanxi"],
          "description": "配音人设，见 references/script.md 的“配音人设与口吻”"
        },
        "pitch": { "type": "integer", "minimum": -20, "maximum": 20, "description": "音高微调，单位 Hz，缺省 0；人设不用它" }
      },
```

`skills/topic-to-video/scripts/check.mjs`，第 8 行 import 换成：

```js
import { checkProject, estimateReport, lintScript, lintVoice } from './lib/project.mjs';
```

第 22 行换成：

```js
  result.warnings = [...lintScript(project), ...lintStoryboard(project), ...lintVoice(project)];
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`node --test tests/project.test.mjs tests/schema.test.mjs tests/check-cli.test.mjs`
预期：全部通过（包括已有的 `SCHEMA_FIELDS matches the field names in the schema`）。
再运行：`npm test`，预期全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/project.mjs skills/topic-to-video/schema/project.schema.json skills/topic-to-video/scripts/check.mjs tests/project.test.mjs tests/schema.test.mjs tests/check-cli.test.mjs
git commit -m "feat(voice): add voice.preset and voice.pitch with preset self-checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 人设解析、`{pitch}` 与缓存键

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/tts.mjs`（第 8–9 行之间加 import；第 15 行之后加函数；第 84–91 行 `vars`；第 120–129 行 `sentenceHash`）
- Create: `tests/voice.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `VOICE_PRESETS`
- Produces:
  - `export function pitchToEdge(pitch = 0): string`：`0 → '+0Hz'`，`-3 → '-3Hz'`
  - `export function resolveVoice(voice: object): { voice: string, speed: number, rate: string, pitch: string }`：`rate`、`pitch` 是 edge-tts 的格式（`'-8%'`、`'+0Hz'`）；人设不存在时抛 `Error`，消息里有这个人设的名字
  - `export function sentenceHash(spokenText: string, voice: object): string`
  - 命令模板支持占位符 `{pitch}`

- [ ] **Step 1: 写失败的测试**

新建 `tests/voice.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pitchToEdge, resolveVoice, sentenceHash, synthesizeProject } from '../skills/topic-to-video/scripts/lib/tts.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
const EDGE = 'edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}';

// A stand-in for edge-tts: logs the flags it got as one JSON line to argv[2], then writes a 0.5 s 48 kHz WAV with
// speech from 0.05 s to 0.45 s and a one-cue VTT. Its file name contains "edge-tts", so a command running it counts
// as an edge-tts command; it writes WAV, so tts.mjs needs no FFmpeg for it.
const FAKE_EDGE = `
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(3);
const flag = (name) => args[args.indexOf(name) + 1];
const eq = (name) => args.find((a) => a.startsWith(name + '='))?.slice(name.length + 1);
appendFileSync(process.argv[2], JSON.stringify({ voice: flag('--voice'), rate: eq('--rate'), pitch: eq('--pitch'), text: flag('--text') }) + '\\n');
const sr = 48000, n = 24000;
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 2400; i < 21600; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 300 * i / sr)), 44 + i * 2);
writeFileSync(flag('--write-media'), buf);
writeFileSync(flag('--write-subtitles'), 'WEBVTT\\n\\n00:00:00.050 --> 00:00:00.450\\n' + flag('--text') + '\\n');
`;

/** A scratch project folder with the fake edge-tts; calls() lists what each run of it received, in order. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'svs-voice-'));
  const fake = join(dir, 'fake-edge-tts.mjs');
  const log = join(dir, 'calls.jsonl');
  writeFileSync(fake, FAKE_EDGE);
  const command = `${process.execPath} ${fake} ${log} ${EDGE.slice('edge-tts '.length)}`;
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  return { dir, command, calls };
}

test('resolveVoice: a preset supplies voice and speed, explicit fields win, and no preset keeps the old defaults', () => {
  assert.deepEqual(resolveVoice({ provider: 'command', preset: 'male-sunny' }), { voice: 'zh-CN-YunxiNeural', speed: 0.92, rate: '-8%', pitch: '+0Hz' });
  assert.deepEqual(resolveVoice({ provider: 'command', preset: 'male-sunny', voice: 'zh-CN-YunjianNeural', speed: 1.1, pitch: -3 }),
    { voice: 'zh-CN-YunjianNeural', speed: 1.1, rate: '+10%', pitch: '-3Hz' });
  assert.deepEqual(resolveVoice({ provider: 'command' }), { voice: 'zh-CN-XiaoxiaoNeural', speed: 1, rate: '-4%', pitch: '+0Hz' });
  assert.throws(() => resolveVoice({ provider: 'command', preset: 'male-deep' }), /male-deep/);
  assert.deepEqual([0, 5, -3, -20].map((hz) => pitchToEdge(hz)), ['+0Hz', '+5Hz', '-3Hz', '-20Hz']);
});

test('the command gets the preset voice, rate and pitch; a new preset re-synthesizes and an unchanged run reuses the cache', async () => {
  const { dir, command, calls } = scratch();
  const p = minimal();
  p.voice = { provider: 'command', preset: 'male-sunny', command };
  await synthesizeProject(p, dir);
  assert.deepEqual(calls(), [
    { voice: 'zh-CN-YunxiNeural', rate: '-8%', pitch: '+0Hz', text: '天空为什么是蓝的？' },
    { voice: 'zh-CN-YunxiNeural', rate: '-8%', pitch: '+0Hz', text: '答案藏在阳光里。' },
  ]);
  p.voice.preset = 'female-warm';
  await synthesizeProject(p, dir);
  await synthesizeProject(p, dir);
  assert.deepEqual(calls().map((c) => `${c.voice} ${c.rate}`), [
    'zh-CN-YunxiNeural -8%', 'zh-CN-YunxiNeural -8%', 'zh-CN-XiaoxiaoNeural -4%', 'zh-CN-XiaoxiaoNeural -4%',
  ]);
});

test('an unknown preset stops synthesis with its name instead of falling back to 晓晓', async () => {
  const { dir, command, calls } = scratch();
  const p = minimal();
  p.voice = { provider: 'command', preset: 'male-deep', command };
  await assert.rejects(synthesizeProject(p, dir), /male-deep/);
  assert.deepEqual(calls(), []);
});

test('without a preset or pitch the cache key is the one older projects stored, so their audio is reused', () => {
  // The formula tts.mjs used before presets existed.
  const legacy = (spokenText, voice) => createHash('sha256').update(JSON.stringify({
    spokenText, provider: voice.provider, voice: voice.voice ?? '', model: voice.model ?? '', speed: voice.speed ?? 1, command: voice.command ?? '',
  })).digest('hex');
  const old = 'edge-tts --voice {voice} --rate={rate} --text {text} --write-media {out} --write-subtitles {sub}';
  for (const voice of [
    { provider: 'command', voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, command: old },
    { provider: 'command', command: old },
    { provider: 'command', voice: 'Tingting', command: 'say -v Tingting -o {out} {text}' },
    { provider: 'command', voice: 'zh-CN-XiaoxiaoNeural', speed: 0.96, command: old, pitch: 0 },
  ]) assert.equal(sentenceHash('天空为什么是蓝的？', voice), legacy('天空为什么是蓝的？', voice), JSON.stringify(voice));
  const sunny = { provider: 'command', preset: 'male-sunny', command: EDGE };
  assert.notEqual(sentenceHash('天空为什么是蓝的？', sunny), sentenceHash('天空为什么是蓝的？', { ...sunny, pitch: -3 }));
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`node --test tests/voice.test.mjs`
预期：失败，加载时报 `does not provide an export named 'pitchToEdge'`。

- [ ] **Step 3: 写实现**

`skills/topic-to-video/scripts/lib/tts.mjs`，在 `import { makeWavBuffer, ... } from './mouth.mjs';` 和 `./timing.mjs` 那行之间加：

```js
import { VOICE_PRESETS } from './project.mjs';
```

在 `speedToEdgeRate` 之后加：

```js
/** Converts a pitch offset in Hz (e.g. 0 -> "+0Hz", -3 -> "-3Hz") to edge-tts --pitch format. */
export function pitchToEdge(pitch = 0) {
  const hz = Math.round(Number(pitch));
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

/** The preset voice.preset names, or null without one. An unknown name throws rather than falling back to 晓晓. */
function presetOf(voice) {
  if (voice.preset === undefined) return null;
  if (!Object.hasOwn(VOICE_PRESETS, voice.preset)) {
    throw new Error(`未知的配音人设 voice.preset: ${voice.preset}，可选 ${Object.keys(VOICE_PRESETS).join('、')}`);
  }
  return VOICE_PRESETS[voice.preset];
}

/**
 * What {voice}, {speed}, {rate} and {pitch} stand for (声音人设设计 §4). A preset supplies the voice and speed unless
 * voice.voice or voice.speed is set; without a preset {voice} is 晓晓, {speed} is 1 and {rate} is -4%, as before.
 */
export function resolveVoice(voice) {
  const preset = presetOf(voice);
  return {
    voice: voice.voice ?? preset?.voice ?? 'zh-CN-XiaoxiaoNeural',
    speed: voice.speed ?? preset?.speed ?? 1,
    rate: speedToEdgeRate(voice.speed ?? preset?.speed ?? 0.96),
    pitch: pitchToEdge(voice.pitch ?? 0),
  };
}
```

`runCommandTts` 里的 `const vars = { ... };` 换成：

```js
  const resolved = resolveVoice(voice);
  const vars = {
    '{text}': text,
    '{out}': rawOut,
    '{sub}': subOut,
    '{voice}': resolved.voice,
    '{speed}': String(resolved.speed),
    '{rate}': resolved.rate,
    '{pitch}': resolved.pitch,
  };
```

整个 `function sentenceHash(...) { ... }` 换成：

```js
/** Cache key of one sentence's audio. Without a preset or a pitch it is the key older projects stored, so they reuse it. */
export function sentenceHash(spokenText, voice) {
  const preset = presetOf(voice);
  const key = {
    spokenText,
    provider: voice.provider,
    voice: voice.voice ?? preset?.voice ?? '',
    model: voice.model ?? '',
    speed: voice.speed ?? preset?.speed ?? 1,
    command: voice.command ?? '',
  };
  if ((voice.pitch ?? 0) !== 0) key.pitch = voice.pitch;
  return createHash('sha256').update(JSON.stringify(key)).digest('hex');
}
```

键的顺序不要动：旧项目的缓存键靠 `JSON.stringify` 的结果逐字相同。

- [ ] **Step 4: 运行测试，确认通过**

运行：`node --test tests/voice.test.mjs tests/render-core.test.mjs`
预期：全部通过。再运行 `npm test`，预期全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/tts.mjs tests/voice.test.mjs
git commit -m "feat(voice): resolve voice presets into edge-tts voice, rate and pitch with backward-compatible cache keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 试听

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/tts.mjs`（fs 的 import 加 `readdirSync`；project.mjs 的 import 加 `isEdgeVoiceCommand`；把 `synthesizeProject` 里的裁静音（开工前第 204–221 行，Task 2 之后会后移）抽成 `trimSynthesized`；在 `LOCAL_TTS_PRESETS` 之前加试听函数）
- Test: `tests/voice.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `VOICE_PRESETS`、`isEdgeVoiceCommand`；Task 2 的 `resolveVoice`（经 `runCommandTts`）
- Produces:
  - `export function selectPresets(list?: string): string[]`：按人设表的顺序返回人设 ID；列表用逗号分隔，每项是人设 ID，或 `female`、`male`、`child`（选出以 `<它>-` 开头的人设）；不写列表时返回全部 8 个；有不认识的项时抛 `Error`，消息里有这一项
  - `export function auditionCommand(voice: object | undefined, recommended?: string): string | null`：项目的 `command` 是 edge-tts 命令就用它，否则用推荐的命令；两者都不是 edge-tts 命令时返回 null
  - `export function auditionVoices(project: object, projectDir: string, { presets?: string[], command: string, ffmpeg?: string }): { ok: true, text: string, presets: { preset: string, name: string, voice: string, speed: number, file: string, duration_ms: number }[], all: string }`：`file` 和 `all` 是相对项目文件夹的路径，例如 `out/audition/01-male-sunny.wav`；编号按这次试听的顺序从 01 开始
  - 模块内部：`toInt16(samples: Float32Array): Int16Array`、`trimSynthesized(wavPath: string): { wavBuf: Buffer, decoded: object, trimOffsetMs: number }`

- [ ] **Step 1: 写失败的测试**

`tests/voice.test.mjs` 顶部的 import 换成：

```js
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWavPcm } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { auditionCommand, auditionVoices, pitchToEdge, resolveVoice, selectPresets, sentenceHash, synthesizeProject } from '../skills/topic-to-video/scripts/lib/tts.mjs';
```

（`node:test`、`node:assert/strict`、`node:crypto` 三行不变。）在文件末尾追加：

```js
test('selectPresets takes preset IDs and the prefixes female, male and child, in table order', () => {
  assert.equal(selectPresets().length, 8);
  assert.deepEqual(selectPresets('male'), ['male-sunny', 'male-passion', 'male-pro']);
  assert.deepEqual(selectPresets('female'), ['female-warm', 'female-lively', 'female-dongbei', 'female-shaanxi']);
  assert.deepEqual(selectPresets('child,female-warm'), ['female-warm', 'child-cute']);
  assert.throws(() => selectPresets('male-deep'), /male-deep/);
});

test('auditionCommand uses the project edge-tts command, else the recommended one, and never macOS say', () => {
  const say = 'say -v Tingting -o {out} {text}';
  const uvx = `uvx --from edge-tts ${EDGE}`;
  assert.equal(auditionCommand({ provider: 'command', command: EDGE }, uvx), EDGE);
  assert.equal(auditionCommand({ provider: 'command', command: say }, uvx), uvx);
  assert.equal(auditionCommand({ provider: 'undecided' }, say), null);
  assert.equal(auditionCommand(undefined, undefined), null);
});

test('auditionVoices writes one trimmed clip per preset and all.wav, and leaves project.json and audio/ alone', () => {
  const { dir, command, calls } = scratch();
  const p = minimal();
  p.sections[0].pronunciation = [{ term: '阳光', reading: '太阳光' }];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(p));
  const before = readFileSync(join(dir, 'project.json'), 'utf8');
  const r = auditionVoices(p, dir, { presets: selectPresets('male'), command });
  assert.equal(r.text, '天空为什么是蓝的？答案藏在太阳光里。');
  assert.deepEqual(r.presets.map((x) => [x.preset, x.name, x.voice, x.speed, x.file]), [
    ['male-sunny', '男声·云希', 'zh-CN-YunxiNeural', 0.92, 'out/audition/01-male-sunny.wav'],
    ['male-passion', '男声·云健', 'zh-CN-YunjianNeural', 0.98, 'out/audition/02-male-passion.wav'],
    ['male-pro', '男声·云扬', 'zh-CN-YunyangNeural', 0.92, 'out/audition/03-male-pro.wav'],
  ]);
  assert.deepEqual(calls().map((c) => `${c.voice} ${c.rate} ${c.pitch}`), ['zh-CN-YunxiNeural -8% +0Hz', 'zh-CN-YunjianNeural -2% +0Hz', 'zh-CN-YunyangNeural -8% +0Hz']);
  for (const x of r.presets) assert.ok(x.duration_ms >= 440 && x.duration_ms <= 510, `trimmed like the real voice-over: ${x.duration_ms}`);
  assert.deepEqual(readdirSync(join(dir, 'out/audition')).sort(), ['01-male-sunny.wav', '02-male-passion.wav', '03-male-pro.wav', 'all.wav']);
  const all = readWavPcm(readFileSync(join(dir, r.all)));
  const expected = r.presets.reduce((sum, x) => sum + x.duration_ms, 0) + 2 * 800;
  assert.ok(Math.abs(all.durationMs - expected) <= 3, `all.wav ${all.durationMs} ms, expected ${expected} ms`);
  assert.equal(readFileSync(join(dir, 'project.json'), 'utf8'), before);
  assert.equal(existsSync(join(dir, 'audio')), false);
});

test('a second, shorter audition leaves no clips from the first one and keeps other files', () => {
  const { dir, command } = scratch();
  const p = minimal();
  auditionVoices(p, dir, { presets: selectPresets('male'), command });
  writeFileSync(join(dir, 'out/audition/备注.txt'), '留着');
  auditionVoices(p, dir, { presets: ['child-cute'], command });
  assert.deepEqual(readdirSync(join(dir, 'out/audition')).sort(), ['01-child-cute.wav', 'all.wav', '备注.txt']);
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`node --test tests/voice.test.mjs`
预期：失败，加载时报 `does not provide an export named 'auditionCommand'`。

- [ ] **Step 3: 写实现**

`skills/topic-to-video/scripts/lib/tts.mjs` 的两行 import 换成：

```js
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
```

```js
import { isEdgeVoiceCommand, VOICE_PRESETS } from './project.mjs';
```

在 `sentenceHash` 之后、`synthesizeProject` 的文档注释之前加：

```js
/** Float samples in [-1, 1] to 16-bit PCM. */
function toInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let k = 0; k < samples.length; k += 1) out[k] = Math.max(-32768, Math.min(32767, Math.round(samples[k] * 32767)));
  return out;
}

/** Trims dead leading/trailing silence of a synthesized clip in place, with a short fade so it does not click. */
function trimSynthesized(wavPath) {
  const rawBuf = readFileSync(wavPath);
  const raw = readWavPcm(rawBuf);
  const [rawStart] = detectSpeechBounds(raw.samples, raw.sampleRate, -42);
  const trimmed = trimSilenceWithFade(raw.samples, raw.sampleRate, { thresholdDb: -42, padMs: 35, fadeMs: 20 });
  if (trimmed.length >= raw.samples.length - 480) return { wavBuf: rawBuf, decoded: raw, trimOffsetMs: 0 };
  const wavBuf = makeWavBuffer(toInt16(trimmed), raw.sampleRate);
  writeFileSync(wavPath, wavBuf);
  return { wavBuf, decoded: readWavPcm(wavBuf), trimOffsetMs: Math.max(0, rawStart - 35) };
}
```

`synthesizeProject` 里从 `const rawBuf = readFileSync(wavPath);` 到裁静音的 `if (voice.provider !== 'import') { ... }` 结束（原第 204–221 行），换成：

```js
    // Trim dead leading/trailing silence on synthesized clips so punctuation-driven pauses stay crisp and natural
    let wavBuf;
    let decoded;
    let trimOffsetMs = 0;
    if (voice.provider === 'import') {
      wavBuf = readFileSync(wavPath);
      decoded = readWavPcm(wavBuf);
    } else {
      ({ wavBuf, decoded, trimOffsetMs } = trimSynthesized(wavPath));
    }
```

后面的 `const speech = detectSpeechBounds(decoded.samples, decoded.sampleRate);` 及之后不变。

在 `synthesizeProject` 之后、`LOCAL_TTS_PRESETS` 之前加：

```js
const AUDITION_PREFIXES = ['female', 'male', 'child'];
const AUDITION_GAP_MS = 800;

/** Preset IDs for an audition list such as "male,female-warm", in table order; female, male and child pick every preset they start. */
export function selectPresets(list) {
  const ids = Object.keys(VOICE_PRESETS);
  if (!list) return ids;
  const picked = new Set();
  for (const item of list.split(',').map((s) => s.trim()).filter(Boolean)) {
    const match = AUDITION_PREFIXES.includes(item) ? ids.filter((id) => id.startsWith(`${item}-`)) : ids.filter((id) => id === item);
    if (!match.length) throw new Error(`试听列表里的 ${item} 不是人设，可写 ${ids.join('、')}，或 ${AUDITION_PREFIXES.join('、')}`);
    match.forEach((id) => picked.add(id));
  }
  return ids.filter((id) => picked.has(id));
}

/** The template an audition runs: the project's own edge-tts command, else the recommended one; null when neither is edge-tts. */
export function auditionCommand(voice, recommended) {
  if (isEdgeVoiceCommand(voice?.command)) return voice.command;
  return isEdgeVoiceCommand(recommended) ? recommended : null;
}

/**
 * Reads the first two script sentences with each preset into out/audition/ (声音人设设计 §5): NN-<preset>.wav, trimmed
 * like the real voice-over, and all.wav with every clip in order, 0.8 s apart. Writes nothing else: not project.json, not audio/.
 */
export function auditionVoices(project, projectDir, { presets = Object.keys(VOICE_PRESETS), command, ffmpeg = 'ffmpeg' } = {}) {
  const text = project.sections
    .flatMap((sec) => splitSentences(sec.text).map((t) => applyPronunciation(t, sec.pronunciation)))
    .slice(0, 2)
    .join('');
  const dir = join(projectDir, 'out', 'audition');
  mkdirSync(dir, { recursive: true });
  readdirSync(dir).filter((f) => /^(\d{2}-.+|all)\.wav$/.test(f)).forEach((f) => unlinkSync(join(dir, f)));
  const clips = presets.map((preset, i) => {
    const file = `out/audition/${String(i + 1).padStart(2, '0')}-${preset}.wav`;
    const wavPath = join(projectDir, file);
    const subPath = wavPath.replace(/\.wav$/, '.vtt');
    runCommandTts({ provider: 'command', preset, command }, text, wavPath, subPath, { ffmpeg });
    if (existsSync(subPath)) unlinkSync(subPath);
    const { decoded } = trimSynthesized(wavPath);
    const { name, voice, speed } = VOICE_PRESETS[preset];
    return { summary: { preset, name, voice, speed, file, duration_ms: decoded.durationMs }, decoded };
  });
  const sampleRate = clips[0]?.decoded.sampleRate ?? 48000;
  const gap = new Float32Array(Math.round((AUDITION_GAP_MS / 1000) * sampleRate));
  const parts = clips.flatMap((c, i) => (i ? [gap, c.decoded.samples] : [c.decoded.samples]));
  const joined = new Float32Array(parts.reduce((n, s) => n + s.length, 0));
  let at = 0;
  for (const s of parts) {
    joined.set(s, at);
    at += s.length;
  }
  writeFileSync(join(dir, 'all.wav'), makeWavBuffer(toInt16(joined), sampleRate));
  return { ok: true, text, presets: clips.map((c) => c.summary), all: 'out/audition/all.wav' };
}
```

试听不带项目的 `voice.pitch`、`voice.speed`：每个人设按原样念，方便比较。

- [ ] **Step 4: 运行测试，确认通过**

运行：`node --test tests/voice.test.mjs tests/render-core.test.mjs`
预期：全部通过。`render-core.test.mjs` 里已有的 `trimmed duration` 断言（440–510 ms）证明抽出 `trimSynthesized` 后正式配音的裁剪没变。再运行 `npm test`，预期全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/tts.mjs tests/voice.test.mjs
git commit -m "feat(voice): audition voice presets into out/audition with the same trimming as the voice-over" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: doctor 的推荐配音与 `render.mjs --audition`

**Files:**
- Modify: `skills/topic-to-video/scripts/doctor.mjs:73-80`
- Modify: `skills/topic-to-video/scripts/render.mjs`（整份替换，见 Step 3）
- Test: `tests/voice.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `resolveVoice`；Task 3 的 `selectPresets`、`auditionCommand`、`auditionVoices`
- Produces:
  - `export function recommendVoice({ edgeTts?: boolean, uvx?: boolean, say?: boolean }): object`：有 edge-tts 或 uvx 时只返回 `{ provider: 'command', command }`，命令带 `--pitch={pitch}`；只有 `say` 时和现在一样；什么都没有时是 `{ provider: 'import' }`
  - `export function parseArgs(argv: string[]): object`：新增 `audition: true`，写了列表时另有 `auditionList: string`；没写列表时不出现 `auditionList` 这个键
  - `export function runAudition(opts: { projectDir: string, auditionList?: string }, doc: { checks: { ffmpeg: { ok: boolean } }, recommended_voice: object }): object`：失败时返回 `{ ok: false, message }`，成功时返回 `auditionVoices` 的结果；不抛异常

- [ ] **Step 1: 写失败的测试**

`tests/voice.test.mjs` 的 import 区再加两行：

```js
import { recommendVoice } from '../skills/topic-to-video/scripts/doctor.mjs';
import { parseArgs, runAudition } from '../skills/topic-to-video/scripts/render.mjs';
```

在文件末尾追加：

```js
test('doctor recommends edge-tts, then uvx, then say, then import, and leaves voice and speed to the preset', () => {
  assert.deepEqual(recommendVoice({ edgeTts: true, uvx: true, say: true }), { provider: 'command', command: EDGE });
  assert.deepEqual(recommendVoice({ uvx: true, say: true }), { provider: 'command', command: `uvx --from edge-tts ${EDGE}` });
  assert.deepEqual(recommendVoice({ say: true }), { provider: 'command', voice: 'Tingting', command: 'say -v Tingting -o {out} {text}' });
  assert.deepEqual(recommendVoice({}), { provider: 'import' });
  const copied = { ...recommendVoice({ edgeTts: true }), preset: 'male-sunny' };
  assert.deepEqual(resolveVoice(copied), { voice: 'zh-CN-YunxiNeural', speed: 0.92, rate: '-8%', pitch: '+0Hz' });
});

test('render.mjs reads the word after --audition as a preset list only when it looks like one', () => {
  assert.deepEqual(parseArgs(['proj', '--audition']), { projectDir: 'proj', audition: true });
  assert.deepEqual(parseArgs(['proj', '--audition', 'male,female-warm']), { projectDir: 'proj', audition: true, auditionList: 'male,female-warm' });
  assert.deepEqual(parseArgs(['--audition', 'proj']), { projectDir: 'proj', audition: true });
  assert.deepEqual(parseArgs(['proj', '--audition', 'male-deep']), { projectDir: 'proj', audition: true, auditionList: 'male-deep' });
  assert.deepEqual(parseArgs(['proj', '--preset', 'slow']), { projectDir: 'proj', preset: 'slow' });
});

test('--audition needs FFmpeg and an edge-tts command but not resvg, and reports a bad list instead of throwing', () => {
  const { dir, command } = scratch();
  writeFileSync(join(dir, 'project.json'), JSON.stringify(minimal()));
  const doc = (ffmpeg, recommended_voice) => ({ checks: { ffmpeg: { ok: ffmpeg }, resvg: { ok: false } }, recommended_voice });
  assert.deepEqual(runAudition({ projectDir: dir }, doc(false, recommendVoice({ edgeTts: true }))), { ok: false, message: '试听需要 FFmpeg' });
  assert.deepEqual(runAudition({ projectDir: dir }, doc(true, recommendVoice({ say: true }))), { ok: false, message: '试听需要 edge-tts 或 uvx' });
  const bad = runAudition({ projectDir: dir, auditionList: 'male-deep' }, doc(true, { provider: 'command', command }));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /male-deep/);
  const r = runAudition({ projectDir: dir, auditionList: 'child' }, doc(true, { provider: 'command', command }));
  assert.deepEqual([r.ok, r.presets.map((x) => x.file)], [true, ['out/audition/01-child-cute.wav']]);
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`node --test tests/voice.test.mjs`
预期：失败，加载时报 `does not provide an export named 'recommendVoice'`。

- [ ] **Step 3: 写实现**

`skills/topic-to-video/scripts/doctor.mjs`，在 `function checkCmd` 之前加：

```js
const EDGE_COMMAND = 'edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}';

/**
 * The voice settings to copy into project.json for the local TTS found. The edge-tts ones carry no voice or speed,
 * so copying them keeps the voice.preset the project chose (声音人设设计 §6).
 */
export function recommendVoice({ edgeTts = false, uvx = false, say = false } = {}) {
  if (edgeTts) return { provider: 'command', command: EDGE_COMMAND };
  if (uvx) return { provider: 'command', command: `uvx --from edge-tts ${EDGE_COMMAND}` };
  if (say) return { provider: 'command', voice: 'Tingting', command: 'say -v Tingting -o {out} {text}' };
  return { provider: 'import' };
}
```

`runDoctor` 里 `const recommended_voice = edgeTts.ok ? ... : { provider: 'import' };` 这一整段（原第 73–80 行）换成：

```js
  const recommended_voice = recommendVoice({ edgeTts: edgeTts.ok, uvx: uvxCheck.ok, say: macSay.ok });
```

`skills/topic-to-video/scripts/render.mjs` 整份换成：

```js
// Unified cross-agent render CLI (agy / Claude Code / Codex):
//   node <skill>/scripts/render.mjs <projectDir> [--preview] [--sample sh08-sh09]
//     [--resolution 1080p|1440p|2160p] [--fps 60|30] [--master] [--motion-blur] [--skip-tts] [--no-qa]
//   node <skill>/scripts/render.mjs <projectDir> --audition [male,female-warm,...]   voice presets into out/audition/
// Falls back cleanly to L0 guidance when FFmpeg or @resvg/resvg-js is unavailable; --audition needs only FFmpeg and edge-tts or uvx.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor } from './doctor.mjs';
import { renderProject } from './lib/encode.mjs';
import { auditionCommand, auditionVoices, selectPresets } from './lib/tts.mjs';

// The word after --audition is a preset list only when every item looks like a preset ID or prefix, so
// `--audition <projectDir>` still names the project and a typo such as male-deep is reported instead of taken as a folder.
const AUDITION_ITEM = /^(female|male|child)(-[a-z]+)*$/;

export function parseArgs(argv) {
  const opts = { projectDir: '.' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--preview') opts.preview = true;
    else if (a === '--master') opts.master = true;
    else if (a === '--motion-blur') opts.motionBlur = true;
    else if (a === '--skip-tts') opts.skipTts = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--no-qa') opts.noQa = true;
    else if (a === '--sample') opts.sample = argv[++i];
    else if (a === '--resolution') opts.resolution = argv[++i];
    else if (a === '--fps') opts.fps = Number(argv[++i]);
    else if (a === '--preset') opts.preset = argv[++i];
    else if (a === '--workers') opts.workers = Number(argv[++i]);
    else if (a === '--audition') {
      opts.audition = true;
      if (argv[i + 1]?.split(',').every((s) => AUDITION_ITEM.test(s))) opts.auditionList = argv[++i];
    } else if (!a.startsWith('--')) opts.projectDir = a;
  }
  return opts;
}

/** --audition: reads voice presets aloud into out/audition/. Needs FFmpeg and an edge-tts command, never resvg or macOS say. */
export function runAudition(opts, doc) {
  if (!doc.checks.ffmpeg.ok) return { ok: false, message: '试听需要 FFmpeg' };
  try {
    const project = JSON.parse(readFileSync(join(opts.projectDir, 'project.json'), 'utf8'));
    const command = auditionCommand(project.voice, doc.recommended_voice.command);
    if (!command) return { ok: false, message: '试听需要 edge-tts 或 uvx' };
    return auditionVoices(project, opts.projectDir, { presets: selectPresets(opts.auditionList), command, ffmpeg: process.env.FFMPEG || 'ffmpeg' });
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const doc = await runDoctor();
  if (opts.audition) {
    const result = runAudition(opts, doc);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!doc.l1_ready) {
    console.log(JSON.stringify({ ok: false, fallback: 'L0', missing: doc.missing, message: doc.fallback }, null, 2));
    process.exitCode = 2;
    return;
  }
  const result = await renderProject(opts.projectDir, opts);
  let qa = null;
  if (!opts.noQa) {
    try {
      const { runQa } = await import('./lib/qa.mjs');
      qa = await runQa(opts.projectDir, {
        videoPath: result.videoPath,
        expectedFps: result.fps,
        timeline: result.timeline,
        shotPlans: result.shotPlans,
        qaByShot: result.qaByShot,
      });
    } catch (err) {
      qa = { skipped: true, reason: err.message };
    }
  }
  console.log(JSON.stringify({
    ok: true,
    video: result.videoPath,
    master: result.masterPath,
    resolution: `${result.width}x${result.height}`,
    fps: result.fps,
    shots_rendered: result.shotsRendered,
    shots_cached: result.shotsCached,
    qa: qa ? { ok: qa.ok, issues: qa.issues?.length ?? 0 } : null,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
```

除了新增的 import、`AUDITION_ITEM`、`export`、`--audition` 分支、`runAudition` 和 `main` 开头的试听分支，其余内容与原文件逐字相同；`encode.mjs` 只在渲染时才动态加载 resvg，所以试听不需要它。

- [ ] **Step 4: 运行测试，确认通过**

运行：`node --test tests/voice.test.mjs tests/render-core.test.mjs`
预期：全部通过（`render-core.test.mjs` 里的 `doctor reports environment capabilities cleanly` 仍然通过）。
再运行：`node skills/topic-to-video/scripts/doctor.mjs`，预期 `recommended_voice` 只有 `provider` 和带 `--pitch={pitch}` 的 `command`（本机没有 edge-tts 和 uvx 时是 `say` 或 `import`）。
再运行 `npm test`，预期全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/doctor.mjs skills/topic-to-video/scripts/render.mjs tests/voice.test.mjs
git commit -m "feat(voice): add render.mjs --audition and stop doctor from overriding the chosen preset" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 文档

**Files:**
- Modify: `skills/topic-to-video/SKILL.md:13-16,34,41-44`
- Modify: `skills/topic-to-video/references/script.md`
- Modify: `skills/topic-to-video/references/providers.md`
- Modify: `README.md:5`、`README.en.md:5`、`site/index.html:165`
- Test: `tests/references.test.mjs`、`tests/readme.test.mjs`、`tests/site.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `VOICE_PRESETS`（测试用它核对 script.md 的人设表）；Task 3–4 的试听命令行
- Produces: 无代码接口

- [ ] **Step 1: 写失败的测试**

`tests/references.test.mjs` 第 5 行的 import 换成：

```js
import { CHARS_PER_SECOND, DEFAULT_SENTENCE_GAP_MS, MAX_SENTENCE_CHARS, estimateReport, VOICE_PRESETS } from '../skills/topic-to-video/scripts/lib/project.mjs';
```

在文件末尾追加：

```js
test('script.md lists every voice preset with the name 讲稿.md uses, the audition command and the tone rules', () => {
  const text = ref('script.md');
  assert.match(text, /^## 配音人设与口吻$/m);
  for (const [id, { name }] of Object.entries(VOICE_PRESETS)) assert.ok(text.includes(`| \`${id}\` | ${name} |`), id);
  assert.ok(text.includes('"voice": { "provider": "undecided", "preset": "female-warm" }'));
  assert.ok(text.includes('- 配音：女声·晓晓（female-warm）'));
  assert.ok(text.includes('--audition'));
});

test('SKILL.md defaults to 女声·晓晓, takes 男声·云希 for a male voice, and asks for a new sample after a preset change', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('女声·晓晓（`female-warm`）'));
  assert.ok(skill.includes('男声·云希（`male-sunny`）'));
  assert.ok(skill.includes('`{"provider": "undecided", "preset": "<人设>"}`'));
  assert.match(skill, /只换配音人设.*不加 `revision`.*重新出样片/);
});

test('providers.md documents {pitch}, the preset form of the edge-tts voice and the audition', () => {
  const text = ref('providers.md');
  assert.ok(text.includes('`{pitch}`'));
  assert.ok(text.includes('{"provider":"command","preset":"female-warm","command":"edge-tts --voice {voice} --rate={rate} --pitch={pitch} '));
  assert.match(text, /^### 试听人设$/m);
  assert.ok(text.includes('--audition'));
  assert.ok(!text.includes('中文常用神经音色'));
});
```

`tests/readme.test.mjs` 末尾追加：

```js
test('both READMEs say the voice has 8 male and female presets to audition', () => {
  assert.ok(read('README.md').includes('男女声 8 个人设，可以先试听'));
  assert.ok(read('README.en.md').includes('8 male and female voice presets you can audition first'));
});
```

`tests/site.test.mjs` 末尾追加：

```js
test('site says the voice has 8 male and female presets to audition', () => {
  assert.ok(html.includes('男女声 8 个人设，可以先试听'));
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`node --test tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs`
预期：新加的 5 个测试失败（文档里还没有这些字样），其余通过。

- [ ] **Step 3: 改 `SKILL.md`**

"开工前"第 2 条（原第 13–16 行）换成：

```markdown
2. 主题和资料都没有时，**一次**问齐：主题（必答），再列出时长、受众、比例、配音的默认值供用户修改。只缺其他项时不要提问，直接用默认值，并写在讲稿.md 开头：
   - 时长 120 秒（1–3 分钟按短片做，约 8 分钟按章节节目做，见 [script.md](references/script.md)）
   - 受众：对这个主题没有专业基础的普通观众
   - 比例 16:9（也可以用 9:16，只影响提示词包的构图）
   - 配音：女声·晓晓（`female-warm`）；用户要男声就用男声·云希（`male-sunny`），其他人设见 [script.md](references/script.md)
```

"流程"下的这一条（原第 34 行）：

```markdown
- 新项目的 `revision` 从 1 开始，`voice.provider` 写 `undecided`，`checkpoints` 和 `jobs` 都是空数组。
```

换成：

```markdown
- 新项目的 `revision` 从 1 开始，`voice` 写成 `{"provider": "undecided", "preset": "<人设>"}`，`checkpoints` 和 `jobs` 都是空数组。
```

"返修"一节末尾（"只改提示词的措辞……"那条之后）加一条：

```markdown
- 只换配音人设（`voice.preset`）时，不加 `revision`，不影响方案确认；如果已经有样片确认（`sample`），换人设后要重新出样片，请用户确认。
```

- [ ] **Step 4: 改 `references/script.md`**

"`project.json` 的其余顶层字段"示例里的

```json
"voice": { "provider": "undecided" },
```

换成

```json
"voice": { "provider": "undecided", "preset": "female-warm" },
```

在"## 口播写法"一节之后、"## 事实与来源"之前加一节：

````markdown
## 配音人设与口吻

`voice.preset` 从下表选一个，全片固定。用户没指定时用 `female-warm`；用户要男声用 `male-sunny`，要童声用 `child-cute`；用户点名了音色或风格时，按下表选。不按主题自动换人设，但可以在回复里推荐更合适的人设。只写 `preset`，不写 `voice.voice` 和 `speed`：音色和语速由人设决定。

| `preset` | 讲稿.md 里写 | 特点 | 适合 |
| --- | --- | --- | --- |
| `female-warm` | 女声·晓晓 | 温暖 | 通用讲解（默认） |
| `female-lively` | 女声·晓伊 | 活泼 | 生活、轻松题材 |
| `male-sunny` | 男声·云希 | 活泼、阳光 | 通用讲解（男声默认） |
| `male-passion` | 男声·云健 | 激情 | 体育、励志 |
| `male-pro` | 男声·云扬 | 专业、可靠 | 新闻、严肃话题 |
| `child-cute` | 童声·云夏 | 可爱（男童声） | 儿童向 |
| `female-dongbei` | 东北话·晓北 | 幽默 | 搞笑、轻松题材 |
| `female-shaanxi` | 陕西话·晓妮 | 明亮 | 地方特色 |

用户想先听再选时，运行下面的命令，把 `out/audition/all.wav` 的路径告诉用户（只需 FFmpeg 和 edge-tts 或 uvx，详见 [providers.md](providers.md) 的“试听人设”）：

```sh
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --audition male
```

口吻：

- 像对朋友讲：用"你""我们"，多用设问引出下一步。
- 口语连接词（"其实""你看""那么"）每段最多用一两个，不要堆口头禅。
- 按人设调语气：活泼的人设可以多用短句和感叹；专业的人设少用语气词，用词更准确；方言人设的讲稿仍然写普通话，口音交给音色。
- 同一期的口吻不变。
````

"## 讲稿.md 格式"示例里，在 `- 采用的默认值：比例 16:9，浅色主题` 之后加一行：

```markdown
- 配音：女声·晓晓（female-warm）
```

并在示例下面的说明里加一条：

```markdown
- "配音"一行写 `voice.preset` 在人设表里的叫法和 ID。
```

"## 交付前自查"末尾加一条：

```markdown
- [ ] 配音人设与用户的要求一致，讲稿.md 的"配音"一行与 `voice.preset` 一致
```

- [ ] **Step 5: 改 `references/providers.md`**

配音来源表里 edge-tts 那一行换成：

```markdown
| **edge-tts**（推荐，微软免费神经语音） | `{"provider":"command","preset":"female-warm","command":"edge-tts --voice {voice} --rate={rate} --pitch={pitch} --text {text} --write-media {out} --write-subtitles {sub}"}` | 实测（SRT/VTT） | 自然度高、支持断句语速微调；音色和语速由 `preset` 决定；无全局安装时可用 `uvx --from edge-tts edge-tts ...` |
```

"占位符："那一段换成：

```markdown
占位符：`{text}` 读音替换后的单句文本、`{out}` 输出音频路径、`{sub}` 字幕时间戳输出路径、`{voice}` 音色名、`{speed}` 语速倍率、`{rate}` `edge-tts` 语速格式（如 `0.96` → `-4%`）、`{pitch}` `edge-tts` 音高格式（`voice.pitch` 为 `-3` 时是 `-3Hz`，缺省 `+0Hz`）。写了 `preset` 时，`{voice}`、`{speed}`、`{rate}` 取人设的音色和语速；另写 `voice.voice` 会换掉人设的音色（自检报 `PRESET_UNUSED`），另写 `voice.speed` 会换掉人设的语速。命令按参数数组直接执行，不经过 shell 拼接。
```

"中文常用神经音色：……"那一行换成：

```markdown
配音人设：8 个人设的音色和适合的题材见 [script.md](script.md) 的“配音人设与口吻”。换人设只改 `voice.preset`；`voice.pitch`（−20 到 20 Hz）只在用户要求时微调音高。
```

在第 2 节末尾（"配音人设："那一行之后、"## 3. 本地渲染命令"之前）加：

````markdown
### 试听人设

选人设或换人设之前可以先试听。只需 FFmpeg 和 edge-tts（或 uvx），不需要 `@resvg/resvg-js`，也不调用付费接口：

```sh
# 全部 8 个人设
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --audition
# 只听男声和晓晓
node <本 skill 目录>/scripts/render.mjs <项目文件夹> --audition male,female-warm
```

- 台词是讲稿最前面的两句。每个人设出一个文件，例如 `out/audition/01-male-sunny.wav`；`out/audition/all.wav` 把它们依次连起来，中间隔 0.8 秒。终端打印每个人设的音色、语速、文件和时长。
- 人设列表写人设 ID，或 `female`、`male`、`child`（选出以它开头的所有人设）。
- 只写 `out/audition/`，不改 `project.json`，也不动 `audio/`。把 `all.wav` 的路径告诉用户，等用户选定后再改 `voice.preset`。
- 项目的 `command` 是 edge-tts 命令时用它，否则用 `doctor.mjs` 推荐的 edge-tts 或 uvx 命令；两者都没有时报错"试听需要 edge-tts 或 uvx"，不改用 macOS `say`。
````

"## 3. 本地渲染命令"代码块里的"可选参数"末尾加一行：

```sh
#   --audition [人设列表]      只试听配音人设，写入 out/audition/，不出片
```

- [ ] **Step 6: 改 README 和网站**

`README.md` 第 5 行里的

```markdown
、平滑同元素转场、`edge-tts` 或离线配音）
```

换成

```markdown
、平滑同元素转场；`edge-tts` 配音有男女声 8 个人设，可以先试听，也可以离线配音）
```

`README.en.md` 第 5 行里的

```markdown
with matched-element transitions and local TTS (`edge-tts` / macOS `say`).
```

换成

```markdown
with matched-element transitions and local TTS: `edge-tts` with 8 male and female voice presets you can audition first, or macOS `say`.
```

两份 README 的章节和链接都不变，`tests/readme.test.mjs` 已有的同步测试会核对。

`site/index.html` 第 165 行里的

```html
<li>支持 <code>edge-tts</code> 神经配音与自然标点停顿，分句字幕关键词同步着色</li>
```

换成

```html
<li>支持 <code>edge-tts</code> 神经配音：男女声 8 个人设，可以先试听；自然标点停顿，分句字幕关键词同步着色</li>
```

- [ ] **Step 7: 运行测试，确认通过**

运行：`node --test tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs tests/links.test.mjs tests/budget.test.mjs`
预期：全部通过（`links.test.mjs` 证明新链接都能打开，`budget.test.mjs` 证明 `SKILL.md` 和 reference 没超行数）。
再运行：`wc -l skills/topic-to-video/SKILL.md skills/topic-to-video/references/*.md`，预期 `SKILL.md` 约 61 行、`script.md` 约 130 行、`providers.md` 约 80 行，都在上限以内；然后 `npm test`，预期全部通过。

- [ ] **Step 8: 提交**

```bash
git add skills/topic-to-video/SKILL.md skills/topic-to-video/references/script.md skills/topic-to-video/references/providers.md README.md README.en.md site/index.html tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs
git commit -m "docs(voice): document voice presets, tone rules and audition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 场景评测 07

**Files:**
- Create: `tests/scenarios/07-male-voice.json`
- Modify: `tests/scenario-specs.test.mjs:9-11`

**Interfaces:**
- Consumes: Task 5 写进 `SKILL.md` 和 `script.md` 的规则（场景检查的就是 agent 照这些规则做没做到）
- Produces: 无代码接口

- [ ] **Step 1: 写失败的测试**

`tests/scenario-specs.test.mjs` 第 9–11 行换成：

```js
test('there are seven scenarios numbered 01–07', () => {
  assert.deepEqual(specs.map((f) => f.slice(0, 2)), ['01', '02', '03', '04', '05', '06', '07']);
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`node --test tests/scenario-specs.test.mjs`
预期：失败，实际只有 `01`–`06`。

- [ ] **Step 3: 新建场景**

`tests/scenarios/07-male-voice.json`：

```json
{
  "id": "07",
  "title": "用户要男声配音",
  "level": "L0",
  "fixtures": [],
  "turns": [
    "帮我做一个 1 分钟的视频，讲讲“为什么冬天静电多”，用男声配音。",
    "方案可以，出提示词包。"
  ],
  "checks": [
    "第 1 轮没有追问配音，直接按男声出方案：project.json 的 voice 是 {\"provider\": \"undecided\", \"preset\": \"male-sunny\"}，没有写 voice.voice 和 speed",
    "讲稿.md 开头有一行“配音：男声·云希（male-sunny）”",
    "讲稿口吻像对朋友讲：用“你”“我们”，有设问；“其实”“你看”“那么”这类连接词每段不超过两个",
    "自动检查摘要中 schema_errors、check_errors、derived_docs 都为空，lint_warnings 没有 ESTIMATE_OFF_TARGET",
    "第 2 轮在 checkpoints 中记录了 stage 为 plan 的确认并产出提示词包.md；全程没有安装工具，也没有调用付费服务或 TTS"
  ]
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`node --test tests/scenario-specs.test.mjs`，预期全部通过；再运行 `npm test`，预期全部通过。
不要运行 `npm run scenario`：真正跑 agy 要花配额，Task 7 结束时问 owner。

- [ ] **Step 5: 提交**

```bash
git add tests/scenarios/07-male-voice.json tests/scenario-specs.test.mjs
git commit -m "test(scenario): add scenario 07 for a male voice request" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 实测验收（由主会话做，要联网用 edge-tts，免费）

**Files:**
- 只改示例的副本 `out/v-check/cache-speed/`（`out/` 已在 `.gitignore` 里，不会提交，owner 也能在文件面板里打开）；只有语速需要重调时才改 `skills/topic-to-video/scripts/lib/project.mjs` 的 `VOICE_PRESETS`、`tests/project.test.mjs` 里对应的断言和 `docs/lite/声音人设设计.md` §3 的表

**Interfaces:**
- Consumes: Task 1–5 的全部成果
- Produces: 验收结论（汇报给 owner）

- [ ] **Step 1: 复制示例**

```bash
SCRATCH="$PWD/out/v-check/cache-speed"; test ! -e "$SCRATCH" && mkdir -p "$(dirname "$SCRATCH")" && cp -R examples/cache-speed "$SCRATCH" && echo "$SCRATCH"
```

`$SCRATCH` 已经存在时这条命令什么也不做：先看里面是什么，确认是上一次验收留下的再删。

- [ ] **Step 2: 试听全部 8 个人设**

```bash
node skills/topic-to-video/scripts/render.mjs "$SCRATCH" --audition > "$SCRATCH/audition.json"; cat "$SCRATCH/audition.json"
```

```bash
diff "$SCRATCH/project.json" examples/cache-speed/project.json && test ! -e "$SCRATCH/audio" && echo "project.json 未改，没有 audio/"
```

预期：`"ok": true`，`presets` 有 8 项，`$SCRATCH/out/audition/` 里有 `01-female-warm.wav` 到 `08-female-shaanxi.wav` 和 `all.wav`；第二条命令打印"project.json 未改，没有 audio/"。

- [ ] **Step 3: 量语速**

```bash
node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const base = r.presets[0].duration_ms; for (const p of r.presets) console.log(p.preset.padEnd(15), String(p.duration_ms).padStart(5), `${((p.duration_ms / base - 1) * 100).toFixed(1)}%`);' "$SCRATCH/audition.json"
```

预期：每个人设与 `female-warm` 相差在 ±5.0% 以内。超出的人设，偏慢就把它的 `speed` 加 0.02，偏快就减 0.02（晓晓 `female-warm` 不动），同步改 `tests/project.test.mjs` 里被改人设的断言和设计 §3 的表，重跑 Step 2–3 直到都在范围内，然后 `npm test` 并提交：

```bash
git add skills/topic-to-video/scripts/lib/project.mjs tests/project.test.mjs docs/lite/声音人设设计.md
git commit -m "fix(voice): retune preset speeds from the audition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: owner 试听**

把 `$SCRATCH/out/audition/all.wav` 发给 owner（用完整绝对路径），附上播放顺序（女声·晓晓、女声·晓伊、男声·云希、男声·云健、男声·云扬、童声·云夏、东北话·晓北、陕西话·晓妮）和 Step 3 的语速表，请 owner 确认默认男女声和语速。owner 要调时按 Step 3 的办法改，再请 owner 听一次。

- [ ] **Step 5: 换成男声出 540p 预览**

```bash
CMD="$(node skills/topic-to-video/scripts/doctor.mjs | node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => console.log(JSON.parse(s).recommended_voice.command));')"
node -e 'const fs = require("fs"); const f = process.argv[1]; const p = JSON.parse(fs.readFileSync(f, "utf8")); p.voice = { provider: "command", preset: "male-sunny", command: process.argv[2] }; fs.writeFileSync(f, JSON.stringify(p, null, 2));' "$SCRATCH/project.json" "$CMD"
node skills/topic-to-video/scripts/check.mjs "$SCRATCH"
node skills/topic-to-video/scripts/render.mjs "$SCRATCH" --preview
```

预期：`$CMD` 含 `edge-tts` 和 `--pitch={pitch}`；`check.mjs` 的 `errors`、`warnings`、`docs` 都为空（没有 `PRESET_UNUSED`）；渲染输出 `"ok": true`，`qa.issues` 为 0。全片要合成约 30 句，耗时几分钟，放到后台跑。再看 `$SCRATCH/out/qa.md`：音画同步一项通过，说明画面时间跟着新配音走；`$SCRATCH/audio/timing.json` 里每句都有 `cache_key`。QA 报了问题时，先查是不是换配音后镜头变长变短引起的，把问题和原因写进汇报，不在本计划里改渲染器。

- [ ] **Step 6: 收尾**

运行 `npm test`，预期全部通过；`git status --short` 除 `.DS_Store` 外没有未提交的改动。用中文向 owner 汇报：做了什么、语速表、试听文件和预览视频的路径、哪些没检查；并问是否花配额跑场景 07（`npm run scenario -- --scenario 07 --mode skill --agent agy`）。
