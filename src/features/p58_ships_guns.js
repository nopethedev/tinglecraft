/* =====================================================================
   SHIPS & NAMED GUNS (Tingle Craft) — p58_ships_guns.js

   SHIPS: build a boat out of ship blocks (planks, logs, glass, wool,
   chests, furnaces, doors — 25 blocks or more), aim at it with the
   Magical Ship Helm and use it: the whole structure drinks the helm's
   magic, lifts out of the world as one drivable ship, and the helm spot
   becomes the driver's seat. WASD to sail (fast on water, slow beached),
   Shift to step off, sneak + right-click a ship to break it back into
   blocks (the helm pops off). On a server everyone sees the ship move,
   ships persist in the world save, and the driver streams the physics.

   GUNS: three named guns on the classic gun framework — the M9 (a
   reliable sidearm), the AK47 (full-auto rifle) and the Remington 870
   (nine-pellet pump shotgun). They use the existing Bullet/Shell ammo,
   render with the weapon-model system, and in multiplayer their bullets
   can hit other players through the server's validated pvp relay.

   Item ids come from the ledger's free range (366+). No new block ids.
   ===================================================================== */
IT.M9=366;IT.AK47=367;IT.REM870=368;IT.HELM=369;

idef(IT.M9,{name:'M9',icon:'gun_m9',stack:1,dur:420,
  gun:{dmg:7,cd:0.30,spd:74,sp:0.010,pel:1,ammo:0,rec:0.018,grav:3,auto:false,scope:false,snd:'pistol'}});
idef(IT.AK47,{name:'AK47',icon:'gun_ak',stack:1,dur:820,
  gun:{dmg:5.5,cd:0.125,spd:82,sp:0.030,pel:1,ammo:0,rec:0.014,grav:3,auto:true,scope:false,snd:'smg'}});
idef(IT.REM870,{name:'Remington 870',icon:'gun_ren',stack:1,dur:320,
  gun:{dmg:3.2,cd:0.92,spd:50,sp:0.080,pel:9,ammo:1,rec:0.070,grav:6,auto:false,scope:false,snd:'shotgun'}});
idef(IT.HELM,{name:'Magical Ship Helm',icon:'i_helm',stack:1,
  lore:'Use it on a built ship (25+ ship blocks) to make it sail.',
  puse:(st,hit,dt,rEdge)=>shipAssemble(st,hit)});

tile('gun_m9',c=>drawGun(c,0,'#33363d'));
tile('gun_ak',c=>drawGun(c,2,'#7a5230'));
tile('gun_ren',c=>drawGun(c,1,'#4e3a28'));
tile('i_helm',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#6b4a2e';c.fillRect(2,2,12,12);
  c.fillStyle='#8a6440';c.fillRect(3,3,10,10);
  c.fillStyle='#4a3118';
  c.fillRect(7,1,2,14);c.fillRect(1,7,14,2);
  c.fillRect(3,3,2,2);c.fillRect(11,3,2,2);c.fillRect(3,11,2,2);c.fillRect(11,11,2,2);
  c.fillStyle='#c9a23a';c.fillRect(7,7,2,2);});

R([' I ','IGI',' S '],{I:IT.IRON,G:IT.GUNPOWDER,S:IT.STICK},IT.M9,1);
R(['IIG','SW ',' S '],{I:IT.IRON,G:IT.GUNPOWDER,S:IT.STICK,W:B.PLANK_O},IT.AK47,1);
R(['IS','IG','WS'],{I:IT.IRON,S:IT.STICK,G:IT.GUNPOWDER,W:B.PLANK_O},IT.REM870,1);
R(['PSP','SDS','PPP'],{P:B.PLANK_O,S:IT.STICK,D:IT.DIAMOND},IT.HELM,1);

