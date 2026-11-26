# H 小青人设实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小青有自己的样子和性格：头顶一根随情绪变形的呆毛、更夸张的表情、新表情 `amazed`、5 个性格动作、4 套服装，没写动作的句子按句意自动挑，站久了会有小动作。

**Architecture:** 形状和尺寸都写进 `assets/host/manifest.json`（`ahoge`、`outfits`、新的 `poses` 和 `expressions`），`rig.mjs` 只负责照数据画：呆毛和帽子画在头部坐标系里，跟着头转；围裙沿脊柱画。`motion.mjs` 的 `evaluateHostAt` 算出每一帧的呆毛渐变量和弹簧弯度、头部挤压量、响指星星和待机小动作，交给 `drawHost`。`settings.outfit` 由 `scene.mjs` 放进镜头计划和缓存键；自动响指的次数跟着 `startState`/`endState` 在镜头之间传递。

**Tech Stack:** Node ≥ 20（ESM，`node --test`）、`@resvg/resvg-js`（导出图片，开发依赖）；Ajv 只在测试里校验 schema。

**Spec:** [小青人设设计](小青人设设计.md)（展开 [个性化路线图](个性化路线图.md) §6.2）

## Global Constraints

- 不加文件、不加 npm 依赖：skill 目录仍不超过 45 个文件、5 MB；skill 只依赖一个 npm 运行时包。新测试文件 `tests/persona.test.mjs` 在 skill 目录外，不受限。
- 一次 L0 要读的 skill 文件合计不超过 100 KB；`SKILL.md` 不超过 150 行、8 KB；每份 reference 不超过 250 行、10 KB；描述的前 60 个字符说清 skill 做什么（owner 2026-11-25，设计 §5.1）。
- 只做向后兼容的新增：`project.json` 的 `version` 仍为 1；旧名字、旧动作、旧枚举值不改，新值追加在枚举末尾；不写新字段的旧项目照常通过自检和渲染。
- `rights.json` 不动，尤其是 `usage`。
- 呆毛 5 种形状和表情的对应照抄设计 §3.1：`curl` ← `explaining`、`focused`；`question` ← `curious`；`straight` ← `surprised`；`droop` ← `worried`、`frustrated`；`spring` ← `happy`、`proud`、`amazed`。换表情时 0.2 秒渐变。
- 头部挤压 6%：`surprised`、`happy`、`amazed` 拉长，`worried`、`frustrated` 压扁，0.3 秒内弹回正圆。情绪符号放大 1.3 倍；眉毛角度、抬高量和 `eye_scale` 的变化幅度加大 25%。
- 新动作照抄设计 §4.1：`snap` 一次性 0.7 秒、`lean_in` 保持、`startle` 一次性 0.8 秒、`double_take` 一次性 1 秒、`scratch_head` 一次性 1.2 秒。
- 自动挑选照抄设计 §4.2：问句 `lean_in`、`think`、`shrug`；含"原来""答案是""所以说""这就是" → `snap`、`present`、`emphasize`；含"居然""竟然""没想到" → `startle`、`double_take`、`emphasize`；揭晓和意外排在现有感叹句规则前面；自动 `snap` 每期最多 2 次，agent 写的不算。
- 待机小动作照抄设计 §4.3：同一动作 3 秒以上没有新的动作或走位指令，每隔 3–4 秒插一个（东张西望、踮脚、呆毛弹一下），由镜头 seed 决定；走路时、一次性动作进行中不插。
- `settings.outfit` 可选值 `none`、`glasses`、`hardhat`、`chef_hat`、`apron`，缺省是 `none`；storyboard 写明只在用户要求时写。
- `SKILL.md` 和 `references/` 用中文；`README.md` 与 `README.en.md` 同步。
- 先写测试，看它失败，再写最少的实现；每个任务结束时 `npm test` 全部通过。
- 在分支 `lite/host-persona` 上提交，不提交到 `main`；不提交 `.DS_Store`；不 push、不合并，除非 owner 说。
- owner 已授权使用 `gemini-3.8-flash-medium` 运行 agy 场景评测（Task 10）。向 owner 汇报用中文。

## Review Focus

1. 镜头开头就写 `host.gesture: "snap"`（一次性动作做起始动作）：应该先打响指，再回到 `idle`，不能卡在响指姿势或报错。→ Task 6 的 `a shot that starts with a snap plays it, then stands idle`。
2. 小青坐着（`sit`）时轮到"踮脚"小动作：不能整个人离地飘起来。→ Task 7 的 `a seated host never floats: tiptoe is skipped while sitting`。
3. 深色主题下戴服装：帽子、眼镜、围裙的描边用浅色墨线，不能出现黑色描边。→ Task 5 的 `outfits use the theme's ink, so a dark frame has no black outlines`。
4. 540p 出片里的呆毛、服装、星星眼和响指星星：线条不能细于 1.5 px。→ Task 5 的 `at 540p the 呆毛, outfits, star eyes and the snap sparkle stay at least 1.5 px wide`。
5. 围裙和眼镜不是帽子：不能把呆毛挪到脸上或胸口（围裙的尺寸字段和帽子的同名会出这个错）。→ Task 5 的 `glasses and the apron leave the 呆毛 where it grows`。

## 文件一览

| 文件 | 改动 | 任务 |
| --- | --- | --- |
| `tests/budget.test.mjs` | L0 上限改 100 KB；描述前 60 字符 | 1 |
| `skills/topic-to-video/schema/project.schema.json` | `settings.outfit`；`expr` 加 `amazed`；`gesture` 加 5 个 | 2、3 |
| `skills/topic-to-video/assets/host/profile.json` | `outfits`；名单同步；`style_lock`、`prompt_lock` 加呆毛 | 2、3、4 |
| `skills/topic-to-video/scripts/lib/project.mjs` | `SCHEMA_FIELDS.settings` 加 `outfit`；自检报错 | 2 |
| `skills/topic-to-video/assets/host/manifest.json` | 表情、`symbol_scale`、5 个动作；`ahoge`、`rig_version` 3；`outfits` | 3、4、5 |
| `skills/topic-to-video/scripts/lib/rig.mjs` | 星星眼、符号放大；呆毛、头部挤压；服装；响指星星 | 3、4、5、6 |
| `skills/topic-to-video/scripts/lib/motion.mjs` | 输出服装；呆毛渐变和弹簧、挤压、惊讶联动、新动作；待机小动作；自动挑选和响指上限 | 5、6、7、8 |
| `skills/topic-to-video/scripts/lib/scene.mjs` | `outfit` 进计划、帧和缓存键；`autoSnaps` 跨镜头传递 | 5、8 |
| `tools/export-host.mjs` | 速查表标签和布局；呆毛形状说明；服装一行 | 3、4、5 |
| `tools/review-host.mjs` | 540p 剪影图 `silhouette-540.png` | 4 |
| `skills/topic-to-video/assets/host/host-ref.png`、`site/assets/host-cheatsheet.png`、`site/index.html` 首页插图 | `npm run export-host` 重新导出 | 3、4、5 |
| `skills/topic-to-video/references/storyboard.md` | 主持人一节（Task 3 先同步新表情/动作名，Task 9 补呆毛、服装与句意表） | 3、9 |
| `skills/topic-to-video/references/prompt-pack.md` | 禁止项与首帧图同步呆毛与 `settings.outfit` | 9 |
| `README.md`、`README.en.md`、`site/index.html` | 讲小青的句子和速查图说明 | 9 |
| `tests/scenarios/08-host-persona.json`、`tests/scenario-specs.test.mjs` | 新增 H 阶段 L0 场景并用 agy (`gemini-3.8-flash-medium`) 实测记录 | 10 |
| `tests/persona.test.mjs` | 新建：本阶段的画法和动作测试 | 3–8 |
| `tests/schema.test.mjs`、`tests/project.test.mjs`、`tests/rig.test.mjs`、`tests/host-rig.test.mjs`、`tests/site.test.mjs`、`tests/review-host.test.mjs`、`tests/scene-encode.test.mjs`、`tests/motion.test.mjs`、`tests/references.test.mjs`、`tests/readme.test.mjs` | 跟着改 | 2–9 |

Task 1–10 按 TDD 逐个执行并提交；Task 11 生成剪影图与 540p 预览并请 owner 验收拍板。各任务写的行号都是开工前的行号；前面的任务改过同一个文件之后，按步骤里给出的原文找位置。

所有代码都已在草稿副本上跑通过（`npm test` 全绿、导出图人工看过），照抄即可。

---

## 开工前：提交本计划

- [ ] **Step 1: 确认分支并提交**

```bash
git branch --show-current
```

Expected: `lite/host-persona`

```bash
git add "docs/lite/H小青人设实施计划.md"
git commit -m "$(cat <<'EOF'
docs(lite): add the H implementation plan for 小青's persona

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: L0 读取预算改为 100 KB

**Files:**
- Modify: `tests/budget.test.mjs`（末尾的 30 KB 测试）

**Interfaces:**
- Consumes: 无
- Produces: 后面的任务可以让 `storyboard.md`、`profile.json` 变大，只要单文件仍在 10 KB 内、合计在 100 KB 内。

- [ ] **Step 1: 改测试**

把文件末尾这段：

```js
// 24 KB until S1; the stick-figure host added 8 expressions, 12 gestures, 6 props and walking (火柴人主持人设计 §10).
// 28 KB until V; the voice presets and tone rules added 2 KB (声音人设设计 §6, owner approved 2026-11-25).
test('a full L0 run reads at most 30 KB of skill files', () => {
  const read = ['SKILL.md', 'references/script.md', 'references/storyboard.md', 'references/prompt-pack.md', 'assets/host/profile.json'];
  const total = read.reduce((sum, f) => sum + bytes(join(SKILL, f)), 0);
  assert.ok(total <= 30 * KB, `${total} bytes`);
});
```

换成：

```js
// 24 KB until S1, 28 KB until V, 30 KB until H. The owner raised it to 100 KB on 2026-11-25 after checking what
// Hermes, Claude Code, Codex and Antigravity load (小青人设设计 §5.1); the per-file caps above stay.
test('a full L0 run reads at most 100 KB of skill files', () => {
  const read = ['SKILL.md', 'references/script.md', 'references/storyboard.md', 'references/prompt-pack.md', 'assets/host/profile.json'];
  const total = read.reduce((sum, f) => sum + bytes(join(SKILL, f)), 0);
  assert.ok(total <= 100 * KB, `${total} bytes`);
});

