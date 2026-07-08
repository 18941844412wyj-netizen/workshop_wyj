const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_WAIT_MS = 2_000

export function isHeadlessEnabled(): boolean {
  return process.env.HEADLESS_ENABLED !== 'false'
}

/** 判断静态抓取是否疑似 SPA 空壳，需要 headless 渲染 */
export function shouldHeadlessFallback(staticText: string, html: string): boolean {
  const lines = staticText.split('\n').filter(Boolean)
  if (lines.length < 3) return true

  const lower = staticText.toLowerCase()
  const hasLoading = /\bloading\b/i.test(staticText)
  const hasRootShell = /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i.test(html)
  const hasNoscriptOnly = lines.length < 12 && /<noscript>/i.test(html)

  if (hasLoading && lines.length < 20) return true
  if (hasRootShell && lines.length < 12) return true
  if (hasNoscriptOnly) return true

  // 文本行数少且重复标题居多（管理后台壳层）
  const unique = new Set(lines)
  if (lines.length >= 4 && unique.size <= Math.ceil(lines.length * 0.6) && hasLoading) {
    return true
  }

  return false
}

function timeoutMs(): number {
  const n = Number(process.env.HEADLESS_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}

/** 可选：外部渲染服务（生产环境 Browserless 等），POST { url } 返回 { html } */
async function renderViaService(url: string): Promise<string | null> {
  const endpoint = process.env.BROWSER_RENDER_URL?.trim()
  if (!endpoint) return null

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(timeoutMs()),
  })
  if (!res.ok) throw new Error(`渲染服务失败: ${res.status}`)
  const data = (await res.json()) as { html?: string }
  if (!data.html?.trim()) throw new Error('渲染服务返回空 HTML')
  return data.html
}

async function renderWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const page = await browser.newPage({
      userAgent: 'SignalDesk/1.0 (Competitor Intel Monitor)',
    })
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs() })

    // 等待常见 SPA loading 消失
    try {
      await page.waitForFunction(
        () => {
          const text = document.body?.innerText ?? ''
          return !/\bloading\b/i.test(text) || text.split('\n').filter(l => l.trim()).length > 15
        },
        { timeout: 10_000 },
      )
    } catch {
      /* 超时也继续，使用当前 DOM */
    }

    await page.waitForTimeout(DEFAULT_WAIT_MS)
    return await page.content()
  } finally {
    await browser.close()
  }
}

/** Headless 渲染页面，返回完整 HTML；失败时抛出异常 */
export async function renderPageHtml(url: string): Promise<string> {
  const fromService = await renderViaService(url)
  if (fromService) return fromService

  if (!isHeadlessEnabled()) {
    throw new Error('HEADLESS_ENABLED=false 且未配置 BROWSER_RENDER_URL')
  }

  return renderWithPlaywright(url)
}
