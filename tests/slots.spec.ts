import { test, expect, type Page } from '@playwright/test';
import { fresh, counts, SAVE_KEY, decode, type Charm } from '../src/game';

async function navigateSlots(page:Page){
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await page.waitForTimeout(250);
  await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:-Math.atan2(5.8,3.7)/.002,movementY:0,bubbles:true})));
  await page.keyboard.down('w');
  try{await expect(page.locator('#interaction')).toContainText('老虎机',{timeout:20000});}finally{await page.keyboard.up('w');}
  await page.keyboard.press('e');await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','图形俱乐部');
}
async function openSlots(page:Page,charms:Charm[]=[],losses=0){
  const state=fresh();state.inventory=counts(20);state.charms=charms;state.slot.losses=losses;
  await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:SAVE_KEY,state});
  await page.goto('/');await page.getByRole('button',{name:'继续生活'}).click();await navigateSlots(page);
}

test('四列滚筒持续旋转、依次停下，最后才显示中奖与库存，暂停不会重复扣奖',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await openSlots(page);
  await page.evaluate(()=>{Math.random=()=>0;});
  await page.locator('[data-action="spin"]').click();
  await expect(page.locator('[data-action="spin"]')).toBeDisabled();
  await expect(page.locator('.reel-column[data-state="spinning"]')).toHaveCount(4);
  await expect(page.locator('#slot-outcome')).not.toContainText('4连');
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('19');
  const ring=page.locator('.reel-cylinder').last();const before=await ring.getAttribute('style');
  await expect.poll(()=>ring.getAttribute('style'),{intervals:[25,50,100],timeout:2000}).not.toBe(before);
  await page.waitForFunction(()=>document.querySelector('.reel-column')?.getAttribute('data-state')==='stopped',undefined,{polling:'raf'});
  await expect(page.locator('.reel-column').nth(0)).toHaveAttribute('data-state','stopped');
  await expect(page.locator('.reel-column').nth(3)).toHaveAttribute('data-state','spinning');
  await page.screenshot({path:'.cache/slots-turning.png'});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','歇一会儿');
  await page.waitForTimeout(600);await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('19');
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('#slot-outcome')).toContainText('4连');
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('19');
  await expect(page.locator('.slot-payline.winning')).toHaveCount(1);
  await expect(page.locator('[data-action="spin"]')).toBeDisabled();
  await expect(page.locator('#payout-tray')).toContainText('15');
  await page.screenshot({path:'.cache/slots-outlet.png'});
  await page.locator('#payout-tray').click();await expect(page.locator('#inventory [title="三角形"]')).toContainText('34');
  await page.screenshot({path:'.cache/slots-stopped.png'});
  const saved=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(saved.inventory.triangle).toBe(34);expect(saved.coins).toBe(20);
  // A refresh resumes the paid round; prizes still need explicit collection.
  await page.locator('[data-action="spin"]').click();await page.reload();await page.getByRole('button',{name:'继续生活'}).click();
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  const after=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(after.inventory.triangle).toBe(33);expect(after.slot.tray.triangle).toBe(15);
  await page.locator('#payout-tray').click();await expect(page.locator('#inventory [title="三角形"]')).toContainText('48');expect(errors).toEqual([]);
});

test('上行和下行挂件在滚筒停稳后分别高亮，不重复发放奖励',async({page})=>{
  await openSlots(page,['top','bottom','triple']);
  await page.evaluate(()=>{let i=0;Math.random=()=>[0,0,0,0,.45,0,0,0,.65,0,0,0][i++%12];});
  await page.locator('[data-action="spin"]').click();
  await expect(page.locator('.slot-payline.winning')).toHaveCount(0);
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('.slot-payline.winning')).toHaveCount(3);
  const result=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(result.inventory.triangle).toBe(19);expect(result.slot.tray.triangle).toBe(15);expect(result.slot.tray.star).toBe(15);expect(result.slot.tray.circle).toBe(15);
  await expect(page.locator('.payout-group')).toHaveCount(3);await page.screenshot({path:'.cache/slots-mixed-payout.png'});
  await page.locator('#payout-tray').click();await expect(page.locator('#inventory [title="三角形"]')).toContainText('34');
  await expect(page.locator('#inventory [title="五角星"]')).toContainText('35');await expect(page.locator('#inventory [title="圆形"]')).toContainText('35');
});

test('五倍十倍投入与出币匹配，未领出币刷新后仍可领取',async({page})=>{
  await openSlots(page);await page.evaluate(()=>{Math.random=()=>0;});
  await page.locator('[data-bet="5"]').click();await page.locator('[data-action="spin"]').click();
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('15');
  await expect(page.locator('#payout-tray')).toContainText('75');await page.locator('#payout-tray').click();
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('90');
  await page.locator('[data-bet="10"]').click();await page.locator('[data-action="spin"]').click();
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('#payout-tray')).toContainText('150');
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();await navigateSlots(page);
  await expect(page.locator('[data-bet="10"]')).toHaveClass(/selected/);
  await expect(page.locator('#payout-tray')).toContainText('150');await expect(page.locator('#inventory [title="三角形"]')).toContainText('80');
  await page.setViewportSize({width:1280,height:720});await page.locator('#payout-tray').scrollIntoViewIfNeeded();
  await page.screenshot({path:'.cache/slots-cabinet-small.png'});
  await page.locator('#payout-tray').click();await expect(page.locator('#inventory [title="三角形"]')).toContainText('230');
});

test('二联返还整笔投入且不改变连败，空奖后连败加一',async({page})=>{
  await openSlots(page,[],3);
  await page.evaluate(()=>{let i=0;Math.random=()=>[0,0,.99,.5][i++%4];});
  await page.locator('[data-bet="5"]').click();await page.locator('[data-action="spin"]').click();
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('#slot-outcome')).toContainText('返还 5');
  let saved=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(saved.slot.losses).toBe(3);expect(saved.inventory.triangle).toBe(15);
  await page.locator('#payout-tray').click();await expect(page.locator('#inventory [title="三角形"]')).toContainText('20');
  await page.evaluate(()=>{let i=0;Math.random=()=>[0,.8,.4,.6][i++%4];});await page.locator('[data-action="spin"]').click();
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  saved=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(saved.slot.losses).toBe(4);expect(saved.slot.tray.triangle).toBe(0);
});

test('四联炸弹当日停机，刷新不能绕过，实际睡到次日恢复',async({page})=>{
  await openSlots(page);
  await page.evaluate(()=>{let i=0;Math.random=()=>[.99,0,0,0][i++%4];});
  await page.locator('[data-action="spin"]').click();
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('.slot-cabinet')).toHaveClass(/is-locked/);await expect(page.locator('[data-action="spin"]')).toBeDisabled();
  await expect(page.locator('#payout-tray')).toBeDisabled();await page.screenshot({path:'.cache/slots-bomb.png'});
  await page.reload();const saved=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;expect(saved.slot.lockedDay).toBe(1);
  await page.getByRole('button',{name:'继续生活'}).click();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.waitForTimeout(250);
  await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:(Math.PI+.3)/.002,movementY:260,bubbles:true})));
  await expect(page.locator('#interaction')).toContainText('床');await page.keyboard.press('e');await page.getByRole('button',{name:'确认睡觉，结束今天'}).click();
  await page.getByRole('button',{name:'迎接今天'}).click();await expect(page.locator('#day')).toHaveText('第 02 天');
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();await navigateSlots(page);
  await expect(page.locator('.slot-cabinet')).not.toHaveClass(/is-locked/);await expect(page.locator('[data-action="spin"]')).toBeEnabled();
});
