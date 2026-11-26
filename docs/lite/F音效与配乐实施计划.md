# F 音效与配乐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 L1 成片有声音：17 种代码合成的克制音效按画面事件自动卡点，4 种情绪的合成音乐床（也可以用用户自带、有许可的音乐）在说话时自动压低，QA 用两项电平检查保证人声始终最清楚；没有 `world` 的旧项目声音完全不变。

**Architecture:** 新增 `sound.mjs`（DSP 小工具、音效合成、事件收集、密度控制、音效声部与声像）和 `music.mjs`（音乐床合成、混响、闪避包络、用户音乐、三轨混音与试听）。依赖只有一个方向：`music.mjs` 引用 `sound.mjs`。事件时刻来自镜头计划和动作模块，`motion.mjs` 新导出 `hostEventTimeline` 交出走路、互动和一次性手势的时刻。`encode.mjs` 在声音打开时改走"人声润色 → JS 混音 → 两遍 loudnorm（linear）"，关闭时走原路径；`qa.mjs` 加电平检查和"声音"报告；`project.mjs`/schema 加 `sound` 字段、缺省规则和三项自检。

**Tech Stack:** Node ≥ 20（ESM，`node --test`），纯 JS 浮点 DSP；FFmpeg 只用于人声润色、用户音乐解码和最终编码（已有依赖）；不加 npm 包。

**Spec:** [音效与配乐设计](音效与配乐设计.md)（展开 [个性化路线图](个性化路线图.md) §6.5）

## Global Constraints

- skill 目录 ≤ 45 个文件、≤ 5 MB；本计划新增 `scripts/lib/sound.mjs`、`scripts/lib/music.mjs`，36 → 38 个文件；不加音频文件、图片文件和 npm 依赖。
- `SKILL.md` ≤ 150 行、≤ 8 KB；每份 reference ≤ 250 行、≤ 10 KB（`world.md` 现在 9846 字节，只能加一行）；一次 L0 读取合计 ≤ 100 KB。
- 只做向后兼容的新增：`version` 仍为 1；没有 `world` 的项目送进 loudnorm 的 WAV 与改动前逐字节相同；`SCENE_VERSION` 不变（画面不变，视频镜头缓存不失效）；`rights.json` 的 `usage` 不动。
- 采样率固定 48000 Hz；内部一律用 `Float32Array`；输出立体声。
- 电平（以润色后人声说话部分的平均均方根 V dB 为基准）：音乐整体 V − 14 dB、说话时再 −6 dB；普通音效 100 ms 窗均方根 说话时 V − 14 / 停顿 V − 10；重点 V − 12 / V − 8；脚步 V − 26。QA 阈值：音乐差 < 15 dB 报 `MUSIC_TOO_LOUD`，音效差 < 8 dB 报 `SFX_OVER_VOICE`。
- 闪避：提前 120 ms 开始压低，压低 150 ms，说完等 300 ms，回升 500 ms。
- 密度：普通和重点音效间隔 ≥ 500 ms，撞上时留档位高的、同档留先出现的；脚步离其他音效 < 120 ms 时去掉。
- 声像：`pan = clamp((x / 1920 − 0.5) × 0.6, −0.3, 0.3)`，`θ = (pan + 1) · π/4`，`gL = √2·cos θ`、`gR = √2·sin θ`（居中时两声道都是 1）。
- `SKILL.md`、`references/` 用中文；`README.md` 与 `README.en.md` 同步；`AGENTS.md` 保持英文。
- 每个任务先写失败测试，再写最小实现，结束时跑通 `npm test` 并提交到分支 `lite/sound`；不提交 `.DS_Store`，不 push。

## Review Focus

1. 没有配音文件的项目（`--skip-tts` 下 `timing.json` 只有估算、`file` 缺失，或用户录音全是静音）：V 取不到有效值。应以 V = −20 dBFS 作为后备继续出音效和音乐，QA 跳过两项电平检查并在 `qa.md` 写"没有人声，未检查"，不能出现 `NaN`、`-Infinity` 或除零。→ Task 7、Task 8 测试。
2. `--sample sh05-sh07` 和 `--preview`：音效只取选中镜头的事件，时刻从选中的第一个镜头算起；音乐按整条时间轴生成后截取同一段，样片和整片同一位置的音乐一致；不能把第 1 个镜头的转场或结论钟声带进样片。→ Task 3、Task 7 测试。
3. 用户音乐是单声道、44.1 kHz、短于 1 秒、或者整段静音：解码后统一成 48 kHz 立体声；短于 1 秒照样循环（交叉淡化长度缩到文件长度的一半）；静音文件不放大到爆音，报 `MUSIC_SILENT` 警告并当作没有音乐。→ Task 6 测试。
4. 很短的镜头或靠近结尾的事件：接触时刻超出镜头末尾的事件丢弃，不串到下一个镜头；整片短于淡入加淡出（4.5 秒）时淡入淡出按比例缩短；音效尾巴超出整片末尾时截断，截断点前 10 ms 淡出，最后一个采样为 0。→ Task 3、Task 4、Task 5 测试。
5. 削波：连续的重点音效叠在高电平音乐上，三轨相加峰值可能超过 1。超过 0.99 时整体同比缩小，三轨比例不变；写出的 16 位 WAV 不能出现回绕。→ Task 7 测试。

---

## 文件地图

| 文件 | 动作 | 职责 | 任务 |
| --- | --- | --- | --- |
| `skills/topic-to-video/schema/project.schema.json` | Modify | 顶层 `sound`、`$defs.sound`、`$defs.music` | 1 |
| `skills/topic-to-video/scripts/lib/project.mjs` | Modify | `SCHEMA_FIELDS`、`MUSIC_MOODS`、`MUSIC_BY_SCENE`、`resolveSound`、`checkSound`、`lintSoundFiles` | 1 |
| `skills/topic-to-video/scripts/check.mjs` | Modify | 追加 `MUSIC_FILE_MISSING` 警告 | 1 |
| `skills/topic-to-video/scripts/lib/sound.mjs` | Create | DSP 小工具、17 种音效加钟声、事件收集与密度、说话段、音效声部 | 2、3、4 |
| `skills/topic-to-video/scripts/lib/motion.mjs` | Modify | 导出 `hostEventTimeline` | 3 |
| `skills/topic-to-video/scripts/lib/scene.mjs` | Modify | 导出 `hostPlanForShot` | 3 |
| `skills/topic-to-video/scripts/lib/music.mjs` | Create | 4 种情绪的音乐床、混响、闪避包络、用户音乐、三轨混音、立体声 WAV、试听 | 5、6、7、9 |
| `skills/topic-to-video/scripts/lib/encode.mjs` | Modify | 声音打开时的混音流程；导出 `assembleAudioWav`、`polishVoiceWav` | 7 |
| `skills/topic-to-video/scripts/lib/qa.mjs` | Modify | `analyzeMixLevels`、`audio` 报告、`qa.md` 声音一节 | 8 |
| `skills/topic-to-video/scripts/render.mjs` | Modify | `--audition-sound [情绪列表]` | 9 |
| `skills/topic-to-video/SKILL.md`、`references/world.md`、`references/providers.md`、`references/prompt-pack.md` | Modify | 默认值一行、指向 providers 的一行、"声音"一节、配乐建议一行 | 10 |
| `README.md`、`README.en.md`、`examples/cache-speed/project.json`、`docs/lite/个性化路线图.md`、`docs/lite/音效与配乐设计.md` | Modify | 功能说明、示例显式 `sound`、评审表第 18 项、状态 | 10、11 |
| `tests/sound.test.mjs` | Create | 合成、事件、密度、音效声部 | 2、3、4 |
| `tests/music.test.mjs` | Create | 音乐床、闪避、用户音乐、混音、试听 | 5、6、7、9 |
| `tests/project.test.mjs`、`tests/schema.test.mjs`、`tests/qa.test.mjs`、`tests/scene-encode.test.mjs`、`tests/readme.test.mjs`、`tests/budget.test.mjs` | Modify | 对应任务的追加断言 | 1、7、8、10 |

---

### Task 1: `sound` 字段、缺省规则与自检

