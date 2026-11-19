import { test, expect, type Page } from '@playwright/test';
import { fresh, counts, SAVE_KEY, decode, type Charm } from '../src/game';

async function openSlots(page:Page,charms:Charm[]=[]){
  const state=fresh();state.inventory=counts(20);state.charms=charms;
  await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:SAVE_KEY,state});
  await page.goto('/');await page.getByRole('button',{name:'继续生活'}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await page.waitForTimeout(250);
  await page.keyboard.down('w');await page.waitForTimeout(1230);await page.keyboard.up('w');
  await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:-Math.PI/2/.002,movementY:80,bubbles:true})));
  await page.keyboard.down('w');
  try{await expect(page.locator('#interaction')).toContainText('老虎机',{timeout:20000});}finally{await page.keyboard.up('w');}
  await page.keyboard.press('e');await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','图形俱乐部');
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
  await expect(page.locator('#inventory [title="三角形"]')).toContainText('34');
  await expect(page.locator('.slot-payline.winning')).toHaveCount(1);
  await page.screenshot({path:'.cache/slots-stopped.png'});
  const saved=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(saved.inventory.triangle).toBe(34);expect(saved.coins).toBe(20);
  // A refresh midway through the next spin retains its one settled result.
  await page.locator('[data-action="spin"]').click();await page.reload();
  const after=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(after.inventory.triangle).toBe(48);expect(errors).toEqual([]);
});

test('上行和下行挂件在滚筒停稳后分别高亮，不重复发放奖励',async({page})=>{
  await openSlots(page,['top','bottom','triple']);
  await page.evaluate(()=>{Math.random=()=>0;});
  await page.locator('[data-action="spin"]').click();
  await expect(page.locator('.slot-payline.winning')).toHaveCount(0);
  await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
  await expect(page.locator('.slot-payline.winning')).toHaveCount(3);
  const result=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(result.inventory.triangle).toBe(64);
});
