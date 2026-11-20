import type { Room } from './room';

const moves = [
  ['turn-left', '左转', '↶'], ['forward', '前进', '↑'], ['turn-right', '右转', '↷'],
  ['left', '左移', '←'], ['interact', '互动', '◎'], ['right', '右移', '→'],
  ['look-down', '低头', '⌄'], ['back', '后退', '↓'], ['look-up', '抬头', '⌃'],
] as const;
export class TouchControls {
  private media = matchMedia('(pointer: coarse) and (max-width: 1000px)');
  private held = new Map<number, string>();
  private drag: { id: number; x: number; y: number; distance: number } | null = null;
  private playing = false;
  hand: 'left' | 'right' = 'right';
  constructor(private host: HTMLElement, private room: Room, private canPlay: () => boolean, private interact: () => void, quick: (action: string) => void) {
    try { if(localStorage.getItem('four-walls-touch-hand')==='left')this.hand='left'; } catch { /* Optional preference. */ }
    host.innerHTML = `<div class="touch-quick">${[['tasks','任务'],['bag','背包'],['save','保存'],['pause','暂停'],['help','?']].map(([id,label])=>`<button data-touch-quick="${id}" aria-label="${id==='help'?'操作说明':label}">${label}</button>`).join('')}</div><div class="touch-pad">${moves.map(([id,label,icon])=>`<button data-touch="${id}" aria-label="${label}"${id==='interact'?' id="touch-interact" disabled':''}><b aria-hidden="true">${icon}</b><span>${label}</span></button>`).join('')}</div>`;
    const mode = () => {
      this.clear();this.room.setTouchMode(this.media.matches);
      document.documentElement.classList.toggle('touch-ui',this.room.touchMode);
      host.dataset.hand=this.hand;
      if(this.room.touchMode)this.room.unlock();
    };
    mode();this.media.addEventListener('change',mode);
    host.addEventListener('contextmenu',e=>e.preventDefault());
    host.addEventListener('click',e=>{
      const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled||!this.canPlay())return;
      if(b.dataset.touch==='interact')this.interact();
      if(b.dataset.touchQuick)quick(b.dataset.touchQuick);
    });
    host.addEventListener('pointerdown',e=>{
      const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-touch]');
      if(!b||b.disabled||b.dataset.touch==='interact'||!this.canPlay()||e.button!==0)return;
      e.preventDefault();b.setPointerCapture(e.pointerId);this.held.set(e.pointerId,b.dataset.touch!);this.markHeld();
    });
    host.addEventListener('pointermove',e=>{
      if(!this.held.has(e.pointerId))return;
      const b=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLButtonElement>('[data-touch]');
      this.held.set(e.pointerId,b&&this.host.contains(b)&&b.dataset.touch!=='interact'?b.dataset.touch!:'');this.markHeld();
    });
    const release=(e:PointerEvent)=>{this.held.delete(e.pointerId);this.markHeld();};
    host.addEventListener('pointerup',release);host.addEventListener('pointercancel',release);host.addEventListener('lostpointercapture',release);
    const world=room.renderer.domElement;
    world.addEventListener('contextmenu',e=>{if(room.touchMode)e.preventDefault();});
    world.addEventListener('pointerdown',e=>{
      if(!room.touchMode||!this.canPlay()||this.drag)return;
      e.preventDefault();world.setPointerCapture(e.pointerId);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};
    });
    world.addEventListener('pointermove',e=>{
      const d=this.drag;if(!d||d.id!==e.pointerId||!this.canPlay())return;
      const dx=e.clientX-d.x,dy=e.clientY-d.y;d.distance+=Math.hypot(dx,dy);d.x=e.clientX;d.y=e.clientY;
      room.look(dx*.004,dy*.004);
    });
    world.addEventListener('pointerup',e=>{if(this.drag?.id!==e.pointerId)return;const tap=this.drag.distance<8;this.drag=null;if(tap&&this.canPlay())this.interact();});
    const cancelDrag=()=>{this.drag=null;};world.addEventListener('pointercancel',cancelDrag);world.addEventListener('lostpointercapture',cancelDrag);
    addEventListener('blur',()=>this.clear());addEventListener('resize',()=>this.clear());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
  }
  private markHeld() { this.host.querySelectorAll<HTMLElement>('[data-touch]').forEach(b=>b.classList.toggle('is-held',[...this.held.values()].includes(b.dataset.touch!))); }
  clear() { this.held.clear();this.drag=null;this.room.touchMove.forward=0;this.room.touchMove.side=0;this.markHeld(); }
  switchHand() { this.hand=this.hand==='right'?'left':'right';this.host.dataset.hand=this.hand;try{localStorage.setItem('four-walls-touch-hand',this.hand);}catch{ /* Optional preference. */ } }
  update(dt: number, active: boolean, target: boolean) {
    const playing=active&&this.room.touchMode;
    this.host.hidden=!playing;
    if(!playing){if(this.playing)this.clear();this.playing=false;return;}
    this.playing=true;
    this.host.querySelector<HTMLButtonElement>('#touch-interact')!.disabled=!target;
    const has=(key:string)=>Number([...this.held.values()].includes(key));
    this.room.touchMove.forward=has('forward')-has('back');this.room.touchMove.side=has('right')-has('left');
    this.room.look((has('turn-right')-has('turn-left'))*1.45*dt,(has('look-down')-has('look-up'))*.85*dt);
  }
}