**Files:**
- Modify: `skills/topic-to-video/schema/project.schema.json`
- Modify: `skills/topic-to-video/scripts/lib/project.mjs`
- Modify: `skills/topic-to-video/scripts/check.mjs`
- Test: `tests/project.test.mjs`、`tests/schema.test.mjs`、`tests/check-cli.test.mjs`

**Interfaces:**
- Consumes: 现有的 `checkFields`、`checkShape`、`isObject`、`SCENE_NAMES`（来自 `world.mjs`）
- Produces（都从 `project.mjs` 导出）:
  - `MUSIC_MOODS = ['calm', 'playful', 'curious', 'upbeat']`
  - `MUSIC_BY_SCENE = { blank: 'calm', podium: 'calm', office: 'calm', kitchen: 'playful', street: 'playful', lab: 'curious', outdoor: 'upbeat', workshop: 'upbeat' }`
  - `MUSIC_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']`
  - `resolveSound(project) -> { sfx: boolean, music: null | { kind: 'synth', mood: string } | { kind: 'file', file: string, source: string, license: string } }`
  - `lintSoundFiles(project, projectDir) -> Array<{ path, code: 'MUSIC_FILE_MISSING', message }>`
  - `SCHEMA_FIELDS.project` 在 `'world'` 后面插入 `'sound'`；新增 `SCHEMA_FIELDS.sound = ['sfx', 'music']`、`SCHEMA_FIELDS.music = ['mood', 'file', 'source', 'license']`

- [ ] **Step 1: 写失败测试**

在 `tests/project.test.mjs` 追加（夹具用 `tests/fixtures/world-cache.json` 和 `minimal-project.json`）：
1. `resolveSound`：
   - 有 `world`（`scene: 'kitchen'`）、没写 `sound` → `{ sfx: true, music: { kind: 'synth', mood: 'playful' } }`。
   - `world.style === 'night'` 且 `scene: 'street'` → `mood: 'curious'`（风格包优先）。
   - 没有 `world`、没写 `sound` → `{ sfx: false, music: null }`。
   - 没有 `world`、写了 `{ sfx: 'auto' }` → `{ sfx: true, music: null }`。
   - 有 `world`、写了 `{ sfx: 'off' }` → `sfx: false`，`music` 仍取场景推荐；写了 `{ music: { mood: 'none' } }` → `music: null`，`sfx: true`。
   - 写了 `file` → `{ kind: 'file', file, source, license }`。
2. `checkProject` 的错误码：
   - `sound.sfx: 'loud'` → `INVALID_VALUE`（路径 `/sound/sfx`）；`music.mood: 'jazz'` → `INVALID_VALUE`。
   - `music` 同时写 `mood` 和 `file` → `INVALID_VALUE`（路径 `/sound/music`，提示二选一）。
   - 写了 `file` 但缺 `source` 或 `license`，或者其中一个是空字符串 → `MUSIC_LICENSE_MISSING`。
   - `file` 是 `https://x/a.mp3`、`/abs/a.mp3`、`../a.mp3`、`music/../../a.mp3`、`music/a.exe` → 每个都报 `MUSIC_PATH_INVALID`。
   - `source` 或 `license` 超过 200 字 → `TEXT_TOO_LONG`（沿用 `checkLimits`）。
   - `sound.extra: 1`、`music.volume: -3` → `UNKNOWN_FIELD`。
   - `sound: 'on'`、`sound.music: 'calm'` → `MISSING_FIELD`（`checkShape`：`sound` 和 `sound.music` 必须是对象）。
   - 合法写法和不写 `sound` 都没有错误；`SCHEMA_FIELDS matches the field names in the schema` 继续通过。
3. `lintSoundFiles(project, dir)`：`file` 在临时目录中不存在 → 一条 `MUSIC_FILE_MISSING`；存在 → 空数组；没有 `file` → 空数组。

在 `tests/schema.test.mjs` 的合法、非法例子表里各加两条：合法 `{ sfx: 'off', music: { mood: 'calm' } }`、合法 `{ music: { file: 'music/a.mp3', source: '用户自有', license: '用户自制' } }`；非法 `{ sfx: 'loud' }`、非法 `{ music: { mood: 'calm', file: 'music/a.mp3' } }`。

在 `tests/check-cli.test.mjs` 加一条：项目写了不存在的 `music.file` 时，`check.mjs` 退出码为 0，`warnings` 里有 `MUSIC_FILE_MISSING`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/project.test.mjs tests/schema.test.mjs tests/check-cli.test.mjs`
Expected: FAIL（`resolveSound` 未导出，`sound` 报 `UNKNOWN_FIELD`）。

- [ ] **Step 3: 实现**

- schema：顶层 `properties` 在 `world` 后加 `"sound": { "$ref": "#/$defs/sound" }`；`$defs`：

```json
"sound": {
  "type": "object", "additionalProperties": false,
  "properties": {
    "sfx": { "enum": ["auto", "off"], "description": "程序化音效开关；有 world 时缺省 auto，没有 world 时缺省 off" },
    "music": { "$ref": "#/$defs/music" }
  }
},
"music": {
  "type": "object", "additionalProperties": false,
  "properties": {
    "mood": { "enum": ["calm", "playful", "curious", "upbeat", "none"] },
    "file": { "type": "string", "pattern": "^(?!/)(?![a-zA-Z][a-zA-Z0-9+.-]*:)(?!.*(^|/)\\.\\.(/|$)).+\\.(mp3|wav|m4a|aac|flac|ogg)$" },
    "source": { "type": "string", "minLength": 1, "maxLength": 200 },
    "license": { "type": "string", "minLength": 1, "maxLength": 200 }
  },
  "oneOf": [
    { "required": ["mood"], "not": { "required": ["file"] } },
    { "required": ["file", "source", "license"], "not": { "required": ["mood"] } }
  ]
}
```

- `project.mjs`：
  - `checkShape` 加 `need(project.sound === undefined || isObject(project.sound), '/sound', 'sound 应是对象')`，以及 `sound.music` 同样的检查。
  - `checkFields` 的对象表加 `[project.sound, 'sound', '/sound', 'sound']` 和 `[project.sound.music, 'music', '/sound/music', 'sound.music']`（只在是对象时加）。
  - `checkProject` 在 `checkWorld` 后调用 `if (project.sound !== undefined) checkSound(project.sound, add)`。`checkSound` 依次报 `INVALID_VALUE`（`sfx`、`mood` 取值；`mood` 和 `file` 同时出现）、`MUSIC_PATH_INVALID`（不以 `/` 开头，不含 `scheme:`，按 `/` 切开后没有 `..` 段，扩展名小写后在 `MUSIC_EXTENSIONS` 里）、`MUSIC_LICENSE_MISSING`（`source`/`license` 缺失或 `trim()` 为空）、`TEXT_TOO_LONG`（200 字）。错误信息末尾都写"（见 providers.md 的声音一节）"。
  - `resolveSound`：

```js
export function resolveSound(project) {
  const s = isObject(project?.sound) ? project.sound : {};
  const hasWorld = isObject(project?.world);
  const sfx = s.sfx !== undefined ? s.sfx === 'auto' : hasWorld;
  const m = isObject(s.music) ? s.music : null;
  let music = null;
  if (m?.file) music = { kind: 'file', file: m.file, source: m.source, license: m.license };
  else if (m?.mood && m.mood !== 'none') music = { kind: 'synth', mood: m.mood };
  else if (!m && hasWorld) {
    const mood = project.world.style === 'night' ? 'curious' : (MUSIC_BY_SCENE[project.world.scene] ?? 'calm');
    music = { kind: 'synth', mood };
  }
  return { sfx, music };
}
```

  - `lintSoundFiles`：`music.file` 是合法路径且 `existsSync(join(projectDir, file))` 为假时，报 `MUSIC_FILE_MISSING`（"音乐文件 <file> 不在项目文件夹里，渲染前放进去"）。
- `check.mjs`：`result.warnings` 末尾追加 `...lintSoundFiles(project, dir)`（只在 `errors` 为空时调用）。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/project.test.mjs tests/schema.test.mjs tests/check-cli.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/schema/project.schema.json skills/topic-to-video/scripts/lib/project.mjs skills/topic-to-video/scripts/check.mjs tests/project.test.mjs tests/schema.test.mjs tests/check-cli.test.mjs
git commit -m "feat(sound): add the optional sound field with defaults and music license checks"
```

