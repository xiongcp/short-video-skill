关于制作**“为什么冬天静电多”**的 1 分钟 MP4 成片，需要先向您说明：

> [!NOTE]
> 当前版本提供 **L0 完整制作文本包**，系统内暂未内置本地视频渲染器（不擅自安装额外未授权模型或调用未授权的第三方付费生成服务），无法直接在本地一键导出 `.mp4` 文件。
> 标准制作流程是先完成并确认 **L0 文本方案**（含项目工程文件、逐字讲稿、详细分镜及后续的逐镜提示词包），指导您在外部视频大模型（如即梦、可灵、Veo 等）与剪辑软件中完成最终的 1 分钟成片。

现已为您完成 **第 1 步（讲稿）** 与 **第 2 步（分镜）** 的规划设计，并建立了项目文件夹。

---

### 一、 项目文件清单

项目文件夹：[`winter-static/`](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static)

- [project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/project.json)：项目的核心元数据与唯一数据源（版本 revision 1）。
- [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/讲稿.md)：总字数 225 字，预估用时约 59 秒（符合 60 秒目标的 ±10% 要求）。
- [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/分镜.md)：共 7 个镜头，结合原创动漫主持人“晴”与图解模板。
- [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/ref/host.png)：主持人“晴”的标准外观参考图，用于向视频生成模型锁定角色形象。

---

### 二、 方案概览

- **目标时长**：60 秒（预估时长 59.25 秒，正文 225 字）
- **核心承诺**：让观众明白“冬天静电多不是因为电荷产生得更多，而是干燥环境让电荷难以导走”。
- **待核实事项（open_questions）**：无。科学原理严谨公认，依据科普中国《为什么冬天静电格外多》。
- **样片候选镜头**：`sh04–sh05`（共约 19 秒，包含主持人、对比图解与版式切换）。

#### 讲稿正文
1. **s01 冬天的触电烦恼（约 14 秒）**  
   你是不是也有过这种经历？冬天脱下毛衣噼啪作响，摸门把手还经常被电得手麻。为什么到了夏天，这种触电感就突然消失了呢？
2. **s02 摩擦一直在起电（约 11 秒）**  
   其实物体摩擦产生静电，一年四季都在发生。只要穿衣走动，化纤和皮肤互相摩擦，电荷就会不断转移。
3. **s03 空气湿度是分水岭（约 13 秒）**  
   夏天的空气湿度大，物体表面的微薄水膜会把电荷悄悄导走。而冬天空气寒冷干燥，电荷散不出去，就会在身上越攒越多。
4. **s04 高压击穿与化解（约 14 秒）**  
   当人体电压攒到几千伏，靠近金属把手就会瞬间击穿空气。想防静电也很简单。只要多涂护手霜或开加湿器，就能帮电荷提前溜走。
5. **s05 一句话记牢（约 8 秒）**  
   冬天静电多不是电变多了。只是干燥的环境，让身上积攒的电荷无路可逃。

#### 分镜设计摘要
| 镜头 | 段·句 | 估时 | 版式 | 主持人 | 图解模板 | 观众看懂什么 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **sh01** | s01·0 | 3 秒 | `host-left` | 好奇 / 挥手 | `title`：为什么冬天静电多 / 脱衣噼啪响与触电之谜 | 开场打招呼，抛出常见困扰 |
| **sh02** | s01·1, 2 | 11 秒 | `host-left` | 好奇 / 指向右侧 | `bullets`：脱毛衣火花、门把手触电、夏天为什么没有 | 罗列生活场景并引出悬念 |
| **sh03** | s02·0, 1 | 11 秒 | `full` | — | `flow`：日常走动 → 相互摩擦 → 电荷转移 | 解释摩擦起电一年四季都有 |
| **sh04** | s03·0, 1 | 13 秒 | `full` | — | `compare`：夏天潮湿（水膜导电） vs 冬天干燥（电荷积聚） | 对比湿度对电荷释放的关键影响 |
| **sh05** | s04·0 | 6 秒 | `host-left` | 专注 / 指向右侧 | `number`：数千伏 / 人体累积静电电压 | 解释击穿空气产生放电的原理 |
| **sh06** | s04·1, 2 | 8 秒 | `host-left` | 讲解 / 指向右侧 | `bullets`：加湿器、护手霜、摸墙放电 | 给出实用防静电技巧 |
| **sh07** | s05·0, 1 | 8 秒 | `host-left` | 开心 / 强调收尾 | `title`：核心结论 / 不是电变多，而是干燥难散 | 核心总结与挥手告别 |

---

### 三、 状态与下一步

- **当前状态**：待确认（Revision 1，处于**确认①**阶段）。
- **请您确认**：请查看以上讲稿与分镜设计，如果符合您的预期，请回复**“确认”**；如有需要微调的词句或画面，请直接指出修改要求。
- **下一步动作**：在您确认后，我将立即进入**第 3 步**，为您生成完整的 [`提示词包.md`](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-04-G08OuR/winter-static/提示词包.md)，包含：
  1. 主持人“晴”的全局锁定提示词与参考图用法；
  2. 7 个镜头的逐镜 AI 视频生成提示词（规格、画风、分段动作、运镜、首尾衔接与负向提示词）；
  3. 如何使用剪辑软件（如剪映、CapCut 等）配合讲稿进行配音、添加字幕与音效，最终导出 1 分钟 MP4 成片的完整实操指引。


<!-- status: SUCCESS; tools: read_file, run_command, run_command, read_file, read_file, read_file, read_file, read_file, read_file, read_file, run_command, run_command, run_command, run_command, run_command, run_command, run_command, run_command, update_steps, run_command, update_steps, write_file, write_file, write_file, update_steps, run_command, update_steps -->
