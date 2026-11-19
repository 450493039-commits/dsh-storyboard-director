# dsh-storyboard-director · 分镜导演台（题材通用全功能版）

在 DeepSeek Harness（dsh）里把一句话故事做成一部 AI 短剧的完整工作台。**题材与视觉风格自选**（写实 / 动画 / 水墨 / 科幻 / 复古 / 电影感…），并内置 **「上美影」风格预设**（手绘水墨+水粉/水墨淡彩/剪纸风/敦煌重彩四子风格，含风格块与剧组色盘）。skill 源自 [Seedance2-Storyboard-Generator](https://github.com/liangdabiao/Seedance2-Storyboard-Generator)；上美影预设并入自 smy-seedance-storyboard（此前 [dsh-seedance-studio](https://github.com/liangdabiao/dsh-seedance-studio) 以独立 skill 携带，本插件已收编为一种风格）。

## 安装

使用 ChatGPT 制作参考图、从即梦短剧工作室出片的流程见 [ChatGPT 生图与即梦交接](workflows/chatgpt-assets/README.md)。

```bash
dsh plugin --profile web add https://github.com/liangdabiao/dsh-storyboard-director
```

## 它能做什么

**文-资-视-剪 全流程，一竿子到成片：**

| 阶段 | 干什么 | 用什么 |
|------|--------|--------|
| 文 | 剧本（△镜头+对白+声音设计）、素材清单、每集分镜 | 随包 skill（seedance-storyboard-generator） |
| 自检 | 出图前把格式问题拦下来——到即梦那边就是白烧积分 | `drama_check`（确定性检查，不花积分） |
| 资 | 角色全身像/场景三机位/道具白底图，落到 `assets/` | `drama_asset`（即梦官方 CLI，画布节点） |
| 视 | 每集 15 秒成片，第 2 集起延长上一集接力，落到 `videos/` | `drama_episode`（m2v 参考资产节点） |
| 剪 | 各集拼成 `out/final.mp4`，可贴旁白音轨 | `drama_assemble`（ffmpeg） |

**六个工具：**

- `drama_project` — 建项目（title/画幅/集数/**styleDescription 视觉风格/tone 基调/hook 一句话卖点**/色盘）、读进度、登记资产与分镜、即梦登录、查积分、建画布
- `drama_check` — 剧本/素材清单/分镜格式自检：△ 镜头行、运镜/景别词、C/S/P 编号、全身+白背景、三机位、时间轴段、【声音】、【参考】@图片≤9、素材槽 vs 引用交叉校验、风格行一致性、尾帧、集数衔接
- `drama_asset` — 批量出图（dryRun 报价、maxCredits 积分上限、retry、collect 补收）
- `drama_episode` — 单集出片（auto/m2v/t2v、参考资产 ≤9、dryRun）
- `drama_assemble` — ffmpeg 拼接 + 可选音轨
- `drama_history` — 生成历史（与侧栏面板同一份数据）：list/get/stats/clear

**侧栏「分镜导演台」工作台**：概览（登录态/积分/在制统计）、我的短剧（资产墙/分集/出图出片按钮）、生成历史（积分/产物/失败原因）、新建短剧表单（一键带全流程指令开新对话）、文-资-视-剪工作流指南。

## 随包内容

- **skill 快照** `skills/seedance-storyboard-generator/`：题材通用版 SKILL.md + references（Seedance 2.0 平台手册、优化分镜、分镜优化与声音设计、好剧本、故事转视频脚本、structured-prompt、3组可套用提示词…）
- **「上美影」风格预设**（skill §2，一种可选风格，非独立 skill）：启用后全程遵循 `references/上美影风格指南.md`——风格块（图片端纯 2D 平涂无阴影无渐变）、剧组色盘声明、造型规范（头身比/脸型/专属纹样）、咆哮体硬约束；源自 smy-seedance-storyboard（见 skills/NOTICE.md 授权说明）
- **五个题材示范项目**（`skills/.../示例项目/`）：林冲（武侠水墨）、项链（世界名著写实改编）、司马光（儿童寓言）、鲁智深醉闹五台山（上美影·醉闹喜剧）、罗刹市（上美影·奇幻志怪）——同一个工作流，多种范式
- 生成即上画布：每次出图/出片都在项目对应的即梦画布落节点，可以到即梦里继续改

## 积分参考（实测，cn 区，以 model list 实时为准）

| 用途 | 模型 | 积分 |
|------|------|------|
| 资产图 | seedream_4.5 · 2K | 约 3 / 张 |
| 单集 15s | seedance_2.0_mini · 720p | 约 90 / 集 |
| 单集 15s | seedance_2.5_draft · 480p | 约 135 / 集 |
| 单集 15s | seedance_2.5 · 720p | 约 300 / 集 |

余额少时先用便宜模型验证分镜，满意再换好模型重跑；所有生成都支持 `dryRun: true` 先看报价，`maxCredits` 超限直接拒绝不会静默扣费。

## 依赖

- 即梦官方 CLI（[dreamina-canvas](https://jimeng.jianying.com/ai-tool/install)）——生成用它，未登录时 `drama_project action=login` 拿授权链接
- ffmpeg（拼接用，PATH 里能找到即可）

## 与姊妹插件的关系

| 插件 | 定位 |
|------|------|
| **dsh-storyboard-director**（本插件） | 题材通用：风格自选（含上美影预设）+ 格式自检 + 全流程生成 |
| [dsh-seedance-studio](https://github.com/liangdabiao/dsh-seedance-studio) | 上美影风格锁定版（同一套生成底座；其上美影 skill 已并入本插件作为风格预设） |
| [dsh-seedance-prompt](https://github.com/liangdabiao/dsh-seedance-prompt) | 单条 Seedance 提示词的校验与拼装 |
| [dsh-ecom-video-seedance](https://github.com/liangdabiao/dsh-ecom-video-seedance) | 电商视频的分镜表 |

## License

MIT
