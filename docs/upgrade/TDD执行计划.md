# TDD 执行计划

简体中文 · [English](tdd.en.md)

**目标**　把现有的 Skill、数据合同和离线检查接成能制作两种片长节目的本地工作室。每次只取依赖已具备的一张任务卡，交付代码、可重放的红绿记录和与该层相符的实物。

**架构**　一个 Orchestrator 管状态和授权。Node.js / TypeScript 服务消费现有 JSON Schema，SQLite 保存项目及作业。角色、图解和音频按镜头编译，再由确定性 Worker 生产。Python 保留为离线验收入口。

**给接手模型**　先读[项目计划](项目计划书.md)、[升级设计](升级详细设计.md)、[验收计划](验收计划.md)与[当前状态](交接状态与证据.md)。T00–T04 已实际完成，T05 的数据通路、T06 的资产目录、T07 的编译器、T08 的烘焙器、T09 的渲染/返修/恢复运行时、T10 的三级 QA/盲评运行时与 T11 的无头交付/归档/还原运行时（按所有者选定的 **方案 A 纯 Agent Skill 裁剪**：正式裁掉 React `studio/` 工作台）已在 RUNTIME 级完成（真实语音的 A05、原创美术的 A06/A11 验收待办），下一张卡是 T12。`runtime/cli.ts`、`runtime/doctor.ts`、`runtime/preview.ts`、`runtime/i18n.ts` 与 `tests/runtime/` 由 T01 建立，`runtime/project-store.ts`、`runtime/orchestrator.ts`、`runtime/approvals.ts` 由 T02 建立，`runtime/jobs.ts`、`runtime/ledger.ts` 由 T03 建立，`runtime/content.ts`、`tools/search_sources/adapter.ts` 由 T04 建立，`runtime/audio.ts`、`runtime/assets.ts`、`tools/align_audio/adapter.ts`、`tools/generate_tts/adapter.ts` 由 T05 建立，T06 在 `runtime/assets.ts` 中加入资产登记、授权、场景模板与装配前检查，`runtime/compiler.ts`、`runtime/timebase.ts` 由 T07 建立，`runtime/baker.ts`、`tools/bake_character/adapter.ts`、`tests/runtime/studio-fixture.mjs` 由 T08 建立，`tools/render_shot/adapter.ts`、`runtime/render.ts`、`runtime/revision.ts` 由 T09 建立，`tools/inspect_media/adapter.ts`、`runtime/qa.ts` 由 T10 建立，`runtime/export.ts`、`tools/package_project/adapter.ts` 由 T11 建立。以下 `runtime/` 和 `tests/runtime/` 为实施路径（`studio/` 已按方案 A 裁减），现有 `schemas/`、`skills/`、`policies/` 和 `tools/` 继续作为权威入口。

## 开工与每张卡的闭环

```sh
python3 -B evals/check_design.py
python3 -B -m unittest discover -s evals -p 'test_*.py' -v
```

- [ ] 选择一项可观察行为，写最小会失败的测试。先记录已有测试结果和本卡输入版本。
- [ ] 单独运行本卡命令，保存 RED 的退出码、失败断言与原因。依赖缺失或测试夹具坏了先修夹具。已有行为本就通过时记录已有覆盖，另选缺失行为。
- [ ] 只实现使该断言成立的最小变更。重新运行同一命令，保存 GREEN，再跑相邻调用方及全量基线。
- [ ] 绿灯后消除本次引入的重复。记录重构或无需重构的理由，再运行全量回归。把 case_id、输入/输出哈希、测试日志和剩余人工项写入状态表。
- [ ] 已有调用方、两种片长及历史样例都保持可读。若需不兼容 Schema，先写旧项目回放测试，再写迁移和版本记录。

工程测试建议使用 Node 内置测试运行器。测试文件为 .mjs，直接断言对外 CLI/服务结果。新 CLI 约定为 `node --experimental-strip-types runtime/cli.ts <操作> --project <目录> --request <JSON文件>`，由 T01 建立。TypeScript 启动方式按目标 Node 版本核验。测试夹具可使用临时项目、本地 WAV 和测试适配器。发布资格使用真实材料。审核身份来自宿主认证会话，代理输入文件只携带请求内容。