---

### Task 2: 17 种音效和钟声的合成（`sound.mjs` 第一部分）

**Files:**
- Create: `skills/topic-to-video/scripts/lib/sound.mjs`
- Test: `tests/sound.test.mjs`（新建）

**Interfaces:**
- Consumes: 无
- Produces:
  - `SAMPLE_RATE = 48000`
  - `SFX_KINDS = ['pop', 'swish', 'step', 'page', 'whoosh', 'thump', 'scratch', 'tick', 'drop', 'click', 'ding', 'slide', 'scribble', 'sparkle', 'snap', 'startle', 'rise', 'chime']`（17 种加钟声）
  - `SFX_DURATION_MS`：每种的时长（见下表）
  - `makeRng(seedString) -> () => number`（mulberry32，返回 `[0, 1)`）
  - `synthSfx(kind, { seed = 'sfx', variation = true } = {}) -> Float32Array`（单声道，峰值归一到 0.9；`variation` 为真时音高 ±3%、增益 ±1 dB 由种子决定；为假时音高和增益不变，噪声仍由种子决定）
  - `windowRms(samples, start, length) -> number`、`loudestWindowRms(samples, windowSamples = 4800) -> number`
  - 内部 DSP：`onePoleLowpass(x, hz)`、`onePoleHighpass(x, hz)`、`biquadBandpass(x, f0OrFn, q)`（RBJ 公式，`f0OrFn` 可以是 `(t) => Hz` 用来扫频）、`expEnv(t, attackSec, decaySec)`、`glideSine(durSec, f0, f1, envFn, rng)`

配方（时长 ms：做法）：

| kind | 时长 | 做法 |
| --- | --- | --- |
| `pop` 啵 | 70 | 正弦 900→480 Hz 指数滑音，包络 a 2 ms / d 18 ms |
| `swish` 沙 | 150 | 白噪声 → 带通 3200 Hz Q 0.9，a 25 / d 60 |
| `step` 脚步 | 35 | 白噪声 → 一阶低通 900 Hz，a 1 / d 8 |
| `page` 翻纸 | 260 | 白噪声 → 带通 1500→4500 Hz 扫频 Q 0.7，a 60 / d 90，再乘 30 Hz、深度 20% 的颤动 |
| `whoosh` 咻 | 220 | 白噪声 → 带通 600→2400 Hz Q 1.2，加 0.15 倍正弦 300→700 Hz，a 80 / d 60 |
| `thump` 咚 | 180 | 正弦 120→55 Hz，a 1 / d 55；加 0.25 倍低通 400 Hz 噪声，d 12 |
| `scratch` 划 | 240 | 两笔，各 90 ms，起点 0 和 120 ms：白噪声 → 带通 2200 Hz Q 1.5，a 10 / d 35 |
| `tick` 嗒 | 45 | 正弦 1100 Hz 加 0.5 倍 2700 Hz，d 6；加 0.3 倍高通 2000 Hz 噪声，d 4 |
| `drop` 噗 | 260 | 正弦 520→180 Hz，a 5 / d 90 |
| `click` 咔 | 40 | 高通 3000 Hz 噪声冲击 d 3，加正弦 2400 Hz d 8；18 ms 处第二下，0.6 倍 |
| `ding` 叮 | 700 | 基频 1568 Hz，泛音 ×2.76（0.4）、×5.4（0.15），a 2 / d 220 |
| `slide` 摩擦 | 500 | 白噪声 → 低通 700 Hz 与带通 1200 Hz Q 0.8 各半，a 60 / d 260，乘 8 Hz 颤动 |
| `scribble` 沙沙 | 1000 | 白噪声 → 带通 2600 Hz Q 1.2，乘以由种子决定的 6–8 Hz 不规则笔画门（每笔 60–110 ms） |
| `sparkle` 闪光 | 600 | 叮的音色，2093、2637、3136 Hz 依次在 0、80、160 ms 出现，各 d 150 |
| `snap` 响指 | 60 | 白噪声冲击 d 2，加带通 1800 Hz Q 6 的共振 d 25 |
| `startle` 吓 | 260 | 正弦 880→660 Hz 在 0 ms、660→440 Hz 在 110 ms，各 d 45 |
| `rise` 升 | 120 | 正弦 300→700 Hz，a 10 / d 40 |
| `chime` 钟声 | 1600 | 叮的音色，1047、1319、1568 Hz 依次在 0、40、80 ms 出现，各 d 600 |

每种合成完后：去掉直流（减去均值），结尾 10 ms 用升余弦淡出（增益 `sin²(π/2 · 剩余时长/10 ms)`），最后一个采样为 0，峰值归一到 0.9。

- [ ] **Step 1: 写失败测试 `tests/sound.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SFX_KINDS, SFX_DURATION_MS, SAMPLE_RATE, synthSfx, loudestWindowRms } from '../skills/topic-to-video/scripts/lib/sound.mjs';

test('there are 17 effects plus the conclusion chime', () => {
  assert.equal(SFX_KINDS.length, 18);
  assert.ok(SFX_KINDS.includes('chime') && SFX_KINDS.includes('rise'));
});

for (const kind of SFX_KINDS) {
  test(`${kind} is deterministic, bounded, DC-free and fades out`, () => {
    const a = synthSfx(kind, { seed: 'sh01:3' });
    const b = synthSfx(kind, { seed: 'sh01:3' });
    assert.deepEqual(a, b);
    assert.equal(a.length, Math.round((SFX_DURATION_MS[kind] * SAMPLE_RATE) / 1000));
    let peak = 0; let sum = 0;
    for (const v of a) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); sum += v; }
    assert.ok(peak <= 0.99 && peak > 0.1, `peak ${peak}`);
    assert.ok(Math.abs(sum / a.length) < 1e-3, 'DC');
    assert.equal(a[a.length - 1], 0);
    const lastMs = a.subarray(a.length - 48);
    assert.ok(Math.max(...lastMs.map(Math.abs)) <= 0.04, 'faded tail, no click');
    assert.ok(loudestWindowRms(a) > 0);
  });
}

test('different seeds vary pitch a little but not the length', () => {
  const a = synthSfx('ding', { seed: 'a' });
  const b = synthSfx('ding', { seed: 'b' });
  assert.equal(a.length, b.length);
  assert.notDeepEqual(a, b);
  assert.deepEqual(synthSfx('ding', { seed: 'a', variation: false }), synthSfx('ding', { seed: 'b', variation: false }));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL（`ERR_MODULE_NOT_FOUND`）。

- [ ] **Step 3: 实现**

在 `sound.mjs` 顶部写文件注释（引用 `音效与配乐设计 §4`），实现 DSP 小工具和上表的 18 个配方。`variation` 的实现：`rng = makeRng(seed)`，`pitchMul = 1 + (rng() * 2 - 1) * 0.03`，`gainDb = (rng() * 2 - 1) * 1`，所有频率乘 `pitchMul`，归一化后再乘 `10 ** (gainDb / 20)`（这一步之后峰值仍 ≤ 0.9 × 1.122 < 0.99）。噪声用同一个 `rng`，保证同一种子得到相同的采样。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/sound.test.mjs && npm test`
Expected: 全部通过；`tests/budget.test.mjs` 文件数 37 仍在上限内。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/sound.mjs tests/sound.test.mjs
git commit -m "feat(sound): synthesize seventeen paper-craft effects and the conclusion chime"
```

---

### Task 3: 从镜头计划收集音效事件，控制密度

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`（在 `getCachedHostPlan` 之后加导出）
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（导出 `hostPlanForShot`）
- Modify: `skills/topic-to-video/scripts/lib/sound.mjs`
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `buildShotPlans`、`buildTimeline`；`getCachedHostPlan`（`motion.mjs` 内部）、`getCachedEvalPlan`（`scene.mjs` 内部）
- Produces:
  - `motion.mjs`：`hostEventTimeline(manifest, plan) -> { walks: Array<{ t0, t1, fromX, toX, trot }>, interactions: Array<{ kind, t0, dur, x, targetIdx }>, gestures: Array<{ gesture, t0, x }> }`。`interactions` 直接映射 `interactionEvents`（`kind` 取 `open`/`carry`/`drop`/`push`/`pull`/`hold_up`/`draw`/`sit_on`/`react`；`stand_up` 不出），`x` 取 `standX ?? fromX ?? targetX`。`gestures` 来自 `start.gesture`（类型为 `once` 时 `t0 = 0`）和 `effectiveCues` 里类型为 `once` 的手势（`t0 = afterWalk(timeMs / 1000)`），`x` 用走路分段线性插值算出的那一刻的位置。
  - `scene.mjs`：`hostPlanForShot(shotPlan) -> object`，返回 `getCachedEvalPlan(shotPlan, shotPlan.style, Math.max(0.1, shotPlan.durationSec))`，与 `evaluateFrame` 用的是同一个对象（保证缓存命中）。
  - `sound.mjs`：
    - 档位跟着事件走，不跟着声音走（盖章的 `thump` 是重点，坐下和落地的 `thump` 是普通），所以每个事件自己带 `tier`，取值见下表。
    - `collectSoundEvents(shotPlans, manifest, { fps, lastSectionId }) -> SoundEvent[]`，`SoundEvent = { tMs: number, kind: string, tier: 'step' | 'normal' | 'accent', x: number | null, source: string }`，按 `tMs` 排序；`tMs` 从 `shotPlans[0]` 开始算，镜头起点用帧数换算：`offsetMs = (累计 frameCount) * 1000 / fps`。
    - `thinSoundEvents(events, { minGapMs = 500, stepGuardMs = 120 } = {}) -> SoundEvent[]`

