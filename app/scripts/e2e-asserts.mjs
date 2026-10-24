/** Layout smoke test in either mode. Start dev + adapter, install Chromium first. */
import { chromium, expect } from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:10241';
const browser=await chromium.launch({headless:true});
try {
 for(const width of [375,390,430,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(base);
  for(const name of ['活动日历','新品推荐','营养套餐','盲盒推荐','团餐选择','MAgent']){
   await page.getByRole('navigation').getByRole('link',{name:new RegExp('^'+name)}).click();
   await expect(page.locator('h1')).toBeVisible();
   await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(6);
   const layout=await page.evaluate(()=>({width:window.innerWidth,scroll:document.documentElement.scrollWidth,side:document.querySelector('.sidebar').getBoundingClientRect().width}));
   if(layout.scroll>layout.width)throw new Error(`${width}/${name}: horizontal overflow`);
   if(width<600&&(layout.side<72||layout.side>88))throw new Error('Mobile navigation width');
  }
  await page.getByRole('link',{name:/^活动日历/}).click();
  await expect(page.locator('.week span')).toHaveCount(7);
  await page.getByRole('link',{name:/^MAgent/}).click();
  await page.getByLabel('给 MAgent 发消息').fill('测试输入');
  await expect(page.getByLabel('给 MAgent 发消息')).toHaveValue('测试输入');
  await page.close();
 }
 console.log('PASS: six modules, four viewports, calendar columns and chat input');
}finally{await browser.close();}