## 任务顺序

| 卡 | 依赖 | 完成物 | 验收编号 |
| --- | --- | --- | --- |
| T00 | 已有架构包 | 真实媒体技术验收命令与离线证据 | C00、C01 |
| T01 | T00 | doctor、12 秒有声薄切片 | A01 |
| T02 | T01 | 状态持久化、版本、人工审核、恢复 | A02 |
| T03 | T02 | 权限、预算、提交意图与对账 | A03 |
| T04 | T02，联网计费时另需 T03 | 主题、证据、审核讲稿 | A04 |
| T05 | T04，付费语音另需 T03 | 实测音频、对齐与字幕轨 | A05 |
| T06 | T01 | 原创角色、三类场景与 45–60 秒美术样片 | A06、A11 美术部分 |
| T07 | T04、T05、T06 | 可追溯的分镜与编译快照 | A07 |
| T08 | T06、T07 | 顺序烘焙、可随机取帧的图层 | A08 |
| T09 | T02、T03、T07、T08 | 逐镜/章渲染、返修规划与恢复 | A09、A12 |
| T10 | T05、T08、T09 | 几何和媒体 QA、联系表与样片评审 | A10、A11 |
| T11 | T02、T09、T10 | 无头交付路径（方案 A）、清单、归档与还原 | A13 |
| T12 | T01–T11 生产依赖就绪 | 三档短片取证、三期长片验收 | A14、A15 |
| T13 · 可选 | T03、T08、T09、T10，所有者已启用 | 受控插镜及回退 | A16 |

里程碑需要的最小 UI、代理片和美术验证可作为对应卡的先行子任务。表中依赖表示整张卡完成的条件。T01 和 T06 早期技术片/美术样片按实际用途标记，正式 G3/G4/G5 均绑定对应节目版本。

## T00　已完成的验收切片

文件为 `evals/check_design.py`、`evals/media_acceptance.py`、`evals/test_media_acceptance.py`。两分钟和八分钟纸面分镜可离线复验。媒体检查读取真实解码帧和音轨，可发现正确帧数中的时间戳抖动。完整红灯、绿灯及重构记录见[证据索引](交接状态与证据.md)。

## T01　环境与最薄有声链路

创建 `runtime/cli.ts`、`runtime/doctor.ts`、`runtime/preview.ts` 和 `tests/runtime/T01-doctor.test.mjs`。复用 `profiles/duration.yaml` 与 `tools/inspect_media/contract.yaml`。第一步只创建诊断入口，随后接入本地画面、WAV、合成与实际预览探针。

- [x] **RED 1**　在临时目录放一份确有内容的字体和 WAV，再把约定字体移走。调用 doctor，断言输出列出缺失字体和该能力状态。测试从返回项判断，避免只匹配日志文字。
- [x] **GREEN 1**　实现本地依赖、字体、渲染和编码能力探针，保留工具版本、实际图形后端及缺口。缺图形后端时仍可报告音频和编码能力。
- [x] **RED 2**　用 48 kHz 本地 WAV 和可分发的角色夹具，生成 12 秒技术片。断言 360 个解码视频帧、存在可听声轨、首中末三帧有正样本画面差。
- [x] **GREEN 2**　将一个角色层和一层程序图解通过拟用生产合成路径输出母版。归档源轨、渲染配置、探针和三帧。尚无原创 Rig 时在报告写明夹具身份。
- [x] 复验命令为 `node --test tests/runtime/T01-doctor.test.mjs`。把 12 秒 PoC 的证据挂在 A01，正式短片命令留给 60 秒以上的节目。

## T02　项目状态、审查与幂等事件

创建 `runtime/project-store.ts`、`runtime/orchestrator.ts`、`runtime/approvals.ts`、`tests/runtime/T02-state.test.mjs`。读取 `workflows/topic-to-video.yaml` 和 `policies/approval-gates.yaml`。

