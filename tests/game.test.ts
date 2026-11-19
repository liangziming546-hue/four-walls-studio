import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, quota, counts, sum, SHAPES, deliver, sleep, spin, roll, evaluate, transfer, buy, sell, upgrade, useItem, decode, tick, drawingStats, finishDrawing, revealSpin, claimSlotPayout, slotOutcome, slotWinChance, slotBonus, type SlotSymbol, type Bet } from '../src/game.ts';
import { REEL_STOP_TIMES, SPIN_DURATION, reelPose } from '../src/slot-reels.ts';
import { outline, assess } from '../src/drawing.ts';

test('分批交付先补旧欠，工资只发一次', () => {
  const s=fresh();s.debt.triangle=1;
  let result=deliver(s);assert.equal(result.delivered,4);assert.equal(result.wage,0);assert.equal(s.debt.triangle,0);assert.equal(s.paid.triangle,1);
  s.inventory.triangle=2;s.inventory.square=1;result=deliver(s);assert.equal(result.wage,48);assert.equal(s.coins,68);
  assert.equal(deliver(s).wage,0);assert.equal(s.coins,68);
});
test('欠额跨日保留，第三次日结失败；清偿后重置连续计数', () => {
  const s=fresh();sleep(s);assert.equal(s.debtDays,1);assert.equal(sum(s.debt),6);sleep(s);assert.equal(s.debtDays,2);assert.equal(sleep(s).failed,true);assert.equal(s.over,true);
  const t=fresh();sleep(t);t.inventory=counts(100);deliver(t);assert.equal(t.debtDays,0);assert.equal(sum(t.debt),0);sleep(t);assert.equal(t.over,false);
});
test('本金结息向下取整、晚睡精神递减、饥渴跨日保留', () => {
  const s=fresh();s.bank=19;s.minute=1440;s.hunger=21;s.thirst=32;deliver(s);const r=sleep(s);
  assert.equal(r.interest,1);assert.equal(s.bank,20);assert.equal(s.energy,80);assert.equal(s.hunger,21);assert.equal(s.thirst,32);assert.equal(s.minute,480);
});
test('30天交付模拟无重复工资、负库存或结息偏差', () => {
  const s=fresh();s.bank=100;
  for(let day=1;day<=30;day++){
    assert.equal(s.day,day);assert.equal(sum(quota(day)),Math.ceil(3*1.1**(day-1))*2);
    s.inventory=counts(200);const coins=s.coins;const r=deliver(s);assert.equal(r.wage,sum(s.due)*8);assert.equal(s.coins,coins+r.wage);assert.equal(deliver(s).wage,0);
    const bank=s.bank;sleep(s);assert.equal(s.bank,bank+Math.floor(bank*.1));assert.equal(s.over,false);assert.ok(SHAPES.every(p=>s.inventory[p]>=0));
  }
});
test('老虎机只消耗图形，四连不重复计算；三行挂件独立生效', () => {
  const s=fresh();const coins=s.coins;s.charms=['top','bottom','triple'];
  const r=spin(s,'square',1,()=>0)!;assert.equal(s.coins,coins);assert.equal(s.inventory.square,1);assert.equal(s.inventory.triangle,2);assert.equal(r.wins.length,3);
  revealSpin(s);assert.equal(s.slot.tray.triangle,45);assert.equal(s.inventory.triangle,2);claimSlotPayout(s);assert.equal(s.inventory.triangle,47);
  const grid=[['triangle','triangle','triangle','circle'],['star','star','star','circle'],['square','square','circle','square']] as const;
  const copied=grid.map(row=>[...row]);assert.deepEqual(evaluate(copied,[]).map(w=>w.reward),[5]);assert.deepEqual(evaluate(copied,['top','bottom','triple']).map(w=>w.reward),[6,6]);
  s.inventory.circle=0;assert.equal(spin(s,'circle'),null);
});
test('从最左列起才中奖；连线抽样能产生所有图形', () => {
  const grid=[['circle','star','star','star'],['circle','star','star','star'],['circle','star','star','star']] as const;
  assert.equal(evaluate(grid.map(row=>[...row]),['top','bottom']).length,0);
  let i=0;const samples=[0,.36,.55,.7];const s=fresh();const r=spin(s,'circle',1,()=>samples[i++%4])!;assert.deepEqual(r.grid[0],SHAPES);
});

test('基础中奖率约9%，三连四连均有，四种图形机会均衡', () => {
  let seed=83721;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let wins=0,fours=0;const symbols=counts(),trials=100000;
  for(let i=0;i<trials;i++){
    const grid=roll(random);const outcome=evaluate(grid,[]);wins+=Number(outcome.length>0);fours+=Number(outcome[0]?.length===4);
    grid[1].forEach(s=>{if(s!=='bomb')symbols[s]++;});
  }
  assert.ok(Math.abs(wins/trials-.09)<.003,`Observed win rate: ${wins/trials}`);
  assert.ok(Math.abs(fours/trials-.0304)<.002,`Observed four rate: ${fours/trials}`);
  for(const s of SHAPES)assert.ok(Math.abs(symbols[s]/sum(symbols)-.25)<.004);
});