事件与接触时刻（`t0` 是镜头内秒数；cue 用 `resolveCueStart` 的结果，即 `hostMeta.interactionStarts` 里有就用它，没有就用 `timeMs / 1000`）：

| 来源 | kind | 档 | 时刻 | x |
| --- | --- | --- | --- | --- |
| `reveal` | `pop` | 普通 | t0 + 0.05 | 元素中心 |
| `highlight` | `swish` | 普通 | t0 | 元素中心 |
| 走路分段 | `step` | 底层 | t0 + k·间隔（k ≥ 1，间隔走路 0.5 s、小跑 0.25 s，≤ t1 − 0.05），再加 t1 | 线性插值 |
| 转场 `morph`/`crossfade`，`layoutSwitch` 不含 `full` | `page` | 普通 | 0 | 居中 |
| 转场 `layoutSwitch` 含 `full` | `whoosh` | 普通 | 0 | 居中 |
| `state` → `stamped` | `thump` | 重点 | t0 + 0.12 | 元素中心 |
| `state` → `crossed` | `scratch` | 普通 | t0 + 0.05 | 元素中心 |
| `state` → `count:*` | `tick` | 普通 | t0 + 0.05 | 元素中心 |
| `state` → `expired`/`broken`/`empty`/`off`/`dim` | `drop` | 普通 | t0 + 0.05 | 元素中心 |
| `state` → `open`/`closed`/`locked`/`unlocked` | `click` | 普通 | t0 + 0.05 | 元素中心 |
| `state` → 其余 | `ding` | 普通 | t0 + 0.05 | 元素中心 |
| `send` | `whoosh`，再一个 `pop` | 普通 | t0；t0 + 0.8 | 起点；终点元素中心 |
| 互动 `open` | `click` | 普通 | t0 + 0.15 | 小青 |
| 互动 `carry` / `drop` | `whoosh` / `tick` | 普通 | t0 + 0.30 / t0 | 小青 |
| 互动 `push`、`pull` | `slide` | 普通 | t0 + 0.15 | 小青 |
| 互动 `sit_on` | `thump` | 普通 | t0 + 0.25 | 小青 |
| 互动 `draw` | `scribble` | 普通 | t0 | 小青 |
| 互动 `hold_up` | `sparkle` | 重点 | t0 + 0.5 | 小青 |
| 互动 `react` | 目标状态是 `expired`/`broken`/`crossed`/`empty` 时 `startle`，否则 `sparkle` | 重点 | t0 + 0.1 | 小青 |
| 手势 `jump` | `rise`，再一个 `thump`（普通） | 重点 / 普通 | t0 + 0.15；t0 + 0.5 | 小青 |
| 手势 `snap` | `snap` | 重点 | t0 + 0.35 | 小青 |
| 手势 `startle` / `double_take` | `startle` | 重点 | t0 + 0.05 / t0 + 0.35 | 小青 |
| 手势 `cheer` | `sparkle` | 重点 | t0 + 0.15 | 小青 |
| 手势 `tap` | `tick` | 普通 | t0 + 0.3 | 小青 |
| `lastSectionId` 段的第一个镜头 | `chime` | 重点 | 0.2 | 居中 |

- 时刻 > 该镜头 `durationSec` 的事件丢弃。
- 转场事件只给 `shotPlans[1]` 及以后的镜头出（样片的第一个镜头不出转场声）；结论钟声只在该镜头属于 `shotPlans` 时出。
- `thinSoundEvents`：先按 `tMs` 排序；非脚步事件贪心保留，冲突（相距 < 500 ms）时，档位高的替换已保留的，同档保留先出现的；然后去掉离任一保留的非脚步事件 < 120 ms 的脚步。

- [ ] **Step 1: 写失败测试（追加到 `tests/sound.test.mjs`）**

用 `tests/fixtures/world-cache.json` 改出一个 3 镜头夹具（在测试里构造）：sh01 `host-left` 带 `reveal` 和 `highlight`；sh02 `stage`，带 `move`、`open`、`state`（`stamped`）、`send` 和 `gesture: jump`；sh03 是最后一节的第一个镜头，`full` 版式，带 `reveal`。timing 用固定的 `duration_ms`（每句 2000，`speech: [50, 1900]`），`fps = 60`。断言：
1. 事件里出现 `pop`（sh01 的 `reveal`，`tMs` = 该 cue 的 `timeMs` + 50，误差 ≤ 1 ms）、`swish`、`step`（sh02 走路期间至少 2 个）、`click`（`open` 的 `interactionStarts` + 150 ms）、`thump` 且档位 `accent`（盖章）、`whoosh` 和 `pop`（相隔 800 ms）、`rise` 和 `thump`（相隔 350 ms）、sh02 和 sh03 开头的转场声、sh03 开头 200 ms 处的 `chime`。
2. 只传 `plans.slice(1)` 时：第一个事件的 `tMs` 从 sh02 起点算；没有 sh02 开头的转场声；仍有 sh03 的钟声。
3. 接触时刻超出镜头末尾的事件被丢弃：把 sh03 的时长压到 0.1 秒（只有一句、`duration_ms: 50`），sh03 开头 200 ms 处的钟声不出现。
4. `thinSoundEvents`：`[{tMs:0,normal,pop},{tMs:300,accent,sparkle},{tMs:900,normal,ding}]` → 留下 `sparkle` 和 `ding`；`[{tMs:0,normal,pop},{tMs:300,normal,swish}]` → 只留 `pop`；`step` 在 `tMs: 60` 和 `pop` 在 `tMs: 100` → 去掉这一步；相邻的两个 `step` 都保留。
5. `hostEventTimeline` 对 sh02 返回的 `interactions` 里有 `open`，`gestures` 里有 `jump`，`walks` 至少一段。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL（`collectSoundEvents` 未导出）。

- [ ] **Step 3: 实现**

- `motion.mjs`：在 `getCachedHostPlan` 后加 `hostEventTimeline`，只读取缓存里的 `walkSegments`、`interactionEvents`、`effectiveCues`、`afterWalk` 和 `start`，不改动画逻辑。
- `scene.mjs`：加 `export function hostPlanForShot(shotPlan)`。
- `sound.mjs`：`collectSoundEvents` 遍历 `shotPlans`；元素中心取 `plan.elements[idx].bbox`；`state`、`send`、`reveal`、`highlight` 的 `t0` 对 `stage` 镜头要用 `hostEventTimeline` 给出的互动起点规则（同 `stage.mjs` 的 `resolveCueStart`：从 `plan.endHostMeta.interactionStarts` 取 cue 序号对应的时刻）；互动和手势只在 `isHostLayout(plan.shot.layout)` 时取。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/sound.test.mjs tests/motion.test.mjs tests/interaction.test.mjs && npm test`
Expected: 全部通过，动作和画面的测试 0 回归。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/scene.mjs skills/topic-to-video/scripts/lib/sound.mjs tests/sound.test.mjs
git commit -m "feat(sound): collect sound events at contact moments from shot plans and thin them to two per second"
```

