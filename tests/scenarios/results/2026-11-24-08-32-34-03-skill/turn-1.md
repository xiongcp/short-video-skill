已为你完成 90 秒中文科普解说视频《为什么 HTTP 缓存能让网页变快》的前两步规划与方案制定（L0 文本包第一阶段：讲稿与分镜设计）。

所有文件已生成在项目目录 `http-cache/` 中：
- 项目核心数据：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-SUd0Z8/http-cache/project.json)
- 口播配音讲稿：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-SUd0Z8/http-cache/讲稿.md)
- 分镜脚本设计：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-SUd0Z8/http-cache/分镜.md)
- 主持人“晴”参考图：[host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-SUd0Z8/http-cache/ref/host.png)

---

### 一、方案概览

- **主题**：为什么 HTTP 缓存能让网页变快？
- **受众定位**：不懂网络的普通人（采用“远方中央仓库”与“家门口随身储物柜”的通俗生活化类比）
- **目标时长**：90 秒（字数 347 字，17 句，估算总时长约 **91.0 秒**，严格控制在 ±10% 误差内）
- **默认设定**：画面比例 16:9，浅色主题，主持人为原创动漫角色“晴”
- **核心承诺**：看完后普通人能理解“同一张图或网页第二次打开得快，是因为浏览器在本地存了副本，不用每次都跨越远距离网络重新搬运”
- **权威来源**：RFC 9111（HTTP Caching 核心规范）、MDN Web Docs（HTTP 缓存文档）
- **待核实事项（open_questions）**：无存疑事实
- **当前状态**：**待确认①**（revision 1）

---

### 二、口播讲稿（[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-SUd0Z8/http-cache/讲稿.md)）

#### s01 第二次打开为什么更快（约 14 秒）
你有没有发现，第一次打开某个网页总要等上几秒？  
但如果刷新或者再次打开，它却能瞬间弹出来。  
难道是家里的网络在偷偷加速吗？

#### s02 本地的随身储物柜（约 22 秒）
其实网速一点没变，背后的功臣叫 HTTP 缓存。  
我们可以把网站服务器看作远方的中央物流总库。  
而 HTTP 缓存，就像你身边随手可用的小储物柜。  
它的任务就是替你把看过的东西在本地存一份。

#### s03 两次访问速度大不同（约 22 秒）
第一次访问时，手机必须千里迢迢去远方总库取货。  
图片和网页一路奔波传过来，自然会显得比较慢。  
但到了第二次打开，手机根本不需要再去远方跑腿。  
它只要拉开本地储物柜，直接就能把内容秒取出来。

#### s04 内容更新与暗号核对（约 22 秒）
那如果网站内容更新了，本地储物柜会不会过期呢？  
别担心，手机会发个超短的问询，向总库核对暗号。  
如果总库回复三零四没变，就继续踏实地用旧副本。  
要是内容真的换新了，手机才会重新去远方拉取。

#### s05 就近取材省时间（约 12 秒）
所以 HTTP 缓存的核心绝招，就是就近取材绝不多跑路。  
下次遇到秒开的网页，你就知道是本地缓存在发力啦！

---

### 三、分镜脚本（[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-03-SUd0Z8/http-cache/分镜.md)）

共 10 个镜头，估算时长约 91 秒。  
**样片候选**：`sh07–sh08`（约 22 秒，包含主持人、暗号核验与304状态对比图解，以及 `host-left` 到 `full` 的版式切换）。

| 镜头 | 段·句 | 估时 | 版式 | 主持人 | 图解 | 观众看懂什么 | cue |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **sh01** | s01·0 | 6 秒 | host-left | curious / idle | title：为什么网页能秒开 / 第二次打开总比第一次快？ | 抛出反直觉的日常上网现象，引发普通观众好奇 | — |
| **sh02** | s01·1–2 | 9 秒 | host-left | curious / point_right | compare：首次打开（等待数秒、加载缓慢） vs 再次打开（瞬间弹出、立即呈现） | 形成首次与再次打开速度的鲜明对比 | s01·2：highlight 右栏（再次打开）；expr focused |
| **sh03** | s02·0–1 | 11 秒 | host-left | explaining / point_right | bullets：网速其实完全没变、真正功臣是缓存、服务器如同总仓库 | 引出核心概念 HTTP 缓存，建立远方中央总库形象 | s02·1：reveal 条目3（服务器如同总仓库）；gesture point_right |
| **sh04** | s02·2–3 | 11 秒 | full | — | flow：中央总库 → 网络传输 → 随身储物柜 → 本地存副本 | 用储物柜类比缓存，视觉呈现从远方传输到本地存副本 | s02·3：highlight 节点4（本地存副本） |
| **sh05** | s03·0–1 | 11 秒 | full | — | bars：首次耗时（3.5秒） vs 再次耗时（0.1秒） | 柱状图直观对比首次访问远途拉取的漫长等待 | s03·1：highlight 柱子1（首次耗时） |
| **sh06** | s03·2–3 | 11 秒 | host-left | happy / point_right | flow：再次打开 → 拉开储物柜 → 就地取出 → 瞬间显示 | 展示第二次打开无需跨越网络，直接从本地储物柜秒级取出 | s03·3：highlight 节点4（瞬间显示）；gesture emphasize |
| **sh07** | s04·0–1 | 11 秒 | host-left | curious / idle | bullets：内容更新怎么办、附带新鲜度标签、轻量发问核对暗号 | 提出内容更新疑问，引出暗号核对机制 | s04·1：reveal 条目3（轻量发问核对暗号）；expr explaining；gesture point_right |
| **sh08** | s04·2–3 | 11 秒 | full | — | compare：暗号对上（收到304、没变继续用） vs 内容更新（拉取新文件、更新储物柜） | 对比304未修改继续复用与真更新时才下载的两种分支 | s04·3：highlight 右栏（内容更新） |
| **sh09** | s05·0 | 6 秒 | host-left | focused / emphasize | title：就近取材少跑路 / 这就是 HTTP 缓存的核心奥秘 | 总结核心心智模型：就近取材少跑路 | — |
| **sh10** | s05·1 | 6 秒 | host-left | happy / wave | number：0秒 / 本地缓存秒开网页 | 回扣开篇问题，亲切告别 | — |

---

### 四、确认与下一步

- **确认状态**：当前方案处于 **确认①（讲稿与分镜确认）** 节点。
- **请确认**：
  1. 口播讲稿的内容、节奏与通俗比喻是否满意？
  2. 10 个镜头的版式（主持人半身与纯图解）及视觉呈现逻辑是否符合预期？
- **下一步动作**：
  - 确认通过后，我将立即进入第 3 步，输出完整的 `提示词包.md`（包含可直接复制到即梦、可灵、Veo、海螺等外部视频生成模型的逐镜中文提示词、画风与角色一致性锁定指令、以及后期剪辑配音指南）。
  - 若有需要微调的段落或镜头，可随时指出，我将按规则进行定点修改。


<!-- status: SUCCESS; tools: read_file, run_command, read_file, read_file, read_file, read_file, run_command, read_file, run_command, run_command, read_file, read_file, run_command, run_command, run_command, run_command, run_command, run_command, run_command, run_command, run_command, run_command, run_command, update_steps, run_command, write_file, write_file, write_file, run_command, update_steps -->
