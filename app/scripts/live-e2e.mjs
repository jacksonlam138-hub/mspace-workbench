/** Read-only live smoke test; no account queries or write tools. */
import { chromium, expect } from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:10241';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(base+'/#new');
 await expect(page.getByRole('banner')).toContainText('MCP 已连接',{timeout:30000});
 await page.getByRole('button',{name:'体验北京王府井示例',exact:true}).click();
 await expect(page.locator('.store-option').first()).toBeVisible({timeout:30000});
 await page.locator('.store-option').first().getByRole('button',{name:'选择此店'}).click();
 await expect(page.locator('.live-product').first()).toBeVisible({timeout:30000});
 await page.locator('.live-product').first().getByRole('button',{name:'选这份并核价'}).click();
 await expect(page.getByRole('region',{name:'真实整单核价'})).toContainText('整单核价成功',{timeout:30000});
 for(const name of ['盲盒推荐 ↗','团餐选择 ↗']){
  await page.getByRole('link',{name,exact:true}).click();
  await page.getByRole('spinbutton',{name:'总预算 / 元',exact:true}).fill('');
  await page.getByRole('button',{name:name.startsWith('盲盒')?'转一转，今天就吃它':'帮我配好并核价',exact:true}).click();
  await expect(page.getByRole('region',{name:'真实整单核价'})).toContainText('整单核价成功',{timeout:30000});
 }
 await page.getByRole('link',{name:'MAgent AI',exact:true}).click();
 await page.getByRole('combobox',{name:'只读工具',exact:true}).selectOption('now-time-info');
 await page.getByRole('button',{name:'按这些参数查询',exact:true}).click();
 await expect(page.locator('.bubble.agent').last()).toContainText(/北京时间|当前时间|日期|202\d/,{timeout:30000});
 console.log('PASS: live menu, default specifications, whole-basket quotes and direct tool form');
}finally{await browser.close();}