- [x] **RED**　同一事件同一输入提交两次应取得同一事件 ID。同键不同载荷和旧 expected_version 应拒绝。再构造已过期的 G2、草稿直接导出、代理请求自签 G4 三个反例。
- [x] **GREEN**　单个 SQLite 事务比较版本、读取真正的审核人身份、查目标哈希、插入事件和推进状态。唯一键覆盖项目和幂等键。批准证据及旧版本保留。
- [x] **REFACTOR**　让 CLI 和后续 UI 使用同一个状态服务。重启进程后读取原项目，比较阶段和事件数量。运行 `node --test tests/runtime/T02-state.test.mjs`，将数据库快照和拒绝记录留 A02。

## T03　预算、供应商作业与未知回执

创建 `runtime/jobs.ts`、`runtime/ledger.ts`、`tests/runtime/T03-jobs.test.mjs`。使用 RenderJob、ToolResult 和 `policies/budget.yaml`，费用统一使用最小货币单位。

- [x] **RED**　余额上限 100，并发发起两个不同的 70 单位意图，断言有效预留只有一个。同一意图重复发送时，测试端接单次数应为 1。注入接单后回执丢失与进程重启。
- [x] **GREEN**　在事务中写 reserve 和待提交意图，再用原键联系供应商。未知时查询原业务键或回执。对账确认后结算一次。无查询接口时保留 UNKNOWN 和待核验余额。
- [x] **REFACTOR**　将记账写入从供应商响应解析中分离。运行 `node --test tests/runtime/T03-jobs.test.mjs`，保存预留、结算、供应商请求计数、授权拒绝与重启日志到 A03。

## T04　主题、来源与可审核脚本

创建 `runtime/content.ts`、`tools/search_sources/adapter.ts`、`tests/runtime/T04-content.test.mjs`。调用入口、选题、研究、编剧四个 Skill。复用短片样例的 brief、evidence-set、script。

- [x] **RED**　让两个版本来源各支持不同结论，再加入无支持的关键断言。断言冲突保留原文定位，unsupported 无法当作已确认事实继续。已有稿件的段落 ID 经非实质文字修订保持不变。
- [x] **GREEN**　以固定版本保存来源、论点关联、限定、分段口播和需试听术语。对真实来源核查的结果由 G1 审核，G2 固定文稿和片长。无网络时可读取用户已授权的材料。
- [x] **REFACTOR**　提取入口和恢复路径共用的默认值合并。测试显式 120 秒、新项目 180 秒、standard8 默认 480 秒。运行 `node --test tests/runtime/T04-content.test.mjs` → A04。

## T05　音频、词对齐、嘴型与 SRT

创建 `runtime/audio.ts`、`tools/align_audio/adapter.ts`、`tools/generate_tts/adapter.ts`、`tests/runtime/T05-audio.test.mjs`。复用 AudioManifest、Alignment 和 SubtitleTrack。先通导入 WAV，再接获准的配音渠道。

- [x] **RED**　段落起始为 48,000 采样，局部词起始为 2,400，断言母带中的词起始是 50,400。同一术语出现两次时用 ID 对齐。加入低置信词和一个手校修订。
- [x] **GREEN**　保存原始 WAV、文本/音色版本、采样时间和对齐置信度。用同一份修订生成字幕和视素驱动。导入 WAV 和 TTS 产生相同的下游合同。
- [ ] **REFACTOR**　计费与重试重用 T03。运行 `node --test tests/runtime/T05-audio.test.mjs`。另用至少 100 个手标锚点及真实音色完成 A05，分别记是否已校准。（计费复用与聚焦测试已完成；真实语音的 A05 尚未执行，故本项未勾选。）

## T06　原创角色和三类可编辑场景

创建 `runtime/assets.ts`、`tests/runtime/T06-assets.test.mjs`。实际素材按权利人许可存入项目资产库。测试目录只放允许复分发的资产及指纹。更新 character、scene 合同前先测既有样例。

- [x] **RED**　缺 Rig 版本、未授权素材、未登记 90 度视角在正式装配时应返回对应资产 ID。输入全幅 1920×1080 位图并要求 1.5 倍无损推近，预检应报告覆盖不足。
- [x] **GREEN**　登记原画、拆层、Rig、许可、支持的动作/视角与音色。保留旧版本，按场景安全区和推近倍率检查可用像素，建立主持人、程序图解、主题插画三类模板。
- [ ] **REFACTOR**　角色画面和纯图解共享同一资产解析。运行 `node --test tests/runtime/T06-assets.test.mjs`，制作 45–60 秒原创美术样片并记录三底、极值姿态和美术决定 → A06、A11。（共享资产解析与聚焦测试已完成；原创美术样片尚未制作，故本项未勾选。）

