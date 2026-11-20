import { test, expect, devices, type Page, type CDPSession, type Locator } from '@playwright/test';
import { fresh, counts, SAVE_KEY, slotOutcome, type State, type SlotSymbol } from '../src/game';
import { outline } from '../src/drawing';

async function setup(browser: any, state: State = fresh(), size = {width:390,height:844}) {
  const context=await browser.newContext({...devices['iPhone 13'],viewport:size,deviceScaleFactor:1});
  const page:Page=await context.newPage();
  await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:SAVE_KEY,state});
  await page.goto('/');const cdp:CDPSession=await context.newCDPSession(page);
  return {page,context,cdp};
}
async function down(cdp:CDPSession,locator:Locator){
  await expect(locator).toBeVisible();await locator.scrollIntoViewIfNeeded();
  const b=(await locator.boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});
}
async function up(cdp:CDPSession,cancel=false){await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
async function fits(page:Page,selector='.panel'){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  for(const el of await page.locator(selector).all()){
    const b=(await el.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
    expect(await el.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  }
}

test('手机无需鼠标锁定，单指移动、转向、取消手势、互动和左右手切换',async({browser})=>{
  const {page,context,cdp}=await setup(browser);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.getByRole('button',{name:'继续生活'}).tap();
    await expect(page.locator('#touch-controls')).toBeVisible();expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
    await fits(page,'#touch-controls');
    // Cancellation must release a held direction before it reaches the table.
    await down(cdp,page.locator('[data-touch="forward"]'));await page.waitForTimeout(400);await up(cdp,true);
    await page.waitForTimeout(2400);await expect(page.locator('#interaction')).not.toContainText('画桌');
    await expect(page.locator('.is-held')).toHaveCount(0);
    await down(cdp,page.locator('[data-touch="forward"]'));
    try{await expect(page.locator('#interaction')).toContainText('画桌',{timeout:12000});}finally{await up(cdp);}
    await expect(page.locator('#touch-interact')).toBeEnabled();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:210,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:210,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:210,id:1}]});await up(cdp);
    await expect(page.locator('#overlay>.panel')).toHaveCount(0);
    await page.screenshot({path:'.cache/mobile-room.png'});
    await page.locator('#touch-interact').tap();await expect(page.locator('[data-screen="work"]')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();await fits(page);
    await page.locator('.touch-back').filter({hasText:'返回'}).tap();
    await page.locator('[data-touch-quick="tasks"]').tap();await expect(page.locator('[data-screen="tasks"]')).toContainText('今日交付');
    const clock=await page.locator('#clock').textContent();await page.waitForTimeout(500);await expect(page.locator('#clock')).toHaveText(clock!);
    await page.locator('.touch-back').filter({hasText:'返回'}).tap();
    await page.locator('[data-touch-quick="pause"]').tap();await page.getByRole('button',{name:'改为左手操作'}).tap();
    await page.getByRole('button',{name:'继续游戏',exact:true}).tap();await expect(page.locator('#touch-controls')).toHaveAttribute('data-hand','left');
    // Backing away makes the station inaccessible again; rotation buttons hold normally.
    await down(cdp,page.locator('[data-touch="back"]'));await page.waitForTimeout(1600);await up(cdp);
    await expect(page.locator('#touch-interact')).toBeDisabled();
    await down(cdp,page.locator('[data-touch="turn-right"]'));await page.waitForTimeout(700);await up(cdp);
    await down(cdp,page.locator('[data-touch="forward"]'));
    try{await expect(page.locator('#interaction')).toContainText('商店',{timeout:15000});}finally{await up(cdp);}
    await page.locator('#touch-interact').tap();await expect(page.locator('[data-screen="shop"]')).toBeVisible();await fits(page);
    await page.getByRole('button',{name:'补给',exact:true}).tap();await fits(page);await page.screenshot({path:'.cache/mobile-shop.png'});
    await page.reload();await page.getByRole('button',{name:'继续生活'}).tap();await expect(page.locator('#touch-controls')).toHaveAttribute('data-hand','left');
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('手指描画直接结算，长按自动绘画、说明暂停和返回均可触控',async({browser})=>{
  const {page,context,cdp}=await setup(browser);
  try{
    await page.getByRole('button',{name:'继续生活'}).tap();await down(cdp,page.locator('[data-touch="forward"]'));
    try{await expect(page.locator('#interaction')).toContainText('画桌',{timeout:12000});}finally{await up(cdp);}
    await page.locator('#touch-interact').tap();
    const rect=(await page.locator('#paper').boundingBox())!,path=outline('triangle');
    const send=async(type:string,p:typeof path[number])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[{x:rect.x+p.x*rect.width,y:rect.y+p.y*rect.height,id:1}]});
    await send('touchStart',path[0]);for(let i=0;i<path.length;i+=6)await send('touchMove',path[i]);await send('touchMove',path[0]);await up(cdp);
    await expect(page.locator('#drawing-count')).toContainText('3');
    await down(cdp,page.locator('#auto-draw'));await page.waitForTimeout(3500);await up(cdp);
    const progress=await page.getByRole('progressbar').getAttribute('aria-valuenow');expect(Number(progress)).toBeGreaterThan(10);
    await page.locator('#overlay [data-action="explain"]').tap();await expect(page.locator('.explanation-content')).toContainText('手机单手操作');
    await page.getByRole('button',{name:'返回游戏',exact:true}).tap();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow',progress!);
    await page.screenshot({path:'.cache/mobile-drawing.png'});
    await down(cdp,page.locator('#auto-draw'));try{await expect(page.locator('#drawing-count')).toContainText('4',{timeout:21000});}finally{await up(cdp);}
    await expect(page.locator('#auto-draw')).toHaveAttribute('aria-pressed','false');
    await page.locator('#overlay [data-action="manual-save"]').tap();await expect(page.locator('.toast').last()).toHaveText('保存成功');
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),SAVE_KEY);expect(saved.inventory.triangle).toBe(4);
  }finally{await context.close();}
});

