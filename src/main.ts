import './style.css';
import { Room, STATION_NAMES, type Station } from './room';
import { SHAPES, INFO, CONFIG, PRODUCTS, SAVE_KEY, fresh, decode, quota, sum, timeLabel, tick, drawingStats, proficiency, finishDrawing, deliver, sleep, buy, useItem, upgrade, transfer, sell, spin, type Shape } from './game';
import { outline, assess, type Point } from './drawing';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="world"></div><div class="vignette"></div>
  <div id="hud" hidden>
    <header class="topbar"><div class="brand"><span class="brand-mark">◈</span> 四面之间 <span class="edition">画室生存记</span></div><div class="day-clock"><b id="day"></b><span id="clock"></span></div><div class="wallet"><span class="coin-icon">●</span> <b id="coins"></b><span>金币</span><button class="icon-button" id="pause-button" aria-label="暂停">Ⅱ</button></div></header>
    <div class="compass"><span>工作区</span><i></i><span>补给与交付</span><i></i><span>休息区</span><i></i><span>图形俱乐部</span></div>
    <aside class="task-card"><div class="eyebrow">TODAY’S COMMISSION</div><h2>今日交付 <span id="task-status"></span></h2><div id="task-list"></div><div id="debt" class="debt"></div><p id="tomorrow"></p></aside>
    <div class="crosshair">·</div><div id="interaction"></div>
    <section class="bottom-left"><div class="stats" id="stats"></div><div class="inventory" id="inventory"></div></section>
    <div class="bottom-right"><button id="bag-button">背包 <kbd>B</kbd></button><button id="help-button">操作 <kbd>H</kbd></button><span id="save-status">本地自动存档</span></div>
    <div id="walk-hint">W A S D 移动 <span>·</span> 鼠标观察 <span>·</span> E 互动 <span>·</span> Esc 暂停</div>
  </div>
  <div id="overlay"></div><div id="toasts" aria-live="polite"></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let state = fresh(), loaded = false;