const losingGrid:SlotSymbol[][]=[['triangle','square','star','circle'],['triangle','square','circle','star'],['square','circle','star','triangle']];
const winningGrid:SlotSymbol[][]=[['triangle','square','star','circle'],['triangle','triangle','triangle','circle'],['square','circle','star','triangle']];
test('同投注二联返还整笔投入，只返还一次且不改变连败',()=>{
  const s=fresh();s.inventory.triangle=20;s.slot.losses=4;s.charms=['top','bottom'];
  let i=0;const samples=[0,0,.99,.5];const round=spin(s,'triangle',5,()=>samples[i++%4])!;
  assert.equal(round.refund,true);assert.equal(s.inventory.triangle,15);assert.equal(sum(s.slot.tray),0);
  revealSpin(s);assert.equal(s.slot.tray.triangle,5);assert.equal(s.slot.losses,4);assert.equal(s.inventory.triangle,15);
  assert.equal(spin(s,'triangle'),null);claimSlotPayout(s);assert.equal(s.inventory.triangle,20);
  assert.equal(sum(claimSlotPayout(s)),0);assert.equal(revealSpin(s),null);
});
test('二联图形不符不退款，三联优先于其他行的二联',()=>{
  const s=fresh();s.charms=['top'];
  const pair:SlotSymbol[][]=[['triangle','triangle','circle','square'],['star','square','circle','triangle'],['star','circle','square','triangle']];
  assert.equal(slotOutcome(s,'square',5,pair).refund,false);
  pair[1]=['star','star','star','circle'];
  const round=slotOutcome(s,'triangle',10,pair);assert.equal(round.refund,false);assert.equal(round.payouts.star,50);assert.equal(round.payouts.triangle,0);
});
test('连续失败提高概率并封顶，真正中奖后清零',()=>{
  const s=fresh();
  for(let n=1;n<=14;n++){
    s.slot.round=slotOutcome(s,'square',1,losingGrid);revealSpin(s);
    assert.equal(s.slot.losses,n);assert.ok(Math.abs(slotWinChance(n)-(.09+.015*Math.min(n,10)))<1e-10);
  }
  assert.equal(slotBonus(s.slot.losses),.15);
  s.slot.round=slotOutcome(s,'triangle',1,winningGrid);revealSpin(s);assert.equal(s.slot.losses,0);assert.equal(s.slot.tray.triangle,5);
});
test('炸弹任意行四联优先取消全部奖励，停机到次日',()=>{
  const s=fresh();const grid:SlotSymbol[][]=[['bomb','bomb','bomb','bomb'],['triangle','triangle','triangle','triangle'],['square','circle','star','triangle']];
  const round=slotOutcome(s,'triangle',10,grid);assert.equal(round.bomb,true);assert.deepEqual(round.wins,[]);assert.equal(sum(round.payouts),0);
  s.slot.round=round;revealSpin(s);assert.equal(s.slot.lockedDay,1);assert.equal(spin(s,'triangle'),null);
  const restored=decode(JSON.stringify(s))!;assert.equal(restored.slot.lockedDay,1);sleep(restored);assert.equal(restored.day,2);assert.equal(restored.slot.lockedDay,0);assert.ok(spin(restored,'triangle'));
});
test('1/5/10倍投入、奖励和挂件加成都按同一倍率，余额不足不扣款',()=>{
  for(const multiplier of [1,5,10] as const){
    const s=fresh();s.inventory.triangle=20;s.charms=['triple'];
    const round=spin(s,'triangle',multiplier,()=>0)!;assert.equal(s.inventory.triangle,20-multiplier);assert.equal(round.payouts.triangle,15*multiplier);
    assert.equal(spin(s,'triangle'),null);assert.equal(sleep(s).blocked,true);revealSpin(s);assert.equal(s.inventory.triangle,20-multiplier);claimSlotPayout(s);assert.equal(s.inventory.triangle,20+14*multiplier);
    assert.equal(slotOutcome(s,'triangle',multiplier,winningGrid).payouts.triangle,6*multiplier);
  }
  const poor=fresh();assert.equal(spin(poor,'triangle',10),null);assert.equal(spin(poor,'triangle',2 as Bet),null);assert.equal(poor.inventory.triangle,2);
});
test('未领取出币跨日保留，领奖后才进入库存',()=>{
  const s=fresh();s.slot.round=slotOutcome(s,'triangle',5,winningGrid);revealSpin(s);
  assert.equal(s.slot.tray.triangle,25);sleep(s);assert.equal(s.slot.tray.triangle,25);assert.equal(s.inventory.triangle,2);
  claimSlotPayout(s);assert.equal(s.inventory.triangle,27);assert.equal(sum(s.slot.tray),0);
});
test('多条线产出不同图形时，托盘分别存放且一次领取各自入账',()=>{
  const s=fresh();s.charms=['top','bottom'];
  const grid:SlotSymbol[][]=[['triangle','triangle','triangle','square'],['star','star','star','star'],['circle','circle','circle','square']];
  s.slot.round=slotOutcome(s,'square',5,grid);revealSpin(s);
  assert.deepEqual(s.slot.tray,{triangle:25,square:0,star:75,circle:25});claimSlotPayout(s);
  assert.deepEqual(s.inventory,{triangle:27,square:2,star:77,circle:27});assert.equal(sum(claimSlotPayout(s)),0);
});
test('旧存档无损升级，未完成抽奖可恢复且不会重复扣款或派奖',()=>{
  const old=fresh();old.coins=123;const data=JSON.parse(JSON.stringify(old));delete data.slot;
  const migrated=decode(JSON.stringify(data))!;assert.equal(migrated.coins,123);assert.deepEqual(migrated.slot,fresh().slot);
  const s=fresh();s.inventory.triangle=20;spin(s,'triangle',10,()=>0);
  const restored=decode(JSON.stringify(s))!;assert.equal(restored.inventory.triangle,10);assert.ok(restored.slot.round);revealSpin(restored);assert.equal(restored.inventory.triangle,10);assert.equal(restored.slot.tray.triangle,150);assert.equal(revealSpin(restored),null);
  const waiting=decode(JSON.stringify(restored))!;claimSlotPayout(waiting);assert.equal(waiting.inventory.triangle,160);claimSlotPayout(waiting);assert.equal(waiting.inventory.triangle,160);
  const invalid=JSON.parse(JSON.stringify(s));invalid.slot.round.grid[0][0]='invalid';assert.equal(decode(JSON.stringify(invalid)),null);
});
test('连败保护提升实际中奖率，同时不提高四联炸弹概率',()=>{
  let seed=7891;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const trials=60000;let normal=0,boosted=0,bombs=0;
  for(let i=0;i<trials;i++){
    const base=roll(random,0),boost=roll(random,10);normal+=Number(evaluate(base,[]).length>0);boosted+=Number(evaluate(boost,[]).length>0);bombs+=Number(boost.some(row=>row.every(symbol=>symbol==='bomb')));
  }
  assert.ok(Math.abs(normal/trials-.09)<.004);assert.ok(Math.abs(boosted/trials-.24)<.006);assert.ok(Math.abs(bombs/trials-.0161)<.003);
});