## T07　导演 DSL、词锚编译与时间基

创建 `runtime/compiler.ts`、`tests/runtime/T07-compiler.test.mjs`。使用 storyboard、common、workflow 三份合同，输入两个示例及实测对齐副本，保留已有 planned 样例的读取能力。

- [x] **RED**　对 2,399 与 2,400 两个采样断言输出帧 1、2。相邻镜头共享一个切点，末端包含最后一个有效采样。非法动作、跨段 cue、循环依赖或越界动画应返回对象和字段。
- [x] **GREEN**　解析稳定引用，对共享边界只量化一次。编译器给出每镜绝对/局部区间、已绑定的动效、音频引用、快照哈希与层级依赖。正式编译只接受 aligned 和获准资产。
- [x] **REFACTOR**　使两档复用同一量化代码。运行 `node --test tests/runtime/T07-compiler.test.mjs`，随后跑 Python 的两组样例回归。保存输入、编译结果和每个负例诊断 → A07。

## T08　顺序角色烘焙与确定性帧读取

创建 `tools/bake_character/adapter.ts`、`runtime/baker.ts`、`tests/runtime/T08-bake.test.mjs`。接已有角色能力表、CharacterActionPlan 和已编译局部帧数。

- [x] **RED**　用同一 Rig、种子、初始状态依次请求局部帧 29、0、15，再按顺序请求 0、15、29，逐个比较无损 RGBA 的哈希。改变显式继承的上一镜末态时缓存键必须变化。
- [x] **GREEN**　固定步长顺序烘焙，合成端只查该帧。将姿态、嘴型和次级运动按固定顺序应用，快照包含 Rig 与物理配置。
- [x] **REFACTOR**　将镜头初态解析与帧读取分开。运行 `node --test tests/runtime/T08-bake.test.mjs`，留实际图像、像素差及锁定环境。模拟 Rig 只记为开发用例 → A08。

## T09　逐镜渲染、局部返修与崩溃恢复

创建 `tools/render_shot/adapter.ts`、`runtime/render.ts`、`runtime/revision.ts`、`tests/runtime/T09-render.test.mjs`。持久化 RenderJob、ChapterCheckpoint、ChangePlan。

- [x] **RED**　改字幕颜色后角色烘焙和 TTS 调用计数应为 0。只换一镜表情时，独立镜头哈希相同。修改第 4 章旁白少 10 秒，应产生第 7,800 帧切点与 470 秒新母版。
- [x] **RED**　在第 4 章临时文件落盘、原子改名、索引已登记三个位置分别停 worker。另破坏一个已缓存镜头的实物。重启后只领取未完成或损坏的任务。
- [x] **GREEN**　局部输入投影生成层键，绝对顺序进入组装键。校验内容哈希再提交索引，恢复时核验实物并重建失效依赖。最终统一混音与编码。
- [x] **REFACTOR**　对比冷渲、热渲与恢复产物。运行 `node --test tests/runtime/T09-render.test.mjs`。留耗时、命中、调用次数、解码帧对比和恢复事件 → A09、A12。

## T10　三级 QA、有声样片与人工评审

创建 `runtime/qa.ts`、`tools/inspect_media/adapter.ts`、`tests/runtime/T10-qa.test.mjs`。复用本包已有的媒体判定规则或同一组测试向量，避免两份规则漂移。

- [x] **RED**　准备一帧闪白、轨迹中途字幕相撞、意外黑场与导演声明的正常静止读图。断言异常给出帧号，允许的停留仍标记原目的。报告绑定所查媒体哈希。
- [x] **GREEN**　渲染前做几何与引用检查。渲染后逐帧查单帧异常、抽样查呈现效果。生成 12 格联系表和 20–30 秒有声样片，QA 返回问题及证据，G3 由人签发。
- [ ] **REFACTOR**　同一 QA 结果可从工作台跳转到镜头与波形。运行 `node --test tests/runtime/T10-qa.test.mjs`。留基线与升级版双片、盲评顺序与人类意见 → A10、A11。（工作台导航契约、专项测试、受控基线双片、盲评排序与宿主模拟评审已完成；真实原创美术/人声的真人 A11 主观评审意见尚未完成，此框保持未勾。）

