// 分镜导演台 · Host 半边（题材通用全功能版）
// 1. 把随包的 skill（skills/seedance-storyboard-generator）注册进 ctx.skills，模型和 /skill 都能用
// 2. 注册六个工具（lib/tools.js）：项目管理、格式自检、批量出图、单集出片、拼接、生成历史
// 3. /storyboard-director 工作台：静态页面（lab/）+ 数据接口（lib/api.js）
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerApi } from './lib/api.js'
import { createSkillProvider } from './lib/skills.js'
import { TOOLS } from './lib/tools.js'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SKILL_DIRS = [join(ROOT, 'skills')]

export const name = 'storyboard-director'
export const inject = ['webServer', 'skills', 'tools']

export function apply(ctx) {
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(SKILL_DIRS, ROOT)))
  for (const tool of TOOLS) ctx.effect(() => ctx.tools.register(tool))
  ctx.effect(() => registerApi(ctx))
}
