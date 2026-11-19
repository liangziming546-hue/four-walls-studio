import './style.css';
import './slots.css';
import './centered.css';
import { Room, STATION_NAMES, type Station } from './room';
import { SHAPES, INFO, CONFIG, PRODUCTS, SAVE_KEY, fresh, decode, quota, sum, timeLabel, tick, drawingStats, proficiency, finishDrawing, deliver, sleep, buy, useItem, upgrade, transfer, sell, spin, revealSpin, claimSlotPayout, activeSlotRows, SLOT_BETS, slotBonus, slotWinChance, type Shape, type Bet, type SlotRound } from './game';
import { outline, assess, traceOutline, type Point } from './drawing';
import { SlotReels, SPIN_DURATION, idleGrid } from './slot-reels';
import { explanation, type HelpContext } from './help';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="world"></div><div class="vignette"></div>
  <div id="hud" hidden>
    <header class="topbar"><div class="day-clock"><b id="day"></b><span id="clock"></span></div><div class="wallet"><span class="coin-icon">●</span> <b id="coins"></b><span>金币</span></div><div class="hud-toolbar"><button class="icon-button" id="help-button" aria-label="操作说明">?</button><button class="icon-button" id="pause-button" aria-label="暂停">Ⅱ</button></div></header>
    <aside class="task-card"><div class="eyebrow">TODAY’S COMMISSION</div><h2>今日交付 <span id="task-status"></span></h2><div id="task-list"></div><div id="debt" class="debt"></div><p id="tomorrow"></p></aside>
    <div class="crosshair">·</div><div id="interaction"></div>
    <section class="bottom-left"><div class="stats" id="stats"></div><div class="inventory" id="inventory"></div></section>
    <div class="bottom-right"><button id="bag-button">背包 <kbd>B</kbd></button><span id="save-status">本地自动存档</span></div>
  </div>
  <div id="overlay"></div><div id="explanation-layer" hidden></div><div id="toasts" aria-live="polite"></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let state = fresh(), loaded = false;
