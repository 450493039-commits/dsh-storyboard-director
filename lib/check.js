// drama_check 的检查内核：剧本 / 素材清单 / 分镜的确定性格式自检（题材通用版）。
// 规则全部来自随包 skill（seedance-storyboard-generator）的输出格式要求，
// 纯文本统计、零联网、零生成——目的是在出图/出片之前把格式问题拦下来，
// 因为这些格式问题到了即梦那边就是白烧积分。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------- 运镜 / 景别词表（SKILL.md 3.2）
const CAMERA_WORDS = ['推镜头', '拉镜头', '摇镜头', '移镜头', '跟镜头', '环绕镜头', '升降镜头', '希区柯克变焦', '一镜到底', '手持晃动']
const SHOT_SIZE_WORDS = ['远景', '全景', '中景', '近景', '特写', '大特写']
const DIALOGUE_MARKS = ['（内心独白）', '(内心独白)', '（画外音）', '(画外音)']
const EPISODE_NO = /第\s*(\d{1,3})\s*集/

function push(list, severity, message) {
  list.push({ severity, message })
}

// ---------------------------------------------------------------- 剧本（SKILL.md §3.2）

export function checkScript(text, file = '剧本.md') {
  const warnings = []
  const stats = {}
  stats.集数标记 = (text.match(/第\s*[0-9一二三四五六七八九十百]+\s*集/g) || []).length
  stats.镜头行 = (text.match(/^△\s*\S/gm) || []).length
  stats.内心独白 = (text.match(/[（(]内心独白[)）]/g) || []).length
  stats.画外音 = (text.match(/[（(]画外音[)）]/g) || []).length
  stats.空镜 = (text.match(/【空镜/g) || []).length
  stats.闪回 = (text.match(/【闪回/g) || []).length
  stats.字幕 = (text.match(/【字幕[：:]/g) || []).length
  stats.连续动作箭头 = (text.match(/→/g) || []).length

  if (!stats.镜头行) push(warnings, 'warn', '整篇没有以「△ 」开头的镜头行——skill 的剧本正文格式要求每个镜头以 △ 开头（常规文学剧本也能用，但建议转成 △ 格式）')
  else if (stats.镜头行 < 5) push(warnings, 'warn', `镜头行只有 ${stats.镜头行} 个，正式剧本每集通常 10 个以上（每集 3-7 个镜头 × N 集）`)
  const hasCamera = CAMERA_WORDS.some((w) => text.includes(w))
  if (!hasCamera) push(warnings, 'warn', '没有出现具体运镜术语（推/拉/摇/移/跟/环绕/升降…）——镜头语言必须具体')
  const hasSize = SHOT_SIZE_WORDS.some((w) => text.includes(w))
  if (!hasSize) push(warnings, 'warn', '没有出现景别词（远景/全景/中景/近景/特写）——景别要有变化')
  if (!stats.内心独白 && !stats.画外音 && !/[：:]/.test(text)) push(warnings, 'warn', '没有任何对白或标注——对白格式为「角色名（内心独白/画外音/情绪）：台词」')
  if (stats.集数标记 && stats.空镜 === 0) push(warnings, 'info', '没有【空镜】——场景切换或情绪转折处建议用空镜配合画外音先导')
  if (EPISODE_NO.test(text) && Number(text.match(EPISODE_NO)[1]) === 1 && !/黄金三秒|强画面|强冲突|强悬念/.test(text)) {
    push(warnings, 'info', '第一集建议设计「黄金三秒」：强画面/强台词/强冲突/强反差/强悬念（skill §3.0）')
  }

  return { kind: 'script', file, ok: !warnings.some((w) => w.severity === 'error'), stats, warnings }
}

// ---------------------------------------------------------------- 素材清单（SKILL.md §4.2）

