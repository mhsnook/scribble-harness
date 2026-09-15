import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1298, height: 900 } })
let current = ''
const failed = new Set()
page.on('pageerror', (e) => { failed.add(current); console.log('PAGEERROR', current, ':', e.message.slice(0, 200)) })
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !t.includes('Failed to load resource')) {
    failed.add(current); console.log('ERR', current, ':', t.slice(0, 200))
  }
})
for (const id of process.argv.slice(2)) {
  current = id
  await page.goto(`http://localhost:7801/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
}
console.log(failed.size === 0 ? `ALL ${process.argv.length - 2} STORIES CLEAN` : `FAILED: ${[...failed].join(', ')}`)
await browser.close()
