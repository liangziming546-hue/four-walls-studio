import { test, expect } from '@playwright/test';
import { fresh, SAVE_KEY, decode } from '../src/game';

test('保存按钮和Ctrl+S立即写入；刷新恢复，存储失败明确提示',async({page})=>{
  const state=fresh();state.coins=123;state.bank=456;state.inventory.star=17;
  await page.addInitScript(({key,state})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));
    const original=Storage.prototype.setItem;
    const tracker={writes:0,fail:false};
    Object.assign(window,{saveTracker:tracker});
    Storage.prototype.setItem=function(k,v){
      if(k===key){if(tracker.fail)throw new DOMException('Storage blocked','QuotaExceededError');tracker.writes++;}
      return original.call(this,k,v);
    };
  },{key:SAVE_KEY,state});
  const writes=()=>page.evaluate(()=>(window as any).saveTracker.writes as number);
  await page.goto('/');await page.getByRole('button',{name:'继续生活'}).click();
  await page.keyboard.press('Escape');
  const panel=page.getByRole('dialog',{name:'歇一会儿',exact:true});await expect(panel).toBeVisible();
  let count=await writes();await panel.getByRole('button',{name:'保存进度',exact:true}).click();
  await expect.poll(writes).toBe(count+1);await expect(page.locator('.toast').last()).toHaveText('保存成功');
  await expect(page.locator('#save-status')).toHaveText('进度已保存');
  const saved=decode(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))!;
  expect(saved.coins).toBe(123);expect(saved.bank).toBe(456);expect(saved.inventory.star).toBe(17);
  // Keyboard saving also works while a separate help dialog is open.
  await panel.getByRole('button',{name:'查看说明'}).click();
  count=await writes();await page.keyboard.press('Control+s');await expect.poll(writes).toBe(count+1);
  await page.getByRole('button',{name:'关闭说明'}).click();
  // A failed write must never produce a success message.
  await page.evaluate(()=>(window as any).saveTracker.fail=true);
  await panel.getByRole('button',{name:'保存进度',exact:true}).click();
  await expect(page.locator('.toast').last()).toHaveText('保存失败：浏览器存储不可用');
  await expect(page.locator('#save-status')).toContainText('存档不可用');
  await page.evaluate(()=>(window as any).saveTracker.fail=false);
  // The HUD button is also available while the pause window is open.
  count=await writes();await page.locator('#save-button').click();await expect.poll(writes).toBe(count+1);
  await page.screenshot({path:'.cache/manual-save.png'});
  await page.reload();await page.getByRole('button',{name:'继续生活'}).click();
  await expect(page.locator('#coins')).toHaveText('123');
  await expect(page.locator('#inventory [title="五角星"]')).toContainText('17');
});
