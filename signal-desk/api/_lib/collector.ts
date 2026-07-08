/** 从 HTML 提取可见文本（剥离 style/script/注释，空白归一化） */
export function extractText(html: string): string {
  let s = html
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<[^>]+>/g, '\n')
  s = s.replace(/&nbsp;/g, ' ')
  s = s.replace(/&amp;/g, '&')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.join('\n')
}

export interface CollectTarget {
  id: string
  url: string
}

export interface CollectResult {
  snapshotId: string
  html: string
  textContent: string
  version: number
  jsFallbackUsed: boolean
}

const USER_AGENT = 'SignalDesk/1.0 (Competitor Intel Monitor)'

async function fetchHtml(url: string, jsFallback = false): Promise<string> {
  const fetchUrl = jsFallback
    ? url + (url.includes('?') ? '&' : '?') + '_render=1'
    : url
  const res = await fetch(fetchUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`抓取失败: ${res.status}`)
  return res.text()
}

/** 从 URL 或本地 file:// 路径抓取 HTML */
export async function fetchPageHtml(url: string): Promise<{ html: string; jsFallbackUsed: boolean }> {
  let html = await fetchHtml(url)
  let text = extractText(html)
  let jsFallbackUsed = false

  if (text.split('\n').filter(Boolean).length < 3) {
    console.warn('[collector] markdown 不足 3 行，尝试 JS 注入降级')
    try {
      html = await fetchHtml(url, true)
      text = extractText(html)
      jsFallbackUsed = true
    } catch {
      console.warn('[collector] JS 注入降级失败，使用原始 HTML')
    }
  }

  return { html, jsFallbackUsed }
}

/** 采集并写入 snapshots 表 */
export async function collectSnapshot(
  target: CollectTarget,
  sql: { (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> },
): Promise<CollectResult> {
  const { html, jsFallbackUsed } = await fetchPageHtml(target.url)
  const textContent = extractText(html)

  const prev = await sql`
    SELECT COALESCE(MAX(version), 0) AS v FROM snapshots WHERE target_id = ${target.id}
  `
  const version = Number((prev[0] as { v: number }).v) + 1

  const rows = await sql`
    INSERT INTO snapshots (target_id, html, text_content, version)
    VALUES (${target.id}, ${html}, ${textContent}, ${version})
    RETURNING id
  `

  return {
    snapshotId: rows[0].id as string,
    html,
    textContent,
    version,
    jsFallbackUsed,
  }
}

/** 从本地 HTML 字符串模拟采集（测试包用） */
export function collectFromHtml(html: string): { html: string; textContent: string } {
  return { html, textContent: extractText(html) }
}
