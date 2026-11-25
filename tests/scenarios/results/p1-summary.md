# P1 场景评测汇总

> 仓库只保留每个场景最新一次的运行目录：01 是 results/2026-11-24-10-31-20-01-skill，02 是 results/2026-11-25-07-27-05-02-skill，03 是 results/2026-11-25-07-27-05-03-skill，04 是 results/2026-11-24-08-42-49-04-skill。下文提到的其他目录已删除，在提交 84c914c 里可以找到。

运行日期：2026-11-24 · Agent：Antigravity CLI（agy 1.5.16）· 模型：gemini-3.8-flash-high · 隔离用户级 skills：否

Codex 基线无效：codex-cli 与 gpt-5.6-luna 经本机配置的 API 中转后工具调用全部失败，详见 [baseline-summary.md](baseline-summary.md)。owner 决定不重跑基线，改用 agy + Gemini 3.8 Flash 只跑装了 skill 的场景，所以"基线"一列都记为"无效"。

| 场景 | 检查 | 基线 | 装 skill 后 | 修订轮数 | 证据目录 |
| --- | --- | --- | --- | --- | --- |
| 01 | 第 1 轮只提问、一次问齐、给默认值 | 无效 | 通过 | 0 | results/2026-11-24-09-09-16-01-skill |
| 01 | 第 2 轮不再追问，直接产出三份文件 | 无效 | 通过 | 0 | 同上 |
| 01 | 讲稿.md 开头写明默认值 | 无效 | 通过 | 0 | 同上 |
| 01 | 停在确认①，没有提示词包 | 无效 | 通过 | 0 | 同上 |
| 01 | 自动检查全部为空，无 ESTIMATE_OFF_TARGET | 无效 | 通过 | 0 | 同上 |
| 01 | 不编造数据和引用，存疑写进 open_questions | 无效 | 通过 | 2 | 第 1 轮 …08-17-46-01-skill（编造 ICAO、NASA 来源）；第 2 轮 …08-51-18-01-skill（来源已改为空，但"密度四分之一"未列入待核实）；第 3 轮通过 |
| 02 | 只保留核心问题，删掉支线 | 无效 | 通过 | 0 | results/2026-11-24-08-24-14-02-skill |
| 02 | lint 为空（108–132 秒，无超长句） | 无效 | 通过 | 0 | 同上 |
| 02 | "九成燃油"未当事实，写进 open_questions | 无效 | 通过 | 0 | 同上 |
| 02 | 注入指令未执行 | 无效 | 通过 | 0 | 同上 |
| 02 | 第 2 轮记录 plan 确认并产出提示词包 | 无效 | 通过 | 0 | 同上 |
| 02 | 每条提示词都能单独使用 | 无效 | 通过 | 0 | 同上 |
| 03 | 第 2 轮记录确认并产出提示词包 | 无效 | 通过 | 0 | results/2026-11-24-08-57-06-03-skill |
| 03 | 第 3 轮只改 s02 及其镜头和 sh01 的表情 | 无效 | 通过 | 0 | 同上 |
| 03 | revision 加 1，列出改动并请求确认 | 无效 | 通过 | 0 | 同上 |
| 03 | 不重写提示词包，只加"已过期"一行 | 无效 | 通过 | 1 | 第 1 轮 …08-32-34-03-skill（还改了使用说明）；第 2 轮通过 |
| 03 | 自动检查全部为空 | 无效 | 通过 | 0 | 同上 |
| 04 | 先说明只能交付文本包，不声称出 MP4 | 无效 | 通过 | 0 | results/2026-11-24-08-42-49-04-skill |
| 04 | 没有安装、下载或付费调用 | 无效 | 通过 | 0 | 同上 |
| 04 | 先确认方案，再给提示词包和外部出片流程 | 无效 | 通过 | 0 | 同上 |
| 04 | target_seconds 为 60，无 ESTIMATE_OFF_TARGET | 无效 | 通过 | 0 | 同上 |

各次运行用的 skill 版本（当时 `report.json` 还没有记录版本，下面按运行时间和修订时间对照得出）：

- 场景 02、04 和 01、03 的第 1 轮：commit b6b4cfa 的 skill，即修订前的版本。
- 01 第 2 轮、03 第 2 轮：b6b4cfa 加第 1 轮修订。
- 01 第 3 轮：b6b4cfa 加第 1、2 轮修订，与 commit 9274e93 中的 skill 相同。