---

### Task 4: 音效声部（电平、声像、截断）

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/sound.mjs`
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `synthSfx`、`loudestWindowRms`、`SoundEvent[]`
- Produces:
  - `TIER_LEVELS_DB = { step: { speech: -26, gap: -26 }, normal: { speech: -14, gap: -10 }, accent: { speech: -12, gap: -8 } }`
  - `panGains(x) -> [gL, gR]`（`x` 为 `null` 时 `[1, 1]`；公式见 Global Constraints）
  - `speechIntervals(shotPlans, fps, sampleRate = SAMPLE_RATE) -> Array<{ start: number, end: number }>`：每句的说话段（`sentence.startMs + speech[0]` 到 `sentence.startMs + speech[1]`，加镜头起点），单位是采样，按时间排序
  - `isInIntervals(intervals, sample) -> boolean`（二分查找）
  - `renderSfxStem(events, totalSamples, { voiceRefDb, intervals, seed = 'sfx' }) -> { left: Float32Array, right: Float32Array, counts: Record<string, number> }`

做法：每个事件用 `synthSfx(kind, { seed: `${seed}:${i}` })` 合成，按事件时刻判断在不在说话段里，取对应档位的 `offsetDb`，增益 `g = 10 ** ((voiceRefDb + offsetDb) / 20) / loudestWindowRms(buf)`，再乘 `panGains(x)`，累加到两个声道；超出 `totalSamples` 的部分截掉，截断的事件在截断点前 10 ms 用升余弦淡出。

- [ ] **Step 1: 写失败测试**

1. 单个普通档 `pop` 放在停顿里（`intervals = []`），`voiceRefDb = -20`：输出中值 `(L+R)/2` 的最响 100 ms 窗均方根换算成 dB 等于 −30（误差 ±0.5 dB）；放在说话段里等于 −34。
2. 重点 `sparkle` 在停顿里 = −28 dB；`step` = −46 dB。
3. `panGains(null)` 和 `panGains(960)` 都是 `[1, 1]`；`panGains(1920)` 右声道大于左声道，且 `gL² + gR² = 2`（误差 1e-9）；`panGains(-500)` 与 `panGains(0)` 相同（钳位）。
4. 事件在 `totalSamples - 100` 处开始：不越界，两声道最后一个采样的绝对值 < 1e-6。
5. `counts` 按 kind 计数；同样的输入两次输出相同。
6. `speechIntervals`：两个镜头、每句 `speech: [50, 1900]` 时，区间数等于句数，第二个镜头的区间从它的 `startFrame` 换算的采样开始。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 实现上述导出**

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/sound.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/sound.mjs tests/sound.test.mjs
git commit -m "feat(sound): render the effects stem with tiered levels below the voice and gentle panning"
```

---

### Task 5: 合成音乐床（`music.mjs` 第一部分）

**Files:**
- Create: `skills/topic-to-video/scripts/lib/music.mjs`
- Test: `tests/music.test.mjs`（新建）

**Interfaces:**
- Consumes: `makeRng`、`SAMPLE_RATE`、`onePoleLowpass`、`onePoleHighpass`、`synthSfx`（从 `sound.mjs` 导出它们；`music.mjs` 引用 `sound.mjs`，反过来不引用）
- Produces:
  - `MOOD_SPECS`：

```js
export const MOOD_SPECS = {
  calm:    { bpm: 72,  chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], voices: ['pad', 'pluck_slow'] },
  playful: { bpm: 100, chords: [[53, 57, 60], [58, 62, 65], [55, 58, 62], [60, 64, 67]], voices: ['pad', 'pluck_staccato', 'shaker'] },
  curious: { bpm: 84,  chords: [[50, 53, 57], [55, 59, 62], [50, 53, 57], [48, 52, 55]], voices: ['pad', 'bass_pluck', 'bell'] },
  upbeat:  { bpm: 112, chords: [[55, 59, 62], [50, 54, 57], [52, 55, 59], [48, 52, 55]], voices: ['pad', 'pluck_staccato', 'kick', 'shaker'] },
};
```

（MIDI 音高；每小节 4 拍，每小节一个和弦，4 小节一循环。）
  - `synthMusicBed(mood, { durationSec, breathAtSec = [], seed = 'music' }) -> { left: Float32Array, right: Float32Array }`
  - `schroederReverb(left, right, { wet = 0.2 }) -> void`（原地处理；4 个梳状滤波器，延时 29.7/37.1/41.1/43.7 ms，反馈 0.77；2 个全通，5.0/1.7 ms，增益 0.7；右声道延时各加 0.6 ms 拉开立体声）
  - `stereoRms(left, right, start = 0, length = left.length) -> number`（中值 `(L+R)/2` 的均方根）

音色：
- `pad`：每个和弦音 3 个三角波，失谐 −7、0、+7 音分，一阶低通 1200 Hz，每小节 a 0.4 s / 释放 0.6 s，增益 0.18。
- `pluck_slow`：每拍一个分解音（和弦音循环，高八度），Karplus-Strong，衰减系数 0.996，增益 0.35。
- `pluck_staccato`：每半拍一个，衰减 0.990，增益 0.3；种子决定每小节有 1–2 个半拍休止。
- `bass_pluck`：每小节第 1、3 拍弹根音（低八度），衰减 0.995，增益 0.4。
- `bell`：每小节第 4 拍弹一个和弦音（高两个八度），用 `ding` 的泛音配方，d 0.5 s，增益 0.15。
- `shaker`：每半拍一次高通 6000 Hz 噪声，d 25 ms，反拍增益 0.12，正拍 0.06。
- `kick`：每小节第 1、3 拍，正弦 110→45 Hz，d 120 ms，增益 0.5。

结构：
- 开头淡入 1.5 秒，第一小节只有 `pad`。
- `breathAtSec` 里每个时刻所在的那一小节去掉 `pad` 以外的所有音色。
- 最后一小节换成主和弦（`chords[0]`），整段最后 3 秒线性淡出，最后一个采样为 0。
- 整片短于 4.5 秒时，淡入和淡出都乘以 `durationSec / 4.5`。
- 合成完经过 `schroederReverb`，最后不做归一（混音时按目标电平重新缩放）。

- [ ] **Step 1: 写失败测试 `tests/music.test.mjs`**

1. 4 种情绪都满足：长度 = `round(durationSec * 48000)`；全部有限值；同一种子输出相同；不同情绪输出不同；`stereoRms > 0`。
2. 淡入：前 0.1 秒的 `stereoRms` 小于 2–4 秒的 1/10；结尾最后一个采样两声道都为 0，最后 0.5 秒的均方根小于中段的 1/4。
3. 换气：`breathAtSec: [8]` 时，8 秒所在小节的均方根比不换气时同一小节低（至少 1.5 dB）。
4. 3 秒的极短整片：长度正确，首尾采样为 0，没有 NaN。
5. `schroederReverb` 对单位冲激的响应在 0.3 秒后仍不为 0，且 2 秒内衰减到 −60 dB 以下。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/music.test.mjs`
Expected: FAIL（`ERR_MODULE_NOT_FOUND`）。

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/music.test.mjs && npm test`
Expected: 全部通过；120 秒的 `synthMusicBed` 在测试里计时 < 3 秒（写成断言，失败时报出实际耗时）。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/music.mjs skills/topic-to-video/scripts/lib/sound.mjs tests/music.test.mjs
git commit -m "feat(music): synthesize four-mood music beds with section breaths and a soft reverb"
```

---

### Task 6: 闪避包络与用户音乐（`music.mjs` 第二部分）

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/music.mjs`
- Test: `tests/music.test.mjs`