// Hermes lists a skill by the first 60 characters of its description (skills.index_desc_limit, 小青人设设计 §5.1).
test('the first 60 characters of the description say what the skill makes', () => {
  const description = readFileSync(join(SKILL, 'SKILL.md'), 'utf8').match(/^description: (.+)$/m)[1];
  const head = [...description].slice(0, 60).join('');
  assert.match(head, /中文知识解说视频/);
  assert.match(head, /分镜/);
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test tests/budget.test.mjs`
Expected: PASS，9 个测试全过（只放宽上限、加了一条对现状的检查；现在的描述前 60 字符是"把主题、资料或已有讲稿做成中文知识解说视频：输出方案、口播讲稿、分镜和交给外部视频模型……"）。

为了确认新测试真能拦住问题：临时把 `/分镜/` 改成 `/不存在的词/`，再跑一次，Expected: FAIL `the first 60 characters of the description say what the skill makes`；改回来。

- [ ] **Step 3: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add tests/budget.test.mjs
git commit -m "$(cat <<'EOF'
test(budget): raise the L0 read budget to 100 KB and check the description head

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `settings.outfit` 字段和自检

**Files:**
- Modify: `skills/topic-to-video/schema/project.schema.json:69`
- Modify: `skills/topic-to-video/assets/host/profile.json:7`
- Modify: `skills/topic-to-video/scripts/lib/project.mjs:54`、`:136`
- Test: `tests/schema.test.mjs`、`tests/project.test.mjs`、`tests/host-rig.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `profile.json` 的 `outfits: ["none", "glasses", "hardhat", "chef_hat", "apron"]`；`project.settings.outfit`（可选）；自检错误 `INVALID_VALUE /settings/outfit`。

- [ ] **Step 1: 写失败的测试**

`tests/schema.test.mjs`：在 `valid` 对象（第 14 行起）里加一条：

```js
  'a host in an outfit': (p) => { p.settings.outfit = 'hardhat'; },
```

在 `invalid` 对象（第 55 行起）里加一条：

```js
  'an unknown outfit': (p) => { p.settings.outfit = 'cape'; },
```

`tests/project.test.mjs` 末尾加：

```js
test('settings.outfit is optional, none means no outfit, and an unknown one names the choices', () => {
  const p = minimal();
  p.settings.outfit = 'none';
  assert.deepEqual(checkProject(p), []);
  p.settings.outfit = 'apron';
  assert.deepEqual(checkProject(p), []);
  p.settings.outfit = 'cape';
  const [error] = checkProject(p);
  assert.equal(`${error.code} ${error.path}`, 'INVALID_VALUE /settings/outfit');
  assert.match(error.message, /cape.*glasses、hardhat、chef_hat、apron/);
});
```

`tests/host-rig.test.mjs`：在 `profile, manifest and schema list the same expressions, gestures and props` 测试后面加：

```js
test('profile and schema list the same outfits, starting with none', () => {
  assert.deepEqual(profile.outfits, schema.$defs.settings.properties.outfit.enum);
  assert.equal(profile.outfits[0], 'none');
});
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/schema.test.mjs tests/project.test.mjs tests/host-rig.test.mjs`
Expected: FAIL：`accepts a host in an outfit`（schema 不认识 `outfit`）、`settings.outfit is optional…`（`UNKNOWN_FIELD`）、`profile and schema list the same outfits…`（`profile.outfits` 是 undefined）。`rejects an unknown outfit` 已经会过（未知字段本来就被拒），不算数。

- [ ] **Step 3: 写实现**

`project.schema.json` 的 `settings.properties` 里，把

```json
        "resolution": { "enum": ["1080p", "1440p", "2160p"] }
      }
```

换成

```json
        "resolution": { "enum": ["1080p", "1440p", "2160p"] },
        "outfit": { "enum": ["none", "glasses", "hardhat", "chef_hat", "apron"] }
      }
```

`profile.json` 在 `"props": [...]` 那一行后面加一行：

```json
  "outfits": ["none", "glasses", "hardhat", "chef_hat", "apron"],
```

`project.mjs` 第 54 行：

```js
  settings: ['ratio', 'target_seconds', 'lang', 'host', 'theme', 'sentence_gap_ms', 'fps', 'resolution'],
```

改成

```js
  settings: ['ratio', 'target_seconds', 'lang', 'host', 'theme', 'sentence_gap_ms', 'fps', 'resolution', 'outfit'],
```

`checkProject` 里，在 `if (project.settings.host !== HOST_ID) {` 前面加：

```js
  const outfit = project.settings.outfit;
  if (outfit !== undefined && !PROFILE.outfits.includes(outfit)) {
    add('/settings/outfit', 'INVALID_VALUE', `服装 ${outfit} 不存在，可选 ${PROFILE.outfits.join('、')}（见 storyboard.md 的主持人一节）`);
  }
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node --test tests/schema.test.mjs tests/project.test.mjs tests/host-rig.test.mjs`
Expected: PASS。

- [ ] **Step 5: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/schema/project.schema.json skills/topic-to-video/assets/host/profile.json skills/topic-to-video/scripts/lib/project.mjs tests/schema.test.mjs tests/project.test.mjs tests/host-rig.test.mjs
git commit -m "$(cat <<'EOF'
feat(project): add the optional settings.outfit with a self-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 新动作、`amazed` 和更夸张的表情

**Files:**
- Modify: `skills/topic-to-video/assets/host/manifest.json`（`figure`、`expressions`、`poses`）
- Modify: `skills/topic-to-video/assets/host/profile.json`、`skills/topic-to-video/schema/project.schema.json:24-25`
- Modify: `skills/topic-to-video/scripts/lib/rig.mjs`（`face` 的眼睛、`symbol`）
- Modify: `tools/export-host.mjs`（`LABELS`、`cheatsheetSvg`）
- Regenerate: `host-ref.png`、`site/assets/host-cheatsheet.png`、`site/index.html` 首页插图
- Test: `tests/persona.test.mjs`（新建）、`tests/rig.test.mjs:91-96`、`tests/site.test.mjs:41`

**Interfaces:**
- Consumes: 无
- Produces: 动作 `snap`、`lean_in`、`startle`、`double_take`、`scratch_head`；表情 `amazed`（`eyes: "star"`）；各表情的 `squash`（Task 6 用）；`manifest.figure.symbol_scale = 1.3`；速查表 1800×2040。

- [ ] **Step 1: 写失败的测试**

新建 `tests/persona.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawHost, resolvePose } from '../skills/topic-to-video/scripts/lib/rig.mjs';
import { evaluateHostAt } from '../skills/topic-to-video/scripts/lib/motion.mjs';

// 小青人设设计 (H): the 呆毛, bigger faces, amazed, five persona gestures, outfits, auto beats and fidgets.
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const H = manifest.height_px;
const R = (manifest.joints.head.length * H) / 2;
const draw = (state) => drawHost(manifest, { gesture: 'idle', expr: 'explaining', x: 400, ground: 930, seed: 'sh01', ...state });
const START = { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
const plan = (cues, extra = {}) => ({
  seed: 'sh07', durationSec: 6, startState: START, cues, elements: [],
  sentences: [{ index: 0, startMs: 0, endMs: 5800, text: '讲一句。' }], ...extra,
});
const NEW_GESTURES = ['snap', 'lean_in', 'startle', 'double_take', 'scratch_head'];

test('the five persona gestures are written inside the joint ranges', () => {
  for (const g of NEW_GESTURES) {
    const pose = resolvePose(manifest, g);
    for (const [joint, deg] of Object.entries(pose.angles)) {
      const [lo, hi] = manifest.joints[joint].range;
      assert.ok(deg >= lo && deg <= hi, `${g} ${joint} ${deg}`);
    }
  }
  assert.deepEqual(NEW_GESTURES.map((g) => resolvePose(manifest, g).type), ['once', 'hold', 'once', 'once', 'once']);
  assert.deepEqual(['snap', 'startle', 'double_take', 'scratch_head'].map((g) => resolvePose(manifest, g).seconds), [0.7, 0.8, 1, 1.2]);
});

test('a persona once gesture plays, then the host goes back to the hold gesture', () => {
  for (const g of ['snap', 'startle', 'double_take', 'scratch_head']) {
    const p = plan([{ sentence: 0, do: 'gesture', target: 'present', timeMs: 0 }, { sentence: 0, do: 'gesture', target: g, timeMs: 1000 }]);
    assert.equal(evaluateHostAt(manifest, p, 1.2).gesture, g);
    assert.equal(evaluateHostAt(manifest, p, 1 + resolvePose(manifest, g).seconds + 0.35).gesture, 'present');
  }
});

test('amazed draws two star eyes, a grin and the sparkle', () => {
  const svg = draw({ expr: 'amazed' });
  assert.equal((svg.match(/data-eye="star"/g) ?? []).length, 2);
  assert.match(svg, /data-symbol="sparkle"/);
  assert.equal(manifest.expressions.amazed.mouth, 'grin');
});

test('faces are 25% stronger than rig v2: brow angle, brow lift and eye scale', () => {
  const v2 = {
    explaining: [-4, 0], focused: [12, -0.006], happy: [-8, 0.012], curious: [0, 0.004],
    surprised: [-6, 0.025], worried: [-18, 0.01], frustrated: [20, -0.008], proud: [4, 0],
  };
  for (const [expr, [angle, lift]] of Object.entries(v2)) {
    const brow = manifest.expressions[expr].brow;
    assert.ok(Math.abs(brow.angle - 1.25 * angle) <= 0.01, `${expr} angle ${brow.angle}`);
    assert.ok(Math.abs(brow.lift - 1.25 * lift) <= 0.001, `${expr} lift ${brow.lift}`);
  }
  manifest.expressions.curious.eye_scale.forEach((s, i) => assert.ok(Math.abs(s - (1 + ([1.25, 0.8][i] - 1) * 1.25)) <= 0.01, `eye ${i}`));
});

test('surprised, happy and amazed stretch the head 6%; worried and frustrated squash it', () => {
  const squash = Object.fromEntries(Object.entries(manifest.expressions).map(([e, x]) => [e, x.squash ?? 0]));
  assert.deepEqual(squash, { explaining: 0, focused: 0, happy: 0.06, curious: 0, surprised: 0.06, worried: -0.06, frustrated: -0.06, proud: 0, amazed: 0.06 });
});

test('emotion symbols are drawn 1.3 times larger around their anchor', () => {
  assert.equal(manifest.figure.symbol_scale, 1.3);
  for (const expr of ['curious', 'surprised', 'worried', 'frustrated', 'proud']) {
    assert.match(draw({ expr }), /scale\(1\.3\) translate\([^)]*\)"><g data-symbol="/, expr);
  }
});
```

`tests/rig.test.mjs` 第 91–96 行的测试改成（`scratch_head` 的手要放到头顶，肘一定离头很近，和 `think` 一样列为例外）：

```js
test('clear silhouette: raised arms pass beside the head, not through it, except the hand on the chin in think and on the head in scratch_head', () => {
  for (const gesture of POSES.filter((g) => !['think', 'scratch_head'].includes(g))) {
    const { points: p, R } = stand(gesture);
    for (const s of ['l', 'r']) assert.ok(dist(p[`${s}_elbow`], p.head_center) >= 1.2 * R, `${gesture} ${s}`);
  }
});
```

`tests/site.test.mjs` 第 41 行：

```js
  assert.deepEqual(pngSize(png), { width: 1800, height: 1600 });
```

改成

```js
  assert.deepEqual(pngSize(png), { width: 1800, height: 2040 });
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/persona.test.mjs tests/site.test.mjs`
Expected: FAIL：`unknown gesture snap`、`amazed` 的 `Cannot read properties of undefined`、幅度和 `symbol_scale` 的断言、速查表尺寸 1600 ≠ 2040。

- [ ] **Step 3: 改 manifest、profile、schema**

`manifest.json` 的 `figure` 行末尾 `"face_scale": 1.2}` 改成 `"face_scale": 1.2, "symbol_scale": 1.3}`。

整段 `"expressions": { … }` 换成：

```json
  "expressions": {
    "explaining": {"eyes": "oval", "brow": {"angle": -5, "lift": 0}, "mouth": "smile"},
    "focused": {"eyes": "narrow", "brow": {"angle": 15, "lift": -0.0075}, "mouth": "line"},
    "happy": {"eyes": "arc", "brow": {"angle": -10, "lift": 0.015}, "mouth": "grin", "squash": 0.06},
    "curious": {"eyes": "oval", "eye_scale": [1.31, 0.75], "brow": {"angle": 0, "lift": 0.005, "asym": 0.025}, "mouth": "o", "symbol": "question"},
    "surprised": {"eyes": "tall", "brow": {"angle": -7.5, "lift": 0.031}, "mouth": "gasp", "symbol": "exclaim", "squash": 0.06},
    "worried": {"eyes": "oval", "brow": {"angle": -22.5, "lift": 0.0125}, "mouth": "wave", "symbol": "sweat", "squash": -0.06},
    "frustrated": {"eyes": "caret", "brow": {"angle": 25, "lift": -0.01}, "mouth": "teeth", "symbol": "shake", "squash": -0.06},
    "proud": {"eyes": "half", "brow": {"angle": 5, "lift": 0, "asym": 0.025}, "mouth": "smirk", "symbol": "sparkle"},
    "amazed": {"eyes": "star", "brow": {"angle": -10, "lift": 0.025}, "mouth": "grin", "symbol": "sparkle", "squash": 0.06}
  },
```

`poses` 的最后一项 `"tap": {…}` 后面加逗号，再追加 5 行（角度已核对过关节范围、平衡、动作线和脊柱 S 形）：

```json
    "snap": {"type": "once", "seconds": 0.7, "view": "three_quarter", "support": "r", "angles": {"waist": -2, "chest": 4, "neck": -4, "head": -6, "l_shoulder": 60, "l_elbow": 110, "l_wrist": 10, "r_shoulder": -28, "r_elbow": 26, "l_hip": 16, "l_knee": 8, "l_ankle": 4, "r_hip": -6, "r_knee": 2}},
    "lean_in": {"type": "hold", "view": "three_quarter", "support": "l", "hands": {"l": "open"}, "angles": {"pelvis": 4, "waist": 12, "chest": 10, "neck": 4, "head": -8, "l_shoulder": 128, "l_elbow": 57, "l_wrist": -20, "r_shoulder": -40, "r_elbow": 40, "l_hip": 2, "l_knee": 4, "r_hip": -14, "r_knee": 6, "r_ankle": -8}},
    "startle": {"type": "once", "seconds": 0.8, "view": "front", "support": "both", "hands": {"l": "open", "r": "open"}, "angles": {"pelvis": -4, "waist": -6, "chest": -6, "neck": -6, "head": -8, "l_shoulder": 118, "l_elbow": 48, "l_wrist": 10, "r_shoulder": 110, "r_elbow": 56, "r_wrist": 14, "l_hip": 14, "l_knee": 18, "r_hip": 10, "r_knee": 14}},
    "double_take": {"type": "once", "seconds": 1.0, "view": "three_quarter", "support": "l", "angles": {"waist": -4, "chest": -4, "neck": -8, "head": -12, "l_shoulder": 22, "l_elbow": 34, "l_wrist": 6, "r_shoulder": -30, "r_elbow": 24, "l_hip": 4, "l_knee": 4, "r_hip": 18, "r_knee": 12, "r_ankle": -10}},
    "scratch_head": {"type": "once", "seconds": 1.2, "view": "three_quarter", "support": "r", "angles": {"waist": -2, "chest": 4, "neck": 8, "head": 14, "l_shoulder": 154, "l_elbow": 55, "l_wrist": 40, "r_shoulder": -28, "r_elbow": 30, "l_hip": 14, "l_knee": 12, "r_hip": -4, "r_knee": 2}}
```

`profile.json`：`"expressions"` 末尾加 `, "amazed"`；`"gestures"` 末尾加 `, "snap", "lean_in", "startle", "double_take", "scratch_head"`。

`project.schema.json` 第 24–25 行同样追加：

```json
    "expr": { "enum": ["explaining", "focused", "happy", "curious", "surprised", "worried", "frustrated", "proud", "amazed"] },
    "gesture": { "enum": ["idle", "point_right", "wave", "emphasize", "point", "think", "shrug", "present", "sit", "jump", "cheer", "tap", "snap", "lean_in", "startle", "double_take", "scratch_head"] },
```

- [ ] **Step 4: 画星星眼、放大符号**

`rig.mjs` 的 `face()` 里，在 `case 'half':` 前加一行：

```js
      case 'star': return `<path data-eye="star" d="${pathData(Array.from({ length: 8 }, (_, j) => step([cx, cy], -90 + j * 45, (j % 2 ? 0.06 : 0.17) * k)), true)}" fill="${ctx.ink}"/>`;
```

`symbol()` 里，`const line = ctx.lines.symbol;` 后面加：

```js
  const k = ctx.manifest.figure.symbol_scale ?? 1;
  const grow = ([ax, ay], svg) => (k === 1 ? svg : `<g transform="translate(${num(ax)} ${num(ay)}) scale(${k}) translate(${num(-ax)} ${num(-ay)})">${svg}</g>`);
```

再把 5 个 `return` 各包一层 `grow(锚点, …)`：问号、汗滴、星星的锚点是它们自己的 `[x, y]`，惊叹线和颤抖线围着头，锚点是 `[cx, cy]`：

```js
      return grow([x, y], `<g data-symbol="question">${pen(ctx, 'question', hook, line)}${ellipse(x, y + 0.75 * s, 0.13 * s, 0.13 * s, 0, ctx.ink)}</g>`);
```

```js
      return grow([cx, cy], `<g data-symbol="exclaim">${[-125, -90, -55].map((deg, i) => pen(ctx, `exclaim${i}`, [step([cx, cy], deg, 1.25 * R), step([cx, cy], deg, 1.6 * R)], line)).join('')}</g>`);
```

```js
      return grow([x, y], `<g data-symbol="sweat"><path d="${drop}" fill="${ctx.accent}" stroke="${ctx.ink}" stroke-width="${num(ctx.lines.fine[0])}"/></g>`);
```

```js
      return grow([cx, cy], `<g data-symbol="shake">${[-1, 1].flatMap((side) => [1.25, 1.45].map((r, i) => {
        const pts = [-25, -10, 5].map((deg) => step([cx, cy], side === 1 ? deg : 180 - deg, r * R));
        return pen(ctx, `shake${side}${i}`, pts, line);
      })).join('')}</g>`);
```

```js
      return grow([x, y], `<g data-symbol="sparkle"><path d="${pathData(star, true)}" fill="${ctx.accent}"/></g>`);
```

- [ ] **Step 5: 速查表标签和布局**

`tools/export-host.mjs` 的 `LABELS` 换成：

```js
export const LABELS = {
  idle: '站着', point: '指向', point_right: '旧名，同 point', emphasize: '强调', think: '思考', shrug: '摊手', present: '介绍', sit: '坐下',
  wave: '挥手', jump: '跳起', cheer: '欢呼', tap: '拍一下', snap: '打响指', lean_in: '凑近看', startle: '吓一跳', double_take: '再看一眼', scratch_head: '挠头',
  explaining: '讲解', focused: '专注', happy: '开心', curious: '好奇', surprised: '惊讶', worried: '担心', frustrated: '着急', proud: '得意', amazed: '恍然大悟',
  pointer: '教鞭', magnifier: '放大镜', phone: '手机', doc: '文件', bulb: '灯泡', question: '问号牌',
};
```

`cheatsheetSvg` 里动作变成 3 行，表情和道具下移、画布加高：把

```js
  const faces = Object.keys(manifest.expressions).map((expr, i) => headCrop(manifest, expr, 20 + i * 220, 910, 200, `sheet-${expr}`) + label(120 + i * 220, 1140, expr)).join('');
  const props = Object.entries(manifest.props).map(([prop, p], i) => {
    const x = 150 + i * 300;
    const gesture = p.hand === 'acting' ? 'point' : 'idle';
    return scaled(0.7, drawHost(manifest, { gesture, expr: 'explaining', prop, x: x / 0.7, ground: 1500 / 0.7, seed: `sheet-${prop}` })) + label(x, 1540, prop);
  }).join('');
  return svgDoc(1800, 1600, title + gestures + faces + props);
```

换成

```js
  const faces = Object.keys(manifest.expressions).map((expr, i) => headCrop(manifest, expr, 18 + i * 196, 1310, 180, `sheet-${expr}`) + label(108 + i * 196, 1520, expr)).join('');
  const props = Object.entries(manifest.props).map(([prop, p], i) => {
    const x = 150 + i * 300;
    const gesture = p.hand === 'acting' ? 'point' : 'idle';
    return scaled(0.7, drawHost(manifest, { gesture, expr: 'explaining', prop, x: x / 0.7, ground: 1940 / 0.7, seed: `sheet-${prop}` })) + label(x, 1980, prop);
  }).join('');
  return svgDoc(1800, 2040, title + gestures + faces + props);
```

- [ ] **Step 5.5: 同步 `storyboard.md` 新增表情与动作名**

`tests/references.test.mjs` 会校验 `storyboard.md` 列出 schema 里所有表情和动作名，因此在 Task 3 同步更新 `skills/topic-to-video/references/storyboard.md` 的表情与动作两行（呆毛、服装和句意表留在 Task 9）：

- `` `proud` 得意（闪光）。符号自动出现。`` → `` `proud` 得意（闪光），`amazed` 恍然大悟（星星眼、闪光）。符号自动出现。``
- `` `shrug` 摊手耸肩，`sit` 坐下。一次性的做完回到之前的保持型动作：`wave` 挥手，`jump` 原地跳，`cheer` 举手欢呼，`tap` 拍一下焦点元素。`` → `` `shrug` 摊手耸肩，`sit` 坐下，`lean_in` 凑近看焦点元素。一次性的做完回到之前的保持型动作：`wave` 挥手，`jump` 原地跳，`cheer` 举手欢呼，`tap` 拍一下焦点元素，`snap` 打响指，`startle` 吓一跳，`double_take` 再看一眼，`scratch_head` 挠头。``

- [ ] **Step 6: 重新导出并跑测试**

Run: `npm run export-host && node --test tests/persona.test.mjs tests/rig.test.mjs tests/host-rig.test.mjs tests/site.test.mjs`
Expected: PASS。

- [ ] **Step 7: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/assets/host/manifest.json skills/topic-to-video/assets/host/profile.json skills/topic-to-video/assets/host/host-ref.png skills/topic-to-video/schema/project.schema.json skills/topic-to-video/scripts/lib/rig.mjs tools/export-host.mjs site/assets/host-cheatsheet.png site/index.html tests/persona.test.mjs tests/rig.test.mjs tests/site.test.mjs
git commit -m "$(cat <<'EOF'
feat(host): add five persona gestures, the amazed face and 25% stronger expressions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 呆毛和头部挤压的画法

**Files:**
- Modify: `skills/topic-to-video/assets/host/manifest.json`（`rig_version`、新增 `ahoge`）
- Modify: `skills/topic-to-video/assets/host/profile.json`（`style_lock`、`prompt_lock`）
- Modify: `skills/topic-to-video/scripts/lib/rig.mjs`（`ahogePoints`、`squash`、`drawHost`）
- Modify: `tools/export-host.mjs`（`headCrop`、表情格说明）、`tools/review-host.mjs`（剪影图）
- Regenerate: 三张导出图
- Test: `tests/persona.test.mjs`、`tests/host-rig.test.mjs`、`tests/review-host.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `amazed` 和各表情。
- Produces:
  - `ahogePoints(manifest, { expr, fromExpr = expr, mix = 1, bend = 0, outfit = 'none' }) → [u, v][]`，头部单位（R = 1，面朝右，−v 向上），`manifest.ahoge.count` 个点，第一个点是根部。
  - `drawHost` 新状态：`ahoge: { fromExpr, mix, bend } | null`、`headStretch`（数字，0.06 是拉长 6%，负数是压扁）。
  - 呆毛画成 `<g data-ahoge="形状名" transform="头部坐标"><path data-part="ahoge" …/></g>`，放在 `data-joint="head"` 组里。
  - `manifest.ahoge = { count, morph_seconds, spring: { stiffness, damping, kick }, by_expr, shapes }`；`manifest.rig_version = 3`。
  - `tools/export-host.mjs` 导出 `AHOGE_LABELS`；`tools/review-host.mjs` 导出 `silhouetteSvg(manifest)`。

- [ ] **Step 1: 写失败的测试**

`tests/persona.test.mjs` 第 5 行的 import 改成：

```js
import { ahogePoints, drawHost, resolvePose } from '../skills/topic-to-video/scripts/lib/rig.mjs';
```

文件末尾加：

```js
test('every expression draws the 呆毛 in the shape manifest.ahoge.by_expr gives it', () => {
  assert.deepEqual(Object.keys(manifest.ahoge.by_expr).sort(), Object.keys(manifest.expressions).sort());
  assert.deepEqual(manifest.ahoge.by_expr, {
    explaining: 'curl', focused: 'curl', curious: 'question', surprised: 'straight', worried: 'droop',
    frustrated: 'droop', happy: 'spring', proud: 'spring', amazed: 'spring',
  });
  for (const [expr, shape] of Object.entries(manifest.ahoge.by_expr)) {
    assert.match(draw({ expr }), new RegExp(`<g data-ahoge="${shape}" transform="[^"]+"><path data-part="ahoge"`), expr);
  }
});

test('the 呆毛 grows from the top of the head, turns with the head and mirrors with it', () => {
  const pts = ahogePoints(manifest, { expr: 'explaining' });
  assert.equal(pts.length, manifest.ahoge.count);
  assert.deepEqual(pts[0], [0, -0.98]);
  assert.ok(pts.every(([, v]) => v <= -0.98 + 1e-9), 'every point is above the root');
  const idle = resolvePose(manifest, 'idle').angles;
  const rotation = (svg) => Number(svg.match(/<g data-ahoge="curl" transform="translate\([^)]*\) rotate\((-?[\d.]+)\)/)[1]);
  assert.ok(Math.abs(rotation(draw({ angles: { ...idle, head: 30 } })) - rotation(draw({ angles: { ...idle, head: 0 } })) - 30) < 0.01);
  assert.match(draw({ facing: -1 }), /<g data-ahoge="curl" transform="[^"]*scale\(-1 1\)">/);
});

test('mix morphs between two shapes and bend swings the tip about the root', () => {
  const curl = ahogePoints(manifest, { expr: 'explaining' });
  const straight = ahogePoints(manifest, { expr: 'surprised' });
  const half = ahogePoints(manifest, { expr: 'surprised', fromExpr: 'explaining', mix: 0.5 });
  half.forEach(([u, v], i) => {
    assert.ok(Math.abs(u - (curl[i][0] + straight[i][0]) / 2) < 1e-9 && Math.abs(v - (curl[i][1] + straight[i][1]) / 2) < 1e-9, `point ${i}`);
  });
  const bent = ahogePoints(manifest, { expr: 'surprised', bend: 20 });
  assert.deepEqual(bent[0], straight[0]);
  assert.ok(bent.at(-1)[0] > straight.at(-1)[0] + 0.3, 'a positive bend leans the tip forward');
});

test('a head stretch draws the head taller than wide; a squash draws it wider', () => {
  const box = (svg) => {
    const d = svg.match(/data-part="head" d="([^"]+)"/)[1];
    const pts = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const span = (k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
    return [span(0), span(1)];
  };
  const [w, h] = box(draw({ headStretch: 0.06 }));
  assert.ok(h > w * 1.08, `${w} x ${h}`);
  const [w2, h2] = box(draw({ headStretch: -0.06 }));
  assert.ok(w2 > h2 * 1.08, `${w2} x ${h2}`);
});
```

`tests/host-rig.test.mjs` 的 `profile names the host and locks its look for external models` 测试末尾加两行：

```js
  assert.ok(profile.style_lock.some((s) => s.includes('呆毛')) && !profile.style_lock.some((s) => s.includes('没有头发')));
  assert.match(profile.prompt_lock.zh, /呆毛/);
  assert.match(profile.prompt_lock.en, /cowlick/);
```

`tests/review-host.test.mjs`：import 行改成 `import { frameSvg, h264RoundTrip, pairSvg, silhouetteSvg } from '../tools/review-host.mjs';`，末尾加：

```js
test('silhouetteSvg shows six moods at 540p with the scarf and markers inked black', () => {
  const svg = silhouetteSvg(manifest);
  assert.ok(svg.includes('width="960" height="270" viewBox="0 0 1920 540"'));
  assert.equal((svg.match(/data-host="xiaoqing"/g) ?? []).length, 6);
  assert.equal((svg.match(/data-part="ahoge"/g) ?? []).length, 6);
  for (const color of [manifest.ink.accent, ...Object.values(manifest.ink.markers)]) assert.ok(!svg.includes(color), color);
});
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/persona.test.mjs tests/host-rig.test.mjs tests/review-host.test.mjs`
Expected: FAIL：`ahogePoints` 不存在（整个 `persona.test.mjs` 报 `does not provide an export named 'ahogePoints'`）、`silhouetteSvg` 不存在、`prompt_lock` 没有呆毛。

- [ ] **Step 3: manifest 和 profile**

`manifest.json`：`"rig_version": 2,` 改成 `"rig_version": 3,`。`"lipsync": {…}` 那一行末尾加逗号，后面加（控制点是设定图草稿 A 的形状，已换算成头部单位）：

```json
  "ahoge": {
    "count": 8,
    "morph_seconds": 0.2,
    "spring": {"stiffness": 140, "damping": 8, "kick": 30},
    "by_expr": {"explaining": "curl", "focused": "curl", "curious": "question", "surprised": "straight", "worried": "droop", "frustrated": "droop", "happy": "spring", "proud": "spring", "amazed": "spring"},
    "shapes": {
      "curl": [[0, -0.98], [0.06, -1.46], [0.28, -1.83], [0.59, -1.83], [0.67, -1.58], [0.48, -1.46]],
      "question": [[0, -0.98], [0.03, -1.53], [-0.07, -1.94], [0.21, -2.24], [0.53, -2.09], [0.5, -1.79], [0.25, -1.68]],
      "straight": [[0, -0.98], [-0.06, -1.46], [0.07, -1.83], [-0.04, -2.21], [0.08, -2.51]],
      "droop": [[0, -0.98], [0.17, -1.34], [0.49, -1.46], [0.77, -1.31], [0.87, -1.04]],
      "spring": [[0, -0.98], [0.08, -1.43], [0.34, -1.76], [0.64, -1.73], [0.7, -1.46], [0.5, -1.34], [0.42, -1.55]]
    }
  }
```

`profile.json`（原文写着"没有头发"，和呆毛冲突，一并改掉）：

- `style_lock` 的 `"空心圆头，没有头发和耳朵"` 改成 `"空心圆头，没有耳朵，头顶一根会随情绪变形的呆毛"`。
- `prompt_lock.zh` 的 `空心圆头，没有头发和耳朵，椭圆形黑眼睛` 改成 `空心圆头，没有耳朵，头顶正中一根呆毛（平时是向前弯的小卷，好奇时卷成问号，吃惊时竖直），椭圆形黑眼睛`。
- `prompt_lock.en` 的 `a hollow circle head with no hair or ears, black oval eyes` 改成 `a hollow circle head with no ears and a single cowlick on top (a small forward curl that turns into a question mark when curious and stands straight up when surprised), black oval eyes`。

- [ ] **Step 4: rig.mjs 画呆毛和挤压**

import 行加上 `resample`：

```js
import { circlePoints, inkStroke, markerFill, num, pathData, resample } from './ink.mjs';
```

在 `// ---- drawing ----` 前面加：

```js
/**
 * The 呆毛 as points in head units (R = 1, facing right, −y up): the shape manifest.ahoge.by_expr gives `expr`,
 * morphed from the shape of `fromExpr` by `mix` (0–1), bent `bend` degrees about its root (positive leans
 * forward), and lifted onto the hat when the outfit has a `crown` (小青人设设计 §3.1).
 */
export function ahogePoints(manifest, { expr, fromExpr = expr, mix = 1, bend = 0, outfit = 'none' }) {
  const a = manifest.ahoge;
  const shape = (e) => resample(a.shapes[a.by_expr[e]], a.count);
  const [from, to] = [shape(fromExpr), shape(expr)];
  const k = Math.max(0, Math.min(1, mix));
  const pts = to.map(([u, v], i) => [from[i][0] + (u - from[i][0]) * k, from[i][1] + (v - from[i][1]) * k]);
  const [ru, rv] = pts[0];
  const lift = (manifest.outfits?.[outfit]?.crown ?? rv) - rv;
  return pts.map(([u, v], i) => {
    const deg = (bend * i) / (pts.length - 1);
    const [c, sn] = [Math.cos(deg * RAD), Math.sin(deg * RAD)];
    return [ru + (u - ru) * c - (v - rv) * sn, rv + (u - ru) * sn + (v - rv) * c + lift];
  });
}
```

（`crown` 是 Task 5 帽子的字段；现在 `manifest.outfits` 不存在，`lift` 为 0。）

在 `function heldProp(ctx, fk, prop) {` 前面加：

```js
// Stretch (k > 1) or squash (k < 1) points along the head's axis, keeping its area.
function squash(points, [cx, cy], headDir, k) {
  if (k === 1) return points;
  const a = (headDir + 90) * RAD;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return points.map(([x, y]) => {
    const [u, w] = [((x - cx) * c + (y - cy) * s) / k, (-(x - cx) * s + (y - cy) * c) * k];
    return [cx + u * c - w * s, cy + u * s + w * c];
  });
}
```

`drawHost` 的文档注释 ` * state: { gesture, expr, view?, facing = 1, x, ground, prop?, blink = 0, theme = 'light', seed }` 改成：

```js
 * state: { gesture, expr, view?, facing = 1, x, ground, prop?, blink = 0, theme = 'light', seed,
 *   ahoge?: { fromExpr, mix, bend }, headStretch = 0 }
```

解构里 `gaze = null, scarfAngles = null, hands = null, symbolOpacity = 1,` 后面加一行：

```js
    ahoge = null, headStretch = 0,
```

把画头的两行：

```js
  const head = `<g data-joint="head" ${origin(p.head_base)}>${pen(ctx, 'head', circlePoints(p.head_center[0], p.head_center[1], R, { seed: `${seed}:head-circle` }))}`
    + `<g data-face="${expr}" transform="translate(${num(p.head_center[0])} ${num(p.head_center[1])}) rotate(${num(dirs.head + 90)}) scale(${facing} 1)">${face(ctx, expr, view, blink, { mouthOpen, mouthWidth, gaze })}</g></g>`;
```

换成：

```js
  const k = 1 + headStretch;
  const headFrame = `translate(${num(p.head_center[0])} ${num(p.head_center[1])}) rotate(${num(dirs.head + 90)}) scale(${facing} 1)`;
  const hair = manifest.ahoge
    ? `<g data-ahoge="${manifest.ahoge.by_expr[expr]}" transform="${headFrame}">${pen(ctx, 'ahoge',
      ahogePoints(manifest, { expr, ...(ahoge ?? {}) }).map(([u, v]) => [u * R, (v - (k - 1)) * R]), ctx.width, ctx.ink, { smooth: 2, taper: 'end' })}</g>`
    : '';
  const head = `<g data-joint="head" ${origin(p.head_base)}>${pen(ctx, 'head', squash(circlePoints(p.head_center[0], p.head_center[1], R, { seed: `${seed}:head-circle` }), p.head_center, dirs.head, k))}`
    + `<g data-face="${expr}" transform="${headFrame}">${face(ctx, expr, view, blink, { mouthOpen, mouthWidth, gaze })}</g>${hair}</g>`;
```

（`manifest.ahoge` 不存在时不画，`drawHost stays backward compatible with a v1 manifest` 测试继续成立；呆毛线宽用身体线宽 `ink.width`，设计 §3.1。）

- [ ] **Step 5: 速查表说明、剪影图**

`tools/export-host.mjs`：`LABELS` 后面加：

```js
/** The 呆毛 shapes; kept apart from LABELS because question is also a prop. */
export const AHOGE_LABELS = { curl: '小卷', question: '问号', straight: '竖直', droop: '耷拉', spring: '弹簧' };
```

`headCrop` 的窗口上移 0.06 H，让呆毛进框：

```js
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${cx - half} ${cy - half - 0.06 * manifest.height_px} ${2 * half} ${2 * half}">${drawHost(manifest, { gesture: 'idle', expr, x: 200, ground: 930, seed })}</svg>`;
```

`cheatsheetSvg` 的 `faces` 换成（每格下面多一行呆毛形状）：

```js
  const faces = Object.keys(manifest.expressions).map((expr, i) => {
    const shape = manifest.ahoge.by_expr[expr];
    return headCrop(manifest, expr, 18 + i * 196, 1310, 180, `sheet-${expr}`) + label(108 + i * 196, 1520, expr)
      + `<text x="${108 + i * 196}" y="1578" font-family="${FONT}" font-size="18" fill="#6b6b6b" text-anchor="middle">呆毛 ${shape} ${AHOGE_LABELS[shape]}</text>`;
  }).join('');
```

文件头注释里 `site/assets/host-cheatsheet.png                 every gesture, expression and prop with its name` 改成 `… every gesture, expression (with its 呆毛 shape), prop and outfit with its name`。

`tools/review-host.mjs`：文件头注释在 `frame-1080-h264.png` 那行前加一行：

```js
//   silhouette-540.png                        six moods at 540p with the scarf and markers inked black (小青人设设计 §7)
```

`pairSvg` 前面加：

```js
/** Six moods drawn at 1080p and shown at 540p, the scarf and every marker inked black: is it still 小青? */
export function silhouetteSvg(manifest) {
  const dark = { ...manifest, ink: { ...manifest.ink, accent: INK, markers: { yellow: INK, red: INK, teal: INK } } };
  const moods = [['idle', 'explaining'], ['lean_in', 'curious'], ['startle', 'surprised'], ['shrug', 'worried'], ['snap', 'amazed'], ['cheer', 'happy']];
  const body = moods.map(([gesture, expr], i) => drawHost(dark, { gesture, expr, x: 210 + i * 300, ground: 500, seed: `silhouette-${gesture}` })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="270" viewBox="0 0 1920 540"><rect width="1920" height="540" fill="${PAPER}"/>${body}</svg>`;
}
```

`main()` 里 `writeFileSync(f540, raster(frameSvg(manifest, { scale: 0.5 })));` 后面加：

```js
  writeFileSync(join(OUT_REVIEW, 'silhouette-540.png'), raster(silhouetteSvg(manifest)));
```

- [ ] **Step 6: 重新导出并跑测试**

Run: `npm run export-host && node --test tests/persona.test.mjs tests/rig.test.mjs tests/host-rig.test.mjs tests/review-host.test.mjs tests/site.test.mjs`
Expected: PASS。

- [ ] **Step 7: 全量测试并提交**

Run: `npm test`
Expected: 全部通过（`rig_version` 升到 3，镜头缓存键全部变化，这是预期的：画法变了，旧帧要重画；配音缓存不受影响）。

```bash
git add skills/topic-to-video/assets/host/manifest.json skills/topic-to-video/assets/host/profile.json skills/topic-to-video/assets/host/host-ref.png skills/topic-to-video/scripts/lib/rig.mjs tools/export-host.mjs tools/review-host.mjs site/assets/host-cheatsheet.png site/index.html tests/persona.test.mjs tests/host-rig.test.mjs tests/review-host.test.mjs
git commit -m "$(cat <<'EOF'
feat(host): draw 小青's 呆毛 and head squash, and add a 540p silhouette review sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 服装的画法和接线

**Files:**
- Modify: `skills/topic-to-video/assets/host/manifest.json`（新增 `outfits`）
- Modify: `skills/topic-to-video/scripts/lib/rig.mjs`（眼镜、帽子、围裙）
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`（返回 `outfit`）
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（计划、帧、缓存键）
- Modify: `tools/export-host.mjs`（服装一行、标签）
- Regenerate: 三张导出图
- Test: `tests/persona.test.mjs`、`tests/host-rig.test.mjs`、`tests/scene-encode.test.mjs`、`tests/site.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `profile.outfits`；Task 4 的 `ahogePoints`（读 `outfits[outfit].crown`）和头部坐标 `headFrame`。
- Produces:
  - `manifest.outfits`：`glasses { rim }`、`hardhat { crown, brim, half, front, marker }`、`chef_hat { crown, band, half, puffs, puff, fill }`、`apron { from, below, width, marker }`。只有帽子有 `crown`，呆毛据此上移。
  - `drawHost` 新状态 `outfit = 'none'`，未知服装报 `unknown outfit <名字>`；画出的组带 `data-outfit="<名字>"`。
  - `evaluateHostAt` 返回 `outfit: plan.outfit ?? 'none'`；镜头计划 `plan.outfit`；`shotCacheKey` 包含 `outfit`。

- [ ] **Step 1: 写失败的测试**

`tests/persona.test.mjs` 末尾加：

```js
const OUTFITS = ['glasses', 'hardhat', 'chef_hat', 'apron'];

test('each outfit draws, a hat keeps the 呆毛 growing out of its crown, and an unknown outfit is an error', () => {
  for (const outfit of OUTFITS) assert.match(draw({ outfit }), new RegExp(`data-outfit="${outfit}"`), outfit);
  for (const outfit of ['hardhat', 'chef_hat']) {
    assert.equal(ahogePoints(manifest, { expr: 'explaining', outfit })[0][1], manifest.outfits[outfit].crown, outfit);
    const svg = draw({ outfit });
    assert.ok(svg.indexOf(`data-outfit="${outfit}"`) < svg.indexOf('data-part="ahoge"'), `${outfit} is drawn under the 呆毛`);
  }
  assert.doesNotMatch(draw({}), /data-outfit/);
  assert.throws(() => draw({ outfit: 'cape' }), /unknown outfit cape/);
});

test('glasses and the apron leave the 呆毛 where it grows', () => {
  const bare = ahogePoints(manifest, { expr: 'explaining' });
  assert.deepEqual(ahogePoints(manifest, { expr: 'explaining', outfit: 'glasses' }), bare);
  assert.deepEqual(ahogePoints(manifest, { expr: 'explaining', outfit: 'apron' }), bare);
});

test('outfits use the theme\'s ink, so a dark frame has no black outlines', () => {
  for (const outfit of OUTFITS) {
    const svg = draw({ outfit, theme: 'dark' });
    assert.ok(svg.includes(manifest.ink.body.dark), outfit);
    assert.ok(!svg.includes(`stroke="${manifest.ink.body.light}"`), outfit);
  }
});

test('at 540p the 呆毛, outfits and star eyes stay at least 1.5 px wide', () => {
  const small = { ...manifest, height_px: 200 };
  for (const outfit of OUTFITS) {
    for (const expr of ['amazed', 'curious']) {
      const svg = drawHost(small, { gesture: 'idle', expr, outfit, x: 200, ground: 465, seed: 'small' });
      for (const m of svg.matchAll(/A([\d.]+) ([\d.]+)/g)) assert.ok(Number(m[1]) * 2 >= 1.5 - 1e-6, `cap ${m[1]} in ${outfit} ${expr}`);
      for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 1.5 - 1e-6, `stroke ${m[1]} in ${outfit} ${expr}`);
    }
  }
});

test('evaluateHostAt passes the plan\'s outfit on to drawHost', () => {
  assert.equal(evaluateHostAt(manifest, plan([]), 1).outfit, 'none');
  const dressed = evaluateHostAt(manifest, plan([], { outfit: 'chef_hat' }), 1);
  assert.equal(dressed.outfit, 'chef_hat');
  assert.match(drawHost(manifest, dressed), /data-outfit="chef_hat"/);
});
```

`tests/host-rig.test.mjs` 的 `profile and schema list the same outfits, starting with none` 末尾加：

```js
  assert.deepEqual(Object.keys(manifest.outfits).sort(), profile.outfits.slice(1).sort());
```

`tests/scene-encode.test.mjs` 末尾加：

```js
test('settings.outfit dresses the host in every frame and is part of the shot cache key', () => {
  const p = minimal();
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'aaa' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'bbb' },
  };
  const plain = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  p.settings.outfit = 'hardhat';
  const dressed = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.equal(plain[0].outfit, 'none');
  assert.equal(dressed[0].outfit, 'hardhat');
  assert.match(evaluateFrame(manifest, dressed[0], 0.5).vectorSvg, /data-outfit="hardhat"/);
  assert.doesNotMatch(evaluateFrame(manifest, plain[0], 0.5).vectorSvg, /data-outfit/);
  assert.match(evaluateFrame(manifest, plain[0], 0.5).vectorSvg, /data-part="ahoge"/, 'an older project gets the 呆毛 without any change');
  assert.notEqual(shotCacheKey(dressed[0]), shotCacheKey(plain[0]));
});
```

`tests/site.test.mjs` 的速查表测试：尺寸改成 `{ width: 1800, height: 2480 }`，循环加上服装：

```js
  for (const name of [...Object.keys(manifest.poses), ...Object.keys(manifest.expressions), ...Object.keys(manifest.props), ...Object.keys(manifest.outfits)]) {
```

测试名改成 `the host cheatsheet was drawn from the current rig and names every gesture, expression, prop and outfit`。

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/persona.test.mjs tests/host-rig.test.mjs tests/scene-encode.test.mjs tests/site.test.mjs`
Expected: FAIL：没有 `data-outfit`、`manifest.outfits` 是 undefined、`unknown outfit` 没有报错、`plan.outfit` 是 undefined、速查表尺寸 2040 ≠ 2480。

- [ ] **Step 3: manifest 加服装尺寸**

`manifest.json` 的 `"ahoge": {…}` 末尾的 `}` 后面加逗号，再加：

```json
  "outfits": {
    "glasses": {"rim": 0.26},
    "hardhat": {"crown": -1.3, "brim": -0.32, "half": 1.1, "front": 1.45, "marker": "yellow"},
    "chef_hat": {"crown": -2.1, "band": [-0.78, -1.1], "half": 0.72, "puffs": [[-0.45, -1.45], [0.05, -1.7], [0.5, -1.45]], "puff": 0.45, "fill": "#ffffff"},
    "apron": {"from": 0.6, "below": 0.13, "width": [0.05, 0.08], "marker": "yellow"}
  }
```

帽子的尺寸是头部单位（R = 1，−y 向上），`crown` 是呆毛从帽顶钻出的位置；围裙的 `from` 是从骨盆到脖子根的比例、`below` 和 `width` 是身高 H 的比例。

- [ ] **Step 4: rig.mjs 画服装**

`face()` 的参数加上 `outfit`：

```js
function face(base, expr, view, blink, { mouthOpen = 0, mouthWidth = 0.5, gaze = null, outfit = 'none' } = {}) {
```

`parts.push(\`<g data-face-part="eyes" …\`);` 那一行后面加眼镜（跟着脸转；正面不画镜腿）：

```js
  if (outfit === 'glasses') {
    const rr = ctx.manifest.outfits.glasses.rim * R;
    const xs = v.eyes.map((u) => at(u, 0)[0]);
    const rims = xs.map((gx0, i) => pen(ctx, `glasses${i}`, circlePoints(gx0, -0.02 * R, rr, { seed: `${ctx.seed}:glasses${i}`, overdraw: 0.2, count: 32 }), ctx.lines.fine));
    const bridge = xs.length > 1 ? pen(ctx, 'glasses_bridge', [[xs[0] + rr, -0.06 * R], [(xs[0] + xs[1]) / 2, -0.12 * R], [xs[1] - rr, -0.06 * R]], ctx.lines.fine) : '';
    const arm = view === 'front' ? '' : pen(ctx, 'glasses_arm', [[xs[0] - rr, -0.05 * R], [-0.92 * R, -0.12 * R]], ctx.lines.fine);
    parts.push(`<g data-outfit="glasses">${rims.join('')}${bridge}${arm}</g>`);
  }
```

在 Task 4 加的 `function squash(` 前面加帽子和围裙：

```js
// Hats in the head frame (R = 1, facing right, −y up); the 呆毛 is drawn after them, out of the crown.
function hatShape(ctx, name) {
  const o = ctx.manifest.outfits[name];
  const P = (pts) => pts.map(([u, v]) => [u * ctx.R, v * ctx.R]);
  const fill = (pts, color, key) => `<path d="${markerFill(P(pts), { seed: `${ctx.seed}:${key}`, shift: ctx.H * 0.003 })}" fill="${color}"/>`;
  const outline = (pts, key) => `<path d="${pathData(P(pts), true)}" fill="none" stroke="${ctx.ink}" stroke-width="${num(ctx.lines.fine[1])}" stroke-linejoin="round" data-part="${key}"/>`;
  if (name === 'hardhat') {
    const dome = Array.from({ length: 13 }, (_, i) => [Math.cos(Math.PI + (i * Math.PI) / 12) * o.half, o.brim + Math.sin(Math.PI + (i * Math.PI) / 12) * (o.brim - o.crown)]);
    return `<g data-outfit="hardhat">${fill(dome, ctx.markers[o.marker], 'hardhat_fill')}${outline(dome, 'hardhat')}`
      + `${pen(ctx, 'hardhat_brim', P([[-o.half - 0.15, o.brim], [o.front, o.brim]]), ctx.width)}${pen(ctx, 'hardhat_ridge', P([[0, o.crown], [0.08, o.brim - 0.08]]), ctx.lines.fine)}</g>`;
  }
  if (name === 'chef_hat') {
    const ring = (u, v) => Array.from({ length: 25 }, (_, j) => [u + Math.cos((j / 24) * 2 * Math.PI) * o.puff, v + Math.sin((j / 24) * 2 * Math.PI) * o.puff]);
    const band = [[-o.half, o.band[0]], [o.half, o.band[0]], [o.half, o.band[1]], [-o.half, o.band[1]]];
    const puffs = o.puffs.map(([u, v], i) => fill(ring(u, v), o.fill, `chef_puff${i}_fill`) + outline(ring(u, v), `chef_puff${i}`)).join('');
    return `<g data-outfit="chef_hat">${puffs}${fill(band, o.fill, 'chef_band_fill')}${outline(band, 'chef_band')}</g>`;
  }
  return '';
}

// The apron hangs from the chest to the thighs along the spine and turns with the torso.
function apronShape(ctx, fk) {
  const o = ctx.manifest.outfits.apron;
  const { points: p, H, view } = fk;
  const len = Math.hypot(p.neck_base[0] - p.pelvis[0], p.neck_base[1] - p.pelvis[1]);
  const a = [(p.neck_base[0] - p.pelvis[0]) / len, (p.neck_base[1] - p.pelvis[1]) / len];
  const n = [-a[1], a[0]];
  const wide = ctx.manifest.views[view].scarf_width;
  const top = [p.pelvis[0] + a[0] * len * o.from, p.pelvis[1] + a[1] * len * o.from];
  const bottom = [p.pelvis[0] - a[0] * o.below * H, p.pelvis[1] - a[1] * o.below * H];
  const [wt, wb] = o.width.map((w) => w * H * wide);
  const quad = [[top[0] + n[0] * wt, top[1] + n[1] * wt], [top[0] - n[0] * wt, top[1] - n[1] * wt], [bottom[0] - n[0] * wb, bottom[1] - n[1] * wb], [bottom[0] + n[0] * wb, bottom[1] + n[1] * wb]];
  return `<g data-outfit="apron"><path d="${markerFill(quad, { seed: `${ctx.seed}:apron_fill`, shift: H * 0.003 })}" fill="${ctx.markers[o.marker]}"/>`
    + `<path data-part="apron" d="${pathData(quad, true)}" fill="none" stroke="${ctx.ink}" stroke-width="${num(ctx.lines.fine[1])}" stroke-linejoin="round"/>`
    + `${pen(ctx, 'apron_strap', [quad[0], p.neck_base, quad[1]], ctx.lines.fine)}</g>`;
}
```

`drawHost`：文档注释的 `seed,` 后面补上 `outfit = 'none',`；解构的 `ahoge = null, headStretch = 0,` 前面加 `outfit = 'none',`；在 `if (!manifest.ink.body[theme]) throw …` 后面加：

```js
  if (outfit !== 'none' && !manifest.outfits?.[outfit]) throw new Error(`unknown outfit ${outfit}`);
```

`hair` 一段改成帽子在前、呆毛在后，并把 `outfit` 交给 `ahogePoints`：

```js
  const hair = manifest.ahoge
    ? `<g data-ahoge="${manifest.ahoge.by_expr[expr]}" transform="${headFrame}">${hatShape(ctx, outfit)}${pen(ctx, 'ahoge',
      ahogePoints(manifest, { expr, ...(ahoge ?? {}), outfit }).map(([u, v]) => [u * R, (v - (k - 1)) * R]), ctx.width, ctx.ink, { smooth: 2, taper: 'end' })}</g>`
    : '';
```

`head` 那行里 `face(ctx, expr, view, blink, { mouthOpen, mouthWidth, gaze })` 改成 `face(ctx, expr, view, blink, { mouthOpen, mouthWidth, gaze, outfit })`。

`const sym = …` 那一行后面加：

```js
  const apron = outfit === 'apron' ? apronShape(ctx, fk) : '';
```

画的顺序里，围裙在躯干和腿之后、围巾之前：

```js
  const body = view === 'front'
    ? [tails, torso, leg('r'), leg('l'), apron, scarf, head, arm('r'), arm('l')]
    : [arm('r'), leg('r'), tails, torso, leg('l'), apron, scarf, head, arm('l')];
```

- [ ] **Step 5: 接线**

`motion.mjs` 的 `evaluateHostAt` 返回对象里，`scarfAngles,` 后面加：

```js
    outfit: plan.outfit ?? 'none',
```

`scene.mjs`：

- `buildShotPlans` 开头 `const theme = project.settings?.theme ?? 'light';` 后面加 `const outfit = project.settings?.outfit ?? 'none';`。
- `const plan = { index: i, id: shot.id, shot, theme,` 的 `theme,` 后面加 `outfit,`。
- 算 `endEval` 的 `evaluateHostAt(manifest, { seed: shot.id, theme,` 的 `theme,` 后面加 `outfit,`。
- `shotCacheKey` 的 JSON 里 `theme: shotPlan.theme,` 后面加 `outfit: shotPlan.outfit ?? 'none',`。
- `evaluateFrame` 的 `const evalPlan = { seed: shotPlan.id, theme: shotPlan.theme,` 后面加 `outfit: shotPlan.outfit,`。
- 换镜时小跑出画的 `drawHost(manifest, { gesture: 'idle', … theme: shotPlan.theme,` 后面加 `outfit: shotPlan.outfit,`。（小跑进画用的是 `...hostState`，已经带上服装。）

- [ ] **Step 6: 速查表加服装一行**

`tools/export-host.mjs` 的 `LABELS` 最后一行 `pointer: … question: '问号牌',` 后面加：

```js
  glasses: '圆眼镜', hardhat: '安全帽', chef_hat: '厨师帽', apron: '围裙',
```

`cheatsheetSvg` 的标题计数加上服装：

```js
    + `<text x="1760" y="64" font-family="${FONT}" font-size="24" fill="#6b6b6b" text-anchor="end">动作 ${Object.keys(manifest.poses).length} · 表情 ${Object.keys(manifest.expressions).length} · 道具 ${Object.keys(manifest.props).length} · 服装 ${Object.keys(manifest.outfits).length}</text>`;
```

把 `return svgDoc(1800, 2040, title + gestures + faces + props);` 换成：

```js
  const outfits = Object.keys(manifest.outfits).map((outfit, i) => {
    const x = 150 + i * 300;
    return scaled(0.7, drawHost(manifest, { gesture: 'idle', expr: 'happy', outfit, x: x / 0.7, ground: 2380 / 0.7, seed: `sheet-${outfit}` })) + label(x, 2420, outfit);
  }).join('');
  return svgDoc(1800, 2480, title + gestures + faces + props + outfits);
```

- [ ] **Step 7: 重新导出并跑测试**

Run: `npm run export-host && node --test tests/persona.test.mjs tests/host-rig.test.mjs tests/scene-encode.test.mjs tests/site.test.mjs tests/rig.test.mjs`
Expected: PASS。

- [ ] **Step 8: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/assets/host/manifest.json skills/topic-to-video/assets/host/host-ref.png skills/topic-to-video/scripts/lib/rig.mjs skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/scene.mjs tools/export-host.mjs site/assets/host-cheatsheet.png site/index.html tests/persona.test.mjs tests/host-rig.test.mjs tests/scene-encode.test.mjs tests/site.test.mjs
git commit -m "$(cat <<'EOF'
feat(host): draw four outfits and dress the host from settings.outfit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 呆毛渐变和弹簧、挤压回弹、惊讶联动、新的一次性动作

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`
- Modify: `skills/topic-to-video/scripts/lib/rig.mjs`（响指星星）
- Test: `tests/persona.test.mjs`

**Interfaces:**
- Consumes: Task 3 的新动作和 `squash`；Task 4 的 `ahogePoints`、`drawHost` 的 `ahoge`、`headStretch`；`manifest.ahoge.spring`、`morph_seconds`。
- Produces:
  - `simulateAhogeSpring(manifest, targetFn, t) → 弯度（度）`：固定步长 1/240 秒，从 `t − 2` 秒静止开始算。
  - `evaluateHostAt` 新返回字段：`ahoge: { fromExpr, mix, bend }`、`headStretch`、`spark`（0–1）；`gaze` 在猛回头时被覆盖。
  - `drawHost` 新状态 `spark = 0`：大于 0.01 时在动作手上方画 `<g data-spark="1">` 的黄色星星。
  - 内部变量 `gazeOverride`、`shiftX`、`inOnce`（Task 7 要用）。

- [ ] **Step 1: 写失败的测试**

`tests/persona.test.mjs` 第 6 行的 import 改成：

```js
import { evaluateHostAt, simulateAhogeSpring } from '../skills/topic-to-video/scripts/lib/motion.mjs';
```

末尾加：

```js
const near = (a, b, eps) => a.every(([u, v], i) => Math.abs(u - b[i][0]) <= eps && Math.abs(v - b[i][1]) <= eps);
const exprAt = (target, ms = 1000) => plan([{ sentence: 0, do: 'gesture', target: 'idle', timeMs: 0 }, { sentence: 0, do: 'expr', target, timeMs: ms }]);

test('a new expression morphs the 呆毛 over 0.2 s', () => {
  const p = exprAt('surprised');
  const at = (t) => { const s = evaluateHostAt(manifest, p, t); return ahogePoints(manifest, { expr: s.expr, ...s.ahoge, bend: 0 }); };
  const curl = ahogePoints(manifest, { expr: 'explaining' });
  const straight = ahogePoints(manifest, { expr: 'surprised' });
  const mid = at(1.1);
  assert.ok(!near(mid, curl, 1e-3) && !near(mid, straight, 1e-3), 'halfway it is neither shape');
  mid.forEach(([, v], i) => assert.ok(v <= Math.max(curl[i][1], straight[i][1]) + 1e-9 && v >= Math.min(curl[i][1], straight[i][1]) - 1e-9, `point ${i}`));
  assert.ok(near(at(1.2), straight, 1e-9));
});

test('a jump kicks the 呆毛 and it settles within 2 px a second after the jump ends', () => {
  const p = plan([{ sentence: 0, do: 'gesture', target: 'idle', timeMs: 0 }, { sentence: 0, do: 'gesture', target: 'jump', timeMs: 1000 }]);
  const rest = ahogePoints(manifest, { expr: 'explaining' }).at(-1);
  const off = (t) => {
    const s = evaluateHostAt(manifest, p, t);
    const tip = ahogePoints(manifest, { expr: s.expr, ...s.ahoge }).at(-1);
    return Math.hypot(tip[0] - rest[0], tip[1] - rest[1]) * R;
  };
  assert.ok(off(1.15) > 6, `tip moved ${off(1.15)} px`);
  const settled = 1 + resolvePose(manifest, 'jump').seconds + 1;
  assert.ok(off(settled) <= 2, `tip ${off(settled)} px from rest`);
});

test('the 呆毛 spring gives the same bend at a time whatever frames came before', () => {
  const pulse = (ts) => (ts >= 0.5 && ts < 0.58 ? 30 : 0);
  assert.equal(simulateAhogeSpring(manifest, pulse, 1.0), simulateAhogeSpring(manifest, pulse, 1.0));
  assert.ok(Math.abs(simulateAhogeSpring(manifest, pulse, 0.7)) > 1);
  assert.ok(Math.abs(simulateAhogeSpring(manifest, pulse, 4)) < 0.01);
});

test('surprised stretches the head for 0.3 s and leans the body back, keeping the gesture', () => {
  const p = exprAt('surprised');
  assert.ok(evaluateHostAt(manifest, p, 1.1).headStretch > 0);
  assert.equal(evaluateHostAt(manifest, p, 1.3).headStretch, 0);
  assert.ok(evaluateHostAt(manifest, exprAt('worried'), 1.1).headStretch < 0);
  assert.equal(evaluateHostAt(manifest, exprAt('curious'), 1.1).headStretch, 0);
  const before = evaluateHostAt(manifest, p, 0.99);
  const during = evaluateHostAt(manifest, p, 1.15);
  assert.ok(during.angles.waist < before.angles.waist - 2, 'leans back');
  assert.equal(during.gesture, before.gesture);
});

test('persona once gestures move the body, not just the label', () => {
  for (const g of ['snap', 'startle', 'double_take', 'scratch_head']) {
    const p = plan([{ sentence: 0, do: 'gesture', target: 'idle', timeMs: 0 }, { sentence: 0, do: 'gesture', target: g, timeMs: 1000 }]);
    const hold = evaluateHostAt(manifest, p, 0.9).angles;
    const mid = evaluateHostAt(manifest, p, 1 + resolvePose(manifest, g).seconds / 2).angles;
    assert.ok(Math.abs(mid.l_shoulder - hold.l_shoulder) > 15, `${g} raises the arm: ${hold.l_shoulder} → ${mid.l_shoulder}`);
  }
});

test('a snap shows a sparkle at the hand for its second half', () => {
  const p = plan([{ sentence: 0, do: 'gesture', target: 'snap', timeMs: 1000 }]);
  assert.equal(evaluateHostAt(manifest, p, 1.1).spark, 0);
  const s = evaluateHostAt(manifest, p, 1.45);
  assert.ok(s.spark > 0.5, `spark ${s.spark}`);
  assert.match(drawHost(manifest, s), /data-spark="1"/);
  assert.doesNotMatch(drawHost(manifest, evaluateHostAt(manifest, p, 2)), /data-spark/);
});

test('a startle hops back and a double take looks away, then back at the focus', () => {
  const startle = plan([{ sentence: 0, do: 'gesture', target: 'startle', timeMs: 1000 }]);
  const still = evaluateHostAt(manifest, startle, 0.9);
  const jolt = evaluateHostAt(manifest, startle, 1.15);
  assert.ok(jolt.lift > 0.01 && jolt.x < still.x - 3, `lift ${jolt.lift}, x ${still.x} → ${jolt.x}`);
  const take = plan([{ sentence: 0, do: 'gesture', target: 'double_take', timeMs: 1000 }]);
  assert.ok(evaluateHostAt(manifest, take, 1.3).gaze[0] < 0, 'looks away');
  assert.ok(evaluateHostAt(manifest, take, 1.55).gaze[0] > 0, 'looks back');
});

test('a shot that starts with a snap plays it, then stands idle', () => {
  const p = plan([], { startState: { ...START, gesture: 'snap' } });
  assert.equal(evaluateHostAt(manifest, p, 0.3).gesture, 'snap');
  assert.equal(evaluateHostAt(manifest, p, 1.2).gesture, 'idle');
});

test('at 540p the snap sparkle outline stays at least 1.5 px wide', () => {
  const small = { ...manifest, height_px: 200 };
  const svg = drawHost(small, { gesture: 'snap', expr: 'amazed', spark: 1, x: 200, ground: 465, seed: 'small-spark' });
  assert.match(svg, /data-spark="1"/);
  for (const m of svg.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 1.5 - 1e-6, `stroke ${m[1]}`);
});
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/persona.test.mjs`
Expected: FAIL：`does not provide an export named 'simulateAhogeSpring'`（整个文件加载失败）。先临时把 import 里的 `simulateAhogeSpring` 去掉再跑一次，确认其余新测试也失败：`s.ahoge` 是 undefined、`headStretch` 是 undefined、`persona once gestures move the body` 肩角不变、`spark` 是 undefined；然后把 import 改回来。

- [ ] **Step 3: 弹簧函数**

`motion.mjs` 在 `const BEAT_CYCLE = …` 前面加：

```js
/**
 * The 呆毛's bend in degrees at `t`: a fixed-step (1/240 s) spring pulled toward `targetFn(ts)`, started at rest
 * 2 s before `t` (it settles well within that), so the result does not depend on the frame rate (小青人设设计 §3.1).
 */
export function simulateAhogeSpring(manifest, targetFn, t) {
  const dt = 1 / 240;
  const { stiffness: k, damping: c } = manifest.ahoge.spring;
  const start = Math.max(0, t - 2);
  const steps = Math.max(0, Math.round((t - start) / dt));
  let bend = 0;
  let omega = 0;
  for (let i = 0; i < steps; i += 1) {
    const acc = -k * (bend - targetFn(start + i * dt)) - c * omega;
    omega += acc * dt;
    bend += omega * dt;
  }
  return bend;
}
```

- [ ] **Step 4: evaluateHostAt 记住上一个表情**

把

```js
  let expr = start.expr;
  let exprChangedAt = -10;
```

换成

```js
  let expr = start.expr;
  let prevExpr = start.expr;
  let exprChangedAt = -10;
```

把 `if (c.do === 'expr') { expr = c.target; exprChangedAt = ct; }` 换成 `if (c.do === 'expr') { prevExpr = expr; expr = c.target; exprChangedAt = ct; }`。

- [ ] **Step 5: 新的一次性动作**

`// Build angles + lift + view` 下面的 `let gesture = holdGesture;` 后面加：

```js
  let spark = 0;
  let gazeOverride = null;
  let shiftX = 0;
  let inOnce = false;
```

一次性动作分支里，`if (dt >= 0 && dt < sec + 0.3) {` 的下一行 `gesture = activeOnce.gesture;` 前面加 `inOnce = true;`。

`tap` 分支的结尾：

```js
            if (u >= 0.4 && u <= 0.65) tapImpact = Math.sin(((u - 0.4) / 0.25) * Math.PI);
          }
```

换成

```js
            if (u >= 0.4 && u <= 0.65) tapImpact = Math.sin(((u - 0.4) / 0.25) * Math.PI);
          } else {
            // H gestures (小青人设设计 §4.1): wind up into the pose, then the gesture's own accent.
            angles = tweenPoseAngles(manifest, toA, spec.angles, Math.min(dt, 0.3), { duration: 0.3, anticipate: true, overshoot: true });
            if (activeOnce.gesture === 'snap') {
              const flick = u > 0.45 && u < 0.65 ? Math.sin(((u - 0.45) / 0.2) * Math.PI) : 0;
              angles = clampAngles(manifest, { ...angles, l_wrist: angles.l_wrist - 30 * flick });
              if (u >= 0.5) spark = 1 - (u - 0.5) / 0.5;
            } else if (activeOnce.gesture === 'startle') {
              isFastMotion = u < 0.4;
              lift = u < 0.4 ? Math.sin((u / 0.4) * Math.PI) * 0.03 : 0;
              shiftX = -facing * 0.03 * H * Math.sin(Math.min(1, u / 0.3) * (Math.PI / 2)) * (1 - u);
            } else if (activeOnce.gesture === 'double_take') {
              const away = u < 0.35 ? Math.sin((u / 0.35) * (Math.PI / 2)) : u < 0.5 ? 1 - easeOutCubic((u - 0.35) / 0.15) : 0;
              const back = u >= 0.35 && u < 0.75 ? Math.sin(((u - 0.35) / 0.4) * Math.PI) : 0;
              isFastMotion = u >= 0.35 && u < 0.5;
              angles = clampAngles(manifest, { ...angles, neck: angles.neck + 10 * away - 4 * back, head: angles.head + 14 * away - 10 * back });
              lift = back * 0.015;
              gazeOverride = away > 0.5 ? [-0.08, 0.04] : back > 0.2 ? [0.08, -0.03] : null;
            } else if (activeOnce.gesture === 'scratch_head') {
              const rub = u > 0.2 && u < 0.85 ? Math.sin(u * 6 * Math.PI) : 0;
              angles = clampAngles(manifest, { ...angles, l_wrist: angles.l_wrist + 15 * rub, l_elbow: angles.l_elbow + 6 * rub });
            }
          }
```

- [ ] **Step 6: 惊讶联动、呆毛、挤压**

把画围巾那段里的 `velAt` 定义整段（从 `const velAt = (ts) => {` 到它的 `};`）挪到 `// Question-end detection for micro head tilt` 前面，并改注释：

```js
  // Walk velocity at any time, for the scarf and the 呆毛 springs
  const velAt = (ts) => {
    for (const seg of walkSegments) {
      if (ts >= seg.t0 && ts < seg.t1 && seg.t1 > seg.t0) {
        const u = (ts - seg.t0) / (seg.t1 - seg.t0);
        return ((seg.toX - seg.fromX) / (seg.t1 - seg.t0)) * 6 * u * (1 - u);
      }
    }
    return 0;
  };
```

原处只留 `// Deterministic scarf spring (velocity sampled from walk segments)` 和 `const scarfAngles = …`。

把 `const finalX = x + micro.weightShift;` 换成：

```js
  // Surprise recoil (§4.4): surprised or amazed leans the body back for 0.3 s; the gesture stays.
  const surpriseAt = ['surprised', 'amazed'].includes(expr) && exprChangedAt >= 0 ? exprChangedAt : null;
  const recoil = surpriseAt !== null && t - surpriseAt < 0.3 ? Math.sin(((t - surpriseAt) / 0.3) * Math.PI) : 0;
  angles = clampAngles(manifest, { ...angles, waist: angles.waist - 5 * recoil, chest: angles.chest - 4 * recoil });
  shiftX += -facing * 0.015 * H * recoil;
  const finalX = x + micro.weightShift + shiftX;

  // 呆毛: morph to the new expression's shape, spring on walks and kicks (§3.1, §4.4)
  const kicks = [
    ...effectiveCues.filter((c) => c.do === 'gesture' && ['jump', 'startle', 'double_take'].includes(c.target)).map((c) => ({ t0: c.timeMs / 1000, amp: c.target === 'startle' ? -1 : 1 })),
    ...effectiveCues.filter((c) => c.do === 'expr' && ['surprised', 'amazed'].includes(c.target)).map((c) => ({ t0: c.timeMs / 1000, amp: -0.7 })),
  ];
  const kick = manifest.ahoge.spring.kick;
  const bend = simulateAhogeSpring(manifest, (ts) => {
    const k = kicks.find((kk) => ts >= kk.t0 && ts < kk.t0 + 0.08);
    return k ? k.amp * kick : Math.max(-kick, Math.min(kick, -Math.abs(velAt(ts)) * 0.06));
  }, t);
  const ahoge = { fromExpr: prevExpr, mix: easeInOutCubic(clamp01((t - exprChangedAt) / manifest.ahoge.morph_seconds)), bend };
  const squash = manifest.expressions[expr].squash ?? 0;
  const headStretch = t - exprChangedAt >= 0 && t - exprChangedAt < 0.3 ? squash * (1 - easeOutCubic((t - exprChangedAt) / 0.3)) : 0;
```

返回对象里 `gaze: micro.gaze,` 换成 `gaze: gazeOverride ?? micro.gaze,`，`outfit: plan.outfit ?? 'none',` 后面加：

```js
    ahoge,
    headStretch,
    spark,
```

- [ ] **Step 7: rig.mjs 画响指星星**

`drawHost` 的文档注释补上 `spark = 0`；解构的 `ahoge = null, headStretch = 0,` 改成 `ahoge = null, headStretch = 0, spark = 0,`。`const apron = …` 前面加：

```js
  // The snap's sparkle beside the acting hand (小青人设设计 §4.1).
  const sparkAt = step(mid(p[`${ACTING}_wrist`], p[`${ACTING}_hand`]), -90, 0.07 * H);
  const sparkSvg = spark > 0.01
    ? `<g data-spark="1" opacity="${num(Math.min(1, spark))}"><path d="${pathData(Array.from({ length: 8 }, (_, i) => step(sparkAt, -90 + i * 45, (i % 2 ? 0.012 : 0.04) * H)), true)}" fill="${ctx.markers.yellow}" stroke="${ctx.ink}" stroke-width="${num(ctx.lines.fine[0])}"/></g>`
    : '';
```

最后的 `return` 里 `${body.join('')}${sym}</g>` 改成 `${body.join('')}${sym}${sparkSvg}</g>`。

- [ ] **Step 8: 跑测试看它通过**

Run: `node --test tests/persona.test.mjs tests/motion.test.mjs tests/scene-encode.test.mjs`
Expected: PASS。

- [ ] **Step 9: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/rig.mjs tests/persona.test.mjs
git commit -m "$(cat <<'EOF'
feat(motion): morph and spring the 呆毛, squash the head, and act out the persona gestures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 待机小动作

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`
- Test: `tests/persona.test.mjs`

**Interfaces:**
- Consumes: Task 6 的 `gazeOverride`、`inOnce`、`kicks`、`velAt`；`effectiveCues`、`walkSegments`、`holdGesture`。
- Produces: `fidgetSchedule(quiet: [number, number][], seed: string) → { t0, kind: 'look' | 'tiptoe' | 'flick' }[]`；`evaluateHostAt` 返回 `fidget`（正在做的小动作名，或 `null`）。

- [ ] **Step 1: 写失败的测试**

`tests/persona.test.mjs` 第 6 行的 import 改成：

```js
import { evaluateHostAt, fidgetSchedule, simulateAhogeSpring } from '../skills/topic-to-video/scripts/lib/motion.mjs';
```

末尾加：

```js
const longTake = (extra = {}) => plan([], { durationSec: 12, sentences: [{ index: 0, startMs: 0, endMs: 11800, text: '讲一句很长的话。' }], ...extra });
const fidgetsBetween = (p, from, to) => { const out = []; for (let t = from; t < to; t += 0.05) out.push(evaluateHostAt(manifest, p, t).fidget); return out; };

test('fidgets come only after 3 quiet seconds and the same way every render', () => {
  assert.ok(fidgetsBetween(longTake(), 0, 3).every((k) => k === null));
  assert.ok(fidgetsBetween(longTake(), 3, 7.5).some((k) => k !== null));
  assert.deepEqual(fidgetsBetween(longTake(), 3, 12), fidgetsBetween(longTake(), 3, 12));
  assert.deepEqual(fidgetSchedule([[0, 12]], 'sh01'), fidgetSchedule([[0, 12]], 'sh01'));
  assert.notDeepEqual(fidgetSchedule([[0, 30]], 'sh01'), fidgetSchedule([[0, 30]], 'sh02'));
  const gaps = fidgetSchedule([[0, 30]], 'sh01').map((f) => f.t0);
  assert.equal(gaps[0], 3);
  gaps.slice(1).forEach((t0, i) => assert.ok(t0 - gaps[i] >= 3 && t0 - gaps[i] <= 4, `gap ${t0 - gaps[i]}`));
});

test('no fidget while walking or during a once gesture', () => {
  const walk = longTake({ durationSec: 6, cues: [{ sentence: 0, do: 'move', target: 'right', timeMs: 0 }] });
  for (let t = 0; t < 6; t += 0.05) {
    const s = evaluateHostAt(manifest, walk, t);
    if (s.view === 'side') assert.equal(s.fidget, null, `walking at ${t}`);
  }
  const jump = longTake({ cues: [{ sentence: 0, do: 'gesture', target: 'jump', timeMs: 5000 }] });
  assert.ok(fidgetsBetween(jump, 5, 6.3).every((k) => k === null));
});

test('a seated host never floats: tiptoe is skipped while sitting', () => {
  const seated = plan([], { durationSec: 30, startState: { ...START, gesture: 'sit' }, sentences: [{ index: 0, startMs: 0, endMs: 29800, text: '讲。' }] });
  for (let t = 0; t < 30; t += 0.05) assert.equal(evaluateHostAt(manifest, seated, t).lift, 0, `t=${t}`);
});
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/persona.test.mjs`
Expected: FAIL：`does not provide an export named 'fidgetSchedule'`。

- [ ] **Step 3: 写实现**

`motion.mjs` 在 `const BEAT_CYCLE = …` 前面（`simulateAhogeSpring` 后面）加：

```js
/**
 * Idle fidgets (小青人设设计 §4.3): in every stretch without a gesture or move cue (`quiet`, start and end in
 * seconds), one 0.8 s fidget 3 s in and then every 3–4 s, chosen and timed by the shot seed.
 * @returns {{ t0: number, kind: 'look' | 'tiptoe' | 'flick' }[]}
 */
export function fidgetSchedule(quiet, seed) {
  const out = [];
  for (const [from, to] of quiet) {
    const rnd = random(`${seed}:fidget:${from.toFixed(3)}`);
    for (let t0 = from + 3; t0 + 0.8 <= to; t0 += 3 + rnd()) out.push({ t0, kind: FIDGETS[Math.floor(rnd() * FIDGETS.length)] });
  }
  return out;
}
const FIDGETS = ['look', 'tiptoe', 'flick'];
```

`evaluateHostAt` 里 `// Build angles + lift + view` 前面加：

```js
  // Quiet stretches between gesture and move cues, and the fidgets in them (§4.3)
  const cueTimes = [0, ...effectiveCues.filter((c) => c.do === 'gesture' || c.do === 'move').map((c) => c.timeMs / 1000), plan.durationSec ?? Infinity];
  const quiet = cueTimes.slice(1).map((end, i) => [cueTimes[i], end]).filter(([a, b]) => b > a);
  const fidgets = fidgetSchedule(quiet, plan.seed ?? 'sh01')
    .filter((f) => !walkSegments.some((seg) => f.t0 < seg.t1 && f.t0 + 0.8 > seg.t0));
  const fidget = fidgets.find((f) => t >= f.t0 && t < f.t0 + 0.8) ?? null;
  const fidgetEnv = fidget ? Math.sin(((t - fidget.t0) / 0.8) * Math.PI) : 0;
```

Task 6 加的这一行：

```js
  angles = clampAngles(manifest, { ...angles, waist: angles.waist - 5 * recoil, chest: angles.chest - 4 * recoil });
```

换成：

```js
  const fidgetOn = fidget && !walking && !inOnce ? fidgetEnv : 0;
  angles = clampAngles(manifest, {
    ...angles,
    waist: angles.waist - 5 * recoil,
    chest: angles.chest - 4 * recoil,
    head: angles.head - (fidget?.kind === 'look' ? 6 * fidgetOn : 0),
  });
  if (fidget?.kind === 'tiptoe' && holdGesture !== 'sit') lift += 0.02 * fidgetOn;
  if (fidget?.kind === 'look' && fidgetOn > 0) gazeOverride = [-0.08 * fidgetOn, 0];
```

`kicks` 数组最后加一行（呆毛弹一下）：

```js
    ...fidgets.filter((f) => f.kind === 'flick').map((f) => ({ t0: f.t0, amp: 0.6 })),
```

注释 `// 呆毛: morph to the new expression's shape, spring on walks and kicks (§3.1, §4.4)` 改成 `… spring on walks, kicks and flicks (§3.1, §4.3, §4.4)`。返回对象的 `spark,` 后面加：

```js
    fidget: fidgetOn > 0 ? fidget.kind : null,
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node --test tests/persona.test.mjs tests/motion.test.mjs`
Expected: PASS。

- [ ] **Step 5: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/scripts/lib/motion.mjs tests/persona.test.mjs
git commit -m "$(cat <<'EOF'
feat(motion): add seeded idle fidgets after three quiet seconds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 按句意自动挑动作，自动响指每期最多 2 次

**Files:**
- Modify: `skills/topic-to-video/scripts/lib/motion.mjs`（`inferSentenceBeat`、自动节拍循环、`endState`）
- Modify: `skills/topic-to-video/scripts/lib/scene.mjs`（`lastHostEnd`、`startState`）
- Test: `tests/persona.test.mjs`、`tests/motion.test.mjs:105`、`tests/scene-encode.test.mjs`

**Interfaces:**
- Consumes: Task 3 的新动作。
- Produces: `inferSentenceBeat(text, { index, hasVisualCue, prevGesture, autoSnaps = 0 }) → { gesture }`；`startState.autoSnaps`、`endState.autoSnaps`（这一期到这个镜头结束为止自动挑出的 `snap` 次数）。

- [ ] **Step 1: 写失败的测试**

`tests/persona.test.mjs` 第 6 行的 import 改成：

```js
import { evaluateHostAt, fidgetSchedule, inferSentenceBeat, simulateAhogeSpring } from '../skills/topic-to-video/scripts/lib/motion.mjs';
```

末尾加：

```js
test('auto beats: a question leans in, a reveal snaps, a surprise startles, and no sentence repeats the last', () => {
  assert.equal(inferSentenceBeat('还要从头下载吗？').gesture, 'lean_in');
  assert.equal(inferSentenceBeat('还要从头下载吗？', { prevGesture: 'lean_in' }).gesture, 'think');
  for (const s of ['原来浏览器早就存了一份。', '答案是三零四。', '所以说缓存不是白存的。', '这就是协商缓存。']) assert.equal(inferSentenceBeat(s).gesture, 'snap', s);
  for (const s of ['居然一个字节都没下载。', '竟然只花了一毫秒。', '没想到服务器只回了一句话。']) assert.equal(inferSentenceBeat(s).gesture, 'startle', s);
  assert.equal(inferSentenceBeat('居然一个字节都没下载。', { prevGesture: 'startle' }).gesture, 'double_take');
  assert.equal(inferSentenceBeat('原来如此！').gesture, 'snap', 'a reveal comes before the exclamation rule');
  assert.equal(inferSentenceBeat('这就是答案吗？').gesture, 'lean_in', 'a question comes first');
});

test('after two automatic snaps the next reveal takes the next candidate', () => {
  assert.equal(inferSentenceBeat('原来如此。', { autoSnaps: 1 }).gesture, 'snap');
  assert.equal(inferSentenceBeat('原来如此。', { autoSnaps: 2 }).gesture, 'present');
  assert.equal(inferSentenceBeat('原来如此。', { autoSnaps: 2, prevGesture: 'present' }).gesture, 'emphasize');
  const reveal = (i) => ({ index: i, startMs: i * 2000, endMs: i * 2000 + 1800, text: '原来是这样。' });
  const three = plan([], { durationSec: 8, sentences: [reveal(0), { index: 1, startMs: 2000, endMs: 3800, text: '讲一句。' }, reveal(2), { index: 3, startMs: 6000, endMs: 7800, text: '讲一句。' }] });
  assert.equal(evaluateHostAt(manifest, three, 7.9).endState.autoSnaps, 2);
  const capped = plan([], { startState: { ...START, autoSnaps: 2 }, sentences: [reveal(0)] });
  assert.notEqual(evaluateHostAt(manifest, capped, 0.2).gesture, 'snap');
});

test('a snap the agent writes always plays and does not count toward the cap', () => {
  const p = plan([{ sentence: 0, do: 'gesture', target: 'snap', timeMs: 0 }], { startState: { ...START, autoSnaps: 2 }, sentences: [{ index: 0, startMs: 0, endMs: 1800, text: '原来如此。' }] });
  assert.equal(evaluateHostAt(manifest, p, 0.2).gesture, 'snap');
  assert.equal(evaluateHostAt(manifest, p, 1).endState.autoSnaps, 2);
});
```

`tests/motion.test.mjs` 第 105 行：

```js
  assert.equal(inferSentenceBeat('还要从头下载吗？', { index: 0, prevGesture: 'idle' }).gesture, 'think');
```

改成（问句的第一候选现在是 `lean_in`，设计 §4.2）：

```js
  assert.equal(inferSentenceBeat('还要从头下载吗？', { index: 0, prevGesture: 'idle' }).gesture, 'lean_in');
```

第 106 行的 `{ index: 1, prevGesture: 'think' }` 改成 `{ index: 1, prevGesture: 'lean_in' }`。

`tests/scene-encode.test.mjs` 末尾加：

```js
test('the automatic snap count carries from one host-left shot to the next', () => {
  const p = minimal();
  p.sections[0].text = '原来是缓存。原来是副本。原来如此。';
  p.shots = [0, 1, 2].map((n) => ({ id: `sh0${n + 1}`, section: 's01', sentences: [n], layout: 'host-left', host: { expr: 'explaining', gesture: 'idle' }, visual: { template: 'title', data: { heading: `${n}` } }, note: 'reveal' }));
  const timing = Object.fromEntries([0, 1, 2].map((n) => [`s01-${n}`, { file: `audio/s01-${n}.wav`, duration_ms: 2000, speech: [50, 1900], source: 'estimate', words: [], sha256: `h${n}` }]));
  const plans = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.deepEqual(plans.map((pl) => pl.startState.autoSnaps), [0, 1, 2]);
  assert.notEqual(evaluateFrame(manifest, plans[2], 0.5).vectorSvg.match(/data-gesture="(\w+)"/)[1], 'snap');
});
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/persona.test.mjs tests/motion.test.mjs tests/scene-encode.test.mjs`
Expected: FAIL：问句挑到 `think`、"原来"句挑不到 `snap`、`endState.autoSnaps` 是 undefined、`startState.autoSnaps` 是 undefined。

- [ ] **Step 3: 改 inferSentenceBeat**

把函数开头到第一个分支：

```js
export function inferSentenceBeat(text = '', { index = 0, hasVisualCue = false, prevGesture = 'idle' } = {}) {
  const s = String(text);
  let candidates;
  if (/[？?][」』”’）)》】\]"']*$/.test(s) || /(?:吗|呢|为什么|怎么|还能)/.test(s)) {
    candidates = ['think', 'shrug', 'present'];
  } else if (
```

换成：

```js
export function inferSentenceBeat(text = '', { index = 0, hasVisualCue = false, prevGesture = 'idle', autoSnaps = 0 } = {}) {
  const s = String(text);
  let candidates;
  if (/[？?][」』”’）)》】\]"']*$/.test(s) || /(?:吗|呢|为什么|怎么|还能)/.test(s)) {
    candidates = ['lean_in', 'think', 'shrug'];
  } else if (/(?:原来|答案是|所以说|这就是)/.test(s)) {
    candidates = ['snap', 'present', 'emphasize'];
  } else if (/(?:居然|竟然|没想到)/.test(s)) {
    candidates = ['startle', 'double_take', 'emphasize'];
  } else if (
```

函数末尾：

```js
  const gesture = candidates.find((g) => g !== prevGesture) ?? candidates[0];
  return { gesture };
```

换成：

```js
  // Two automatic snaps per video keep it a signature move (小青人设设计 §4.2).
  if (autoSnaps >= 2) candidates = candidates.filter((g) => g !== 'snap');
  const gesture = candidates.find((g) => g !== prevGesture) ?? candidates[0];
  return { gesture };
```

- [ ] **Step 4: 自动节拍计数，并在镜头之间传递**

`evaluateHostAt` 里：

```js
  const autoBeats = [];
  let runningGesture = start.gesture;
```

换成

```js
  const autoBeats = [];
  let autoSnaps = start.autoSnaps ?? 0;
  let runningGesture = start.gesture;
```

```js
      prevGesture: runningGesture,
    });
    runningGesture = beat.gesture;
```

换成

```js
      prevGesture: runningGesture,
      autoSnaps,
    });
    if (beat.gesture === 'snap') autoSnaps += 1;
    runningGesture = beat.gesture;
```

返回对象的 `endState` 改成：

```js
    endState: { x: curX, view, facing, gesture: holdGesture, expr, prop, autoSnaps },
```

`scene.mjs` 的 `buildShotPlans`：

```js
  let lastHostEnd = { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none' };
```

换成

```js
  let lastHostEnd = { x: 320, view: 'three_quarter', facing: 1, gesture: 'idle', expr: 'explaining', prop: 'none', autoSnaps: 0 };
```

`startState` 里 `prop: lastHostEnd.prop,` 后面加 `autoSnaps: lastHostEnd.autoSnaps ?? 0,`。

- [ ] **Step 5: 跑测试看它通过**

Run: `node --test tests/persona.test.mjs tests/motion.test.mjs tests/scene-encode.test.mjs`
Expected: PASS。

- [ ] **Step 6: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/scripts/lib/motion.mjs skills/topic-to-video/scripts/lib/scene.mjs tests/persona.test.mjs tests/motion.test.mjs tests/scene-encode.test.mjs
git commit -m "$(cat <<'EOF'
feat(motion): pick lean-in, snap and startle by sentence meaning, two automatic snaps per video

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 文档

**Files:**
- Modify: `skills/topic-to-video/references/storyboard.md:36-63`
- Modify: `README.md:26-28`、`README.en.md:26-28`、`site/index.html:174-177`
- Test: `tests/references.test.mjs`、`tests/readme.test.mjs`、`tests/site.test.mjs`

**Interfaces:**
- Consumes: Task 2–8 的名字和数字（17 个动作、9 种表情、6 件道具、4 套服装）。
- Produces: 无。

- [ ] **Step 1: 写失败的测试**

`tests/references.test.mjs` 末尾加：

```js
test('storyboard.md introduces the 呆毛, the outfits and when to leave settings.outfit out', () => {
  const text = readFileSync(join(SKILL, 'references/storyboard.md'), 'utf8');
  assert.ok(text.includes('呆毛'));
  assert.ok(text.includes('settings.outfit'));
  for (const outfit of ['glasses', 'hardhat', 'chef_hat', 'apron']) assert.ok(text.includes(`\`${outfit}\``), outfit);
  assert.match(text, /用户要求时才写/);
  assert.match(text, /\| 想通了、揭晓答案 \| `amazed` \| `snap` \|/);
});
```

（文件里已有 `SKILL` 常量和 `readFileSync`、`join` 的 import；如果名字不同，照文件开头的写法改。）

`tests/readme.test.mjs` 末尾加：

```js
test('both READMEs give 小青 the 呆毛 and the H counts', () => {
  assert.ok(read('README.md').includes('呆毛'));
  assert.ok(read('README.md').includes('17 个动作、9 种表情、6 件道具和 4 套服装'));
  assert.ok(read('README.en.md').includes('cowlick'));
  assert.ok(read('README.en.md').includes('17 gestures, 9 expressions, 6 props and 4 outfits'));
});
```

`tests/site.test.mjs` 末尾加：

```js
test('the site describes the 呆毛 and shows the taller cheatsheet', () => {
  assert.ok(html.includes('呆毛'));
  assert.ok(html.includes('17 个动作、9 种表情、6 件手持道具和 4 套服装'));
  assert.match(html, /host-cheatsheet\.png" alt="[^"]*" width="1800" height="2480"/);
});
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs`
Expected: FAIL：三个新测试都找不到呆毛和新数字。

- [ ] **Step 3: 改 storyboard.md 与 prompt-pack.md**

`storyboard.md` 逐处替换（改完仍在 10 KB 内；表情和动作名单已在 Task 3 同步）：

1. `主持人是火柴人"小青"：手绘墨线，系一条青色围巾，只在 \`host-left\` 镜头出场。` → `主持人是火柴人"小青"：手绘墨线，系一条青色围巾，头顶一根呆毛随表情变形，只在 \`host-left\` 镜头出场。性格是好奇的伙伴：爱凑近看，想通了打响指。`
2. 在动作一行 `scratch_head` 挠头 后面补充：`句子没写动作时，渲染器按句意自动挑。`
3. 在 `- **接戏**` 那一条前面加一条：

```markdown
- **服装**（`settings.outfit`）：`glasses`、`hardhat`、`chef_hat`、`apron`，全片一套；用户要求时才写，缺省不穿。
```

4. 句意表：
   - `| 提问、制造悬念 | \`curious\` | \`think\` | \`question\` | — |` → `| 提问、制造悬念 | \`curious\` | \`lean_in\` 或 \`think\` | \`question\` | — |`
   - `| 意外的事实、反转 | \`surprised\` | \`jump\` | — | — |` 换成三行：

```markdown
| 意外的事实、反转 | `surprised` | `startle` 或 `jump` | — | — |
| "等一下，再看一眼" | `surprised` | `double_take` | — | — |
| 困惑、"这就怪了" | `curious` | `scratch_head` | — | — |
```

   - `| 想通了 | \`surprised\` 再接 \`happy\` | \`idle\` | \`bulb\` | — |` → `| 想通了、揭晓答案 | \`amazed\` | \`snap\` | \`bulb\` | — |`

`prompt-pack.md` 两处同步（避免与呆毛、`settings.outfit` 冲突）：
- 第 36 行 `表情、动作和手里的道具` 改成 `表情、动作、服装（有 \`settings.outfit\` 时写上，如圆眼镜、安全帽、厨师帽或围裙）和手里的道具`。
- 第 39 行 `人物不加头发、衣服和身体填色` 改成 `人物除头顶一根呆毛和指定服装外不加头发、衣服和身体填色`。

- [ ] **Step 4: 改 README 和官网**

`README.md` 第 26、28 行：

```markdown
主持人是原创手绘火柴人"小青"：黑色墨线，系一条青色围巾，头顶一根会随情绪变形的呆毛，全身 17 个关节由代码画出。分镜按名字选 17 个动作、9 种表情、6 件道具和 4 套服装；在 `host-left` 镜头里，小青能走到某个图解元素旁边指着讲，没写动作的句子会按句意自动配上动作。

![小青速查图：17 个动作、9 种表情、6 件道具和 4 套服装](site/assets/host-cheatsheet.png)
```

`README.en.md` 第 26、28 行：

```markdown
The host is 小青 (Xiaoqing), an original hand-drawn stick figure: black ink lines, a teal scarf and a cowlick on top that changes shape with each mood, with 17 joints drawn by code. The storyboard picks from 17 gestures, 9 expressions, 6 props and 4 outfits by name; in `host-left` shots Xiaoqing can walk over to a diagram element and point at it, and a sentence with no gesture gets one picked from its meaning.

![Xiaoqing cheatsheet: 17 gestures, 9 expressions, 6 props and 4 outfits](site/assets/host-cheatsheet.png)
```

`site/index.html` 第 174、175、177 行：

```html
    <p class="lead">原创手绘火柴人：黑色墨线，空心圆头，椭圆眼睛，头顶一根会随情绪变形的呆毛，脖子上系一条青色围巾。全身 17 个关节由代码画出，每个镜头都是同一个人。</p>
    <p>分镜按名字选 17 个动作、9 种表情、6 件手持道具和 4 套服装；表情自带问号、汗滴、闪光这类符号。在 <code>host-left</code> 镜头里，小青能走到某个图解元素旁边，指它、看它、拍它；没写动作的句子，渲染器按句意自动配上凑近看、打响指、吓一跳这类动作。</p>
```

```html
    <figure class="cheatsheet"><img src="assets/host-cheatsheet.png" alt="小青速查图：17 个动作、9 种表情、6 件道具和 4 套服装，每格写着英文名和中文说明" width="1800" height="2480" loading="lazy"></figure>
```

- [ ] **Step 5: 跑测试看它通过**

Run: `node --test tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs tests/budget.test.mjs`
Expected: PASS（`storyboard.md` 在 10 KB 内，L0 合计在 100 KB 内）。

- [ ] **Step 6: 全量测试并提交**

Run: `npm test`
Expected: 全部通过。

```bash
git add skills/topic-to-video/references/storyboard.md README.md README.en.md site/index.html tests/references.test.mjs tests/readme.test.mjs tests/site.test.mjs
git commit -m "$(cat <<'EOF'
docs: introduce 小青's 呆毛, persona gestures and outfits in the storyboard, READMEs and site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 场景 08 规格与 agy 实测（`gemini-3.8-flash-medium`）

**Files:**
- Create: `tests/scenarios/08-host-persona.json`
- Modify: `tests/scenario-specs.test.mjs`
- Record: `tests/scenarios/results/<timestamp>-08-skill/`

- [ ] **Step 1: 写失败的测试**

`tests/scenario-specs.test.mjs` 改成检查 `01`–`08` 共 8 个场景，运行 `node --test tests/scenario-specs.test.mjs`，预期失败。

- [ ] **Step 2: 新增 `tests/scenarios/08-host-persona.json` 并验证规格测试**

主题 1 分钟科普并明确要求小青戴安全帽出镜，验证 `settings.outfit === "hardhat"`、使用至少 1 个 H 新增表情或动作、所有自动检查通过、第 2 轮产出的 `提示词包.md` 含呆毛锁定与安全帽描述且未调用付费服务或 TTS。运行 `npm test` 通过并提交规格。

- [ ] **Step 3: 运行 agy 场景评测并记录结果**

Run: `npm run scenario -- --scenario 08 --mode skill --agent agy --model gemini-3.8-flash-medium`
逐条核对生成产物与 `review.md`，填写证据和结论后提交评测记录。

---

### Task 11: 验收（主会话，需要 owner）

**Files:** 不改代码；输出都在 `out/`，不提交。

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 2: 速查表和剪影图给 owner 看**

Run: `npm run review-host`
Expected: `out/review/silhouette-540.png` 等文件生成。

把 `site/assets/host-cheatsheet.png` 和 `out/review/silhouette-540.png` 发给 owner，问两件事：

1. 外观：呆毛 5 种形状、9 种表情、17 个动作、4 套服装是否认可。特别请 owner 看 `scratch_head`：手要放到头顶，前臂会从脸前经过；如果不认可，备选是改用远侧的手（画在头后面），只改 `manifest.json` 里这一个动作的角度并重新导出。
2. 剪影：围巾涂黑后，540p 下是否还认得出小青。

- [ ] **Step 3: 示例项目出一版 540p 预览**

不改 `examples/cache-speed/project.json`，复制一份到 `out/` 再渲染（配音走免费的 edge-tts）：

```bash
rm -rf out/h-accept && cp -R examples/cache-speed out/h-accept
```

```bash
node skills/topic-to-video/scripts/render.mjs out/h-accept --preview
```

Expected: 渲染完成，QA 报告没有技术问题。

把预览视频发给 owner，请 owner 确认：至少出现 3 次新的性格动作（`lean_in`、`snap`、`startle`、`double_take`、`scratch_head`）或待机小动作；小青"有性格了"。

- [ ] **Step 4: 收尾**

owner 认可后，按 superpowers:finishing-a-development-branch 处理分支。`lite/host-persona` 叠在 `lite/persona`（PR #6）上：PR #6 合并后先 rebase 到 `main` 再开 PR。push 和开 PR 前先问 owner。

---

## 自查记录

- 设计 §3.1 呆毛：Task 4（画法、形状表、线宽）、Task 6（渐变、弹簧）、Task 5（从帽顶钻出）。
- 设计 §3.2 表情：Task 3（幅度、符号、`amazed`、挤压量）、Task 4（挤压画法）、Task 6（0.3 秒回弹）。
- 设计 §3.3 服装：Task 2（字段、自检）、Task 5（画法、接线）、Task 9（storyboard 写明用户要求时才写）。
- 设计 §3.4 参考图与描述：Task 3–5 重新导出；Task 4 改 `style_lock`、`prompt_lock`；`rights.json` 不动。
- 设计 §4.1–§4.4：Task 3、6、7、8。
- 设计 §5.1 预算：Task 1；`storyboard.md` 改完约 9.9 KB。
- 设计 §6 测试：都落在 Task 1–9 的测试里；"旧项目照常渲染"在 Task 5 的 `settings.outfit dresses the host…` 里检查（没写新字段也画出呆毛）。
- 设计 §7 验收：Task 10。
- 和设计文字不同、在计划里定下的几处：
  - 帽子的呆毛位置字段叫 `crown`，不叫 `top`。围裙也有尺寸字段，同名会把呆毛挪到脸上，原型里出过这个错，见 Review Focus 5。
  - `profile.json` 原来写"没有头发"，和呆毛冲突，一并改掉。
  - 设计说句意表加"揭晓""意外"两行：做法是把"想通了"改成"想通了、揭晓答案"并换成 `amazed` + `snap`，再加"再看一眼""这就怪了"两行，"意外的事实"一行加上 `startle`。
  - `scratch_head` 列入"手臂不穿过头"测试的例外，和 `think` 一样，因为手要放到头顶。
  - 速查表的表情窗口上移 0.06 H，让呆毛进框。