try { const saved = decode(localStorage.getItem(SAVE_KEY)); if (saved) { state = saved; loaded = true; } } catch { /* Play remains available if storage is blocked. */ }
let room: Room;
try { room = new Room($('world')); } catch {
  $('overlay').innerHTML = '<section class="panel"><h1>暂时无法启动3D场景</h1><p>请在支持 WebGL 的电脑浏览器中打开，并开启浏览器的硬件加速。</p></section>';
  throw new Error('WebGL unavailable');
}
let started = false, paused = false, modal: Station | 'bag' | 'pause' | 'result' | 'reset' | null = null;
let explanationOpen = false, explanationWasPaused = false, explanationFocus: HTMLElement | null = null;
let shopTab = 'delivery', selected: Shape = 'triangle', stake: Shape = state.slot.round?.stake ?? 'triangle', bet: Bet = state.slot.round?.multiplier ?? 1;
let spinLeft = state.slot.round ? SPIN_DURATION : 0, spinResult: SlotRound | null = state.slot.round ?? state.slot.last, lastResult = '', saveElapsed = 0;
let spinStartGrid = state.slot.last?.grid ?? idleGrid(), slotReels: SlotReels | null = null, stoppedReels = 0;
let volume = state.volume, audio: AudioContext | null = null;
const shapeName = (s: Shape) => `${INFO[s].symbol} ${INFO[s].name}`;
const shapeChip = (s: Shape, text = '') => `<span class="shape-chip" style="--shape:${INFO[s].color}"><b>${INFO[s].symbol}</b>${text || INFO[s].name}</span>`;
function toast(message: string) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; $('toasts').append(el); setTimeout(() => el.remove(), 4200); }
function save() { try { state.volume = volume; localStorage.setItem(SAVE_KEY, JSON.stringify(state)); $('save-status').textContent = '进度已保存'; } catch { $('save-status').textContent = '存档不可用 · 请勿关闭页面'; } }
function sound(frequency = 520, duration = .12) {
  if (!volume) return;
  try { audio ??= new AudioContext(); void audio.resume(); const o=audio.createOscillator(),g=audio.createGain(); o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(volume*.12,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration); } catch { /* Audio is optional. */ }
}
function choice(selectedShape: Shape, attr: string) { return SHAPES.map(s => `<button class="shape-choice ${s===selectedShape?'selected':''}" ${attr}="${s}" style="--shape:${INFO[s].color}">${INFO[s].symbol}<small>${INFO[s].name}</small></button>`).join(''); }
function hud() {
  $('day').textContent = `第 ${String(state.day).padStart(2,'0')} 天`; $('clock').textContent = timeLabel(state.minute); $('coins').textContent = state.coins.toLocaleString();
  $('task-status').textContent = state.wageClaimed ? '已完成' : `工资 ${sum(state.due)*8} 金币`;
  $('task-list').innerHTML = SHAPES.filter(s=>state.due[s]).map(s=>`<div class="task-row">${shapeChip(s)}<b class="${state.paid[s]>=state.due[s]?'done':''}">${state.paid[s]} <span>/ ${state.due[s]}</span></b></div>`).join('');
  $('debt').innerHTML = sum(state.debt) ? `待补欠额 ${SHAPES.filter(s=>state.debt[s]).map(s=>`${INFO[s].symbol}${state.debt[s]}`).join('　')}<br>连续欠额 ${state.debtDays} / 3 天` : '';
  const tomorrow=quota(state.day+1);$('tomorrow').textContent=`明日：${SHAPES.filter(s=>tomorrow[s]).map(s=>`${INFO[s].symbol} ×${tomorrow[s]}`).join('　')}`;
  $('stats').innerHTML = ([['饥饿',state.hunger,'#d5b77d'],['口渴',state.thirst,'#86bfc8'],['精神',state.energy,'#b0bea1']] as const).map(([name,n,color])=>`<div class="stat"><span>${name}</span><div class="stat-track"><i style="width:${n}%;background:${n<40?'#e69b83':color}"></i></div><b>${Math.round(n)}</b></div>`).join('');
  $('inventory').innerHTML = SHAPES.map(s=>`<span title="${INFO[s].name}" style="--shape:${INFO[s].color}"><b>${INFO[s].symbol}</b> ${state.inventory[s]}</span>`).join('');
}
function intro() {
  $('overlay').innerHTML = `<section class="intro"><div class="panel-header"><button class="explain-button" data-action="explain" aria-label="查看说明">?</button></div><h1>四面之间<span>画室生存记</span></h1><div class="intro-actions"><button class="primary" data-action="start">${loaded?'继续生活':'开始第一天'}</button>${loaded?'<button data-action="reset-ask">重新开始</button>':''}</div></section>`;
}
function shell(title: string, eyebrow: string, content: string, cls='') {
  $('overlay').innerHTML = `<section class="panel ${cls}" data-screen="${modal}" role="dialog" aria-modal="true" aria-label="${title}"><header class="panel-header"><button class="explain-button" data-action="explain" aria-label="查看说明">?</button>${modal!=='result'?'<button class="close" data-action="close" aria-label="关闭">×</button>':''}</header>${content}<footer class="panel-footer"><span>${timeLabel(state.minute)}${paused?' · 暂停':''}</span><span>金币 ${state.coins}</span></footer></section>`;
}
function openExplanation() {
  if (explanationOpen) return;
  explanationOpen=true; explanationWasPaused=paused; explanationFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  paused=true; drawingDown=false; autoHeld=false; room.unlock();
  const context:HelpContext = !started&&!modal?'intro':modal??'general';
  $('overlay').inert=true; $('hud').inert=true;
  $('explanation-layer').hidden=false;
  $('explanation-layer').innerHTML=`<section class="panel explanation-window" role="dialog" aria-modal="true" aria-label="操作说明"><header class="panel-header"><button class="close" data-action="close-explanation" aria-label="关闭说明">×</button></header><div class="explanation-content">${explanation(context)}</div></section>`;
  $('explanation-layer').querySelector<HTMLButtonElement>('button')!.focus();metrics();hud();
}
function closeExplanation() {
  if(!explanationOpen)return;
  explanationOpen=false;paused=explanationWasPaused;last=performance.now();
  $('explanation-layer').hidden=true;$('explanation-layer').innerHTML='';$('overlay').inert=false;$('hud').inert=false;
  if(explanationFocus?.isConnected)explanationFocus.focus();
  if(started&&!modal&&!paused)room.lock();
}
function open(next: NonNullable<typeof modal>) {
  if (spinLeft && next !== 'pause' && next !== 'slots') { toast('请等待本次旋转结束'); return; }
  modal=next; paused=next==='pause'||next==='reset'||next==='result';room.unlock();drawingDown=false;autoHeld=false;
  renderPanel();hud();
}
function close() {
  if (spinLeft) { toast('请等待本次旋转结束'); return; }
  if (modal==='result' && state.over) return;
  if (!started) { modal=null;paused=false;intro();return; }
  modal=null;paused=false;$('overlay').innerHTML='';room.lock();save();
  drawingDown=false;autoHeld=false;
}
function renderPanel() {
  if (modal==='work') renderWork();
  if (modal==='shop') renderShop();
  if (modal==='slots') renderSlots();
  if (modal==='bed') shell('今天，做到这里吧','',`<div class="sleep-art">☾</div><div class="summary-grid"><div><span>当前时间</span><b>${timeLabel(state.minute)}</b></div><div><span>次日精神</span><b>${Math.round(Math.max(60,100-Math.max(0,state.minute-1320)/60*10))}</b></div><div><span>今日待交</span><b>${sum(state.due)-sum(state.paid)} 块</b></div><div><span>旧欠额</span><b>${sum(state.debt)} 块</b></div></div><button class="primary full" data-action="sleep">确认睡觉，结束今天</button>`,'narrow');
  if (modal==='letters') shell('书桌','',`<div class="sleep-art">✉</div><div class="center-status">尚未开放</div>`,'narrow');
  if (modal==='bag') renderBag();
  if (modal==='pause') shell('歇一会儿','',`<button class="primary full" data-action="resume">继续游戏</button><label class="volume">音效音量 <input id="volume" aria-label="音效音量" type="range" min="0" max="1" step="0.05" value="${volume}"></label><div class="summary-grid"><div><span>画笔</span><b>Lv.${state.pen}</b></div><div><span>手部控制</span><b>Lv.${state.hand}</b></div><div><span>存款</span><b>${state.bank}</b></div></div><button class="text-button" data-action="reset-ask">重新开始游戏</button>`,'narrow');
  if (modal==='reset') shell('重新开始这段生活？','',`<div class="center-status">清除当前进度并重新开始？</div><div class="button-row"><button data-action="cancel-reset">保留进度</button><button class="danger" data-action="reset">确认重新开始</button></div>`,'narrow');
  if (modal==='result') shell(state.over?'这段生活，暂时结束了':'新的一天，开始了','',`<div class="sleep-art">${state.over?'◇':'☀'}</div><div class="center-status">${state.over?'游戏结束':`第 ${state.day} 天`}</div><div class="summary-grid"><div><span>饥饿</span><b>${Math.round(state.hunger)}</b></div><div><span>口渴</span><b>${Math.round(state.thirst)}</b></div><div><span>精神</span><b>${Math.round(state.energy)}</b></div><div><span>欠额</span><b>${sum(state.debt)} 块</b></div><div><span>连续欠额</span><b>${state.debtDays}/3 天</b></div><div><span>存款</span><b>${state.bank}</b></div></div><button class="primary full" data-action="${state.over?'reset':'close'}">${state.over?'重新开始':'迎接今天'}</button>`,'narrow');
}
function renderShop() {
  const tabs=[['delivery','交付'],['supplies','补给'],['upgrades','成长与挂件'],['bank','存款']];
  let content='';
  if(shopTab==='delivery') content=`<div class="two-column"><div><div class="section-label">今日订单</div>${SHAPES.map(s=>`<div class="delivery-row">${shapeChip(s)}<span>持有 <b>${state.inventory[s]}</b></span><span>今日 ${state.paid[s]} / ${state.due[s]}</span><span class="${state.debt[s]?'warning-text':'muted'}">旧欠 ${state.debt[s]}</span></div>`).join('')}<button class="primary full" data-action="deliver">交付可用图形${state.wageClaimed?'':` · 工资 ${sum(state.due)*8}`}</button></div><div class="side-card"><div class="section-label">售卖 · 3金币/块</div>${SHAPES.map(s=>`<div class="sell-row">${shapeChip(s)}<button data-sell="${s}" ${!state.inventory[s]?'disabled':''}>卖1块</button></div>`).join('')}</div></div>`;
  if(shopTab==='supplies') content=`<div class="product-grid">${(['water','food','books'] as const).map(k=>product(k)).join('')}</div><button class="full" data-action="bag">打开背包</button>`;
  if(shopTab==='upgrades') content=`<div class="product-grid">${(['pen','hand'] as const).map(k=>`<article class="product"><div class="product-symbol">${k==='pen'?'✎':'◎'}</div><h3>${k==='pen'?'画笔':'手部控制'} <span>Lv.${state[k]}</span></h3><button data-upgrade="${k}" ${state[k]>=5||state.coins<CONFIG.upgradeCosts[state[k]-1]?'disabled':''}>${state[k]>=5?'已达最高等级':`${CONFIG.upgradeCosts[state[k]-1]} 金币 · 升级`}</button></article>`).join('')}${(['top','bottom','triple'] as const).map(k=>product(k)).join('')}</div>`;
  if(shopTab==='bank') content=`<div class="bank-balance"><span>存款余额</span><strong>${state.bank.toLocaleString()}</strong><span>金币</span></div><div class="bank-summary">预计利息 <b>+${Math.floor(state.bank*.1)} 金币</b></div><label class="bank-input">操作金额<input id="bank-amount" type="number" min="1" step="1" placeholder="输入金币数量" value="10"></label><div class="button-row"><button class="primary" data-transfer="deposit">存入金币</button><button data-transfer="withdraw">取出金币</button></div><div class="bank-summary">持有 ${state.coins} 金币</div>`;
  shell('补给与交付','',`<nav class="tabs">${tabs.map(([id,name])=>`<button data-tab="${id}" class="${shopTab===id?'active':''}">${name}</button>`).join('')}</nav><div class="tab-content">${content}</div>`,'wide shop-panel');
}
function product(k: keyof typeof PRODUCTS) {
  const p=PRODUCTS[k],isCharm=k==='top'||k==='bottom'||k==='triple',owned=isCharm&&state.charms.includes(k);
  return `<article class="product"><div class="product-symbol">${({water:'◒',food:'▣',books:'▤',top:'☀',bottom:'☾',triple:'☆'})[k]}</div><h3>${p.name}</h3><button data-buy="${k}" ${owned||state.coins<p.price?'disabled':''}>${owned?'已装备':`${p.price} 金币 · 购买`}</button></article>`;
}
function renderBag() {
  shell('随身背包','',`<div class="bag-supplies"><article><h3>◒ 瓶装水 ×${state.water}</h3><button data-use="water" ${!state.water?'disabled':''}>喝水</button></article><article><h3>▣ 便当 ×${state.food}</h3><button data-use="food" ${!state.food?'disabled':''}>吃便当</button></article></div><div class="info-box"><h3>▤ 绘画技能书 ×${state.books}</h3><label>学习图形 <select id="book-shape">${SHAPES.map(s=>`<option value="${s}">${INFO[s].name}</option>`).join('')}</select></label><button data-use="books" ${!state.books?'disabled':''}>阅读</button></div><div class="section-label">熟练度</div><div class="skills">${SHAPES.map(s=>`<div>${shapeChip(s)}<b>Lv.${proficiency(state,s)}</b><small>${state.xp[s]} 点经验</small></div>`).join('')}</div>`,'bag-panel');
}