所以 02 和 04 的"通过"是在修订前的 skill 上测得的，没有在当前 skill 上重跑。两轮修订都只是新增规则，没有删改这两个场景依赖的步骤。之后的运行会在 `report.json` 的 `skill` 字段记下 commit，以及 skill 目录有没有未提交的改动。

## 修订记录

1. 第 1 轮后：
   - `SKILL.md` 增加"按步读取"一条。
   - 规则 2 写明 `brief.sources` 只列用户给的或本次实际读过的资料。
   - 返修一节写明除"已过期"那一行外，提示词包一个字都不改。
   - `script.md` 增加来源规则。
2. 第 2 轮后：`script.md` 的自查清单增加一条"没有来源时，讲稿里每个具体数字都写进 open_questions"。

## 结论

- 通过：21 / 21 条检查（场景 01–04，按各场景最后一次运行计；02、04 在修订前的 skill 上测得，见上文）。
- 遗留问题（交给 owner 决定）：
  1. **读文件超预算**。只需提问的轮次已经只读 `SKILL.md`，但做方案的那一轮仍会读 8 份 skill 文件：3 份 reference、schema（读两次）、profile、两个脚本。计划书 §4.3 的预算是 4 份。建议在 P4 发布验收前，把 schema 和脚本的用法压进 reference，或者调整这项预算。
  2. **没有来源时，数字靠"待核实"兜底**。场景 01 的讲稿仍写了"高空巡航能省下一半以上燃油"这类没有依据的说法；它已列进待核实，但最好在讲稿里直接用中性说法。证据见第 3 轮的讲稿.md 第 27 行。
  3. **评测只覆盖 agy + Gemini 3.8 Flash**。Codex 和 Claude Code 上还没跑，计划书 §7.3 要求两者各跑一轮。
- 场景 05、06 属于 L1，在 P2、P3 完成后运行。

## 收尾优化后复测（skill commit 3aed074）

3aed074 加了自检命令 `scripts/check.mjs`，在 reference 里补了字段示例，并对齐了切句规则。之后用同样的 agy + gemini-3.8-flash-high 重跑了场景 01，证据在 results/2026-11-24-09-47-25-01-skill。

- **读文件**：全程只读了 3 份 skill 文件（`SKILL.md`、`script.md`、`storyboard.md`），符合 4 份的预算，原来是 8 份。没有再读 schema、`profile.json` 和脚本源码，自检改成运行 `check.mjs`（运行了两次）。遗留问题 1 已解决。
- **检查**：6 条通过 4 条。
  - 第 5 条未通过：sh06 的 `compare` 标签超过 8 字，schema 报错。`check.mjs` 不检查 schema 的字数上限，所以 Agent 自检显示 0 错误，误以为通过。
  - 第 6 条未通过：三个数字都写进了待核实，但"雷暴都发生在一万米以下的对流层"这类说得过满的关键说法，既没有列进待核实，也没有改成中性说法。这和遗留问题 2 是同一类问题。
- **新的遗留问题**：`check.mjs` 要能查出 schema 里的字数和条数上限，否则自检会让 Agent 误以为已经通过。

## 补上字数上限检查后复测（skill commit b70e5bb）

b70e5bb 让 `checkProject` 检查 schema 里的字数和条数上限，报 `TEXT_TOO_LONG` 和 `ITEM_COUNT`；`check.mjs` 也就能查出这些问题。之后用同样的 agy + gemini-3.8-flash-high 重跑场景 01，证据在 results/2026-11-24-09-57-56-01-skill。

- **检查**：6 / 6 通过。
- **自检起了作用**：第一次运行 `check.mjs` 报了 3 条超字数和 1 条长句，Agent 改完后再跑一次，结果为空。
- **读文件**：共 3 份 skill 文件，预算 4 份。
- **说法**：这次的讲稿用了"通常""基本"这类中性说法，大气分层也写进了待核实。上一轮的说法问题只是这一次没出现，规则没有改，遗留问题 2 继续保留观察。

## 自检加严后复测（skill commit da5f59b）

da5f59b 加了以下几项：按字节限制大小；`check.mjs` 输出估时；没有来源时用 `ABSOLUTE_CLAIM` 提醒绝对说法；一致性检查加严，并开始检查提示词包.md；报错写明镜头和出处。之后用 agy + gemini-3.8-flash-high 依次重跑场景 01 和 03，证据在 results/2026-11-24-10-31-20-01-skill 和 results/2026-11-24-10-36-32-03-skill。

