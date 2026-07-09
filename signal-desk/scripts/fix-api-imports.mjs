import fs from 'fs'
import path from 'path'

function fixImport(specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier
  if (specifier.endsWith('.js')) return specifier
  return `${specifier}.js`
}

function transform(content) {
  return content.replace(
    /from\s+['"](\.\.?\/[^'"]+)['"]/g,
    (_match, specifier) => `from '${fixImport(specifier)}'`,
  )
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      walk(full)
      continue
    }
    if (!full.endsWith('.ts')) continue
    const content = fs.readFileSync(full, 'utf8')
    const next = transform(content)
    if (next !== content) {
      fs.writeFileSync(full, next)
      console.log(full)
    }
  }
}

walk('api')
