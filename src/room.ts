import * as THREE from 'three';
export type Station = 'work' | 'shop' | 'bed' | 'letters' | 'slots';
export const STATION_NAMES: Record<Station, string> = { work: '画桌 · 开始绘画', shop: '商店 · 交付与补给', bed: '床 · 结束今天', letters: '书桌 · 信件', slots: '老虎机 · 图形游戏' };
export class Room {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .1, 60);
  yaw = 0; pitch = -.08; keys = new Set<string>();
  get locked() { return document.pointerLockElement === this.renderer.domElement; }
  private targets: { mesh: THREE.Object3D; station: Station }[] = [];
  private obstacles: {x:number;z:number;w:number;d:number}[] = [];
  private ray = new THREE.Raycaster();
  private lastView = '';
  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label', '第一人称房间场景');
    this.scene.background = new THREE.Color('#18272e'); this.scene.fog = new THREE.Fog('#263b40', 12, 29);
    this.camera.position.set(0,1.65,3.7); this.camera.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight('#c5e5de', '#3c3030', 2.1));
    const sun = new THREE.DirectionalLight('#ffe0af', 3); sun.position.set(-3,7,3); sun.castShadow = true;
    sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-9; sun.shadow.camera.right=9; sun.shadow.camera.top=9; sun.shadow.camera.bottom=-9; sun.shadow.normalBias=.025; this.scene.add(sun);
    this.build();
    addEventListener('resize', () => { this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight);this.lastView=''; });
    document.addEventListener('pointerlockchange', () => { this.keys.clear(); });
    addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT','SELECT'].includes((e.target as HTMLElement).tagName)) this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code)); addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => { if (this.locked) { this.yaw -= e.movementX*.002; this.pitch = THREE.MathUtils.clamp(this.pitch-e.movementY*.002,-1.15,1.15); } });
  }
  material(color: string, metalness = 0) { return new THREE.MeshStandardMaterial({color,roughness:.78,metalness}); }
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,station?:Station) {
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color)); m.position.set(x,y,z); m.castShadow=true;m.receiveShadow=true;this.scene.add(m);
    if(station) this.targets.push({mesh:m,station}); return m;
  }
  cylinder(x:number,y:number,z:number,r:number,h:number,color:string) { const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),this.material(color));m.position.set(x,y,z);m.castShadow=true;this.scene.add(m); return m; }
  label(text:string,sub:string,x:number,y:number,z:number,rotation=0,color='#bcdcd0') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d')!;
    c.fillStyle='#1c3037';c.fillRect(0,0,1024,256);c.fillStyle=color;c.fillRect(0,0,10,256);c.font='bold 68px "Microsoft YaHei",sans-serif';c.fillText(text,56,112);c.fillStyle='#a8b7b7';c.font='30px "Microsoft YaHei",sans-serif';c.fillText(sub,58,185);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(3,.75),new THREE.MeshBasicMaterial({map:texture}));m.position.set(x,y,z);m.rotation.y=rotation;this.scene.add(m);
  }
  light(x:number,y:number,z:number,color:string) { const l=new THREE.PointLight(color,15,7,2);l.position.set(x,y,z);this.scene.add(l);this.box(x,y+.08,z,.6,.06,.35,color); }
  furniture(x:number,z:number,w:number,d:number) { this.obstacles.push({x,z,w,d}); }
  build() {
    const b=this.box.bind(this);
    b(0,-.15,0,14,.3,14,'#777366');
    for(let x=-7;x<7;x+=.7) b(x+.34,.004,0,.015,.008,14,'#5c605b');
    for(let z=-6;z<7;z+=2) b(0,.006,z,14,.008,.015,'#65695f');
    b(0,2.3,-7,14,4.6,.25,'#71847e'); b(-7,2.3,0,.25,4.6,14,'#596e70');b(7,2.3,0,.25,4.6,14,'#667d7b');b(0,2.3,7,14,4.6,.25,'#738783');
    b(0,4.65,0,14,.15,14,'#465c5f');
    for(const z of [-6.85,6.85]) { b(0,.16,z,14,.3,.1,'#344d50');b(0,3.55,z,14,.1,.12,'#c1b18c'); }
    for(const x of [-6.85,6.85]) { b(x,.16,0,.1,.3,14,'#344d50');b(x,3.55,0,.12,.1,14,'#c1b18c'); }
    // Drawing corner: oak bench, angled drawing board, tools and paper stacks.
    b(0,.018,-4.6,5.4,.03,3.8,'#405e5e');
    b(0,.91,-5.2,3.7,.18,1.45,'#ae8555','work');this.furniture(0,-5.2,3.7,1.45);
    for(const x of [-1.55,1.55]) for(const z of [-5.75,-4.65]) b(x,.44,z,.1,.88,.1,'#34474a');
    b(0,1.035,-5.1,1.45,.07,1,'#d9d2b9','work');b(0,1.078,-5.1,1.2,.01,.84,'#faf0d5','work');
    b(1.2,1.04,-5.3,.54,.08,.7,'#e4dfca');b(-1.15,1.12,-5.5,.25,.3,.25,'#c29967');
    for(let i=0;i<4;i++) b(-1.23+i*.05,1.38,-5.5,.018,.48,.018,['#a84e47','#cfb468','#4d9298','#34494a'][i]);
    b(-.75,1.095,-4.9,.02,.018,.44,'#333e42');
    b(0,.45,-3.95,.7,.14,.65,'#886b4c');b(0,.22,-3.95,.45,.44,.45,'#34474a');this.furniture(0,-3.95,.7,.65);
    this.label('工作区','WORKSHOP  /  每一笔，都有回报',0,2.8,-6.83);
    for(let i=0;i<3;i++) { b(-2.6+i*.8,2,-6.8,.6,.7,.04,'#b8a078');b(-2.6+i*.8,2,-6.76,.5,.6,.015,'#e9dfc7'); }
    this.light(0,3.9,-4.8,'#ffde9d');
    // Shop hatch and shelves on the east wall.
    b(5.85,.65,0,1.25,1.3,3.8,'#304e53','shop');b(5.7,1.35,0,1.7,.13,4.1,'#b49b70','shop');this.furniture(5.85,0,1.5,4.1);
    b(6.79,2.05,0,.12,1.3,3.8,'#253c43','shop');
    for(let z=-1.3;z<=1.4;z+=.65) { this.cylinder(5.65,1.57,z,.11,.35,'#80b9bd');b(6.45,1.7,z,.3,.35,.3,'#d5af68'); }
    b(5.3,1.5,.95,.4,.22,.5,'#263a3e','shop');b(5.29,1.65,.95,.3,.15,.3,'#7ca296','shop');
    this.label('补给与交付','EXCHANGE  /  金币让日子继续',6.82,3,0,-Math.PI/2,'#a4d5d7'); this.light(4.7,3.8,0,'#b6eee8');
    // Rest corner, mattress and writing desk.
    b(0,.025,5,5.5,.03,3.1,'#8c7767');b(-1.25,.3,5.6,2,.5,2.6,'#947352','bed');b(-1.25,.63,5.6,1.95,.25,2.5,'#d7ccb5','bed');
    b(-1.25,.82,5.15,1.98,.16,1.6,'#496e78','bed');b(-1.25,.85,6.38,1.5,.22,.48,'#e4dfcc','bed');b(-1.25,.85,6.87,2.1,1.2,.12,'#755e47','bed');this.furniture(-1.25,5.6,2.1,2.6);
    b(2.1,.9,5.7,1.8,.15,1,'#ae8555','letters');for(const x of [1.4,2.8]) b(x,.43,5.7,.12,.85,.75,'#34474a');this.furniture(2.1,5.7,1.8,1);
    b(2.1,1,5.5,.55,.02,.4,'#ede4cd','letters');b(2.35,1.03,5.6,.02,.02,.3,'#263a3e');this.cylinder(1.55,1.1,5.8,.13,.3,'#b89a60');
    this.label('休息区','REST  /  给明天留一点精神',0,2.8,6.82,Math.PI,'#dfc8a2');this.light(0,3.8,5,'#ffe2ad');
    // Slot cabinet with luminous face and physical reels.
    b(-5.2,.018,0,3.1,.03,4.6,'#675a70');b(-5.8,.65,0,1.25,1.3,1.7,'#33384d','slots');b(-5.8,1.85,0,1.1,1.4,1.7,'#4a4b62','slots');
    b(-5.22,1.9,0,.04,.95,1.4,'#d1af6d','slots');b(-5.19,1.9,0,.03,.78,1.22,'#192e34','slots');
    for(let row=0;row<3;row++) for(let col=0;col<4;col++) b(-5.16,1.62+row*.27,-.45+col*.3,.04,.21,.24,row===1?'#d4b273':'#9bb6ac','slots');
    b(-5.8,2.72,0,1.25,.28,1.85,'#bd9462','slots');this.label('图形俱乐部','LUCK  /  投入图形，碰碰运气',-6.82,3.25,0,Math.PI/2,'#ddbdd8');
    this.cylinder(-5,1.15,1.15,.07,.5,'#ad895a');this.furniture(-5.8,0,1.4,1.9);this.light(-4.5,3.7,0,'#e8beee');
    // Sealed entrance and window overlooking a painted sky.
    b(-4.5,1.4,6.83,1.6,2.8,.08,'#344b50');b(-4.5,1.4,6.76,.08,2.8,.04,'#273f45');b(-3.95,1.25,6.7,.08,.08,.08,'#cfac67');
    b(4.7,2.3,-6.8,2.3,1.9,.08,'#314d53');b(4.7,2.3,-6.74,2,1.6,.04,'#c2d7c5');b(4.7,2.3,-6.69,.08,1.6,.04,'#536c67');b(4.7,2.3,-6.69,2,.08,.04,'#536c67');
    // A potted plant and structural beams give the room scale.
    this.cylinder(4.8,.3,-4.9,.28,.6,'#aa785b');
    for(let i=0;i<7;i++) { const leaf=this.box(4.8+Math.sin(i)*.22,.8+i*.09,-4.9+Math.cos(i)*.2,.12,.65,.18,'#567c63');leaf.rotation.z=Math.sin(i)*.5; }
    for(const x of [-3.3,3.3]) b(x,4.4,0,.17,.3,14,'#344b50');
  }
  async lock() { try { await this.renderer.domElement.requestPointerLock(); } catch { /* Browser may require another click. */ } }
  unlock() { if(document.pointerLockElement) document.exitPointerLock();this.keys.clear(); }
  update(dt:number,active:boolean) {
    this.camera.rotation.y=this.yaw;this.camera.rotation.x=this.pitch;
    if(active && this.locked) {
      const forward=Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),side=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'));
      const length=Math.hypot(forward,side)||1,speed=3*dt/length;
      const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*speed,dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*speed;
      const clear=(x:number,z:number)=>Math.abs(x)<6.5&&Math.abs(z)<6.5&&!this.obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.24&&Math.abs(z-o.z)<o.d/2+.24);
      const p=this.camera.position,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1));
      for(let i=0;i<steps;i++){if(clear(p.x+dx/steps,p.z))p.x+=dx/steps;if(clear(p.x,p.z+dz/steps))p.z+=dz/steps;}
    }
    const view=`${this.camera.position.x},${this.camera.position.z},${this.yaw},${this.pitch}`;
    if(view!==this.lastView){this.renderer.render(this.scene,this.camera);this.lastView=view;}
  }
  target():Station|null {
    this.ray.setFromCamera(new THREE.Vector2(0,0),this.camera);this.ray.far=3.3;
    const hit=this.ray.intersectObjects(this.targets.map(t=>t.mesh),false)[0];return hit?this.targets.find(t=>t.mesh===hit.object)!.station:null;
  }
}
