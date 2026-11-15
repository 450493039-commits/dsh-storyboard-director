# 随包 skill 来源说明

本插件随包一条 skill：`seedance-storyboard-generator/`（题材通用，风格自选）。

## 主体

来自 [Seedance2-Storyboard-Generator](https://github.com/liangdabiao/Seedance2-Storyboard-Generator)（`.claude/skills/seedance-storyboard-generator/`）的快照，作者 liangdabiao（本插件作者本人），随插件以 MIT 分发。

## 风格预设：上美影（并入 references 与示例项目）

`references/上美影风格指南.md`、`references/上美影原始提示词.txt` 与 `示例项目/鲁智深醉闹五台山项目/`、`示例项目/罗刹市奇幻故事项目/` 原属 `smy-seedance-storyboard`（上美影风格 Seedance 分镜生成器），在 dsh-seedance-studio 中曾是独立 skill 快照，现已并入上述位置作为本 skill 的一种可选风格预设。

该部分不是本仓库原创，而是第三方 skill 的内容快照：

- 来源：用户本地提供的 `smy-seedance-storyboard-main` 目录；原 README 提到首发于 linux.do 社区
- 原目录未附 LICENSE 文件

如果你要把它用于商业用途或再分发，请先向原作者确认授权；本仓库的 MIT 许可只覆盖插件本身的代码（`index.js`、`client.js`、`lib/`、`scripts/`）。

## 共同约定

- 都是快照：不要在插件目录里 `git pull`，skill 随插件版本一起更新
- 示例项目均只保留 md 文档（未含图片素材），仅作范式参考