try { const saved = decode(localStorage.getItem(SAVE_KEY)); if (saved) { state = saved; loaded = true; } } catch { /* Play remains available if storage is blocked. */ }
let room: Room;
try { room = new Room($('world')); } catch {
  $('overlay').innerHTML = '<section class="panel"><h1>暂时无法启动3D场景</h1><p>请在支持 WebGL 的电脑浏览器中打开，并开启浏览器的硬件加速。</p></section>';
  throw new Error('WebGL unavailable');
}
let started = false, paused = false, modal: Station | 'bag' | 'help' | 'pause' | 'result' | 'reset' | null = null;
let shopTab = 'delivery', selected: Shape = 'triangle', stake: Shape = 'triangle';
let spinLeft = 0, spinResult: ReturnType<typeof spin> = null, lastResult = '', saveElapsed = 0;
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
  $('overlay').innerHTML = `<section class="intro"><div class="eyebrow">A SMALL ROOM. ANOTHER DAY.</div><h1>四面之间<span>画室生存记</span></h1><p>一张画桌，一间房子。<br>用画出的形状，换取明天的生活。</p><div class="intro-actions"><button class="primary" data-action="start">${loaded?'继续生活':'开始第一天'}</button>${loaded?'<button data-action="reset-ask">重新开始</button>':''}</div><div class="intro-guide"><span>△ 描画图形</span><span>□ 完成交付</span><span>☆ 把握运气</span><span>○ 好好休息</span></div><small>电脑键盘与鼠标游玩 · 进度自动保存在此浏览器</small></section>`;
}
function shell(title: string, eyebrow: string, content: string, cls='') {
  $('overlay').innerHTML = `<section class="panel ${cls}" role="dialog" aria-modal="true" aria-label="${title}"><header class="panel-header"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${modal!=='result'?'<button class="close" data-action="close" aria-label="关闭">×</button>':''}</header>${content}<footer class="panel-footer"><span>${paused?'时间已暂停':'时间正在流逝'} · ${timeLabel(state.minute)}</span><span>${modal==='work'?'按住左键沿虚线描画':'Esc 关闭 / 暂停'} · 金币 ${state.coins}</span></footer></section>`;
}
function open(next: NonNullable<typeof modal>) {
  if (spinLeft && next !== 'pause') { toast('请等待本次旋转结束'); return; }
  modal=next; paused=next==='pause'||next==='help'||next==='reset'||next==='result';room.unlock();drawingDown=false;
  renderPanel();hud();
}
function close() {
  if (spinLeft) { toast('请等待本次旋转结束'); return; }
  if (modal==='result' && state.over) return;
  if (!started) { modal=null;paused=false;intro();return; }
  modal=null;paused=false;$('overlay').innerHTML='';room.lock();save();
}
function renderPanel() {
  if (modal==='work') renderWork();
  if (modal==='shop') renderShop();
  if (modal==='slots') renderSlots();
  if (modal==='bed') shell('今天，做到这里吧','REST & RECOVER',`<div class="sleep-art">☾</div><p class="lead">现在是 ${timeLabel(state.minute)}，明天又是新的一天。</p><div class="info-box">22:00前入睡，次日精神恢复至100。之后每晚睡1小时少恢复10点，最低60。<br>当前预计恢复：<b>${Math.round(Math.max(60,100-Math.max(0,state.minute-1320)/60*10))}</b></div><div class="info-box ${sum(state.due)-sum(state.paid)+sum(state.debt)?'warning':''}">今日待交 ${sum(state.due)-sum(state.paid)} 块 · 旧欠 ${sum(state.debt)} 块<br>${sum(state.due)-sum(state.paid)+sum(state.debt)?'未交部分将记入欠额，连续3个日结仍欠额将结束游戏。':'今天的任务已完成，可以安心休息。'}</div><button class="primary full" data-action="sleep">确认睡觉，结束今天</button>`);
  if (modal==='letters') shell('留给外面的信','LETTERS',`<div class="letter-paper"><span>亲爱的，</span><p>这里有一张画桌。<br>我每天画一些形状，换一些食物。<br>如果有一天你收到这封信……</p><span class="muted">写信功能将在后续开放。</span></div>`);
  if (modal==='bag') renderBag();
  if (modal==='help') shell('房间里的生活指南','HOW TO PLAY',`<div class="help-grid"><article><h3>走近，开始生活</h3><p>WASD移动，鼠标观察。看向附近物品，按E互动。B打开背包，Esc暂停；点击画面恢复鼠标控制。</p></article><article><h3>△ 工作区</h3><p>选图形，按住左键沿虚线描画。覆盖90%以上、偏差合格并完成作画时间后收取。画笔、手部控制和熟练度能改善绘画。</p></article><article><h3>□ 补给与交付</h3><p>每日轮换两种图形。交付优先偿还旧欠，当日交足自动领薪。多余图形每块卖3金币。水和食物需在背包使用。</p></article><article><h3>☆ 图形俱乐部</h3><p>每次投入1块图形，查看中间行从左起的连续图形。三连得5块，四连得15块。挂件可以开启其他行或增加奖励。</p></article><article><h3>○ 休息区</h3><p>一天约15分钟，凌晨02:00强制睡觉。越早休息，次日精神越好。连续3个日结仍有欠额，游戏结束。</p></article><article><h3>给明天做准备</h3><p>存款每天结算10%利息，向下取整。饥饿、口渴、精神低于40影响绘画。暂停或切到其他页面时，时间停止。</p></article></div><button class="primary full" data-action="close">明白了</button>`);
  if (modal==='pause') shell('歇一会儿','TAKE A BREATH',`<p class="lead">房间会等你回来。</p><button class="primary full" data-action="resume">继续游戏</button><button class="full" data-action="help">操作指南</button><label class="volume">音效音量 <input id="volume" aria-label="音效音量" type="range" min="0" max="1" step="0.05" value="${volume}"></label><p class="muted">画笔 Lv.${state.pen} · 手部控制 Lv.${state.hand} · 存款 ${state.bank} 金币</p><button class="text-button" data-action="reset-ask">重新开始游戏</button>`,'narrow');
  if (modal==='reset') shell('重新开始这段生活？','NEW BEGINNING',`<p class="lead">将清除当前浏览器中的游戏进度，从第一天重新开始。</p><div class="button-row"><button data-action="cancel-reset">保留进度</button><button class="danger" data-action="reset">确认重新开始</button></div>`,'narrow');
  if (modal==='result') shell(state.over?'这段生活，暂时结束了':'新的一天，开始了',state.over?'END OF THIS CHAPTER':'A NEW DAY',`<div class="sleep-art">${state.over?'◇':'☀'}</div><p class="lead">${lastResult}</p><div class="info-box">${state.over?`你坚持到了第 ${state.day} 天。连续3个日结仍有欠额。`:`第 ${state.day} 天 · 08:00<br>饥饿 ${Math.round(state.hunger)} · 口渴 ${Math.round(state.thirst)} · 精神 ${Math.round(state.energy)}<br>待补欠额 ${sum(state.debt)} 块 · 连续欠额 ${state.debtDays}/3 天`}</div><button class="primary full" data-action="${state.over?'reset':'close'}">${state.over?'重新开始':'迎接今天'}</button>`,'narrow');
}
function renderShop() {
  const tabs=[['delivery','交付'],['supplies','补给'],['upgrades','成长与挂件'],['bank','存款']];
  let content='';
  if(shopTab==='delivery') content=`<div class="two-column"><div><h3>今日订单</h3><p class="muted">交付时优先补齐旧欠，再完成今天的订单。</p>${SHAPES.map(s=>`<div class="delivery-row">${shapeChip(s)}<span>持有 <b>${state.inventory[s]}</b></span><span>今日 ${state.paid[s]} / ${state.due[s]}</span><span class="${state.debt[s]?'warning-text':'muted'}">旧欠 ${state.debt[s]}</span></div>`).join('')}<button class="primary full" data-action="deliver">交付可用图形${state.wageClaimed?'':` · 交足领 ${sum(state.due)*8} 金币`}</button></div><div class="side-card"><h3>出售多余图形</h3><p>每块售价 <b>3 金币</b>。<br>记得为明天留一些。</p>${SHAPES.map(s=>`<div class="sell-row">${shapeChip(s)}<button data-sell="${s}" ${!state.inventory[s]?'disabled':''}>卖1块</button></div>`).join('')}<p class="muted">${state.wageClaimed?'今日工资已领取。':'完成全部当日要求后自动领薪。'}</p></div></div>`;
  if(shopTab==='supplies') content=`<p class="muted">购买后放入背包，使用时生效。按 B 可以随时打开背包。</p><div class="product-grid">${(['water','food','books'] as const).map(k=>product(k)).join('')}</div><button class="full" data-action="bag">打开背包</button>`;
  if(shopTab==='upgrades') content=`<div class="product-grid">${(['pen','hand'] as const).map(k=>`<article class="product"><div class="product-symbol">${k==='pen'?'✎':'◎'}</div><h3>${k==='pen'?'画笔':'手部控制'} <span>Lv.${state[k]}</span></h3><p>${k==='pen'?'提高作画速度，缩短每张画的完成时间。':'减少落笔时的抖动，让线条更稳定。'}</p><button data-upgrade="${k}" ${state[k]>=5||state.coins<CONFIG.upgradeCosts[state[k]-1]?'disabled':''}>${state[k]>=5?'已达最高等级':`${CONFIG.upgradeCosts[state[k]-1]} 金币 · 升级`}</button></article>`).join('')}${(['top','bottom','triple'] as const).map(k=>product(k)).join('')}</div>`;
  if(shopTab==='bank') content=`<div class="bank-balance"><span>存款余额</span><strong>${state.bank.toLocaleString()}</strong><span>金币</span></div><div class="info-box">每日利率 10% · 日结时向下取整<br>按当前余额，今晚可获得 <b>${Math.floor(state.bank*.1)}</b> 金币利息。</div><label class="bank-input">操作金额<input id="bank-amount" type="number" min="1" step="1" placeholder="输入金币数量" value="10"></label><div class="button-row"><button class="primary" data-transfer="deposit">存入金币</button><button data-transfer="withdraw">取出金币</button></div><p class="muted">身上有 ${state.coins} 金币。存款可随时取出。</p>`;
  shell('补给与交付','THE EXCHANGE',`<nav class="tabs">${tabs.map(([id,name])=>`<button data-tab="${id}" class="${shopTab===id?'active':''}">${name}</button>`).join('')}</nav><div class="tab-content">${content}</div>`,'wide');
}
function product(k: keyof typeof PRODUCTS) {
  const p=PRODUCTS[k],isCharm=k==='top'||k==='bottom'||k==='triple',owned=isCharm&&state.charms.includes(k);
  return `<article class="product"><div class="product-symbol">${({water:'◒',food:'▣',books:'▤',top:'☀',bottom:'☾',triple:'☆'})[k]}</div><h3>${p.name}</h3><p>${p.desc}</p><button data-buy="${k}" ${owned||state.coins<p.price?'disabled':''}>${owned?'已装备':`${p.price} 金币 · 购买`}</button></article>`;
}
function renderBag() {
  shell('随身背包','YOUR BELONGINGS',`<div class="bag-supplies"><article><h3>◒ 瓶装水 ×${state.water}</h3><p>恢复50口渴</p><button data-use="water" ${!state.water?'disabled':''}>喝水</button></article><article><h3>▣ 便当 ×${state.food}</h3><p>恢复40饥饿</p><button data-use="food" ${!state.food?'disabled':''}>吃便当</button></article></div><div class="info-box"><h3>▤ 绘画技能书 ×${state.books}</h3><label>学习图形 <select id="book-shape">${SHAPES.map(s=>`<option value="${s}">${INFO[s].name}</option>`).join('')}</select></label><button data-use="books" ${!state.books?'disabled':''}>阅读 · 熟练度增加5</button></div><h3>绘画熟练度</h3><div class="skills">${SHAPES.map(s=>`<div>${shapeChip(s)}<b>Lv.${proficiency(state,s)}</b><small>${state.xp[s]} 点经验</small></div>`).join('')}</div><p class="muted">成功完成一张画获得1点经验，每5点提升1级，最高5级。</p>`);
}
function renderSlots() {
  const grid=spinResult?.grid;
  shell('图形俱乐部','THE SHAPE CLUB',`<div class="slot-layout"><div><div class="slot-marquee">GOOD SHAPES · GOOD LUCK</div><div class="slot-machine ${spinLeft?'spinning':''}" id="reels">${Array.from({length:3},(_,row)=>`<div class="reel-row ${row===1||state.charms.includes(row===0?'top':'bottom')?'enabled':'disabled-line'} ${spinResult?.wins.some(w=>w.row===row)&&!spinLeft?'winning':''}">${Array.from({length:4},(_,col)=>{const s=grid?.[row][col]||SHAPES[(row+col)%4];return `<div class="reel" style="--shape:${INFO[s].color}">${INFO[s].symbol}</div>`;}).join('')}</div>`).join('')}</div><div id="slot-outcome" class="slot-outcome">${spinLeft?'图形正在转动……':spinResult?spinResult.wins.length?spinResult.wins.map(w=>`${['上行','中行','下行'][w.row]} ${w.length}连：${shapeName(w.shape)} +${w.reward}`).join(' · '):'没有连成图形。下次会有好运吗？':'中间行，从最左侧开始，寻找相同形状。'}</div><div class="shape-options">${choice(stake,'data-stake')}</div><button class="primary full" data-action="spin" ${spinLeft||!state.inventory[stake]?'disabled':''}>${spinLeft?'旋转中……':`投入1块${INFO[stake].name} · 开始旋转`}</button></div><aside class="side-card"><h3>奖励规则</h3><div class="payout"><span>同图形三连</span><b>${state.charms.includes('triple')?6:5} 块</b></div><div class="payout"><span>同图形四连</span><b>15 块</b></div><p>奖励为连线对应的图形块。四连只领取四连奖励。</p><p>四种图形等概率，各格独立。基础仅中间行生效，必须从最左列连续。</p><h3>已装备挂件</h3><p>${state.charms.length?state.charms.map(c=>PRODUCTS[c].name).join('、'):'暂无 · 可在商店购买'}</p><p class="warning-text">会损失投入的图形块，请为每日交付留足材料。</p></aside></div>`,'wide slot-panel');
}

