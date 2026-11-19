import { test, expect, type Page, type Locator } from '@playwright/test';
import { fresh, SAVE_KEY } from '../src/game';

async function seed(page:Page){
  const state=fresh();
  await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:SAVE_KEY,state});
  await page.goto('/');
}
async function station(page:Page,kind:'work'|'shop'|'slots'|'bed'|'letters'){
  await page.getByRole('button',{name:'继续生活'}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.waitForTimeout(250);
  const targets={work:{x:0,z:-5.2,p:.45,name:'画桌'},shop:{x:5.8,z:0,p:.08,name:'商店'},slots:{x:-5.8,z:0,p:.08,name:'老虎机'},bed:{x:-1.25,z:5.6,p:.6,name:'床'},letters:{x:2.1,z:5.7,p:.45,name:'书桌'}};
  const t=targets[kind],yaw=Math.atan2(-t.x,3.7-t.z);
  await page.evaluate(({x,y})=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y,bubbles:true})),{x:-yaw/.002,y:(t.p-.08)/.002});
  await page.keyboard.down('w');try{await expect(page.locator('#interaction')).toContainText(t.name,{timeout:20000});}finally{await page.keyboard.up('w');}
  await page.keyboard.press('e');
}
async function centered(page:Page,panel:Locator){
  const box=(await panel.boundingBox())!;
  expect(Math.abs(box.x+box.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
}
async function explainAndReturn(page:Page,panel:Locator,expected:string){
  await expect(panel.locator('.panel-header h1')).toHaveCount(0);
  await centered(page,panel);
  await panel.getByRole('button',{name:'查看说明'}).click();
  const help=page.getByRole('dialog',{name:'操作说明',exact:true});await expect(help).toContainText(expected);await centered(page,help);
  const clock=await page.locator('#clock').textContent();await page.waitForTimeout(350);await expect(page.locator('#clock')).toHaveText(clock!);
  await help.getByRole('button',{name:'关闭说明'}).click();await expect(panel).toBeVisible();
}

test('各操作窗口居中、无左上标题，规则仅在独立说明窗口显示',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await seed(page);await centered(page,page.locator('.intro'));
  await page.locator('.intro').getByRole('button',{name:'查看说明'}).click();
  await expect(page.locator('.explanation-content')).toContainText('房间里的生活');await page.getByRole('button',{name:'关闭说明'}).click();
  for(const kind of ['shop','slots','bed','letters'] as const){
    if(kind!=='shop')await page.reload();await station(page,kind);
    const panel=page.locator('#overlay>.panel');
    await explainAndReturn(page,panel,{shop:'交付与售卖',slots:'炸弹停机',bed:'结束一天',letters:'信件'}[kind]);
    await expect(panel.locator('p')).toHaveCount(0);
    if(kind==='shop'){
      for(const tab of ['补给','成长与挂件','存款']){await page.getByRole('button',{name:tab,exact:true}).click();await centered(page,panel);await expect(panel.locator('p')).toHaveCount(0);}
      await page.getByRole('button',{name:'补给',exact:true}).click();await page.screenshot({path:'.cache/centered-shop.png'});
    }
    if(kind==='slots'){await expect(page.locator('.slot-rulebook')).toHaveCount(0);await centered(page,page.locator('.slot-cabinet'));await page.screenshot({path:'.cache/centered-slots.png'});}
  }
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();await page.keyboard.press('b');
  await explainAndReturn(page,page.locator('#overlay>.panel'),'使用物品');
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.keyboard.press('Escape');
  await explainAndReturn(page,page.locator('#overlay>.panel'),'暂停');
  await page.getByRole('button',{name:'重新开始游戏'}).click();await explainAndReturn(page,page.locator('#overlay>.panel'),'重新开始');
  expect(errors).toEqual([]);
});

test('长按自动画图约20秒完成，松开与查看说明暂停，完成直接入库',async({page})=>{
  await seed(page);await station(page,'work');
  const panel=page.locator('#overlay>.panel');await centered(page,panel);await centered(page,page.locator('#paper'));await expect(panel.locator('#collect')).toHaveCount(0);
  const button=page.locator('#auto-draw');await button.hover();await page.mouse.down();await page.waitForTimeout(5000);await page.mouse.up();
  const progress=Number(await page.getByRole('progressbar',{name:'绘画进度'}).getAttribute('aria-valuenow'));
  expect(progress).toBeGreaterThanOrEqual(20);expect(progress).toBeLessThan(40);
  await page.waitForTimeout(700);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(progress));
  await explainAndReturn(page,panel,'基础用时约20秒');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(progress));
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('2');
  await page.screenshot({path:'.cache/centered-work.png'});
  await button.hover();await page.mouse.down();
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('3',{timeout:19000});
  await expect(button).toHaveAttribute('aria-pressed','true');await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed','false');
  await page.waitForTimeout(300);await expect(page.locator('#inventory [title="三角形"]')).toContainText('3');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),SAVE_KEY);expect(saved.xp.triangle).toBe(1);
});