## T11　无头追溯、发布清单与可恢复归档（方案 A 裁剪）

项目所有者确认采用 **方案 A（纯 Agent Skill 裁剪）**：所有编辑与返修均通过 Agent + Skill CLI 完成，正式裁掉 React `studio/` 工作台及 `tests/ui/T11-review.test.mjs`。创建 `runtime/export.ts`、`tools/package_project/adapter.ts`、`tests/runtime/T11-delivery.test.mjs`，并随包生成零依赖单文件静态审片报告 `deliverables/review-report.html`。

- [x] **RED**　通过 `trace` 从论点跳到来源、从字幕跳到词锚，修改一镜（`revise`）后刷新版本。使用旧 G4 或替换 G5 清单字节时，导出与打包服务应拒绝。把合法包放入新目录后应能重开、验证原资产哈希并逐镜编辑。
- [x] **GREEN**　先签 G4，生成经过 HTML 转义的 `deliverables/review-report.html` 与不含 G5 自身收据的 `ExportManifest`，G5 绑定 `manifest_hash`，打包 `.tar.gz` 后逐文件解包校验哈希并推动 `archive_verified` → `DELIVERED`，最后在新目录还原重开。
- [x] **REFACTOR**　合并 `trace`、`manifest` 与 `package` 中的共享快照读取（`getProjectSnapshot`）。运行 `node --test tests/runtime/T11-delivery.test.mjs`。保留追溯、篡改拒收、审片 HTML、签收与重开报告 → A13（RUNTIME 级夹具与模拟会话验证；真实人类签收归于 T12）。

## T12　真实节目与整体验收

创建 `tests/e2e/T12-programmes.test.mjs`，按[验收计划](验收计划.md)为每期建立独立证据目录。使用所有者批准的主题、来源、原创角色与真实声音。

- [ ] **RED**　缺真实媒体、任一阶段使用过期批准或缺审片记录时，验收汇总返回相应缺项。不能产生生产 PASS。先在受控样本上证明这项检查会失败。
- [ ] **GREEN**　核对精确短片帧数、实际声音、人工门、预算和可还原工程。完成 60/120/180 秒三规格，其中至少一支真实全流程短片。连续生产三期约 8 分钟，至少一期做跨章返修与恢复。
- [ ] **REFACTOR**　按 run_id 聚合证据并保留每期明细。运行 `node --test tests/e2e/T12-programmes.test.mjs` 以及各成片的技术验收命令。例如精确 480 秒长片归档在下列路径时，执行 `python3 -B evals/check_design.py --media evidence/runs/long-01/A15/final.mp4 --profile standard8 --target-seconds 480`。由所有者回看、签收与核对成本 → A14、A15。

## T13　可选的生成式插镜

创建 `tools/generate_image/adapter.ts`、`tools/generate_video/adapter.ts` 中当期实际启用的渠道及 `tests/runtime/T13-inserts.test.mjs`。常规原创角色和程序图解可独立交付。项目有独立图片候选需求时，可在 T03/T06 就绪后提前接图片端。

- [ ] **RED**　默认关闭时视频适配器调用计数为 0。显式启用后，超候选数、超帧预算或回执未知时不会发起第二次付费提交。拒用的候选能回退至原镜头。
- [ ] **GREEN**　登记 driving 片和参考资产，继承 T03 预算及幂等机制，仅将人类选择的候选绑定到该镜头时间轴。
- [ ] **REFACTOR**　验证原角色层/图解回退路径。运行 `node --test tests/runtime/T13-inserts.test.mjs`。未启用时保留状态及原因，真实启用时补供应商凭证摘要、连续性证据与人工决定 → A16。

## 交接与收尾

每次离开任务时，在[交接状态](交接状态与证据.md)更新最近完成卡、证据、未解决的问题和下一可开工卡。Git 提交与远端发布按用户授权办理。所有目标文件与证据就绪后，从干净目录重放离线命令，再按验收计划签发该层结论。