let strokes: Point[][]=[], drawingDown=false, drawSeconds=0, drawPath=outline(selected), lastAssessment={coverage:0,deviation:1,valid:false}, pointer:Point={x:0,y:0}, assessElapsed=0;
function resetDrawing() { strokes=[];drawingDown=false;drawSeconds=0;drawPath=outline(selected);lastAssessment={coverage:0,deviation:1,valid:false}; }
function renderWork() {
  const stats=drawingStats(state,selected);
  shell('把今天，画成形状','THE WORKSHOP',`<div class="drawing-layout"><div class="drawing-board"><div class="paper-label">${INFO[selected].name}练习 <span>按住鼠标左键描画</span></div><canvas id="paper" width="640" height="640" aria-label="沿虚线描画${INFO[selected].name}"></canvas></div><aside class="drawing-sidebar"><div class="eyebrow">CHOOSE YOUR SHAPE</div><div class="shape-options">${choice(selected,'data-shape')}</div><p class="muted">沿虚线描画，可松开后继续。图形覆盖与线条偏差同时决定是否合格。</p><div id="draw-metrics"></div><div class="tool-levels"><span>画笔 <b>Lv.${state.pen}</b></span><span>手部控制 <b>Lv.${state.hand}</b></span><span>当前熟练度 <b>Lv.${stats.level}</b></span></div><button class="primary full" id="collect" data-action="collect" disabled>完成后收取图形</button><button class="full" data-action="clear-drawing">重新描画</button><p class="muted">低状态会降低绘画速度与稳定性。当前图形持有 ${state.inventory[selected]} 块。</p></aside></div>`,'wide drawing-panel');
  const canvas=$<HTMLCanvasElement>('paper');
  function position(e:PointerEvent) { const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height}; }
  canvas.onpointerdown=e=>{if(e.button!==0||paused)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);pointer=position(e);strokes.push([]);drawingDown=true;sampleInk();};
  canvas.onpointermove=e=>{pointer=position(e);if(drawingDown){sampleInk();paint();}};
  canvas.onpointerup=canvas.onpointercancel=()=>{drawingDown=false;};
  paint();metrics();
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
  const stats=drawingStats(state,selected),progress=Math.min(100,drawSeconds/stats.seconds*100),ready=lastAssessment.valid&&progress>=100;
  $('draw-metrics').innerHTML=`<div class="metric"><span>轮廓覆盖</span><b>${Math.round(lastAssessment.coverage*100)}% / 90%</b></div><div class="metric"><span>平均偏差</span><b>${strokes.flat().length?(lastAssessment.deviation*100).toFixed(1):'0'}% / ${(stats.tolerance*100).toFixed(1)}%</b></div><div class="metric"><span>作画进度</span><b>${Math.floor(progress)}%</b></div><div class="progress-track"><i style="width:${progress}%"></i></div><p class="draw-status ${ready?'done':''}">${ready?'线条合格，可以收取！':progress<100?`持续落笔完成作画，约需 ${Math.ceil(stats.seconds)} 秒`:'请补全虚线；偏差过大可重新描画。'}</p>`;
  $<HTMLButtonElement>('collect').disabled=!ready;
}
function settleDay(forced=false) {
  drawingDown=false;resetDrawing();const result=sleep(state);save();lastResult=result.failed?'交付处再也没有传来回音。':`${forced?'凌晨两点，你疲惫地睡着了。':'你放下了今天的忙碌。'} 存款利息 +${result.interest} 金币。`;open('result');sound(result.failed?180:620,.3);
}