test('320至430像素竖屏老虎机不横向溢出，倍率、领奖和返回可点按',async({browser})=>{
  for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:430,height:932}]){
    const state=fresh();state.inventory=counts(20);
    const grid:SlotSymbol[][]=Array.from({length:3},()=>['circle','triangle','triangle','triangle']);
    state.slot.round=slotOutcome(state,'triangle',5,grid);state.inventory.triangle-=5;
    const {page,context}=await setup(browser,state,viewport);
    try{
      await fits(page,'.intro');await page.getByRole('button',{name:'继续生活'}).tap();
      await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});await fits(page);
      const tray=page.locator('#payout-tray');await expect(tray).toContainText('25');await tray.tap();
      await page.locator('[data-bet="10"]').tap();await expect(page.locator('[data-bet="10"]')).toHaveClass(/selected/);
      if(viewport.width===390){
        await page.evaluate(()=>{Math.random=()=>0;});await page.locator('[data-action="spin"]').tap();
        await page.locator('.touch-back').filter({hasText:'暂停'}).tap();await expect(page.locator('[data-screen="pause"]')).toBeVisible();
        await page.getByRole('button',{name:'继续游戏',exact:true}).tap();
        await expect(page.locator('#reels')).not.toHaveClass(/spinning/,{timeout:10000});
        await expect(tray).toContainText('150');await tray.tap();
        const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),SAVE_KEY);expect(saved.inventory.triangle).toBe(180);
      }
      await fits(page);await page.screenshot({path:`.cache/mobile-slots-${viewport.width}.png`});
      await page.locator('.touch-back').filter({hasText:'返回'}).tap();await expect(page.locator('#touch-controls')).toBeVisible();
    }finally{await context.close();}
  }
});
