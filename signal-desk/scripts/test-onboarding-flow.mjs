const base = process.env.API_BASE || 'http://127.0.0.1:3001'
const email = `test-onboard-${Date.now()}@test.com`

async function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json, setCookie, text }
}

const reg = await req('/api/auth/register?action=register', {
  method: 'POST',
  body: { email, password: 'test123456', confirm: 'test123456' },
})
console.log('REGISTER', reg.status, reg.json)
const cookie = reg.setCookie.map(c => c.split(';')[0]).join('; ')

const put = await req('/api/profile', {
  method: 'PUT',
  cookie,
  body: {
    role: '产品经理',
    weights: { 定价: 3, 功能: 5, 更新日志: 4, 招聘: 2, 营销活动: 3, 合规条款: 2 },
    onboarded: true,
  },
})
console.log('PUT', put.status, put.json)

const get = await req('/api/profile', { cookie })
console.log('GET', get.status, JSON.stringify(get.json, null, 2))
console.log('weights type:', typeof get.json?.weights)
console.log('onboarded:', get.json?.onboarded)
