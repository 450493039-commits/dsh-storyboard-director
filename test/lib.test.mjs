// 数据层与检查内核单测（离线，零依赖）。
// 运行：node test/lib.test.mjs  （Windows 下比 node --test 更稳，无 async 资源误报）
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'sbd-test-'))

const { checkAssets, checkScript, checkStoryboards, discoverFiles, parseAssets } = await import('../lib/check.js')
const { initProject, readProject, updateProject, listProjects, projectSummary, resolveDir, ProjectError } = await import('../lib/project.js')
const { readHistory, recordGeneration, filterHistory, summarize, clearHistory, normalizePath } = await import('../lib/history.js')

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// ---------------------------------------------------------------- check.js

test('checkScript：标准剧本通过', () => {
  const text = [
    '第1集', '1-1 夜 外 草料场', '出场人物：林冲', '',
    '△ 【空镜】远景俯拍，大雪纷飞的草料场，镜头缓慢下降前推',
    '林冲（内心独白）：这雪，下得人心慌。',
    '△ 中景推近，披蓑衣的身影伫立风雪中',
    '△ 特写：枪缨上的雪', '△ 近景跟镜头：林冲推开庙门', '△ 【字幕：风雪山神庙】'
  ].join('\n')
  const r = checkScript(text, '剧本.md')
  assert.equal(r.ok, true)
  assert.equal(r.stats.镜头行, 5)
  assert.equal(r.stats.内心独白, 1)
})

test('checkScript：无△镜头行要告警（剧本是创作文档，不硬拦）', () => {
  const r = checkScript('林冲走进草料场。他很冷。', '剧本.md')
  assert.equal(r.ok, true)
  assert.ok(r.warnings.some((w) => w.message.includes('△')))
})

test('checkScript：无运镜无景别要告警', () => {
  const r = checkScript('第1集\n△ 一个人站着\n△ 另一个人也站着\n△ 第三个人还是站着', '剧本.md')
  assert.equal(r.ok, true)
  assert.ok(r.warnings.some((w) => w.message.includes('运镜')))
  assert.ok(r.warnings.some((w) => w.message.includes('景别')))
})

test('parseAssets：兼容 ### C01 — 和 【角色名】 两种写法', () => {
  const a = parseAssets(['### C01 — 林冲·正面全身', '水墨风格 prompt 一段', '', '### S01 — 草料场', '场景 prompt', '', '【长枪】', '道具用途：主武器', 'AI 出图提示词：红缨长枪 纯白背景'].join('\n'))
  assert.deepEqual(a.map((x) => x.id), ['C01', 'S01'])
  // 【长枪】块没有 C/S/P 编号行，不应被收进来
  assert.equal(a.length, 2)
})

test('checkAssets：缺提示词/缺全身/缺白背景都要拦', () => {
  const text = [
    '### C01 — 林冲', '水墨风格，正面站姿，半身构图，灰色宣纸底',
    '### C02 — 陆谦', '', '### S01 — 草料场', '场景描述'
  ].join('\n')
  const r = checkAssets(text, '素材清单.md')
  assert.equal(r.ok, false) // C02 无提示词
  assert.ok(r.warnings.some((w) => w.message.includes('C01') && w.message.includes('全身')))
  assert.ok(r.warnings.some((w) => w.message.includes('纯白背景')))
  assert.ok(r.warnings.some((w) => w.message.includes('正打')))
})

test('checkAssets：合规清单通过且统计正确', () => {
  const text = [
    '### C01 — 林冲·正面全身', '水墨武侠动漫风格，全身正面站立，纯白背景',
    '### S01 — 草料场（正打）', '水墨武侠动漫风格，草料场雪景，无人物（反打另出）',
    '### P01 — 长枪', '水墨武侠动漫风格，红缨长枪，纯白背景，单独展示'
  ].join('\n')
  const r = checkAssets(text, '素材清单.md')
  assert.equal(r.ok, true)
  assert.equal(r.stats['C类'], 1)
  assert.equal(r.stats['S类'], 1)
  assert.equal(r.stats['P类'], 1)
})

test('checkStoryboards：标准分镜通过 + @图片 解析', () => {
  const text = [
    '# E01 - 雪中草料场', '', '| 素材槽 | 文件 |', '| 图片1 | C01 |', '', '## Seedance Prompt', '',
    '水墨武侠动漫风格，9:16竖屏', '',
    '0-3秒：俯拍草料场', '3-6秒：中景推近', '6-9秒：特写', '9-12秒：火光', '12-15秒：落版', '',
    '【声音】只生成音效，不要生成音乐。不要生成任何字幕。风声', '', '【参考】@图片1 角色一致性参考', '', '## 尾帧描述', '背影，雪光逆照'
  ].join('\n')
  const r = checkStoryboards(text, 'E01_分镜.md')
  assert.equal(r.ok, true)
  assert.deepEqual(r.episodes[0].refSlots, [1])
  assert.equal(r.episodes[0].segments, 5)
})