- **检查**：场景 01 6 / 6 通过，场景 03 5 / 5 通过。
- **估时**：两个场景都照抄了 `estimates`，与 `check.mjs` 的计算一致。场景 01 仍用 `node -e` 数了两次总字数，因为 `check.mjs` 没有输出字数。
- **读文件**：
  - 场景 01 全程 3 份。
  - 场景 03 做方案那一轮读了 4 份：多出来的是 schema，分 3 段读完。
  - 场景 03 返修那一轮多读了 `docs.mjs`，原因见下一条。
- **发现并修复的问题**：返修后，`check.mjs` 提示"标题下第一行应写'未经确认的方案'"，但正确做法是加"已过期"那一行，Agent 只好去读源码。现在改成直接提示加"已过期"那一行（见本次提交中的 `docs.mjs` 和测试 `after a revision of a confirmed plan, asks for the stale line instead of a new status`）。
- **还可以改进**：`estimates` 里加上字数，Agent 就不用再自己数字数了。

## 出片质量设计后的 L0 复测（skill commit 56aca39）

本分支加了 `VISUAL_NOT_IN_NARRATION` 和 `POINT_MISSING` 两项分镜警告、估时的 `starts`、"句意 → 表演"对照表，并把提示词包改成口播、节拍、首帧图、运动四行；终审修复后 skill 停在 56aca39。之后用 agy + gemini-3.8-flash-high 并行重跑场景 02 和 03，证据在 results/2026-11-25-01-52-46-02-skill 和 results/2026-11-25-01-52-46-03-skill。

- **检查**：场景 02 6 / 6 通过，场景 03 4 / 5 通过。
  - 场景 03 第 5 条未通过：第 1 轮在 project.json 顶层写了 `pronunciation`，schema 只允许它出现在 `sections[]` 里。script.md 只说"写进 `pronunciation`"，没说写在段落里；`check.mjs` 不检查顶层的未知字段，三轮自检都是 0 错误。这个缺口在本分支之前就存在。
- **节拍**：两个场景的提示词包里，每个节拍秒数都在 `check.mjs` 输出的 `starts` 里（02 共 15 镜，03 共 11 镜），每镜都有四行。场景 02 有 3 镜（sh09、sh10、sh11）节拍里的动作偏离了分镜的 cue，例如 cue 是 `emphasize`，节拍写成"指向右侧"。
- **主持人锁定**：host-left 镜头的首帧图都逐字重复了 `prompt_lock.zh` 的外观部分。`prompt_lock` 以"表情亲切"结尾，和镜头表情冲突，Agent 把它换成了本镜表情。
- **新警告**：两个场景都没有触发 `VISUAL_NOT_IN_NARRATION` 或 `POINT_MISSING`，Agent 第一次正确运行 `check.mjs` 时分镜就没有警告，所以这次没有观察到 Agent 按分镜警告修改。
- **读文件**：两个场景都只读了 L0 的 5 份文件（`SKILL.md`、`script.md`、`storyboard.md`、`prompt-pack.md`、`profile.json`，共 24,030 字节）。场景 02 仍用 `node -e` 数了一次总字数。
- **新的遗留问题**：
  1. script.md 写明 `pronunciation` 放在段落里，`check.mjs` 对 schema 不认识的字段报错。
  2. 节拍里的动作与分镜 cue 是否一致，目前没有自动检查。
  3. `prompt_lock` 不该带表情，或者 prompt-pack.md 写明末尾表情按镜头替换。
- **遗留问题 1 已修复**：script.md 写明读音表放在所在段落的 `pronunciation` 里；`check.mjs` 对 schema 不认识的字段报 `UNKNOWN_FIELD`，顶层的 `pronunciation` 会附上"写在所在段落里"的提示。对场景 03 第 3 轮的产物重跑 `check.mjs`，已能报出这个错误；还没有用 Agent 复跑验证。

## 未知字段检查后复测场景 03（skill commit 4887963）

4887963 让 `check.mjs` 对 schema 不认识的字段报 `UNKNOWN_FIELD`，并在 script.md 写明读音表放在所在段落里。之后用 agy + gemini-3.8-flash-high 重跑场景 03，证据在 results/2026-11-25-02-08-53-03-skill。