/* ------------------------------------------------------------------ ships */
const SHIP_MAX=1400,SHIP_MIN=25;
function shipBlockOk(id){
  const d=DEFS[id];
  if(!d||d.item)return false;
  if(id===B.GLASS||id===B.BGLASS||id===B.WOOL||id===B.CHEST||id===B.FURNACE)return true;
  if(d.door)return true;
  return d.toolClass==='axe';    /* planks, logs, and anything else wooden */
}
/* pack: u16 count, then per voxel i16 dx, i8 dy(+80), i16 dz, u8 id */
function shipPack(vox){
  const b=new Uint8Array(2+vox.size*6);
  b[0]=vox.size&255;b[1]=(vox.size>>8)&255;
  let i=2;
  const w16=v=>{const u=v<0?v+65536:v;b[i]=u&255;b[i+1]=(u>>8)&255;i+=2;};
  for(const [k,id] of vox){
    const p=k.split(',');
    w16(+p[0]);b[i++]=(+p[1])+80;w16(+p[2]);b[i++]=id;
  }
  return b64enc(b);
}
function shipUnpack(s){
  let b=null;
  try{b=b64bytes(s);}catch(e){return null;}
  if(!b||b.length<2)return null;
  const n=b[0]|(b[1]<<8);
  if(b.length<2+n*6)return null;
  const vox=new Map();
  let i=2;
  const r16=()=>{let v=b[i]|(b[i+1]<<8);i+=2;return v>=32768?v-65536:v;};
  for(let k=0;k<n;k++){
    const dx=r16(),dy=b[i++]-80,dz=r16(),id=b[i++];
    vox.set(dx+','+dy+','+dz,id);
  }
  return vox;
}
function shipMesh(vox){
  const byId=new Map();
  for(const [k,id] of vox){
    const p=k.split(',');
    let a=byId.get(id);
    if(!a){a=[];byId.set(id,a);}
    a.push([+p[0],+p[1],+p[2]]);
  }
  const g=new THREE.Group();
  for(const [id,offs] of byId){
    let mat=matOp;
    if(DEFS[id]&&DEFS[id].bucket==='cut')mat=matCut;
    else if(DEFS[id]&&DEFS[id].bucket==='wat')mat=matWat;
    const im=new THREE.InstancedMesh(mkCubeGeo(id,1.0),mat,offs.length);
    const M=new THREE.Matrix4();
    for(let i=0;i<offs.length;i++){
      M.makeTranslation(offs[i][0],offs[i][1],offs[i][2]);
      im.setMatrixAt(i,M);
    }
    im.instanceMatrix.needsUpdate=true;
    g.add(im);
  }
  shadowify(g);
  return g;
}
function spawnShipEnt(vox,ox,oy,oz,opts){
  opts=opts||{};
  const e={t:'ship',vox:vox,
    ox:ox,oy:oy,oz:oz,
    x:ox+0.5,y:oy,z:oz+0.5,vx:0,vy:0,vz:0,
    yaw:opts.yaw||0,spd:0,hw:1.6,h:2.4,onGround:false,
    seatY:1.6,eyeH:2.9,sid:opts.sid||null,rider:opts.rider||null,net:!!opts.net,
    ntx:ox+0.5,nty:oy,ntz:oz+0.5,ntyaw:opts.yaw||0,netT:0,
    mesh:shipMesh(vox)};
  scene.add(e.mesh);
  e.mesh.position.set(e.x,e.y,e.z);
  entities.push(e);
  return e;
}
/* aim a ray at every ship in the dimension (slab test per ship AABB) */
function pickShip(ox,oy,oz,dx,dy,dz,max){
  let best=null;
  const o3=[ox,oy+0.8,oz],d3=[dx,dy,dz];
  for(const e of entities){
    if(e.t!=='ship'||e.dead)continue;
    const c3=[e.x,e.y+1,e.z],r3=[e.hw+0.4,2.2,e.hw+0.4];
    let t0=0,t1=max,ok=true;
    for(let a=0;a<3;a++){
      const da=d3[a]||1e-9;
      let tn=(c3[a]-r3[a]-o3[a])/da,tf=(c3[a]+r3[a]-o3[a])/da;
      if(tn>tf){const tmp=tn;tn=tf;tf=tmp;}
      t0=Math.max(t0,tn);t1=Math.min(t1,tf);
      if(t0>t1){ok=false;break;}
    }
    if(ok&&t0>=0&&t0<=max&&(!best||t0<best.t))best={e:e,t:t0};
  }
  return best;
}
function shipAssemble(st,hit){
  if(!playing||!P||!hit)return true;
  if(DIM!=='over'){showToast('The magic only works on the open sea (overworld).');return true;}
  const sx=hit.x,sy=hit.y,sz=hit.z;
  if(!shipBlockOk(getBlock(sx,sy,sz))){
    showToast('Aim the helm at the ship itself — planks, logs, glass, wool...');
    return true;
  }
  /* flood fill the connected ship blocks */
  const vox=new Map(),q=[[sx,sy,sz]];
  vox.set('0,0,0',getBlock(sx,sy,sz));
  let over=false;
  while(q.length){
    if(vox.size>SHIP_MAX){over=true;break;}
    const [cx2,cy2,cz2]=q.pop();
    const dx0=cx2-sx,dy0=cy2-sy,dz0=cz2-sz;
    for(const [ddx,ddy,ddz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const nx=cx2+ddx,ny=cy2+ddy,nz=cz2+ddz;
      const rx=nx-sx,ry=ny-sy,rz=nz-sz;
      if(Math.abs(rx)>26||Math.abs(ry)>14||Math.abs(rz)>26)continue;
      const k=rx+','+ry+','+rz;
      if(vox.has(k))continue;
      const id=getBlock(nx,ny,nz);
      if(!shipBlockOk(id))continue;
      vox.set(k,id);
      q.push([nx,ny,nz]);
    }
  }
  if(over){showToast('Too grand for one helm — keep it under '+SHIP_MAX+' blocks.');return true;}
  if(vox.size<SHIP_MIN){showToast('That is not ship-shaped yet: '+vox.size+'/'+SHIP_MIN+' ship blocks.');return true;}
  /* drink the structure out of the world (edits stream as one batch) */
  for(const [k,id] of vox){
    const p=k.split(',');
    setBlock(sx+ +p[0],sy+ +p[1],sz+ +p[2],B.AIR);
  }
  const e=spawnShipEnt(vox,sx,sy,sz,{});
  e.spd=0;
  if(typeof NET!=='undefined'&&NET.on){
    e.sid=(NET.name||'s')+'-'+Date.now().toString(36)+((Math.random()*1e4)|0);
    netSend({t:'shipadd',sid:e.sid,d:shipPack(vox),x:e.x,y:e.y,z:e.z,yaw:0});
    netSend({t:'state'});
  }
  if(P.mode!=='c'){st.count--;if(st.count<=0)P.inv[P.sel]=null;redrawHotbar();}
  P.ride=e;P.useT=0.4;P.swing=1;
  showToast('The ship breathes! WASD to sail, Shift to step off.');
  playS('jackpot');
  return true;
}
function shipDisassemble(e){
  if(!e||e.t!=='ship')return;
  const ox=Math.round(e.x-0.5),oy=Math.round(e.y),oz=Math.round(e.z-0.5);
  for(const [k,id] of e.vox){
    const p=k.split(',');
    const wx=ox+ +p[0],wy=oy+ +p[1],wz=oz+ +p[2];
    if(wy>0&&wy<WH)setBlock(wx,wy,wz,id);
  }
  if(typeof NET!=='undefined'&&NET.on&&e.sid)netSend({t:'shipdel',sid:e.sid});
  spawnDrop(e.x,e.y+1.4,e.z,{id:IT.HELM,count:1},0,2,0);
  if(P&&P.ride===e)P.ride=null;
  showToast('The ship rests again. The helm pops free.');
  playS('place');
  removeEnt(e);
}
/* per-frame: buoyancy, sailing, remote interpolation */
function updateShip(e,dt){
  const ridden=P&&P.ride===e&&!P.dead;
  let f=0,s=0;
  if(ridden&&!modalOpen()&&!paused){
    f=clamp((KEY.KeyW?1:0)-(KEY.KeyS?1:0)+TOUCH.f,-1,1);
    s=clamp((KEY.KeyD?1:0)-(KEY.KeyA?1:0)+TOUCH.s,-1,1);
  }
  if(!ridden&&e.net){
    /* someone else drives: glide to the streamed pose */
    const k=1-Math.exp(-dt*8);
    e.x=lerp(e.x,e.ntx,k);e.y=lerp(e.y,e.nty,k);e.z=lerp(e.z,e.ntz,k);
    e.yaw+=(((e.ntyaw-e.yaw+Math.PI*3)%(Math.PI*2))-Math.PI)*Math.min(1,dt*8);
    e.mesh.position.set(e.x,e.y,e.z);
    e.mesh.rotation.y=e.yaw;
    return;
  }
  const fx=Math.floor(e.x),fz=Math.floor(e.z);
  /* the water line under the hull (topmost water surface below the deck) */
  let ws=null;
  for(let yy=Math.min(WH-2,Math.floor(e.y)+3);yy>=1;yy--){
    const b=getBlock(fx,yy,fz);
    if(b===B.WATER){ws=yy+1;break;}
    if(DEFS[b].solid&&b!==B.WATER)break;
  }
  if(ws!=null){
    e.y=lerp(e.y,ws-0.55,1-Math.exp(-dt*5));
    e.vy=0;e.onGround=false;
    if(f!==0)e.spd=lerp(e.spd,f*9,1-Math.exp(-dt*1.2));
    else e.spd*=Math.exp(-dt*0.7);
    e.mesh.rotation.z=lerp(e.mesh.rotation.z||0,Math.sin(performance.now()*0.0016)*0.035,0.1);
  }else{
    e.vy-=GRAV*dt;
    e.y+=e.vy*dt;
    const gy=Math.floor(e.y-0.05);
    if(e.vy<=0&&(solidAt(fx,gy,fz)||solidAt(Math.floor(e.x+e.hw*0.7),gy,fz)||solidAt(fx,gy,Math.floor(e.z+e.hw*0.7)))){
      e.y=gy+1;e.vy=0;e.onGround=true;
    }else e.onGround=false;
    if(f!==0&&e.onGround)e.spd=lerp(e.spd,f*2.4,1-Math.exp(-dt*2));
    else e.spd*=Math.exp(-dt*(e.onGround?4:0.25));
    e.mesh.rotation.z=lerp(e.mesh.rotation.z||0,0,0.1);
  }
  e.yaw-=s*dt*1.15*clamp(Math.abs(e.spd)/4,0.25,1.3)*Math.sign(e.spd||1);
  /* sail: stop dead against anything solid at hull height */
  if(Math.abs(e.spd)>0.01){
    const dx=-Math.sin(e.yaw),dz=-Math.cos(e.yaw);
    const step=e.spd*dt;
    const probe=(pxx,pzz)=>{
      const by=Math.floor(e.y+0.6);
      return solidAt(Math.floor(pxx),by,Math.floor(pzz))||solidAt(Math.floor(pxx),by+1,Math.floor(pzz));
    };
    const reach=Math.max(1.2,Math.abs(e.spd)*0.45);
    if(probe(e.x+dx*reach,e.z+dz*reach)||probe(e.x,e.z)){e.spd=0;}
    else{e.x+=dx*step;e.z+=dz*step;}
  }
  if(ridden&&P){
    P.x=e.x;P.z=e.z;P.y=e.y+1.7;
  }
  if(e.y<-30){
    if(P&&P.ride===e)P.ride=null;
    if(typeof NET!=='undefined'&&NET.on&&e.sid)netSend({t:'shipdel',sid:e.sid});
    removeEnt(e);return;
  }
  e.mesh.position.set(e.x,e.y,e.z);
  e.mesh.rotation.y=e.yaw;
}
/* net: everyone else's ships */
function shipFromNet(sid,d,x,y,z,yaw,rider){
  if(!NSH.list.has(sid)){
    const vox=shipUnpack(d);
    if(!vox)return;
    const e=spawnShipEnt(vox,Math.round(x-0.5),Math.round(y),Math.round(z-0.5),
      {sid:sid,yaw:yaw||0,rider:rider||null,net:true});
    NSH.list.set(sid,e);
  }else{
    const e=NSH.list.get(sid);
    if(e&&!e.dead){e.ntx=x;e.nty=y;e.ntz=z;e.ntyaw=yaw||0;}
  }
}
function shipNetRemove(sid){
  const e=NSH.list.get(sid);
  if(e&&!e.dead)removeEnt(e);
  NSH.list.delete(sid);
}
const NSH={list:new Map()};
