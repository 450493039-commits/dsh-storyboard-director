// 本地自检：不建节点、不花积分，只验证数据层、官方 CLI 探活和 ffmpeg 拼接。
// 运行：node scripts/selftest.mjs [自检根目录]
// 默认落在系统临时目录，避免每次都在工作区里留一个样片工程。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { concatEpisodes, probeDuration, resolveFfmpeg } from '../lib/ffmpeg.js'
import { authAccount, authStatus, resolveCli } from '../lib/dreamina.js'
import { checkAssets, checkScript, checkStoryboards, discoverFiles } from '../lib/check.js'
import { fileSummary, initProject, listProjects, readProject, updateProject } from '../lib/project.js'

const ROOT = process.argv[2] || join(tmpdir(), 'dsh-storyboard-director-selftest')
const dir = join(ROOT, '样片')

function step(name, fn) {
  process.stdout.write(`- ${name} … `)
  try {
    const value = fn()
    console.log('ok')
    return value
  } catch (err) {
    console.log('失败')
    throw err
  }
}

rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })

const project = step('建项目', () => initProject({
  path: dir,
  title: '自检样片',
  aspect: '9:16',
  episodes: 2,
  styleDescription: '水墨武侠动漫风格',
  tone: '悲壮',
  hook: '忍无可忍，无须再忍！',
  paletteZh: '灰白、墨黑、朱砂红'
}))

step('登记资产与分镜', () => updateProject(dir, {
  assets: [
    { id: 'C01', kind: 'character', name: '主角标准像', ratio: '3:4', prompt: '水墨武侠动漫风格，全身正面站立，纯白背景' },
    { id: 'S01', kind: 'scene', name: '雪原', ratio: '16:9', prompt: '水墨武侠动漫风格，雪原空镜' }
  ],
  episodes: project.episodes.map((e, i) => ({ ...e, refs: ['C01', 'S01'], prompt: `0-3秒：第${i + 1}集开场` }))
}))

const reread = step('读回 project.json', () => readProject(dir))
if (reread.style.description !== '水墨武侠动漫风格' || reread.style.hook !== '忍无可忍，无须再忍！') throw new Error('风格字段没读回来')
const summary = fileSummary(dir, reread)
console.log(`  → ${reread.title}，资产 ${summary.assets.length}，集 ${summary.episodes.length}`)

// drama_check 内核：写三份约定命名的样例文档，验证发现与检查逻辑
step('写样例文档（剧本/素材清单/分镜）', () => {
  writeFileSync(join(dir, '剧本.md'), [
    '# 自检样片 - 剧本', '', '第1集', '1-1 夜 外 草料场', '出场人物：林冲', '',
    '△ 【空镜】远景俯拍，大雪纷飞的草料场，镜头缓慢下降前推', '林冲（内心独白）：这雪，下得人心慌。', '△ 中景推近，披蓑衣的身影伫立风雪中', '【字幕：风雪山神庙】'
  ].join('\n'))
  writeFileSync(join(dir, '素材清单.md'), [
    '# 素材清单', '', '## 风格前缀', '水墨武侠动漫风格', '', '### C01 — 林冲·正面全身', '水墨武侠动漫风格，全身正面站立，纯白背景，宋代武官装束',
    '', '### S01 — 草料场雪景（正打）', '水墨武侠动漫风格，大雪覆盖的草料场，无人物', '', '### P01 — 长枪', '水墨武侠动漫风格，红缨长枪，纯白背景，单独展示'
  ].join('\n'))
  writeFileSync(join(dir, 'E01_分镜.md'), [
    '# E01 - 雪中草料场', '', '| 素材槽 | 文件 |', '| 图片1 | C01 |', '', '## Seedance Prompt', '',
    '水墨武侠动漫风格，9:16竖屏，孤寂压抑氛围', '', '0-3秒：高空俯拍草料场全景，镜头缓慢下降', '3-6秒：中景推近林冲', '6-9秒：特写眼神', '9-12秒：远火光', '12-15秒：落版', '',
    '【声音】只生成音效，不要生成音乐。不要生成任何字幕。风雪呼啸声', '', '【参考】@图片1 角色一致性参考', '', '## 尾帧描述', '林冲背影立于庙门，雪光逆照'
  ].join('\n'))
})
step('drama_check 内核自检', () => {
  const files = discoverFiles(dir)
  if (!files.scripts.length || !files.assets.length || !files.storyboards.length) throw new Error(`文件发现不全：${JSON.stringify(files)}`)
  const script = checkScript(readFileSync(join(dir, files.scripts[0]), 'utf8'), files.scripts[0])
  const assets = checkAssets(readFileSync(join(dir, files.assets[0]), 'utf8'), files.assets[0])
  const sb = checkStoryboards(readFileSync(join(dir, files.storyboards[0]), 'utf8'), files.storyboards[0])
  if (!script.ok || !assets.ok || !sb.ok) throw new Error(`样例没过自检：${JSON.stringify({ script: script.warnings, assets: assets.warnings, sb: sb.warnings })}`)
  if (sb.episodes[0].refSlots[0] !== 1) throw new Error('@图片 引用解析失败')
  // 反例：缺【参考】要报 error
  const bad = checkStoryboards('0-3秒：开场\n3-6秒：发展\n【声音】只生成音效', 'bad.md')
  if (bad.ok) throw new Error('反例没被拦住')
  return { script: script.warnings.length, assets: assets.warnings.length, sb: sb.warnings.length }
})

step('列项目', () => {
  const list = listProjects(ROOT)
  if (!list.length) throw new Error('列表为空')
  return list
})

const cli = await (async () => {
  process.stdout.write('- 定位即梦官方 CLI … ')
  try {
    const c = await resolveCli()
    console.log(`ok（${c.bin}，v${c.version || '?'}）`)
    return c
  } catch (err) {
    console.log(`失败：${err.message}`)
    return null
  }
})()

try {
  const status = await authStatus()
  const account = status.loggedIn ? await authAccount().catch(() => null) : null
  console.log(`- 即梦账号：${status.loggedIn ? `已登录 ${account ? account.displayName : ''}，积分 ${account ? account.availableCredits : '?'}` : '未登录（生成前需要 auth login）'}`)
} catch (err) {
  console.log(`- 即梦账号：查询失败 — ${err.message}`)
}

process.stdout.write('- ffmpeg … ')
const ff = await resolveFfmpeg()
console.log(`ok（${ff.ffmpeg}）`)

const clips = ['videos/E01.mp4', 'videos/E02.mp4'].map((rel, i) => {
  const file = join(dir, rel)
  execFileSync(ff.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=${i === 0 ? '0xc8332a' : '0x2f6f63'}:s=360x640:d=2`,
    '-pix_fmt', 'yuv420p', '-r', '24', file
  ])
  if (!existsSync(file)) throw new Error(`造样片失败：${file}`)
  return file
})
process.stdout.write('- 拼接 … ')
const out = join(dir, 'out', 'final.mp4')
const { bytes } = await concatEpisodes(clips, out)
const duration = await probeDuration(out)
console.log(`ok（${(bytes / 1024).toFixed(0)} KB，${duration}s）`)
if (!duration || duration < 3.5) throw new Error(`拼接结果时长异常：${duration}`)

writeFileSync(join(dir, 'out', 'selftest.json'), JSON.stringify({ ok: true, duration, cli: Boolean(cli) }, null, 2))
console.log(`\n全部通过。产物：${out}`)