test('checkStoryboards：缺【参考】报 error；@图片>9 报 error；超清单引用告警', () => {
  const slots = Array.from({ length: 10 }, (_, i) => `| 图片${i + 1} | C0${i % 9 + 1} |`).join('\n')
  const noRef = ['# E02', slots, '0-3秒：a', '3-6秒：b', '6-9秒：c'].join('\n')
  const r0 = checkStoryboards(noRef, 'E02_分镜.md')
  assert.equal(r0.ok, false)
  assert.ok(r0.warnings.some((w) => w.severity === 'error' && w.message.includes('【参考】')))
  const refs = Array.from({ length: 11 }, (_, i) => `@图片${i + 1}`).join(' ')
  const text = ['# E02', slots, '0-3秒：a', '3-6秒：b', '6-9秒：c', `【参考】${refs}`].join('\n')
  const r = checkStoryboards(text, 'E02_分镜.md')
  assert.equal(r.ok, false)
  assert.ok(r.warnings.some((w) => w.severity === 'error' && w.message.includes('≤9')))
  assert.ok(r.warnings.some((w) => w.message.includes('素材上传清单里没有对应行')))
})

test('checkStoryboards：第2集建议衔接（info）', () => {
  const text = ['# E02 - 接力', '| 图片1 | C01 |', '0-3秒：a', '3-6秒：b', '6-9秒：c', '【声音】只生成音效', '【参考】@图片1 角色', '尾帧：x'].join('\n')
  const r = checkStoryboards(text, 'E02_分镜.md')
  assert.ok(r.warnings.some((w) => w.severity === 'info' && w.message.includes('延长')))
})

test('discoverFiles：按约定命名发现三类文档，排除使用指南', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-files-'))
  writeFileSync(join(dir, '风雪山神庙_剧本.md'), 'x')
  writeFileSync(join(dir, '风雪山神庙_素材清单.md'), 'x')
  writeFileSync(join(dir, 'E01_分镜.md'), 'x')
  writeFileSync(join(dir, 'E02_分镜.md'), 'x')
  writeFileSync(join(dir, '使用指南.md'), 'x')
  const f = discoverFiles(dir)
  assert.equal(f.scripts.length, 1)
  assert.equal(f.assets.length, 1)
  assert.equal(f.storyboards.length, 2)
  rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------- project.js

const ROOT = mkdtempSync(join(tmpdir(), 'sbd-proj-'))

test('initProject：风格字段落盘', () => {
  const dir = join(ROOT, '风雪山神庙')
  const p = initProject({ path: dir, title: '风雪山神庙', aspect: '16:9', episodes: 3, styleDescription: '水墨武侠动漫风格', tone: '悲壮', hook: '忍无可忍', paletteZh: '灰白、墨黑' })
  assert.equal(p.style.description, '水墨武侠动漫风格')
  assert.equal(p.style.tone, '悲壮')
  assert.equal(p.style.hook, '忍无可忍')
  assert.equal(readProject(dir).style.description, '水墨武侠动漫风格')
  // 重复 init 要拒绝
  assert.throws(() => initProject({ path: dir }), ProjectError)
})

test('updateProject：数组和浅合并语义', () => {
  const dir = join(ROOT, '风雪山神庙')
  updateProject(dir, { assets: [{ id: 'C01', name: '林冲', prompt: '水墨 全身 白背景' }] })
  updateProject(dir, { style: { tone: '苍凉' }, title: '风雪山神庙·完整版' })
  const p = readProject(dir)
  assert.equal(p.style.tone, '苍凉')
  assert.equal(p.style.description, '水墨武侠动漫风格') // 浅合并不丢
  assert.equal(p.assets.length, 1)
})

test('projectSummary：暴露 styleDescription/tone/hook', () => {
  const s = projectSummary(join(ROOT, '风雪山神庙'))
  assert.equal(s.styleDescription, '水墨武侠动漫风格')
  assert.equal(s.tone, '苍凉')
  assert.equal(s.hook, '忍无可忍')
  assert.equal(s.episodes, 3)
})

test('listProjects：扫到项目且按更新时间排序', () => {
  const list = listProjects(ROOT)
  assert.equal(list.length, 1)
  assert.equal(list[0].title, '风雪山神庙·完整版')
})

test('resolveDir：拒绝相对路径与盘根', () => {
  assert.throws(() => resolveDir('relative/path'), ProjectError)
  assert.throws(() => resolveDir('D:\\'), ProjectError)
})

// ---------------------------------------------------------------- history.js

test('recordGeneration + filterHistory + summarize + clearHistory', () => {
  recordGeneration({ kind: 'asset', project: 'D:\\x\\a', projectTitle: 'A', status: 'ok', summary: '2 张', credits: 6 })
  recordGeneration({ kind: 'episode', project: 'D:\\x\\a', projectTitle: 'A', status: 'failed', summary: 'E01 失败', error: '报价超限' })
  recordGeneration({ kind: 'asset', project: 'D:\\x\\b', projectTitle: 'B', status: 'ok', summary: '1 张', credits: 3 })
  assert.equal(readHistory().length, 3)
  assert.equal(filterHistory(readHistory(), { project: 'D:/X/A/' }).length, 2) // 大小写与斜杠归一
  assert.equal(filterHistory(readHistory(), { kind: 'asset', status: 'ok' }).length, 2)
  assert.equal(filterHistory(readHistory(), { q: 'E01' }).length, 1)
  const s = summarize(readHistory())
  assert.equal(s.total, 3)
  assert.equal(s.credits, 9)
  assert.equal(s.failed, 1)
  assert.equal(clearHistory({ project: 'D:\\x\\a' }), 2)
  assert.equal(readHistory().length, 1)
})

test('normalizePath：Windows 大小写/斜杠归一', () => {
  assert.equal(normalizePath('D:/X/a'), normalizePath('d:\\x\\a'))
})

process.stdout.write(`\n${passed} 个单测全部通过\n`)