test('卷轴从左到右依次停下，最终角度精确对准三个结果图形', () => {
  REEL_STOP_TIMES.forEach((stop,col)=>{
    assert.equal(reelPose(col,stop-.01).stopped,false);
    assert.equal(reelPose(col,stop).stopped,true);
    if(col<3)assert.equal(reelPose(col+1,stop).stopped,false);
    let previous=0;
    for(let t=0;t<stop;t+=.03){const pose=reelPose(col,t);assert.ok(pose.angle<=previous+.00001);previous=pose.angle;}
    assert.ok(Math.abs((reelPose(col,SPIN_DURATION).angle+8*22.5)%360)<.00001);
  });
});
test('购买、出售、存取款和使用补给均校验余额', () => {
  const s=fresh();assert.equal(transfer(s,-1,true),false);assert.equal(transfer(s,1.2,true),false);assert.equal(transfer(s,21,true),false);
  assert.equal(transfer(s,20,true),true);assert.equal(buy(s,'food'),false);assert.equal(transfer(s,20,false),true);assert.equal(buy(s,'water'),true);s.thirst=70;useItem(s,'water');assert.equal(s.thirst,100);assert.equal(s.water,0);assert.equal(useItem(s,'water'),false);
  s.inventory.star=0;assert.equal(sell(s,'star'),false);assert.equal(upgrade(s,'pen'),false);
  s.coins=500;assert.equal(buy(s,'top'),true);assert.equal(buy(s,'top'),false);assert.equal(upgrade(s,'pen'),true);
});
test('状态和升级影响绘画，熟练度递增，时间在凌晨封顶', () => {
  const s=fresh(),a=drawingStats(s,'circle');s.pen=3;s.hand=3;const b=drawingStats(s,'circle');assert.ok(b.seconds<a.seconds);assert.ok(b.jitter<a.jitter);
  s.hunger=0;s.thirst=0;s.energy=0;assert.ok(drawingStats(s,'circle').seconds>b.seconds);
  finishDrawing(s,'circle');assert.equal(s.xp.circle,1);assert.equal(s.inventory.circle,3);
  tick(s,1e6);assert.equal(s.minute,1560);assert.equal(s.hunger,0);
});
test('存档完整往返、损坏与旧版本存档安全回退', () => {
  const s=fresh();assert.deepEqual(decode(JSON.stringify(s)),s);assert.equal(decode('{'),null);assert.equal(decode('{"version":2}'),null);assert.equal(decode(null),null);
  s.inventory.star=-1;assert.equal(decode(JSON.stringify(s)),null);
});
test('四种图形精确描画合格，空白、乱画、不连贯端点不合格', () => {
  for(const shape of SHAPES){const path=outline(shape);assert.equal(assess(path,[[...path,path[0]]]).valid,true);assert.equal(assess(path,[]).valid,false);assert.equal(assess(path,[[{x:0,y:0},{x:1,y:1}]]).valid,false);assert.equal(assess(path,path.map(p=>[p])).valid,false);}
});