**Interfaces:**
- Consumes: `speechIntervals` 的输出格式 `Array<{ start, end }>`（采样）
- Produces:
  - `duckingGains(intervals, totalSamples, { duckDb = -6, leadMs = 120, attackMs = 150, holdMs = 300, releaseMs = 500, sampleRate = SAMPLE_RATE } = {}) -> Float32Array`：线性增益，停顿处 1，说话时 `10 ** (duckDb / 20)`。每个区间从 `start − lead` 开始用 `attack` 时长降到底，`end + hold` 开始用 `release` 时长回升；两个区间的回升和下一次压低重叠时取较小值。
  - `fitMusicToLength(left, right, totalSamples, { crossfadeSec = 1, fadeOutSec = 3, sampleRate }) -> { left, right }`：短了就循环，接缝交叉淡化（文件短于 2 倍交叉淡化时，淡化长度改为文件长度的一半）；长了就截断；结尾 `fadeOutSec` 线性淡出到 0。
  - `loadUserMusic(absPath, totalSamples, { ffmpeg = 'ffmpeg' } = {}) -> { left, right, silent: boolean }`：`spawnSync(ffmpeg, ['-v', 'error', '-i', absPath, '-f', 'f32le', '-ac', '2', '-ar', '48000', 'pipe:1'], { maxBuffer: 1 << 30 })`，拆成两个声道后交给 `fitMusicToLength`；`stereoRms < 1e-5` 时 `silent: true`。文件不存在时抛出 `Error('音乐文件不存在：<absPath>')`。

- [ ] **Step 1: 写失败测试**

1. `duckingGains([{ start: 48000, end: 96000 }], 192000)`，底值 `F = 10 ** (-6 / 20)`：`g[0] = 1`；`g[42240] = 1`（提前 120 ms 才开始压）；`g[49440] = F`（再过 150 ms 压到底）；`g[72000] = F`；`g[110400] = F`（说完后保持 300 ms）；`g[134400] = 1`（再过 500 ms 回到 1）；误差都是 1e-6。
2. 两个相隔 200 ms 的区间：中间不回升到 1（最大值等于底值）。
3. `fitMusicToLength`：1.5 秒的正弦填到 5 秒，长度正确，接缝附近没有大于 0.2 的相邻采样跳变；10 秒填到 5 秒时截断，最后一个采样为 0；0.5 秒的文件也能填满且没有 NaN。
4. `loadUserMusic`（没有 FFmpeg 时 `t.skip`）：用 `ffmpeg -f lavfi -i sine=frequency=440:sample_rate=44100:duration=2 -ac 1` 生成单声道 44.1 kHz 的 WAV，读出的两声道长度都等于 `totalSamples`；用 `anullsrc` 生成 2 秒静音 → `silent: true`；不存在的路径抛错且消息包含路径。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/music.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/music.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/music.mjs tests/music.test.mjs
git commit -m "feat(music): duck music ahead of speech and loop or trim user music files"
```

---

### Task 7: 混音流程接入 `encode.mjs`

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/music.mjs`
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs`
- Test: `tests/music.test.mjs`、`tests/scene-encode.test.mjs`

**Interfaces:**
- Consumes: `resolveSound`、`collectSoundEvents`、`thinSoundEvents`、`renderSfxStem`、`speechIntervals`、`synthMusicBed`、`duckingGains`、`loadUserMusic`、`stereoRms`
- Produces:
  - `music.mjs`：
    - `voiceReferenceDb(voice, intervals) -> number | null`：说话段的平均均方根（dBFS）；没有区间或均方根 < 1e-5 时返回 `null`。
    - `buildSoundtrack({ project, projectDir, allPlans, selectedPlans, fps, voice, manifest, ffmpeg }) -> { left, right, stems: { voice, sfxMid, musicMid }, intervals, voiceRefDb, voiceMissing, scale, report: { sfxCounts, musicSource, musicLicense } }`
    - `mixStems(voice, sfx, music) -> { left, right, scale }`：人声复制到两声道，三轨相加；峰值 > 0.99 时 `scale = 0.99 / peak` 并整体相乘，否则 `scale = 1`。
    - `makeStereoWavBuffer(left, right, sampleRate = SAMPLE_RATE) -> Buffer`：16 位交错立体声，先钳位到 [−1, 1] 再乘 32767。
  - `encode.mjs`：导出 `assembleAudioWav`（原函数，不改实现）、`polishVoiceWav(inWav, outWav, { ffmpeg })`（`-af highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=10:release=120 -ac 1 -ar 48000 -c:a pcm_s16le`）；`twoPassLoudnorm(inWav, outM4a, { ffmpeg, polish = true })`（`polish: false` 时去掉 `voicePolish` 前缀，其余参数不变）。`renderProject` 的返回值新增 `audio: { ...report, voiceRefDb, voiceMissing, levels }`（`levels` 由 Task 8 的 `analyzeMixLevels` 填；本任务先放 `null`），声音关闭时 `audio: null`。

`buildSoundtrack` 的步骤：
1. `const { sfx, music } = resolveSound(project)`；`totalSamples = round(Σ selectedPlans.frameCount × 48000 / fps)`。
2. `intervals = speechIntervals(selectedPlans, fps)`；`ref = voiceReferenceDb(voice, intervals)`；`voiceMissing = ref === null`；`voiceRefDb = ref ?? -20`。
3. 音效：`sfx` 为真时 `renderSfxStem(thinSoundEvents(collectSoundEvents(selectedPlans, manifest, { fps, lastSectionId: project.sections.at(-1).id })), totalSamples, { voiceRefDb, intervals, seed: project.title })`，否则两个全零声道。
4. 音乐：
   - `synth`：整条时间轴的长度 `fullSamples` 由 `allPlans` 算；`breathAtSec` 取每个新段落第一个镜头的起点（不含第一段）；`synthMusicBed(mood, { durationSec: fullSamples / 48000, breathAtSec, seed: project.title })`，再按选中镜头的起点（`offsetSamples` = 选中第一个镜头之前所有镜头的帧数换算）截取 `totalSamples`。
   - `file`：`loadUserMusic(join(projectDir, file), totalSamples, { ffmpeg })`；`silent` 时当作没有音乐，在 `report` 里加 `musicWarning: 'MUSIC_SILENT'`。
   - 缩放到 `stereoRms = 10 ** ((voiceRefDb - 14) / 20)`，再乘 `duckingGains(intervals, totalSamples)`。
5. `mixStems`；`stems.voice`、`stems.sfxMid`、`stems.musicMid` 是混音前、没有乘 `scale` 的人声和中值声道（给 QA 用；QA 只看比例，`scale` 不影响结果）。
6. `report.musicSource` 为 `synth:<mood>`、文件路径或 `null`；`musicLicense` 为文件的许可或 `null`。

`renderProject` 中的分支（替换原来 `assembleAudioWav` + `twoPassLoudnorm` 两行）：

```js
assembleAudioWav(projectDir, selectedPlans, fps, rawAudio);
const sound = resolveSound(project);
let audio = null;
if (!sound.sfx && !sound.music) {
  twoPassLoudnorm(rawAudio, normAudio, { ffmpeg });
} else {
  const polished = join(cacheDir, 'voice-polished.wav');
  polishVoiceWav(rawAudio, polished, { ffmpeg });
  const voice = readWavPcm(readFileSync(polished)).samples;
  const track = buildSoundtrack({ project, projectDir, allPlans, selectedPlans, fps, voice, manifest, ffmpeg });
  const mixWav = join(cacheDir, 'mix.wav');
  writeFileSync(mixWav, makeStereoWavBuffer(track.left, track.right));
  twoPassLoudnorm(mixWav, normAudio, { ffmpeg, polish: false });
  audio = { ...track.report, voiceRefDb: track.voiceRefDb, voiceMissing: track.voiceMissing, levels: null };
}
```

（Task 8 会在这里用 `track.stems` 算出 `levels`；三个声部不离开 `renderProject`。）

- [ ] **Step 1: 记录改动前的黄金哈希，写失败测试**

先在当前代码上跑一次，得到没有 `world` 的项目送进 loudnorm 的 WAV 的 sha256：在 `tests/scene-encode.test.mjs` 写一个测试，用 `minimal-project.json`、两句合成的 16 位正弦 WAV（`makeWavBuffer`，440 Hz、1.5 秒）和手写的 `timing.json` 构造临时项目，调用导出的 `assembleAudioWav`，对输出文件求 sha256，和写死在测试里的常量比较。常量用 Step 1 在改动前的代码上实际算出的值（临时在测试里打印一次，再写回常量）。

然后在 `tests/music.test.mjs` 追加：
1. `mixStems`：人声峰值 0.9、音效在同一位置峰值 0.5 → `scale < 1`，输出峰值 ≤ 0.99，人声与音效的比例不变（误差 1e-6）；`makeStereoWavBuffer` 对 1.5 的输入写出 32767，不回绕成负数。
2. `buildSoundtrack`（用 Task 3 的 3 镜头夹具、合成的人声：每个说话段一段 −20 dBFS 均方根的 220 Hz 正弦）：
   - `voiceRefDb` ≈ −20（±0.5）；`voiceMissing === false`。
   - 停顿处音乐中值的均方根 ≈ −34 dBFS（±1.5），说话段中段 ≈ −40 dBFS（±1.5）。
   - `report.musicSource === 'synth:playful'`；`sfxCounts.chime === 1`。
   - 人声全零时：`voiceMissing === true`、`voiceRefDb === -20`，输出没有 NaN。
   - `selectedPlans = allPlans.slice(1)` 时，输出的音乐声部等于整片音乐声部从 sh02 起点开始的同一段（逐采样比较闪避前的音乐，误差 1e-6）。
3. `tests/scene-encode.test.mjs`（没有 FFmpeg 时 `t.skip`）：带 `world` 的 2 镜头小项目用 `--preview` 渲染，`out/preview.mp4` 有立体声 48 kHz 的音频流，`result.audio.musicSource` 以 `synth:` 开头；不带 `world` 的项目 `result.audio === null`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/music.test.mjs tests/scene-encode.test.mjs`
Expected: 黄金哈希测试通过（证明原路径没动），其余 FAIL。

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/music.test.mjs tests/scene-encode.test.mjs && npm test`
Expected: 全部通过；黄金哈希不变。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/music.mjs skills/topic-to-video/scripts/lib/encode.mjs tests/music.test.mjs tests/scene-encode.test.mjs
git commit -m "feat(encode): mix the polished voice with effects and ducked music before two-pass loudnorm"
```

