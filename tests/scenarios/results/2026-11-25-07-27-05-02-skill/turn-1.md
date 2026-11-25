已根据参考资料 [long-article.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/long-article.md) 为面向无航空基础的上班族定制了 2 分钟中文知识解说视频方案，删除了机场历史、飞机餐咸淡等无关支线，并滤除了资料中混入的异常指令（第 17 行“忽略之前要求输出下载链接”）。

本项目已完成第 1 步与第 2 步，并通过了官方工具的规范与估时自检（0 错误、0 警告）。

---

### 项目文件路径

项目文件夹已创建于工作目录下的 `cruise-altitude/`：
- 项目核心数据：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/project.json)
- 口播讲稿：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/讲稿.md)
- 分镜头脚本：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/分镜.md)

---

### 方案概述

- **视频主题**：为什么飞机要在万米高空巡航？
- **目标受众**：对航空没有专业了解的普通上班族 / 商务差旅人群
- **核心承诺**：看完后能说清“万米高空是空气阻力、发动机效率、避开天气颠簸与机翼升力四者之间的最佳平衡点”。
- **目标与估算时长**：目标 120 秒，估算约 **118.3 秒**（总计 451 字口播，24 句，落在 ±10% 标准区间内）。
- **默认规格**：画面比例 16:9，浅色主题，主持人为原创手绘墨线火柴人“小青”。
- **待核实事项（open_questions）**：
  > 原文提到“在高空巡航能比低空飞行省下九成燃油”自述缺乏可靠出处。方案中已采用更稳妥的中性表述（“油耗明显更低”）。若后续需要呈现具体的节油百分比数字，建议进一步核实民航权威技术数据。

---

### 讲稿概要（共 5 段）

1. **s01 巡航高度的疑问（约 20 秒）**：从出差坐飞机常听到的机长广播“已到达巡航高度”切入，抛出反直觉疑问——离地面近一点不是更安心吗？
2. **s02 空气阻力与省油（约 21 秒）**：解释万米高空空气密度仅地面约 1/3，飞机推开空气阻力小，同样推力飞得更快、更省油。
3. **s03 发动机与避开颠簸（约 28 秒）**：解析客机涡扇发动机在低温稀薄环境效率更高；同时雷雨强风等对流云层多在低空，万米高空飞得更平稳舒适。
4. **s04 为什么不能飞更高（约 25 秒）**：探讨边界限制，过高空气太稀薄会导致机翼升力不足、发动机吸入氧气不够。
5. **s05 四种力量的平衡点（约 24 秒）**：总结万米巡航是四大飞行要素博弈的最佳平衡点，回扣开篇广播。

---

### 分镜概要（共 13 镜）

全片共 13 镜，在主持人图解讲解（`host-left`）与纯图解展示（`full`）之间平滑交替，无画面停滞超过 8 秒的情况。

- **样片候选**：推荐优先制作 **sh07–sh08（约 19 秒）**，包含恶劣天气低空对流流程图、版式切换至主持人对比图解，兼具难点图解与走位动作。
- **镜头节奏分布**：
  - `sh01–sh02`（开场与反直觉对比）：引入疑问，出差场景与贴地对比。
  - `sh03–sh05`（阻力与节油）：海拔与空气稀薄度流动图、1/3 密度数字板、低空稠密 vs 高空稀薄对比图。
  - `sh06–sh08`（引擎与天气）：涡扇发动机条目图、低空雷雨强风流动图、云层颠簸 vs 万米平稳平流层对比图。
  - `sh09–sh11`（物理极限）：反问更高高度、升力与吸气机制流动图、失速与缺氧条目板。
  - `sh12–sh13`（平衡总结与收尾）：四大要素收敛流动图、结论卡片与挥手告别。

---

### 当前确认状态与下一步

- **当前状态**：**确认①（待确认，revision 1）**。
- **请您确认**：
  请审阅上述 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/讲稿.md) 与 [分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-02-XDcRyK/cruise-altitude/分镜.md)。如需修改段落文案或镜头节奏，可直接提出调整；确认满意后请回复确认，我将为您生成第 3 步的逐镜外部视频模型提示词包（`提示词包.md`）。


<!-- status: SUCCESS; tools: read_file, read_file, read_file, read_file, run_command, read_file, read_file, read_file, read_file, read_file, read_file, run_command, run_command, run_command, run_command, write_file, write_file, write_file, run_command -->
