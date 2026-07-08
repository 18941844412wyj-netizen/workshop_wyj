import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Sql } from 'postgres'
import { isHeadlessEnabled, renderPageHtml, shouldHeadlessFallback } from './headless-renderer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CESHI_ROOT = join(__dirname, '../../../ceshi')

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

function readTestPackHtml(url: string): string | null {
  if (!url.startsWith('test://')) return null
  const rel = url.slice('test://'.length).replace(/^\//, '')
  const filePath = join(CESHI_ROOT, rel)
  if (!existsSync(filePath)) throw new Error(`测试包文件不存在: ${rel}`)
  return readFileSync(filePath, 'utf-8')
}

async function fetchHtml(url: string): Promise<string> {
  const local = readTestPackHtml(url)
  if (local) return local
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`抓取失败: ${res.status}`)
  return res.text()
}

/** 从 URL 或本地 test:// 路径抓取 HTML */
export async function fetchPageHtml(url: string): Promise<{ html: string; jsFallbackUsed: boolean }> {
  if (url.startsWith('test://')) {
    const html = await fetchHtml(url)
    return { html, jsFallbackUsed: false }
  }

  let html = await fetchHtml(url)
  let text = extractText(html)
  let jsFallbackUsed = false

  const needsHeadless = isHeadlessEnabled() && shouldHeadlessFallback(text, html)
  if (needsHeadless) {
    console.warn('[collector] 检测到 SPA/空壳页面，启用 headless 渲染:', url)
    try {
      html = await renderPageHtml(url)
      text = extractText(html)
      jsFallbackUsed = true
    } catch (err) {
      console.warn('[collector] headless 渲染失败，使用静态 HTML:', err)
    }
  }

  return { html, jsFallbackUsed }
}

/** 采集并写入 snapshots 表 */
export async function collectSnapshot(
  target: CollectTarget,
  db: Sql,
): Promise<CollectResult> {
  const { html, jsFallbackUsed } = await fetchPageHtml(target.url)
  const textContent = extractText(html)

  const prev = await db`
    SELECT COALESCE(MAX(version), 0) AS v FROM snapshots WHERE target_id = ${target.id}
  `
  const version = Number((prev[0] as { v: number }).v) + 1

  const rows = await db`
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