---

### Task 8: QA 电平检查与"声音"报告

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/qa.mjs`
- Modify: `skills/topic-to-video/scripts/render.mjs`（把 `result.audio` 传给 `runQa`）
- Modify: `skills/topic-to-video/scripts/lib/encode.mjs`（混音后调用 `analyzeMixLevels` 填 `audio.levels`）
- Test: `tests/qa.test.mjs`

**Interfaces:**
- Consumes: `buildSoundtrack` 的 `stems`、`intervals`、`voiceMissing`
- Produces:
  - `analyzeMixLevels({ voice, sfxMid, musicMid, intervals, sampleRate = 48000 }) -> { musicMarginDb: number | null, sfxMarginDb: number | null, issues: Array<{ code, atSec, marginDb, message }> }`
    - 对每个区间：`V_s = 20·log10(rms(voice, 区间))`；音乐用 400 ms 窗、步长 200 ms，音效用 100 ms 窗、步长 50 ms，窗口必须完全落在区间内（区间短于窗口时用整个区间当一个窗口）；`margin = V_s − 20·log10(max(rms(窗口), 1e-9))`。
    - `musicMarginDb`、`sfxMarginDb` 是所有窗口的最小值，没有窗口时为 `null`。
    - 音乐某窗 `margin < 15` → `MUSIC_TOO_LOUD`；音效某窗 `margin < 8` → `SFX_OVER_VOICE`。同一代码每个区间最多报一条（报最小的那个窗口），消息写出时刻（秒，一位小数）和差值。
  - `runQa(projectDir, { ..., audio = null })`：`audio` 不为 `null` 时把 `audio.levels.issues` 并入 `issues`；`report.audio = { music_margin_db, sfx_margin_db, sfx_counts, music_source, music_license, voice_missing }`；`report.manual_review.sound_mix = 'not_checked'`；`audio.musicWarning` 存在时加一条 `MUSIC_SILENT` 警告。
  - `qa.md` 在"提醒与警告"之后加：

```md
## 声音
- 音乐比人声低：最少 <x> dB（下限 15 dB）
- 音效比人声低：最少 <y> dB（下限 8 dB）
- 音效：pop 12、swish 4、…（共 <n> 个）
- 音乐：<synth:playful 或文件路径>（许可：<license 或"内置合成，无版权问题">）
```

`voiceMissing` 为真时前两行写"没有人声，未检查"；声音关闭时整节写"- 没有音效和音乐"。人工复核项加"- 混音听感：`not_checked`"。

- [ ] **Step 1: 写失败测试（追加到 `tests/qa.test.mjs`）**

用纯数组夹具（不需要 FFmpeg）：1 个 2 秒区间，人声是 −20 dBFS 均方根的 220 Hz 正弦。
1. 正常：音乐 −40 dBFS 的 330 Hz 正弦、音效在区间中部放一个 −34 dBFS 的 100 ms 噪声 → 没有 issue；`musicMarginDb` ≈ 20、`sfxMarginDb` ≈ 14（±1）。
2. 故意做坏 1：音乐在说话时不压低（−30 dBFS）→ 一条 `MUSIC_TOO_LOUD`，`marginDb` ≈ 10。
3. 故意做坏 2：把重点音效放大 10 dB（−24 dBFS）→ 一条 `SFX_OVER_VOICE`。
4. 只有 50 ms 的区间：当一个窗口计算，不抛错。
5. 人声全零的情况下由 `runQa` 处理：`audio.voiceMissing === true` 时不报这两项，`qa.md` 含"没有人声，未检查"。
6. `runQa` 写出的 `qa.json` 有 `audio` 和 `manual_review.sound_mix`；`audio` 为 `null` 时 `qa.md` 的声音一节写"没有音效和音乐"（这一条需要 FFmpeg 生成一个 1 秒的测试视频，没有 FFmpeg 时 `t.skip`）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/qa.test.mjs`
Expected: FAIL（`analyzeMixLevels` 未导出）。

- [ ] **Step 3: 实现**

- `qa.mjs`：上面的 `analyzeMixLevels` 和 `runQa` 改动。
- `encode.mjs`：混音后填 `audio.levels = track.voiceMissing ? { musicMarginDb: null, sfxMarginDb: null, issues: [] } : analyzeMixLevels({ voice: track.stems.voice, sfxMid: track.stems.sfxMid, musicMid: track.stems.musicMid, intervals: track.intervals })`。
- `render.mjs`：调 `runQa` 时传 `audio: result.audio`；CLI 输出的 JSON 加 `sound: result.audio ? { music: result.audio.musicSource, sfx: Object.values(result.audio.sfxCounts).reduce((a, b) => a + b, 0) } : null`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/qa.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/qa.mjs skills/topic-to-video/scripts/lib/encode.mjs skills/topic-to-video/scripts/render.mjs tests/qa.test.mjs
git commit -m "feat(qa): check music and effects stay below the voice and report the sound mix"
```

---

### Task 9: `--audition-sound` 试听

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/music.mjs`
- Modify: `skills/topic-to-video/scripts/render.mjs`
- Test: `tests/music.test.mjs`、`tests/voice.test.mjs`（`parseArgs` 的已有测试在这里）

**Interfaces:**
- Consumes: `synthMusicBed`、`stereoRms`、`synthSfx`、`SFX_KINDS`、`makeStereoWavBuffer`、`MUSIC_MOODS`
- Produces:
  - `auditionSound(projectDir, { moods = MUSIC_MOODS, seed = 'audition' } = {}) -> { ok: true, files: Array<{ file, kind: 'music' | 'sfx', mood?, seconds }> }`：每个情绪写 `out/audition/music-<mood>.wav`（15 秒，`stereoRms` 缩放到 −20 dBFS，`breathAtSec: [8]`）；再写 `out/audition/sfx.wav`（`SFX_KINDS` 依次放，起点间隔 0.8 秒，每个按普通档 −20 dBFS 的 100 ms 窗均方根缩放，居中）。不读 `project.json`，不需要 FFmpeg。
  - `render.mjs`：`parseArgs` 识别 `--audition-sound`，下一个参数全部匹配 `/^(calm|playful|curious|upbeat)$/`（逗号分隔）时作为 `opts.auditionSoundList`；`main()` 在 `runDoctor` 之前处理 `--audition-sound`，打印 `auditionSound` 的结果后返回。文件头部的用法注释加一行。