function renderSlots() {
  const rolling = spinLeft > 0;
  if (!rolling) spinResult = state.slot.last;
  const locked = state.slot.lockedDay === state.day, tray = state.slot.tray, prize = sum(tray), canChoose = !rolling && !locked && !prize;
  if ((prize || locked) && spinResult) { stake = spinResult.stake; bet = spinResult.multiplier; }
  const losses = rolling ? spinResult!.lossesBefore : state.slot.losses;
  const outcome = rolling ? '四列卷轴转动中……' : locked ? '四联炸弹 · 今日停机' : spinResult ? spinResult.wins.length
    ? spinResult.wins.map(w=>`${['上行','中行','下行'][w.row]} ${w.length}连：${shapeName(w.shape)} +${w.reward}`).join(' · ') + (prize ? ' · 待领取' : ' · 已领取')
    : spinResult.refund ? `同图形二联 · 返还 ${spinResult.multiplier} 块${INFO[spinResult.stake].name}${prize?' · 待领取':'，已领取'}`
    : '未中奖' : '待机';
  const options = choice(stake,'data-stake');
  const chips = SHAPES.filter(shape=>tray[shape]).map((shape,i)=>`<span class="payout-group"><span class="payout-stack">${Array.from({length:Math.min(3,tray[shape])},(_,j)=>`<i class="payout-token token-${shape}" style="--drop:${(i*3+j)*.06}s;--tilt:${-12+i*9+j*8}deg;--stack:${j};--shape:${INFO[shape].color}">${INFO[shape].symbol}</i>`).join('')}</span><b>${INFO[shape].name} ×${tray[shape]}</b></span>`).join('');
  shell('图形俱乐部','THE SHAPE CLUB',`<div class="slot-layout"><div class="slot-cabinet ${rolling?'is-playing':''} ${prize&&spinResult?.wins.length?'is-winning':''} ${locked?'is-locked':''}">
    <div class="cabinet-crown"><span class="cabinet-lamp"></span><div class="slot-marquee"><small>FOUR WALLS</small><strong>SHAPE CLUB</strong><span>${locked?'OUT OF SERVICE':prize?'COLLECT YOUR SHAPES':'READY'}</span></div><span class="cabinet-lamp"></span></div>
    <div class="cabinet-bezel"><div class="slot-machine ${rolling?'spinning':''}" id="reels" aria-busy="${rolling}"></div><div class="reel-stop-indicators" aria-hidden="true">${Array.from({length:4},()=>'<i></i>').join('')}</div></div>
    <div id="slot-outcome" class="slot-outcome ${locked?'alarm-text':prize?'prize-text':''}" role="status">${outcome}</div>
    <div class="machine-readouts"><div><span>本次投入</span><b>${INFO[stake].symbol} ×${bet}</b></div><div><span>连续未中</span><b>${losses} 次</b></div><div><span>连败加成</span><b>+${(slotBonus(losses)*100).toFixed(1)}%</b></div></div>
    <div class="machine-controls"><div class="stake-heading">投入图形 <span>当前持有 ${state.inventory[stake]} 块</span></div><div class="shape-options">${canChoose?options:options.replaceAll('<button ','<button disabled ')}</div>
    <div class="bet-and-spin"><div class="bet-selector" aria-label="投注倍率">${SLOT_BETS.map(value=>`<button data-bet="${value}" class="bet-button ${bet===value?'selected':''}" ${!canChoose?'disabled':''}>${value}<small>倍</small></button>`).join('')}</div><button class="spin-button" data-action="spin" ${!canChoose||state.inventory[stake]<bet?'disabled':''}><span>${locked?'停机':rolling?'转动中':prize?'待领取':'开 始'}</span><small>${locked?'次日恢复':rolling?'请稍候':prize?'点击出币口':`投入 ${bet} 块`}</small></button></div></div>
    <div class="outlet-heading"><span>图形出币口</span><small>${prize?'奖励等待领取':'PAYOUT TRAY'}</small></div><button id="payout-tray" class="payout-tray ${prize?'has-payout':''}" data-action="claim-payout" ${rolling||!prize?'disabled':''} aria-label="${prize?`领取 ${prize} 个图形块`:'出币口暂无图形块'}"><span class="outlet-mouth"></span><span class="payout-content">${prize?chips:'<span class="tray-empty">暂无出币</span>'}</span><span class="tray-caption">${prize?`点击领取 · 共 ${prize} 块`:''}</span></button>
    <div class="cabinet-feet"><i></i><span></span><i></i></div>
  </div></div>`,'wide slot-panel');
  slotReels = new SlotReels($('reels'), rolling ? spinStartGrid : spinResult?.grid ?? idleGrid(), rolling ? spinResult!.grid : null, col=>sound(320+col*100,.065));
  stoppedReels = slotReels.update(rolling ? SPIN_DURATION-spinLeft : 0, false);
  slotReels.highlight(activeSlotRows(state.charms),rolling?[]:spinResult?.wins,!rolling&&locked);
  updateReelStatus(stoppedReels);
}
function updateReelStatus(count: number) {
  document.querySelectorAll('.reel-stop-indicators i').forEach((light,col)=>light.classList.toggle('stopped',spinLeft?col<count:!!spinResult));
  if(spinLeft)$('slot-outcome').textContent=count ? count<4?`第 ${count} 列已停下，等待其余卷轴……`:'卷轴已停稳，正在揭晓奖励……' : '四列卷轴转动中……';
}