$('overlay').addEventListener('click',e=>{
  const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled)return;
  sound();const action=b.dataset.action;
  if(b.dataset.tab){shopTab=b.dataset.tab;renderShop();return;}
  if(b.dataset.shape){selected=b.dataset.shape as Shape;resetDrawing();renderWork();return;}
  if(b.dataset.stake&&!spinLeft){stake=b.dataset.stake as Shape;renderSlots();return;}
  if(b.dataset.buy){if(buy(state,b.dataset.buy as keyof typeof PRODUCTS)){toast('购买成功，补给已放入背包；挂件自动装备。');save();hud();renderShop();}return;}
  if(b.dataset.upgrade){if(upgrade(state,b.dataset.upgrade as 'pen'|'hand')){toast('升级成功');save();hud();renderShop();}return;}
  if(b.dataset.sell){sell(state,b.dataset.sell as Shape);save();hud();renderShop();return;}
  if(b.dataset.use){const shape=$<HTMLSelectElement>('book-shape').value as Shape;useItem(state,b.dataset.use as 'water'|'food'|'books',shape);save();hud();renderBag();return;}
  if(b.dataset.transfer){const n=Number($<HTMLInputElement>('bank-amount').value);if(!transfer(state,n,b.dataset.transfer==='deposit'))toast('请输入有效的整数金额，并确认余额充足。');else{save();hud();renderShop();}return;}
  if(action==='start'){started=true;modal=null;$('hud').hidden=false;$('overlay').innerHTML='';save();hud();if(state.over){lastResult='这段生活已结束，你可以从第一天重新开始。';open('result');return;}room.lock();toast('走近正前方的画桌，看向桌面并按 E 开始绘画。');return;}
  if(action==='close'||action==='resume'){if(spinLeft){modal='slots';paused=false;renderSlots();}else close();return;}
  if(action==='bag'){open('bag');return;}
  if(action==='help'){open('help');return;}
  if(action==='reset-ask'){open('reset');return;}
  if(action==='cancel-reset'){if(started)open('pause');else close();return;}
  if(action==='reset'){state=fresh();volume=state.volume;loaded=false;started=true;spinLeft=0;spinResult=null;resetDrawing();room.camera.position.set(0,1.65,3.7);room.yaw=0;room.pitch=-.08;$('hud').hidden=false;save();close();hud();return;}
  if(action==='clear-drawing'){resetDrawing();paint();metrics();return;}
  if(action==='collect'){lastAssessment=assess(drawPath,strokes,drawingStats(state,selected).tolerance);if(lastAssessment.valid&&drawSeconds>=drawingStats(state,selected).seconds){finishDrawing(state,selected);toast(`完成${INFO[selected].name} +1 · 熟练度 +1`);sound(760,.2);save();hud();resetDrawing();renderWork();}return;}
  if(action==='deliver'){const r=deliver(state);toast(`交付 ${r.delivered} 块${r.wage?`，工资 +${r.wage} 金币`:''}`);save();hud();renderShop();return;}
  if(action==='sleep'){settleDay();return;}
  if(action==='spin'){const result=spin(state,stake);if(result){spinResult=result;spinLeft=2.2;save();hud();renderSlots();sound(250,.2);}return;}
});
$('overlay').addEventListener('input',e=>{if((e.target as HTMLElement).id==='volume'){volume=Number((e.target as HTMLInputElement).value);save();}});
$('pause-button').onclick=()=>open('pause');$('bag-button').onclick=()=>open('bag');$('help-button').onclick=()=>open('help');
$('world').onclick=()=>{if(started&&!modal){const target=room.locked?room.target():null;if(target){if(target==='work')resetDrawing();if(target==='shop')shopTab='delivery';open(target);}else room.lock();}};
document.addEventListener('pointerlockchange',()=>{if(started&&!document.pointerLockElement&&!modal){open('pause');}});
document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden&&started){save();drawingDown=false;if(!modal)open('pause');}});
addEventListener('beforeunload',()=>{if(started)save();});
addEventListener('keydown',e=>{
  if(!started||e.repeat||['INPUT','SELECT'].includes((e.target as HTMLElement).tagName))return;
  if(e.code==='Escape'){e.preventDefault();if(modal==='result'||modal==='reset')return;if(modal)close();else open('pause');}
  if(e.code==='KeyE'&&!modal&&room.locked){const t=room.target();if(t){if(t==='work')resetDrawing();if(t==='shop')shopTab='delivery';open(t);}}
  if(e.code==='KeyB'&&!spinLeft&&modal!=='result'){if(modal==='bag')close();else open('bag');}
  if(e.code==='KeyH'&&!spinLeft&&modal!=='result'){if(modal==='help')close();else open('help');}
});
let last=performance.now(),hudElapsed=0;
function frame(now:number){
  const dt=Math.min(1,(now-last)/1000);last=now;
  const active=started&&!paused&&!document.hidden&&!state.over;
  if(active){
    tick(state,dt);saveElapsed+=dt;
    if(modal==='work'){
      if(drawingDown){drawSeconds+=dt;sampleInk();paint();}
      assessElapsed+=dt;if(assessElapsed>.2){assessElapsed=0;lastAssessment=assess(drawPath,strokes,drawingStats(state,selected).tolerance);metrics();}
    }
    if(spinLeft){spinLeft=Math.max(0,spinLeft-dt);if(!spinLeft){if(modal==='slots')renderSlots();sound(spinResult?.wins.length?820:240,.25);}}
    if(state.minute>=CONFIG.dayEnd&&!spinLeft)settleDay(true);
    if(saveElapsed>5){saveElapsed=0;save();}
  }
  room.update(dt,active&&!modal);
  hudElapsed+=dt;if(hudElapsed>.25){hudElapsed=0;if(started)hud();const footer=document.querySelector('.panel-footer span');if(footer)footer.textContent=`${paused?'时间已暂停':'时间正在流逝'} · ${timeLabel(state.minute)}`;}
  const target=active&&!modal?room.target():null;
  $('interaction').innerHTML=target?`<kbd>E</kbd> ${STATION_NAMES[target]}`:started&&!modal&&!room.locked?'点击画面，继续观察房间':'';
  requestAnimationFrame(frame);
}
intro();hud();requestAnimationFrame(frame);
