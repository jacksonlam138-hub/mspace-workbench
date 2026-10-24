/**
 * 验收截图脚本。使用项目依赖的 playwright（@playwright/test 附带 playwright-core）。
 * 前置：pnpm exec playwright install chromium。支持 Playwright 标准浏览器路径。
 * 用法：node scripts/shots.mjs [baseUrl] [outDir]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const [baseUrl = 'http://127.0.0.1:10241', outDir = 'screenshots'] = process.argv.slice(2);

const PAGES = ['calendar', 'new', 'nutrition', 'blind', 'team', 'agent'];
const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'desktop-1440', width: 1440, height: 900 }
];

const browser = await chromium.launch({
  headless: true,
});

fs.mkdirSync(outDir, { recursive: true });
const results = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  for (const mod of PAGES) {
    await page.goto(`${baseUrl}/#${mod}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth
    }));
    const file = path.join(outDir, `${vp.name}-${mod}.png`);
    await page.screenshot({ path: file, fullPage: false });
    results.push({ viewport: vp.name, module: mod, ...overflow });
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