let strokes: Point[][]=[], drawingDown=false, autoHeld=false, autoMode=false, autoProgress=0, drawPath=outline(selected), lastAssessment={coverage:0,deviation:1,valid:false}, pointer:Point={x:0,y:0}, assessElapsed=0;
function resetDrawing() { strokes=[];drawingDown=false;autoHeld=false;autoMode=false;autoProgress=0;drawPath=outline(selected);lastAssessment={coverage:0,deviation:1,valid:false}; }
function renderWork() {
  const stats=drawingStats(state,selected);
  shell('把今天，画成形状','',`<div class="drawing-layout"><div class="shape-options work-shapes">${choice(selected,'data-shape')}</div><div class="drawing-board"><canvas id="paper" width="640" height="640" aria-label="沿虚线描画${INFO[selected].name}"></canvas></div><div id="draw-metrics"></div><div class="draw-actions"><button class="primary" id="auto-draw" aria-pressed="false">长按自动画图</button><button data-action="clear-drawing">重新描画</button></div><div class="tool-levels"><span>画笔 <b>Lv.${state.pen}</b></span><span>手部 <b>Lv.${state.hand}</b></span><span>熟练度 <b id="drawing-level">Lv.${stats.level}</b></span><span id="drawing-count">${INFO[selected].symbol} ×${state.inventory[selected]}</span></div></div>`,'drawing-panel');
  const canvas=$<HTMLCanvasElement>('paper');
  function position(e:PointerEvent) { const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height}; }
  canvas.onpointerdown=e=>{if(e.button!==0||paused)return;e.preventDefault();if(autoMode)resetDrawing();canvas.setPointerCapture(e.pointerId);pointer=position(e);strokes.push([]);drawingDown=true;sampleInk();metrics();};
  canvas.onpointermove=e=>{pointer=position(e);if(drawingDown){sampleInk();paint();}};
  canvas.onpointerup=()=>{drawingDown=false;if(!paused&&!autoMode)inspectDrawing();};
  canvas.onpointercancel=canvas.onlostpointercapture=()=>{drawingDown=false;};
  const autoButton=$<HTMLButtonElement>('auto-draw');
  const startAuto=()=>{if(paused||explanationOpen)return;if(!autoMode)resetDrawing();autoMode=true;autoHeld=true;drawingDown=false;metrics();};
  const stopAuto=()=>{autoHeld=false;metrics();};
  autoButton.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();autoButton.setPointerCapture(e.pointerId);startAuto();};
  autoButton.onpointerup=autoButton.onpointercancel=autoButton.onlostpointercapture=stopAuto;
  autoButton.onblur=stopAuto;
  autoButton.onkeydown=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();if(!e.repeat)startAuto();}};
  autoButton.onkeyup=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();stopAuto();}};
  paint();metrics();
}
function awardDrawing() {
  const keepHolding=autoMode&&autoHeld;
  finishDrawing(state,selected);save();hud();resetDrawing();
  autoMode=keepHolding;autoHeld=keepHolding;
  const held=$('drawing-count');if(held)held.textContent=`${INFO[selected].symbol} ×${state.inventory[selected]}`;
  const level=$('drawing-level');if(level)level.textContent=`Lv.${proficiency(state,selected)}`;
  paint();metrics();sound(760,.15);toast(`${INFO[selected].symbol} ${INFO[selected].name} +1`);
}
function inspectDrawing() {
  lastAssessment=assess(drawPath,strokes,drawingStats(state,selected).tolerance);
  if(!autoMode&&lastAssessment.valid){awardDrawing();return;}
  metrics();
}
function sampleInk() {
  if(!drawingDown||!strokes.length)return;
  const jitter=drawingStats(state,selected).jitter/640,t=performance.now()/100;
  const p={x:Math.max(0,Math.min(1,pointer.x+Math.sin(t*1.6)*jitter)),y:Math.max(0,Math.min(1,pointer.y+Math.cos(t*1.9)*jitter))};
  const line=strokes[strokes.length-1],last=line.at(-1);
  if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.002) { if(strokes.reduce((n,s)=>n+s.length,0)<6500)line.push(p); }
}
function paint() {
  const c=$<HTMLCanvasElement>('paper')?.getContext('2d');if(!c)return;const size=640;
  c.fillStyle='#f0ead8';c.fillRect(0,0,size,size);c.fillStyle='#d6d1bd';for(let x=24;x<size;x+=24)for(let y=24;y<size;y+=24){c.beginPath();c.arc(x,y,.9,0,Math.PI*2);c.fill();}
  c.strokeStyle='#a4b3a7';c.lineWidth=3;c.setLineDash([7,8]);c.beginPath();drawPath.forEach((p,i)=>i?c.lineTo(p.x*size,p.y*size):c.moveTo(p.x*size,p.y*size));c.closePath();c.stroke();c.setLineDash([]);
  c.lineWidth=3.2;c.lineCap='round';c.lineJoin='round';c.strokeStyle='#354e55';
  for(const line of strokes){c.beginPath();line.forEach((p,i)=>i?c.lineTo(p.x*size,p.y*size):c.moveTo(p.x*size,p.y*size));c.stroke();}
}
function metrics() {
  if(!$('draw-metrics'))return;
  const stats=drawingStats(state,selected),progress=autoMode?autoProgress*100:Math.min(1,lastAssessment.coverage/.9,stats.tolerance/Math.max(stats.tolerance,lastAssessment.deviation))*100;
  $('draw-metrics').innerHTML=`<div class="drawing-progress-label"><span>${autoMode?'自动':'手动'}</span><b>${Math.floor(progress)}%</b></div><div class="progress-track" role="progressbar" aria-label="绘画进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(progress)}"><i style="width:${progress}%"></i></div>`;
  const button=$<HTMLButtonElement>('auto-draw');if(button){button.textContent=autoHeld?'自动绘画中':autoMode&&autoProgress>0?'长按继续画图':'长按自动画图';button.setAttribute('aria-pressed',String(autoHeld));button.classList.toggle('holding',autoHeld);}
}
function settleDay(forced=false) {
  drawingDown=false;resetDrawing();const result=sleep(state);if('blocked' in result&&result.blocked)return;save();lastResult=result.failed?'交付处再也没有传来回音。':`${forced?'凌晨两点，你疲惫地睡着了。':'你放下了今天的忙碌。'} 存款利息 +${result.interest} 金币。`;open('result');sound(result.failed?180:620,.3);
}