// 兼容两种写法：
//   A: `### C01 — 林冲·正面全身立绘` + 下一段提示词（源仓库示例的写法）
//   B: `【角色名】` + 「AI 出图提示词：」（skill §4.2 模板的写法）
export function parseAssets(text) {
  const assets = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    let id = null
    let name = ''
    let m = line.match(/^#{2,5}\s*\[?([CSP]\d{1,2})\]?\s*[—–-]\s*(.+)$/)
    if (m) {
      id = m[1]
      name = m[2].trim()
    } else {
      m = line.match(/^#{0,5}\s*【([^】]+)】/)
      if (m) {
        // 向下找编号与提示词
        name = m[1].trim()
        for (let j = i + 1; j < Math.min(lines.length, i + 8); j += 1) {
          const idm = lines[j].match(/[（(]?(?:编号|ID)[）)]?\s*[：:]\s*([CSP]\d{1,2})/) || lines[j].match(/^#{0,5}\s*\[?([CSP]\d{1,2})\]?/)
          if (idm) { id = idm[1]; break }
        }
      }
    }
    if (!id) continue
    // 提示词 = 这个标题之后、下一个标题之前的最长非空文本块
    const promptLines = []
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^#{1,5}\s/.test(lines[j]) || /^【[^】]+】\s*$/.test(lines[j])) break
      if (lines[j].trim()) promptLines.push(lines[j].trim())
    }
    assets.push({ id, name, prompt: promptLines.join('\n') })
  }
  return assets
}

export function checkAssets(text, file = '素材清单.md') {
  const warnings = []
  const assets = parseAssets(text)
  const stats = { 资产总数: assets.length }
  for (const prefix of ['C', 'S', 'P']) stats[`${prefix}类`] = assets.filter((a) => a.id.startsWith(prefix)).length

  if (!assets.length) {
    push(warnings, 'error', '没有解析到任何 C/S/P 编号资产——素材清单要按「编号 — 名称 + 提示词」组织（skill §4.2）')
    return { kind: 'assets', file, ok: false, stats, warnings }
  }
  for (const prefix of ['C', 'S', 'P']) {
    const ids = assets.filter((a) => a.id.startsWith(prefix)).map((a) => Number(a.id.slice(1))).sort((a, b) => a - b)
    if (!ids.length) continue
    const missing = []
    for (let n = ids[0]; n <= ids[ids.length - 1]; n += 1) if (!ids.includes(n)) missing.push(`${prefix}${String(n).padStart(2, '0')}`)
    if (missing.length) push(warnings, 'info', `${prefix} 类编号跳号：${missing.join('、')}（确认是删了还是漏了）`)
  }
  const noPrompt = assets.filter((a) => a.prompt.length < 20)
  if (noPrompt.length) push(warnings, 'error', `这些资产缺提示词（<20 字）：${noPrompt.map((a) => a.id).join('、')}`)

  const characters = assets.filter((a) => a.id.startsWith('C') && a.prompt.length >= 20)
  const noFullBody = characters.filter((a) => !/全身|full body|从头到脚/i.test(a.prompt))
  if (characters.length && noFullBody.length) {
    push(warnings, 'warn', `角色资产提示词没写「全身站立/从头到脚完整入镜」（易出半身图）：${noFullBody.map((a) => a.id).join('、')}`)
  }
  const noWhiteBg = characters.filter((a) => !/纯白背景|白底|white background|clean background/i.test(a.prompt))
  if (characters.length && noWhiteBg.length) {
    push(warnings, 'warn', `角色资产提示词没写「纯白背景」（一致性参考要求）：${noWhiteBg.map((a) => a.id).join('、')}`)
  }
  const scenes = assets.filter((a) => a.id.startsWith('S'))
  const sceneText = scenes.map((a) => a.prompt).join('\n')
  if (scenes.length && !/正打/.test(sceneText)) push(warnings, 'warn', '场景资产建议每个重要场景出三条提示词：正打 / 反打 / 侧面全景（skill §4.2 二）')
  const props = assets.filter((a) => a.id.startsWith('P'))
  const badProps = props.filter((a) => a.prompt.length >= 20 && /人物|person|character/i.test(a.prompt))
  if (badProps.length) push(warnings, 'warn', `道具提示词里出现「人物」——道具要单独展示、不要出现任何人物：${badProps.map((a) => a.id).join('、')}`)
  if (!characters.length && !scenes.length) push(warnings, 'info', '没有 C/S 类资产——只有道具通常撑不起一致性参考，确认是否漏了角色和场景')

  return { kind: 'assets', file, ok: !warnings.some((w) => w.severity === 'error'), stats, warnings }
}

// ---------------------------------------------------------------- 分镜（SKILL.md §5）

// 每个分镜 md 可能含多集；按集拆开逐集检查，跨集再查「素材槽 vs @图片 引用」和衔接。
export function checkStoryboards(text, file = '分镜.md') {
  const warnings = []
  const stats = {}
  // 拆集：优先按 `# E01` / `## E01` 标题，退化为整篇作为一集
  const chunks = []
  const headRe = /^#{1,3}\s*(?:E\d{1,3}|第\s*\d+\s*集|.*E(\d{1,3}).*)$/gmi
  const marks = []
  let m
  while ((m = headRe.exec(text))) marks.push({ index: m.index, line: m[0] })
  if (marks.length < 2) {
    chunks.push({ file, text })
  } else {
    for (let i = 0; i < marks.length; i += 1) {
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length
      chunks.push({ file: `${file} · ${marks[i].line.trim().slice(0, 40)}`, text: text.slice(marks[i].index, end) })
    }
  }
  stats.集块数 = chunks.length

  const perEpisode = chunks.map((chunk) => {
    const w = []
    const t = chunk.text
    const segs = (t.match(/\d{1,2}\s*[-—~至到]\s*\d{1,2}\s*(?:秒|s\b)/g) || []).length
    // 上传槽位要先剥掉 @图片N 引用（"图片N" 是 "@图片N" 的子串，否则交叉校验恒匹配）
    const tNoRefs = t.replace(/@\s*图片\s*\d{1,2}/g, '')
    const uploadSlots = [...new Set([...tNoRefs.matchAll(/图片\s*(\d{1,2})/g)].map((x) => Number(x[1])))].sort((a, b) => a - b)
    const refSlots = [...new Set([...t.matchAll(/@图片\s*(\d{1,2})/g)].map((x) => Number(x[1])))].sort((a, b) => a - b)
    const epm = t.match(EPISODE_NO) || t.match(/E(\d{1,3})/i)
    const episodeNo = epm ? Number(epm[1]) : null

    if (!/seedance/i.test(t) && !/@图片/.test(t) && segs < 2) {
      push(w, 'error', '没找到 Seedance Prompt（既没有时间轴秒数段、也没有 @图片 引用）——确认这份 md 是分镜而不是剧本')
    }
    if (segs && segs < 3) push(w, 'warn', `时间轴段落只有 ${segs} 段——标准 15 秒分镜应有 5 段（0-3/3-6/6-9/9-12/12-15）`)
    const hasUploadTable = /素材上传清单|上传位置/.test(t)
    if (!/【声音】/.test(t) && !/音效设计/.test(t)) push(w, 'warn', '缺【声音】行——要写明「只生成音效，不要生成音乐。不要生成任何字幕」（老格式「音效设计：」也认）')
    else if (/【声音】/.test(t)) {
      const sound = t.match(/【声音】[^\n]*/)[0]
      if (/音乐/.test(sound) && !/不要.{0,6}音乐/.test(sound)) push(w, 'warn', '【声音】行提到了音乐——skill 要求只生成音效、不要生成音乐')
    }
    if (/【字幕[：:]/.test(t) && !/不要.{0,4}字幕/.test(t)) push(w, 'info', '分镜正文里有【字幕：】——Seedance 提示词要求「不要生成任何字幕」，字幕留给后期')
    const refIdx = t.search(/【参考】/)
    if (refIdx < 0) {
      if (hasUploadTable && !/@图片/.test(t)) push(w, 'info', '没有【参考】行（老格式只有素材上传清单）——建议按 skill 格式补一行 @图片N 的用途说明')
      else if (!hasUploadTable) push(w, 'error', '缺【参考】行——要写 @图片N 的用途说明')
    }
    if (refSlots.length > 9) push(w, 'error', `@图片 引用 ${refSlots.length} 个——Seedance 2.0 硬限制：图片 ≤9`)
    if (uploadSlots.length && refSlots.length) {
      const unknown = refSlots.filter((n) => !uploadSlots.includes(n))
      if (unknown.length) push(w, 'warn', `@图片${unknown.join('、@图片')} 在素材上传清单里没有对应行——即梦按槽位对号入座，漏了会拿到错误参考`)
    }
    if (episodeNo && episodeNo >= 2 && !/延长|@视频\s*1/.test(t)) {
      push(w, 'info', `第 ${episodeNo} 集建议用「将@视频1延长15s」衔接上一集（抽帧接力或延长视频，skill §5.2）`)
    }
    if (!/尾帧|最后一帧|ending frame/i.test(t)) push(w, 'info', '缺尾帧描述——记录最后一帧（主体/背景/光线/构图/氛围）才能保证下一集连续性')
    return { episode: episodeNo, warnings: w, segments: segs, uploadSlots, refSlots }
  })

  const merged = []
  for (const ep of perEpisode) for (const w of ep.warnings) merged.push(w)
  stats.时间轴段总数 = perEpisode.reduce((n, e) => n + e.segments, 0)
  stats.引用超限集数 = perEpisode.filter((e) => e.refSlots.length > 9).length

  // 跨集：风格行一致性（首行风格描述应逐集相同，防风格漂移）
  const styleLines = perEpisode.map((e, i) => {
    const body = chunks[i].text
    const pm = body.match(/(?:Seedance\s*Prompt[^\n]*\n+)([^\n#]+)/i) || body.match(/\n([^\n#]{20,}\n)\s*\n?\s*\**\s*\d{1,2}\s*[-—~]/)
    return pm ? pm[1].trim() : ''
  }).filter(Boolean)
  if (styleLines.length >= 2) {
    const unique = [...new Set(styleLines)]
    if (unique.length > 1) push(warnings, 'warn', `各集风格行不一致（${Math.min(unique.length, 3)} 种写法）——首行风格描述应逐集逐字相同，否则成片风格漂移`)
  }

  return {
    kind: 'storyboard',
    file,
    ok: !merged.some((w) => w.severity === 'error'),
    stats,
    warnings: merged,
    episodes: perEpisode.map((e) => ({ episode: e.episode, segments: e.segments, uploadSlots: e.uploadSlots, refSlots: e.refSlots }))
  }
}

// ---------------------------------------------------------------- 文件发现

// 项目目录里的约定文件：*剧本*.md / *素材清单*.md / *分镜*.md。
// 排除「使用指南 / README / 好剧本」这类方法论文档；「完整版」合集排最后（优先按单集分镜检查）。
export function discoverFiles(dir) {
  let names = []
  try { names = readdirSync(dir) } catch { return {} }
  const md = names.filter((n) => n.endsWith('.md') && !n.startsWith('使用指南') && !n.startsWith('README') && !n.startsWith('好剧本'))
  const rank = (n) => (/完整版/.test(n) ? 1 : 0)
  const pick = (re) => md.filter((n) => re.test(n)).sort((a, b) => rank(a) - rank(b) || a.length - b.length)
  return {
    scripts: pick(/剧本/),
    assets: pick(/素材清单/),
    storyboards: pick(/分镜/)
  }
}

export function severityLabel(s) {
  return s === 'error' ? '❌' : s === 'warn' ? '⚠️' : 'ℹ️'
}
