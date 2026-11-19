import { test, expect, type Page } from '@playwright/test';
import { outline } from '../src/drawing';
async function look(page: Page, x: number, y=0) {
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await page.waitForTimeout(250);
  await page.evaluate(({x,y}) => document.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y,bubbles:true})),{x,y});
}
async function walk(page:Page,key:string,ms:number) { await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key); }
async function approach(page:Page,name:string){await page.keyboard.down('w');try{await expect(page.locator('#interaction')).toContainText(name,{timeout:20000});}finally{await page.keyboard.up('w');}}
test('从第一人称移动到画桌，实际描画并收取，背包和暂停可用', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('button',{name:'开始第一天'})).toBeVisible();
  await page.screenshot({path:'.cache/intro.png'});
  await page.getByRole('button',{name:'开始第一天'}).click();
  await page.waitForTimeout(300);
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await look(page,0,185);await approach(page,'画桌');
  await expect(page.locator('#interaction')).toContainText('画桌');await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','把今天，画成形状');
  await page.screenshot({path:'.cache/drawing.png'});
  const paper=page.locator('#paper'),rect=(await paper.boundingBox())!;
  const path=outline('triangle');const first=path[0];
  await page.mouse.move(rect.x+first.x*rect.width,rect.y+first.y*rect.height);await page.mouse.down();
  for(let i=0;i<=path.length;i+=3){const p=path[i%path.length];await page.mouse.move(rect.x+p.x*rect.width,rect.y+p.y*rect.height);await page.waitForTimeout(230);}
  await page.mouse.move(rect.x+first.x*rect.width,rect.y+first.y*rect.height);await page.waitForTimeout(3000);await page.mouse.up();
  await expect(page.locator('#collect')).toBeEnabled();await page.locator('#collect').click();
  await expect(page.locator('#inventory')).toContainText('3');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.keyboard.press('b');await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','随身背包');
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.keyboard.press('Escape');
  const pausedTime=await page.locator('#clock').textContent();await page.waitForTimeout(1300);await expect(page.locator('#clock')).toHaveText(pausedTime!);
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();await expect(page.locator('#inventory')).toContainText('3');
  expect(errors).toEqual([]);
});

test('商店交易和存款，老虎机动画结算，床和次日恢复',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'开始第一天'}).click();
  await page.waitForTimeout(300);await look(page,Math.atan2(5.8,3.7)/.002);await approach(page,'商店');
  await expect(page.locator('#interaction')).toContainText('商店');await page.keyboard.press('e');
  await page.getByRole('button',{name:'交付可用图形',exact:false}).click();await expect(page.locator('#task-list')).toContainText('2');
  await page.getByRole('button',{name:'补给',exact:true}).click();await page.locator('[data-buy="water"]').click();
  await page.getByRole('button',{name:'存款',exact:true}).click();await page.locator('#bank-amount').fill('10');await page.getByRole('button',{name:'存入金币',exact:true}).click();await expect(page.locator('.bank-balance')).toContainText('10');
  await page.screenshot({path:'.cache/shop.png'});
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  // Reopen the saved game before visiting the cabinet, also verifying trades persist.
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.waitForTimeout(250);
  await look(page,-Math.atan2(5.8,3.7)/.002);await approach(page,'老虎机');
  await expect(page.locator('#interaction')).toContainText('老虎机');await page.keyboard.press('e');
  await page.locator('[data-stake="star"]').click();await page.locator('[data-action="spin"]').click();
  await expect(page.locator('#reels')).toHaveClass(/spinning/);await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await page.screenshot({path:'.cache/slots.png'});
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  // Reload also checks that the settled slot result and purchases persist.
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();
  await look(page,(Math.PI+.3)/.002,260);await page.waitForTimeout(200);
  await expect(page.locator('#interaction')).toContainText('床');await page.keyboard.press('e');
  await page.getByRole('button',{name:'确认睡觉，结束今天'}).click();await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','新的一天，开始了');
  await page.getByRole('button',{name:'迎接今天'}).click();await expect(page.locator('#day')).toHaveText('第 02 天');
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await page.keyboard.press('e');await page.getByRole('button',{name:'确认睡觉，结束今天'}).click();
  await page.getByRole('button',{name:'迎接今天'}).click();await expect(page.locator('#day')).toHaveText('第 03 天');
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await page.keyboard.press('e');await page.getByRole('button',{name:'确认睡觉，结束今天'}).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','这段生活，暂时结束了');
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','这段生活，暂时结束了');
});
