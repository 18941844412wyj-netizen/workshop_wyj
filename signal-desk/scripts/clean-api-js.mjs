import { readdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'

const apiDir = new URL('../api', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.js')) unlinkSync(p)
  }
}

walk(apiDir)
console.log('cleaned api/**/*.js')