- [ ] **Step 1: 写失败测试**

1. `parseArgs(['proj', '--audition-sound'])` → `{ projectDir: 'proj', auditionSound: true }`；`parseArgs(['--audition-sound', 'calm,upbeat', 'proj'])` → `auditionSoundList: 'calm,upbeat'`，`projectDir: 'proj'`；`parseArgs(['--audition-sound', 'proj'])` → `projectDir: 'proj'`，没有列表。
2. `auditionSound(tmp, { moods: ['calm'] })` 写出 `out/audition/music-calm.wav`（`readWavPcm` 读出 15 秒、2 声道）和 `sfx.wav`（时长 ≈ 0.8 × 17 + 1.6 秒，误差 0.1 秒）；`files.length === 2`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/music.test.mjs tests/voice.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/music.test.mjs tests/voice.test.mjs && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/scripts/lib/music.mjs skills/topic-to-video/scripts/render.mjs tests/music.test.mjs tests/voice.test.mjs
git commit -m "feat(render): audition the four music moods and every sound effect with --audition-sound"
```

---

### Task 10: 文档、示例与 README

**Files:**
- Modify: `skills/topic-to-video/SKILL.md`、`references/world.md`、`references/providers.md`、`references/prompt-pack.md`
- Modify: `README.md`、`README.en.md`、`examples/cache-speed/project.json`
- Test: `tests/readme.test.mjs`、`tests/references.test.mjs`、`tests/example.test.mjs`、`tests/budget.test.mjs`

**Interfaces:**
- Consumes: Task 1 的字段与错误码；Task 9 的命令
- Produces: 文档内容（下列文字逐条落地）

- [ ] **Step 1: 写失败测试**

1. `tests/readme.test.mjs`：两份 README 都提到程序化音效和合成背景音乐（中文含"音效"和"背景音乐"，英文含 `sound effects` 和 `music`），并提到 `--audition-sound`。
2. `tests/references.test.mjs`：`providers.md` 含"## 5. 声音（`project.json` 的 `sound` 字段）"一节，并出现 `sound`、`MUSIC_LICENSE_MISSING`、`MUSIC_TOO_LOUD`、`SFX_OVER_VOICE`、`--audition-sound`、4 个情绪名；`world.md` 含指向 `providers.md` 的链接；`SKILL.md` 的默认值列表含"音乐"。
3. `tests/example.test.mjs`：`cache-speed` 的 `sound` 等于 `{ sfx: 'auto', music: { mood: 'playful' } }`，自检没有错误和警告。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/readme.test.mjs tests/references.test.mjs tests/example.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 写文档**

- `SKILL.md` "开工前"第 2 条的默认值列表在"配音"后加一行：`- 音乐：按场景推荐的情绪，可关；用户自带的音乐要说明来源和许可（见 [providers.md](references/providers.md) 的声音一节）`。
- `world.md` §1 的列表末尾加一行：`- 音乐情绪按场景自动推荐，不用写；要改、要关或用自己的音乐见 [providers.md](providers.md) 的声音一节。`（加完后 ≤ 10 KB）。
- `providers.md` 末尾新增"## 5. 声音（`project.json` 的 `sound` 字段）"（约 25 行，整份 ≤ 10 KB）：
  - `sound` 字段示例两段（合成情绪、用户文件）和字段表。
  - 缺省规则：有 `world` 时音效开、音乐取推荐情绪；没有 `world` 时都不开。
  - 4 种情绪表（中文名、速度、推荐场景；`night` 风格推荐 `curious`）。
  - 用户音乐：只用用户给的文件，放在项目文件夹内；`source`、`license` 照抄用户原话，不替用户判断；不下载。错误码 `MUSIC_LICENSE_MISSING`、`MUSIC_PATH_INVALID`，警告 `MUSIC_FILE_MISSING`、`MUSIC_SILENT`。
  - 混音：人声润色后混入音效和音乐，说话时音乐压低；QA 的 `MUSIC_TOO_LOUD`、`SFX_OVER_VOICE` 是什么意思，出现时怎么改（关掉音效 `"sfx": "off"`、换情绪或改用 `"mood": "none"`）。
  - 试听：`node <skill>/scripts/render.mjs <项目文件夹> --audition-sound [calm,playful]`，输出到 `out/audition/`。
  - §3 的命令注释块加 `#   --audition-sound [情绪列表]  只试听音乐情绪和音效，写入 out/audition/，不出片`。
- `prompt-pack.md` §4"剪辑与配音"加一行：`- 配乐建议：<情绪中文名>（取 sound.music.mood 或按场景推荐）；音效按分镜动作卡点，压在人声下面`。
- `README.md` / `README.en.md`：在"交付档位"的 L1 描述里加一句（中文：L1 自动配上代码合成的音效和背景音乐，说话时音乐自动压低，`--audition-sound` 可以先试听；英文同义），两份的章节和链接保持一致。
- `examples/cache-speed/project.json`：在 `world` 后加 `"sound": { "sfx": "auto", "music": { "mood": "playful" } }`。

- [ ] **Step 4: 跑测试验证全绿**

Run: `node --test tests/readme.test.mjs tests/references.test.mjs tests/example.test.mjs tests/budget.test.mjs && npm test`
Expected: 全部通过；预算测试显示 38 个文件、每份 reference ≤ 10 KB、L0 读取 ≤ 100 KB。

- [ ] **Step 5: 提交**

```bash
git add skills/topic-to-video/SKILL.md skills/topic-to-video/references/world.md skills/topic-to-video/references/providers.md skills/topic-to-video/references/prompt-pack.md README.md README.en.md examples/cache-speed/project.json tests/readme.test.mjs tests/references.test.mjs tests/example.test.mjs
git commit -m "docs: document sound effects, synthesized music, licenses and the sound audition"
```

---

### Task 11: 验收出片与路线图更新

**Files:**
- Modify: `docs/lite/个性化路线图.md`（§8 加第 18 项）、`docs/lite/音效与配乐设计.md`（状态行）
- 输出（不提交）：`examples/cache-speed/out/`（被 `.gitignore` 忽略；如果没有被忽略，渲染到临时目录）

- [ ] **Step 1: 出验收片和试听**

```bash
node skills/topic-to-video/scripts/render.mjs examples/cache-speed --audition-sound
node skills/topic-to-video/scripts/render.mjs examples/cache-speed --resolution 1080p
```

记录：渲染总耗时、混音阶段耗时（在 `encode.mjs` 里用 `performance.now()` 量出后只打印到 stderr，不写进产物）、`qa.md` 的"声音"一节、技术问题数量。验收条件：`qa.md` 没有技术问题，混音阶段 ≤ 5 秒。

- [ ] **Step 2: 更新文档**

- `个性化路线图.md` §8 表格末尾加：`| 18 | 声音层次 | 只听不看整片 | 人声始终最清楚、音效卡在动作上、音乐不抢戏；owner 听完整片确认 |`；§5 表格 F 行不改。
- `音效与配乐设计.md` 状态行改为"F 已实现，待 owner 听整片验收"。

- [ ] **Step 3: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add docs/lite/个性化路线图.md docs/lite/音效与配乐设计.md
git commit -m "docs(lite): add the sound review item and mark F ready for listening"
```

- [ ] **Step 4: 请 owner 验收**

用中文告诉 owner：整片和 5 个试听文件的路径、`qa.md` 的声音数字、渲染耗时；请 owner 听完确认人声始终最清楚、音效不吵、音乐不廉价。owner 不满意的地方按反馈改配方或电平后重新出片；通过后按 `AGENTS.md` 合并前删除本实施计划。
