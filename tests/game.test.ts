import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, quota, counts, sum, SHAPES, deliver, sleep, spin, evaluate, transfer, buy, sell, upgrade, useItem, decode, tick, drawingStats, finishDrawing } from '../src/game.ts';
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
  const r=spin(s,'square',()=>0)!;assert.equal(s.coins,coins);assert.equal(s.inventory.square,1);assert.equal(s.inventory.triangle,47);assert.equal(r.wins.length,3);
  const grid=[['triangle','triangle','triangle','circle'],['star','star','star','circle'],['square','square','circle','square']] as const;
  const copied=grid.map(row=>[...row]);assert.deepEqual(evaluate(copied,[]).map(w=>w.reward),[5]);assert.deepEqual(evaluate(copied,['top','bottom','triple']).map(w=>w.reward),[6,6]);
  s.inventory.circle=0;assert.equal(spin(s,'circle'),null);
});
test('从最左列起才中奖；独立抽样能产生所有图形', () => {
  const grid=[['circle','star','star','star'],['circle','star','star','star'],['circle','star','star','star']] as const;
  assert.equal(evaluate(grid.map(row=>[...row]),['top','bottom']).length,0);
  let i=0;const s=fresh();const r=spin(s,'circle',()=>((i++%4)+.1)/4)!;assert.deepEqual(r.grid[0],SHAPES);
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