$('overlay').addEventListener('click',e=>{
  const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled)return;
  sound();const action=b.dataset.action;
  if(b.dataset.tab){shopTab=b.dataset.tab;renderShop();return;}
  if(b.dataset.shape){selected=b.dataset.shape as Shape;resetDrawing();renderWork();return;}
  if(b.dataset.stake&&!spinLeft){stake=b.dataset.stake as Shape;renderSlots();return;}
  if(b.dataset.bet&&!spinLeft){const value=Number(b.dataset.bet) as Bet;if(SLOT_BETS.includes(value)){bet=value;renderSlots();}return;}
  if(b.dataset.buy){if(buy(state,b.dataset.buy as keyof typeof PRODUCTS)){toast('购买成功');save();hud();renderShop();}return;}
  if(b.dataset.upgrade){if(upgrade(state,b.dataset.upgrade as 'pen'|'hand')){toast('升级成功');save();hud();renderShop();}return;}
  if(b.dataset.sell){sell(state,b.dataset.sell as Shape);save();hud();renderShop();return;}
  if(b.dataset.use){const shape=$<HTMLSelectElement>('book-shape').value as Shape;useItem(state,b.dataset.use as 'water'|'food'|'books',shape);save();hud();renderBag();return;}
  if(b.dataset.transfer){const n=Number($<HTMLInputElement>('bank-amount').value);if(!transfer(state,n,b.dataset.transfer==='deposit'))toast('金额无效或余额不足');else{save();hud();renderShop();}return;}
  if(action==='start'){started=true;modal=null;$('hud').hidden=false;$('overlay').innerHTML='';save();hud();if(state.over){lastResult='这段生活已结束，你可以从第一天重新开始。';open('result');return;}if(state.slot.round){open('slots');return;}room.lock();return;}
  if(action==='close'||action==='resume'){if(spinLeft){modal='slots';paused=false;renderSlots();}else close();return;}
  if(action==='bag'){open('bag');return;}
  if(action==='explain'||action==='help'){openExplanation();return;}
  if(action==='reset-ask'){open('reset');return;}
  if(action==='cancel-reset'){if(started)open('pause');else close();return;}
  if(action==='reset'){state=fresh();volume=state.volume;loaded=false;started=true;spinLeft=0;spinResult=null;stake='triangle';bet=1;slotReels=null;resetDrawing();room.camera.position.set(0,1.65,3.7);room.yaw=0;room.pitch=-.08;$('hud').hidden=false;save();close();hud();return;}
  if(action==='clear-drawing'){resetDrawing();paint();metrics();return;}
  if(action==='deliver'){const r=deliver(state);toast(`交付 ${r.delivered} 块${r.wage?`，工资 +${r.wage} 金币`:''}`);save();hud();renderShop();return;}
  if(action==='sleep'){settleDay();return;}
  if(action==='spin'){
    if(spinLeft)return;
    const result=spin(state,stake,bet);
    if(result){spinStartGrid=state.slot.last?.grid??idleGrid();spinResult=result;spinLeft=SPIN_DURATION;save();hud();renderSlots();sound(250,.2);}
    return;
  }
  if(action==='claim-payout'){
    if(spinLeft)return;
    const claimed=claimSlotPayout(state);if(sum(claimed)){save();hud();renderSlots();toast(`已领取 ${SHAPES.filter(shape=>claimed[shape]).map(shape=>`${INFO[shape].name} ×${claimed[shape]}`).join('、')}`);sound(860,.18);}
    return;
  }
});
$('overlay').addEventListener('input',e=>{if((e.target as HTMLElement).id==='volume'){volume=Number((e.target as HTMLInputElement).value);save();}});
$('pause-button').onclick=()=>open('pause');$('bag-button').onclick=()=>open('bag');$('help-button').onclick=()=>openExplanation();
$('explanation-layer').onclick=e=>{if((e.target as HTMLElement).closest('[data-action="close-explanation"]'))closeExplanation();};
$('world').onclick=()=>{if(started&&!modal){const target=room.locked?room.target():null;if(target){if(target==='work')resetDrawing();if(target==='shop')shopTab='delivery';open(target);}else room.lock();}};
document.addEventListener('pointerlockchange',()=>{if(started&&!document.pointerLockElement&&!modal&&!explanationOpen){open('pause');}});
document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden&&started){save();drawingDown=false;autoHeld=false;if(!modal&&!explanationOpen)open('pause');}});
addEventListener('blur',()=>{drawingDown=false;autoHeld=false;metrics();});
addEventListener('beforeunload',()=>{if(started)save();});
addEventListener('keydown',e=>{
  if(e.repeat||['INPUT','SELECT'].includes((e.target as HTMLElement).tagName))return;
  if(explanationOpen){if(['Escape','KeyH'].includes(e.code)){e.preventDefault();closeExplanation();}else if(e.code==='Tab'){e.preventDefault();$('explanation-layer').querySelector<HTMLButtonElement>('button')?.focus();}return;}
  if(e.code==='KeyH'){e.preventDefault();openExplanation();return;}
  if(!started)return;
  if(e.code==='Escape'){e.preventDefault();if(modal==='result'||modal==='reset')return;if(spinLeft){if(paused){modal='slots';paused=false;renderSlots();}else open('pause');}else if(modal)close();else open('pause');}
  if(e.code==='KeyE'&&!modal&&room.locked){const t=room.target();if(t){if(t==='work')resetDrawing();if(t==='shop')shopTab='delivery';open(t);}}
  if(e.code==='KeyB'&&!spinLeft&&modal!=='result'){if(modal==='bag')close();else open('bag');}
});
let last=performance.now(),hudElapsed=0;
function frame(now:number){
  const dt=Math.min(1,(now-last)/1000);last=now;
  const active=started&&!paused&&!document.hidden&&!state.over;
  if(active){
    tick(state,dt);saveElapsed+=dt;
    if(modal==='work'){
      if(autoMode&&autoHeld){autoProgress=Math.min(1,autoProgress+dt/drawingStats(state,selected).seconds);strokes=[traceOutline(drawPath,autoProgress)];paint();if(autoProgress>=1)awardDrawing();}
      else if(drawingDown){sampleInk();paint();}
      assessElapsed+=dt;if(assessElapsed>.1){assessElapsed=0;if(autoMode)metrics();else inspectDrawing();}
    }
    if(spinLeft){
      spinLeft=Math.max(0,spinLeft-dt);
      if(modal==='slots'&&slotReels){const count=slotReels.update(SPIN_DURATION-spinLeft);if(count!==stoppedReels){stoppedReels=count;updateReelStatus(count);}}
      if(!spinLeft){const revealed=revealSpin(state);spinResult=revealed??state.slot.last;save();if(modal==='slots')renderSlots();hud();sound(revealed?.bomb?130:revealed?.wins.length?820:revealed?.refund?520:240,.25);}
    }
    if(state.minute>=CONFIG.dayEnd&&!spinLeft)settleDay(true);
    if(saveElapsed>5){saveElapsed=0;save();}
  }
  room.update(dt,active&&!modal);
  hudElapsed+=dt;if(hudElapsed>.25){hudElapsed=0;if(started)hud();const footer=document.querySelector('.panel-footer span');if(footer)footer.textContent=`${timeLabel(state.minute)}${paused?' · 暂停':''}`;}
  const target=active&&!modal?room.target():null;
  $('interaction').innerHTML=target?`<kbd>E</kbd> ${STATION_NAMES[target]}`:started&&!modal&&!room.locked?'点击画面，继续观察房间':'';
  requestAnimationFrame(frame);
}
intro();hud();requestAnimationFrame(frame);
