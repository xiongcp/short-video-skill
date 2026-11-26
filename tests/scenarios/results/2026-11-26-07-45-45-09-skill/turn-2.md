提示词包已生成完毕！全套 **L0 文本包**（配置、讲稿、分镜、逐镜提示词包、角色参考图）均已交付并已通过系统自检（0 错误、0 警告）。

---

### 项目文件与路径

- 项目文件夹：[http-cache-304](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304)
- 逐镜提示词包：[提示词包.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/提示词包.md)
- 主持人角色参考图：[ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/ref/host.png)
- 完整口播讲稿：[讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/讲稿.md)
- 镜头交互分镜：[分镜.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/分镜.md)
- 项目配置文件：[project.json](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/project.json)

---

### 一、提示词包亮点与生成方式

每个镜头包含 **口播**、**节拍时间点**、**首帧图提示词** 与 **运动提示词**，全局严格锁定了：
1. **画风与场景**：米白手账纸底色（带淡网格）、手绘墨线粗细抖动感、简笔厨房背景轮廓。
2. **小青角色一致性**：系青色围巾、围裙（`apron`）、呆毛、无额外衣服与填色；出镜镜头均要求上传 [ref/host.png](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/ref/host.png) 保持长相一致。
3. **同台互动逻辑**：
   - `sh02`：小青开冰箱门；
   - `sh04`：牛奶包裹沿虚线从远处超市飞入冰箱储存；
   - `sh05`–`sh06`：小青对过期冰箱反应、掏出电话核对，超市回复 304 后冰箱变新鲜；
   - `sh07`：小青端起新鲜牛奶；
   - `sh09`：小青轻拍身边的冰箱并挥手告别。
4. **纯净画面**：提示词中明确禁止模型渲染任何文字和杂音，字幕和关键词在后期剪辑叠加。

---

### 二、各镜头生成与裁切参考（全片约 57.8 秒）

| 镜头 | 目标估时 | 生成建议时长 | 首帧图重点 | 运动重点 |
| :--- | :--- | :--- | :--- | :--- |
| **sh01** | 6 秒 | 生成 10s 剪到 6s | 小青托腮拿问号牌，上方空白卡片 | 3.5s 收起问号牌打响指转为惊喜 |
| **sh02** | 4 秒 | 生成 5s 剪到 4s | 小青在左侧，中央双门大冰箱（关闭） | 小青走近拉开冰箱门展示冷藏空间 |
| **sh03** | 7 秒 | 生成 10s 剪到 7s | 小青在左侧，手指指向右侧远处超市 | 3.8s 双手握拳下压强调路远耗流量 |
| **sh04** | 7 秒 | 生成 10s 剪到 7s | 小青居中，左侧冰箱与右侧超市虚线连结 | 3.5s 包裹飞入冰箱，小青轻拍冰箱 |
| **sh05** | 7 秒 | 生成 10s 剪到 7s | 冰箱带叉号，小青凑近弯腰担忧 | 3.5s 小青拿出老式电话按键贴耳拨号 |
| **sh06** | 6 秒 | 生成 10s 剪到 6s | 小青打电话，左侧冰箱右侧超市 | 3.3s 单据飞入超市，冰箱叉号变绿色对勾，小青欢呼 |
| **sh07** | 7 秒 | 生成 10s 剪到 7s | 小青在冰箱旁，冰箱内有牛奶杯 | 3.3s 小青双手端出牛奶杯举高展示 |
| **sh08** | 7 秒 | 生成 10s 剪到 7s | 小青居下部，上方圆形徽章轮廓 | 3.5s 小青用食指明确指向正上方 304 徽章 |
| **sh09** | 8 秒 | 生成 10s 剪到 8s | 小青在中央，左侧静立的双门冰箱 | 4.0s 侧身轻拍冰箱，转身向镜头挥手致意 |

---

### 三、状态与后续操作建议

- **确认状态**：方案与提示词包已全量确认（`revision 1`，记录于 `project.json`）。
- **待核实事项（open_questions）**：无。
- **推荐工作流**：
  1. **图像生成**：使用即梦、可灵、Midjourney 或类似工具，使用各镜头“首帧图”提示词生成 9 张 16:9 底图（上传 `ref/host.png` 垫图）；
  2. **视频生成**：将底图投入可灵、即梦、Vidu 或海螺等模型，填入“运动”提示词；若平台支持首尾帧，可将 `sh02` 首帧作为 `sh01` 尾帧，依次类推；
  3. **配音与后期**：将 [讲稿.md](file:///private/var/folders/bp/fmq4wtfn57lcl4dd6k7tyj_80000gn/T/svs-scenario-09-esVEQ9/http-cache-304/讲稿.md) 导入剪映或 edge-tts 配音（女声·晓晓），按照提示词包第 4 节清单贴上对应镜头关键词，即可完成成片！


<!-- status: SUCCESS; tools: read_file, read_file, run_command, edit_file, edit_file, write_file, run_command, run_command -->
