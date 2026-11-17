(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = { start: $('start-screen'), end: $('end-screen'), hud: $('hud'), pause: $('pause-badge'), collect: $('collect-count'), health: $('health-value'), healthMeter: $('health-meter'), ammo: $('ammo-value'), reserve: $('ammo-reserve'), weapon: $('weapon-name'), slot: $('slot-name'), toast: $('toast'), endTitle: $('end-title'), endKicker: $('end-kicker'), endCopy: $('end-copy'), report: $('run-report') };
  const MAP = [
    '#################', '#...............#', '#..##.....##....#', '#..##.....##....#', '#...............#', '#.....#.........#', '###...#...####..#', '#.....#.........#', '#...............#', '#....##.....##..#', '#....##.....##..#', '#...............#', '#################'
  ];
  const WEAPONS = [
    { id:'sidekick', name:'SIDEKICK', label:'SIDEKICK // 9MM', color:'#d5ff64', damage:34, rate:330, clip:12, reserve:48, spread:.018, pellets:1, auto:false },
    { id:'buzzcut', name:'BUZZCUT SMG', label:'BUZZCUT // .45 AUTO', color:'#ffb45c', damage:17, rate:105, clip:32, reserve:128, spread:.045, pellets:1, auto:true },
    { id:'breacher', name:'BREACHER', label:'BREACHER // 12 GA', color:'#ff714f', damage:14, rate:650, clip:8, reserve:32, spread:.13, pellets:7, auto:false },
    { id:'longshot', name:'LONGSHOT', label:'LONGSHOT // 5.56', color:'#67d8ff', damage:68, rate:580, clip:10, reserve:50, spread:.006, pellets:1, auto:false },
    { id:'arc', name:'ARC CASTER', label:'ARC CASTER // ION', color:'#c88aff', damage:48, rate:440, clip:18, reserve:72, spread:.025, pellets:1, auto:true }
  ];
  const keys = Object.create(null);
  let W = 960, H = 540, running = false, paused = false, gameOver = false, last = 0, lastShot = 0, reloadUntil = 0, toastTimer = 0, damageFlash = 0, muzzle = 0, kills = 0, gunsCollected = 0, fireHeld = false, audio = null;
  let player, guns, enemies, exit, zBuffer = new Float32Array(W), view = { x:0, y:0, dirX:1, dirY:0, planeX:0, planeY:.66 };
  function resize(){const cw=innerWidth,ch=innerHeight; W=Math.max(480,Math.min(1100,Math.floor(cw*.88))); H=Math.max(270,Math.round(W*ch/cw)); canvas.width=W;canvas.height=H;zBuffer=new Float32Array(W);}
  addEventListener('resize',resize); resize();
  function createState(){
    player={x:1.55,y:1.55,angle:0,health:100,weapon:0,ammo:12,reserve:48,inventory:[0],bob:0,moving:false};
    guns=[{x:5.35,y:1.55,type:1,taken:false},{x:13.5,y:4.5,type:2,taken:false},{x:2.5,y:8.5,type:3,taken:false},{x:12.5,y:10.5,type:4,taken:false}];
    enemies=[{x:10.5,y:1.6,hp:70,max:70,attack:0,seed:1},{x:14.5,y:7.7,hp:95,max:95,attack:.8,seed:2},{x:5.5,y:10.5,hp:75,max:75,attack:1.7,seed:3},{x:8.5,y:4.5,hp:75,max:75,attack:2.4,seed:4}];
    exit={x:15.15,y:11.2}; gunsCollected=0;kills=0;lastShot=0;reloadUntil=0;muzzle=0;damageFlash=0;gameOver=false;paused=false;
  }
  createState();
  // Every map character except a dot is solid.
  function solid(x,y){const mx=Math.floor(x),my=Math.floor(y);return !MAP[my]||MAP[my][mx]!=='.';}
  function canStand(x,y,r=.2){return !solid(x-r,y-r)&&!solid(x+r,y-r)&&!solid(x-r,y+r)&&!solid(x+r,y+r);}
  function showToast(message){ui.toast.textContent=message;ui.toast.classList.add('show');toastTimer=1.65;}
  function updateHud(){const w=WEAPONS[player.weapon];ui.collect.textContent=`${gunsCollected} / 3`;ui.health.textContent=Math.max(0,Math.ceil(player.health));ui.healthMeter.style.width=`${Math.max(0,player.health)}%`;ui.healthMeter.style.background=player.health<35?'#ff604e':'#d5ff64';ui.ammo.textContent=player.ammo;ui.reserve.textContent=` / ${player.reserve}`;ui.weapon.textContent=w.label;ui.slot.textContent=w.name;}
  function begin(){createState();running=true;paused=false;ui.start.classList.add('hidden');ui.end.classList.add('hidden');ui.hud.hidden=false;ui.pause.hidden=true;updateHud();try{canvas.requestPointerLock?.();}catch(_){}last=performance.now();}
  $('start-button').addEventListener('click',begin);$('restart-button').addEventListener('click',begin);
  document.addEventListener('pointerlockchange',()=>{if(!running||gameOver)return;if(document.pointerLockElement!==canvas&&!matchMedia('(max-width:700px)').matches){paused=true;fireHeld=false;ui.pause.hidden=false;}else if(document.pointerLockElement===canvas){paused=false;ui.pause.hidden=true;last=performance.now();}});
  canvas.addEventListener('click',()=>{if(running&&!gameOver&&paused){canvas.requestPointerLock?.();return;}if(running&&!paused&&document.pointerLockElement!==canvas&&!matchMedia('(max-width:700px)').matches){canvas.requestPointerLock?.();}});
  document.addEventListener('mousemove',e=>{if(running&&!paused&&!gameOver&&document.pointerLockElement===canvas)player.angle+=e.movementX*.00235;});
  document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(!running||paused||gameOver)return;if(k==='r')reload();if(k==='e')interact();if(k>='1'&&k<='5')switchWeapon(+k-1);});
  document.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
  document.addEventListener('mousedown',e=>{if(e.button===0&&running&&!paused&&!gameOver){fireHeld=true;shoot();}});document.addEventListener('mouseup',e=>{if(e.button===0)fireHeld=false;});
  addEventListener('blur',()=>{fireHeld=false;Object.keys(keys).forEach(k=>keys[k]=false);});
  function reload(){if(reloadUntil||player.ammo===WEAPONS[player.weapon].clip||player.reserve<=0)return;reloadUntil=performance.now()+850;showToast('RELOADING');}
  function switchWeapon(n){if(n<0||n>=WEAPONS.length||!player.inventory.includes(n)||player.weapon===n)return;saveAmmo();reloadUntil=0;player.weapon=n;player.ammo=player._ammo?.[n]??WEAPONS[n].clip;player.reserve=player._reserve?.[n]??WEAPONS[n].reserve;updateHud();showToast(`${WEAPONS[n].name} EQUIPPED`);}
  ui.slot.addEventListener('click',()=>{if(player.inventory?.length>1){const i=player.inventory.indexOf(player.weapon);switchWeapon(player.inventory[(i+1)%player.inventory.length]);}});
  function saveAmmo(){player._ammo=player._ammo||{};player._reserve=player._reserve||{};player._ammo[player.weapon]=player.ammo;player._reserve[player.weapon]=player.reserve;}
  function obtainGun(g){if(g.taken)return;g.taken=true;gunsCollected++;saveAmmo();player.weapon=g.type;player.ammo=WEAPONS[g.type].clip;player.reserve=WEAPONS[g.type].reserve;if(!player.inventory.includes(g.type))player.inventory.push(g.type);updateHud();showToast(`${WEAPONS[g.type].name} ACQUIRED`);if(gunsCollected>=3)showToast('EXTRACTION GATE UNLOCKED · FIND THE GREEN BEACON');}
  function interact(){if(Math.hypot(player.x-exit.x,player.y-exit.y)<1.55){if(gunsCollected>=3){finish(true);return;}showToast(`EXTRACTION LOCKED · ${3-gunsCollected} MORE GUN${3-gunsCollected===1?'':'S'} NEEDED`);}}
  function finish(win){gameOver=true;running=false;fireHeld=false;document.exitPointerLock?.();ui.pause.hidden=true;ui.end.classList.remove('hidden');ui.endKicker.textContent=win?'RUN COMPLETE':'SIGNAL LOST';ui.endTitle.textContent=win?'Clean getaway.':'Down in the dark.';ui.endCopy.textContent=win?'You made it out with the goods.':'The station kept its weapons this time.';ui.report.textContent=`${gunsCollected} weapons secured · ${kills} hostiles neutralized`;}
  function audioBeep(freq,duration,type='square',volume=.035){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch(_){}}
  function shoot(){const now=performance.now(),w=WEAPONS[player.weapon];if(!running||paused||gameOver||now<lastShot+w.rate*.82||reloadUntil)return;if(player.ammo<=0){audioBeep(130,.045,'square',.018);if(player.reserve>0)reload();return;}lastShot=now;player.ammo--;saveAmmo();muzzle=.12;updateHud();audioBeep(player.weapon===2?90:player.weapon===4?360:170,.09,player.weapon===4?'sawtooth':'triangle',.04);
    for(let p=0;p<w.pellets;p++){const angle=player.angle+(Math.random()-.5)*w.spread;let hit=null,nearest=10;for(const e of enemies){if(e.hp<=0)continue;const dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy),delta=Math.atan2(Math.sin(Math.atan2(dy,dx)-angle),Math.cos(Math.atan2(dy,dx)-angle));if(Math.abs(delta)<.11&&dist<nearest){let blocked=false;for(let t=.15;t<dist;t+=.12){if(solid(player.x+Math.cos(angle)*t,player.y+Math.sin(angle)*t)){blocked=true;break;}}if(!blocked){hit=e;nearest=dist;}}}if(hit){hit.hp-=w.damage;if(hit.hp<=0){kills++;showToast('HOSTILE DOWN');}else showToast('HIT CONFIRMED');}}
  }
  function movePlayer(dt){let f=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0),s=(keys.d?1:0)-(keys.a?1:0);if(keys.arrowleft)player.angle-=dt*2.35;if(keys.arrowright)player.angle+=dt*2.35;
    if(touchMove.forward)f++;if(touchMove.back)f--;if(touchMove.right)s++;if(touchMove.left)s--;
    const len=Math.hypot(f,s)||1;f/=len;s/=len;const speed=(keys.shift?.78:1)*2.65*dt;const dx=(Math.cos(player.angle)*f-Math.sin(player.angle)*s)*speed,dy=(Math.sin(player.angle)*f+Math.cos(player.angle)*s)*speed;
    if(canStand(player.x+dx,player.y,.21))player.x+=dx;if(canStand(player.x,player.y+dy,.21))player.y+=dy;player.moving=!!(f||s);if(player.moving)player.bob+=dt*11;
    for(const g of guns)if(!g.taken&&Math.hypot(g.x-player.x,g.y-player.y)<.58)obtainGun(g);
  }
  function updateEnemies(dt){for(const e of enemies){if(e.hp<=0)continue;const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy);if(d>1.05){const speed=.48*dt;e.seed+=dt;const nx=e.x+dx/d*speed+Math.sin(e.seed*2)*speed*.13,ny=e.y+dy/d*speed+Math.cos(e.seed*1.6)*speed*.13;if(canStand(nx,e.y,.22))e.x=nx;if(canStand(e.x,ny,.22))e.y=ny;}else{e.attack-=dt;if(e.attack<=0){e.attack=1.35+Math.random()*.55;player.health-=9;damageFlash=.38;audioBeep(75,.1,'sawtooth',.045);updateHud();if(player.health<=0)finish(false);}}}}
  const touchMove={forward:false,back:false,left:false,right:false};
  document.querySelectorAll('[data-move]').forEach(btn=>{const key=btn.dataset.move,down=e=>{e.preventDefault();touchMove[key]=true;},up=e=>{e.preventDefault();touchMove[key]=false;};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',up);});
  const fireButton=$('touch-fire');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();fireHeld=true;shoot();});['pointerup','pointercancel','pointerleave'].forEach(ev=>fireButton.addEventListener(ev,e=>{e.preventDefault();fireHeld=false;}));
  let lookLast=null;const lookPad=$('look-pad');lookPad.addEventListener('pointerdown',e=>{if(!running||paused)return;lookLast=e.clientX;lookPad.setPointerCapture(e.pointerId);});lookPad.addEventListener('pointermove',e=>{if(lookLast!==null){player.angle+=(e.clientX-lookLast)*.009;lookLast=e.clientX;}});['pointerup','pointercancel'].forEach(ev=>lookPad.addEventListener(ev,()=>lookLast=null));
  function render(){
    const horizon=Math.floor(H*.49);view.x=Math.cos(player.angle);view.y=Math.sin(player.angle);view.dirX=view.x;view.dirY=view.y;view.planeX=-view.y*.68;view.planeY=view.x*.68;
    const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#101c24');sky.addColorStop(1,'#29353a');ctx.fillStyle=sky;ctx.fillRect(0,0,W,horizon);
    const floor=ctx.createLinearGradient(0,horizon,0,H);floor.addColorStop(0,'#252b2a');floor.addColorStop(.35,'#171e1d');floor.addColorStop(1,'#090d10');ctx.fillStyle=floor;ctx.fillRect(0,horizon,W,H-horizon);
    // Distant industrial ribs and a soft horizon lamp.
    ctx.fillStyle='rgba(151,192,169,.045)';for(let i=0;i<13;i++){const x=((i*97+performance.now()*.003)%W);ctx.fillRect(x,horizon-22,2,20);}
    for(let x=0;x<W;x++){const cameraX=2*x/W-1,rayX=view.dirX+view.planeX*cameraX,rayY=view.dirY+view.planeY*cameraX;let mapX=Math.floor(player.x),mapY=Math.floor(player.y);const deltaX=Math.abs(1/(rayX||.00001)),deltaY=Math.abs(1/(rayY||.00001));let stepX,stepY,sideX,sideY;if(rayX<0){stepX=-1;sideX=(player.x-mapX)*deltaX;}else{stepX=1;sideX=(mapX+1-player.x)*deltaX;}if(rayY<0){stepY=-1;sideY=(player.y-mapY)*deltaY;}else{stepY=1;sideY=(mapY+1-player.y)*deltaY;}let side=0,steps=0;while(steps++<45){if(sideX<sideY){sideX+=deltaX;mapX+=stepX;side=0;}else{sideY+=deltaY;mapY+=stepY;side=1;}if(!MAP[mapY]||MAP[mapY][mapX]!=='.')break;}let dist=side===0?sideX-deltaX:sideY-deltaY;dist=Math.max(.08,dist);zBuffer[x]=dist;const lineH=Math.min(H*2,Math.floor(H/dist));let top=Math.max(0,horizon-lineH/2),bottom=Math.min(H,horizon+lineH/2);let wallX=side===0?player.y+dist*rayY:player.x+dist*rayX;wallX-=Math.floor(wallX);const mapShade=((mapX*7+mapY*11)%4)*7;let shade=Math.max(30,218-dist*17-mapShade-(side?26:0));const seam=(Math.floor(wallX*8)%2===0)?0:12;const red= Math.round(shade*.49),green=Math.round(shade*.59),blue=Math.round(shade*.60);ctx.fillStyle=`rgb(${Math.max(18,red-seam)},${Math.max(21,green-seam)},${Math.max(23,blue-seam)})`;ctx.fillRect(x,top,1,bottom-top);
      if(Math.floor(wallX*8)===0||Math.floor(wallX*8)===7){ctx.fillStyle=`rgba(213,255,100,${Math.max(0,.14-dist*.012)})`;ctx.fillRect(x,top,1,bottom-top);}const bandY=(top+bottom)*.5;ctx.fillStyle=`rgba(4,8,10,${Math.max(.05,.3-dist*.012)})`;ctx.fillRect(x,bandY,1,Math.max(1,lineH*.018));
    }
    drawFloorGrid(horizon);
    const sprites=[];for(const g of guns)if(!g.taken)sprites.push({x:g.x,y:g.y,type:'gun',weapon:g.type,dist:(player.x-g.x)**2+(player.y-g.y)**2});for(const e of enemies)if(e.hp>0)sprites.push({x:e.x,y:e.y,type:'enemy',entity:e,dist:(player.x-e.x)**2+(player.y-e.y)**2});sprites.push({x:exit.x,y:exit.y,type:'exit',dist:(player.x-exit.x)**2+(player.y-exit.y)**2});sprites.sort((a,b)=>b.dist-a.dist);for(const s of sprites)drawSprite(s,horizon);
    drawWeapon();if(muzzle>0){ctx.fillStyle=`rgba(213,255,100,${muzzle*2.5})`;ctx.beginPath();ctx.arc(W*.53,H*.55,35*muzzle/.12,0,Math.PI*2);ctx.fill();}
    if(damageFlash>0){ctx.fillStyle=`rgba(255,45,38,${damageFlash*.55})`;ctx.fillRect(0,0,W,H);}
    drawVignette();
  }
  function drawFloorGrid(horizon){ctx.save();for(let i=1;i<=9;i++){const t=i/10,y=horizon+(H-horizon)*t*t;const alpha=(1-t)*.12;ctx.strokeStyle=`rgba(197,218,191,${alpha})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.restore();}
  function drawSprite(s,horizon){const dx=s.x-player.x,dy=s.y-player.y,inv=1/(view.planeX*view.dirY-view.dirX*view.planeY),tx=inv*(view.dirY*dx-view.dirX*dy),ty=inv*(-view.planeY*dx+view.planeX*dy);if(ty<=.15)return;const sx=Math.floor(W*(.5+tx/ty)),size=Math.min(H*1.8,Math.abs(H/ty));if(size<2)return;const x=sx-size*.35,y=horizon-size*.68;const left=Math.max(0,Math.floor(sx-size*.42)),right=Math.min(W,Math.ceil(sx+size*.42));for(let stripe=left;stripe<right;stripe++){if(ty<zBuffer[stripe]){const u=(stripe-(sx-size*.42))/(size*.84);drawSpriteStripe(s,u,x,y,size,ty);}}
  }
  function drawSpriteStripe(s,u,x,y,size,depth){const centerX=x+size*.42;const shade=Math.max(.35,1-depth*.055);if(s.type==='gun'){const col=WEAPONS[s.weapon].color;const yy=y+size*.48,ww=size*.7,hh=size*.24;ctx.save();ctx.globalAlpha=Math.min(1,1/depth*.9);ctx.shadowBlur=14;ctx.shadowColor=col;ctx.fillStyle=col;ctx.fillRect(centerX-ww*.45,yy-hh*.48,ww*.75,hh*.42);ctx.fillRect(centerX+ww*.19,yy-hh*.23,ww*.32,hh*.17);ctx.fillStyle='#182024';ctx.fillRect(centerX-ww*.14,yy-hh*.07,ww*.14,hh*.42);ctx.fillStyle='#effac9';ctx.font=`${Math.max(8,size*.085)}px monospace`;ctx.textAlign='center';ctx.fillText(WEAPONS[s.weapon].name,centerX,yy+hh*.75);ctx.restore();return;}
    if(s.type==='exit'){const active=gunsCollected>=3;ctx.save();ctx.globalAlpha=Math.min(.95,.9/depth);const col=active?'#d5ff64':'#63706c';ctx.shadowBlur=active?22:5;ctx.shadowColor=col;ctx.strokeStyle=col;ctx.lineWidth=Math.max(2,size*.035);ctx.strokeRect(centerX-size*.25,y+size*.23,size*.5,size*.63);ctx.fillStyle=active?'rgba(213,255,100,.10)':'rgba(140,160,150,.06)';ctx.fillRect(centerX-size*.21,y+size*.26,size*.42,size*.58);ctx.fillStyle=col;ctx.fillRect(centerX-size*.08,y+size*.43,size*.16,size*.05);ctx.restore();return;}
    const e=s.entity;const headY=y+size*.16,bodyY=y+size*.32;ctx.save();ctx.globalAlpha=Math.min(1,1/depth*.9);ctx.translate(centerX,0);ctx.fillStyle='#26363b';ctx.beginPath();ctx.ellipse(0,bodyY+size*.33,size*.23,size*.29,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#425357';ctx.fillRect(-size*.16,bodyY+size*.37,size*.11,size*.18);ctx.fillRect(size*.05,bodyY+size*.37,size*.11,size*.18);ctx.fillStyle='#39494c';ctx.beginPath();ctx.arc(0,headY+size*.04,size*.14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff654f';ctx.shadowBlur=10;ctx.shadowColor='#ff3f3f';ctx.fillRect(-size*.085,headY+size*.025,size*.17,size*.035);ctx.shadowBlur=0;ctx.fillStyle='#172023';ctx.fillRect(-size*.25,bodyY+size*.05,size*.5,size*.08);ctx.fillStyle='#ff634e';ctx.fillRect(-size*.27,bodyY+size*.19,size*.54*(e.hp/e.max),Math.max(2,size*.025));ctx.restore();
  }
  function drawWeapon(){const w=WEAPONS[player.weapon],bob=player.moving?Math.sin(player.bob)*4:0;const cx=W*.72,base=H*.93+bob,scale=Math.min(W/960,H/540);ctx.save();ctx.translate(cx,base);ctx.scale(scale,scale);ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=18;
    // Gloved hand and chunky, distinct weapon silhouette.
    ctx.fillStyle='#a8a78d';ctx.beginPath();ctx.moveTo(25,5);ctx.lineTo(120,-12);ctx.lineTo(188,24);ctx.lineTo(188,100);ctx.lineTo(46,102);ctx.closePath();ctx.fill();ctx.fillStyle='#d2ccb1';ctx.beginPath();ctx.moveTo(12,7);ctx.lineTo(71,-27);ctx.lineTo(119,-9);ctx.lineTo(112,38);ctx.lineTo(58,57);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#172125';ctx.strokeStyle='#4b5957';ctx.lineWidth=4;
    if(player.weapon===2){ctx.fillRect(-4,-91,145,55);ctx.fillRect(97,-75,80,30);ctx.fillRect(50,-38,37,77);ctx.fillStyle='#9e4735';ctx.fillRect(5,-30,37,17);ctx.fillRect(123,-30,29,17);}
    else if(player.weapon===3){ctx.fillRect(0,-84,127,47);ctx.fillRect(111,-70,118,20);ctx.fillRect(40,-43,34,73);ctx.fillRect(20,-99,46,15);ctx.fillStyle='#67d8ff';ctx.fillRect(174,-66,40,9);}
    else if(player.weapon===4){ctx.fillRect(2,-90,145,57);ctx.fillRect(125,-76,80,29);ctx.fillRect(49,-38,34,75);ctx.fillStyle='#9561c8';ctx.fillRect(10,-84,30,44);ctx.fillRect(94,-88,15,51);}
    else if(player.weapon===1){ctx.fillRect(0,-79,130,44);ctx.fillRect(104,-70,88,27);ctx.fillRect(52,-40,35,73);ctx.fillRect(20,-94,60,14);ctx.fillStyle='#9c6a43';ctx.fillRect(4,-37,32,14);}
    else{ctx.fillRect(11,-78,119,42);ctx.fillRect(101,-67,81,22);ctx.fillRect(54,-39,32,69);ctx.fillRect(19,-91,47,15);ctx.fillStyle='#8c7657';ctx.fillRect(14,-35,31,12);}
    ctx.fillStyle=w.color;ctx.fillRect(30,-72,17,5);ctx.fillStyle='#657274';ctx.fillRect(147,-68,Math.max(0,player.ammo)*.8,3);ctx.restore();
  }
  function drawVignette(){const g=ctx.createRadialGradient(W/2,H/2,H*.18,W/2,H/2,H*.8);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.48)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
  function frame(now){requestAnimationFrame(frame);const dt=Math.min(.04,(now-last)/1000||0);last=now;if(running&&!paused&&!gameOver){movePlayer(dt);updateEnemies(dt);if(fireHeld&&WEAPONS[player.weapon].auto)shoot();if(reloadUntil&&now>=reloadUntil){const cap=WEAPONS[player.weapon].clip,take=Math.min(cap-player.ammo,player.reserve);player.ammo+=take;player.reserve-=take;reloadUntil=0;saveAmmo();updateHud();}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}muzzle=Math.max(0,muzzle-dt);damageFlash=Math.max(0,damageFlash-dt);}
    render();}
  requestAnimationFrame(frame);
})();