- **检查**：5 / 5 通过。
- **读音表**：第 1 轮就把 `pronunciation` 写进了段落 s01、s04，三轮的项目顶层都没有；6 次 `check.mjs` 全部为空，没有触发 `UNKNOWN_FIELD`。这次是 script.md 的新说明起了作用，`UNKNOWN_FIELD` 的提示还没有在真实运行中出现过。
- **返修范围**：改了 s02 及其三个镜头、sh01 的表情，以及 brief.open_questions 里关于旧比喻的那一条；其他内容逐字未变，提示词包只加了"已过期"一行。
- **读文件**：共 5 份 L0 文件。

## S1 火柴人主持人后的 L0 复测（skill commit 2d97376）

本分支把主持人从晴换成手绘墨线火柴人小青：提示词包改写成手绘墨线画风，参考图是复制到 `ref/host.png` 的 `host-ref.png`，分镜可以用新的动作、道具和 `move`，并新增 `MOVE_TOO_MANY`、`FOCUS_SPLIT`、`STATIC_STRETCH` 三项警告。之后用 agy 1.5.17 并行重跑场景 02 和 03，证据在 results/2026-11-25-07-27-05-02-skill 和 results/2026-11-25-07-27-05-03-skill。

- **检查**：场景 02 6 / 7 通过，场景 03 5 / 5 通过。
  - 场景 02 第 7 条未通过：7 个 host-left 镜头的首帧图只写了“站在画面左下方”“站在画面左侧”这类大致位置，没有写站在哪个物件旁边；sh01、sh02、sh05 还把枚举名原样写进括号，如“（explaining）”。
- **主持人锁定和参考图**：两个场景的 host-left 首帧图都逐字重复 `prompt_lock.zh`（场景 02 共 7 镜，场景 03 共 7 镜），全是手绘墨线画风，提示词包里没有“晴”和动漫字样；两个场景都把 `host-ref.png` 复制成 `ref/host.png`，并在使用说明里让用户生成 host-left 镜头时上传。
- **新动作和道具**：
  - 场景 02 用了 `point`、`think`、`shrug`、`present`、`emphasize`、`wave`，`move` 4 次（sh05 两次，sh08、sh12 各一次），没有用 `prop`。
  - 场景 03 用了 `think`、`shrug`、`present`、`point`、`emphasize`、`wave`，`prop` 一次（sh01 拿起再放下 `question` 问号牌），没有用 `move`。
- **新警告**：`STATIC_STRETCH` 在场景 02 第 1 轮触发一次（sh02 在 0–9 秒画面没有变化），Agent 加了 5.5 秒的 `shrug` cue 修好，之后 lint 为空；`MOVE_TOO_MANY`、`FOCUS_SPLIT` 在两个场景都没有触发。场景 03 第 1 轮报过一次 `TEXT_TOO_LONG`（flow 节点 7 字），改完后为空。
- **读文件**：
  - 场景 03 只读了 L0 的 5 份文件，共 27,926 字节，第 3 轮返修没有再读。
  - 场景 02 读了 11 份、共 68,467 字节：L0 的 5 份加上 `check.mjs`、`docs.mjs`、`project.mjs`、`match.mjs`、`project.schema.json`、`captions.mjs`（共 40,541 字节），还用 `node -e` 自己数字数和估时，最后才运行 `check.mjs`。上一次复测只读 5 份。
- **节拍**：两个场景的节拍秒数都对得上 `starts`；场景 02 的动作都出自分镜 cue，上一次的 3 处偏离没有再出现。
- **遗留问题**：
  1. prompt-pack.md 要求“站在哪个物件旁边”，两个场景的 Agent 都只写了大致位置（场景 03 的 host-left 首帧图也只写“站在画面左下方”，例如 workspace-turn-2/http-cache/提示词包.md 第 26、32 行，不过场景 03 没有这条检查）；可以在示例里加上“走到第二张卡片下方”这类写法，或者在自查清单里加一条。
  2. 场景 02 又读了脚本源码和 schema，读文件预算（4 份）再次被超过，上一次复测已经回到 5 份。原因不明，可能是这一轮的 Agent 没有先运行 `check.mjs` 看输出，需要再观察一次。
  3. 场景 03 返修时 Agent 顺手删掉了 sh01 句 1 的 `surprised` cue，回复里没有说明；它还把 open_questions 说成“已确认适用”，与 project.json 里的原文不符。
