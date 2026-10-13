/* =====================================================================
   MACHINES (Tingle Craft) — a Create-flavoured contraption pack.
   Two blocks, because the block-id ledger has exactly two free slots left:
     B.ENGINE 248  the Steam Engine: right-click it, feed it coal or planks
                   (the furnace FUELS table); while it burns it puffs smoke
                   and powers every conveyor within 3 blocks of it.
     B.CONV   249  the Conveyor Belt: carries drops, mobs and you along
                   its axis while powered. No orientation metadata exists
                   in the world format, so the axis is DERIVED, the same
                   way on every client: belts with neighbours line up with
                   them, a lone belt runs along X on even (x+z), Z on odd.
   And a freebie that costs no id: a belt section next to a BURNING
   FURNACE is a heated section — drops that ride over it get smelted
   (the SMELT table), so ore goes in one end and ingots fall off the
   other. Furnace burn timers are relayed in multiplayer with the same
   tiny `mach` message the engine uses, so the line cooks everywhere.
   Machines are tracked in `machs` (a bkey set), fed by setBlock (p03c),
   world load (p07e) and net edits (net0_client). Belts and their cargo
   stay client-side physics, like every drop in this game.
   ===================================================================== */
B.ENGINE=248;B.CONV=249;
def(B.ENGINE,{name:'Steam Engine',tiles:{top:'engin_t',side:'engin_s',bot:'engin_t'},hard:3.5,toolClass:'pick',req:true,interact:'engine'});
def(B.CONV,{name:'Conveyor Belt',tiles:{top:'conv',side:'conv_s',bot:'engin_t'},hard:1.2,toolClass:'axe'});
tile('engin_t',(c,R)=>{fillN(c,R,'#8a8f96',.07);
  c.fillStyle='#5c6167';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#b8bcc4';c.fillRect(3,3,10,10);c.fillStyle='#6e747c';
  for(let i=0;i<4;i++)c.fillRect(4,4+i*3,8,1);
  c.fillStyle='#3d4147';c.fillRect(7,7,2,2);});
tile('engin_s',(c,R)=>{fillN(c,R,'#8a8f96',.07);
  c.fillStyle='#5c6167';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#3d4147';c.fillRect(3,6,10,7);          /* the firebox mouth */
  c.fillStyle='#24272b';c.fillRect(4,7,8,5);
  c.fillStyle='#c96a2a';c.fillRect(5,10,2,2);c.fillRect(9,9,2,3);c.fillRect(7,11,1,1);
  c.fillStyle='#b8bcc4';c.fillRect(0,2,16,2);c.fillRect(2,4,2,2);c.fillRect(12,4,2,2);});
tile('conv',(c,R)=>{fillF(c,'#2c2c33');
  c.fillStyle='#45454f';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);
  c.fillStyle='#e0b23a';                                 /* direction arrows */
  c.fillRect(2,6,4,1);c.fillRect(5,5,1,1);c.fillRect(5,7,1,1);
  c.fillRect(9,6,4,1);c.fillRect(12,5,1,1);c.fillRect(12,7,1,1);
  c.fillStyle='#1a1a1f';for(let x=3;x<16;x+=4)c.fillRect(x,3,1,10);   /* rollers */
  c.fillStyle='#3a3a44';for(let x=4;x<16;x+=4)c.fillRect(x,5,1,6);});
tile('conv_s',(c,R)=>{fillN(c,R,'#8a8f96',.07);
  c.fillStyle='#2c2c33';c.fillRect(0,3,16,4);            /* the belt band on the side */
  c.fillStyle='#45454f';c.fillRect(0,3,16,1);
  c.fillStyle='#5c6167';c.fillRect(0,7,16,1);c.fillRect(2,8,2,8);c.fillRect(12,8,2,8);});
R(['III','IFI','CCC'],{I:IT.IRON,F:B.FURNACE,C:B.COBBLE},B.ENGINE,1);
R(['II','II'],{I:IT.IRON},B.CONV,6);

/* ----- tracking ------------------------------------------------------- */
const machs=new Set();          /* bkey of every placed machine */
const MC_POW=new Set();         /* powered belt bkeys (recomputed) */
let MC_powAcc=0,MC_puff=0;
function isMach(id){return id===B.ENGINE||id===B.CONV;}
function mcParse(k){const p=k.split(',');return {x:+p[p.length-3],y:+p[p.length-2],z:+p[p.length-1]};}
/* setBlock hook: keep the set honest */
function mcOnSet(x,y,z,old,id){
  const k=bkey(x,y,z);
  if(isMach(old)){machs.delete(k);MC_POW.delete(k);}
  if(isMach(id))machs.add(k);
}
/* world load hook (p07e replays edits) + net edit hook for unloaded chunks:
   both hand us (chunk key, local key, id) — rebuild the world-space bkey */
function mcReplayKey(ck,lk,id){
  if(!isMach(id))return;
  const p=lk.split(','),c2=ck.split(',');
  const kd=(ck[1]===';')?ck.slice(0,2):'';
  machs.add(kd+((+(kd?ck.slice(2).split(',')[0]:c2[0]))*CH+ +p[0])+','+(+p[1])+','+(+c2[1]*CH+ +p[2]));
}

/* ----- power: a burning engine heats every belt within 3 steps --------- */
function mcEngineBurning(k){
  const be=blockEnts.get(k);
  return !!(be&&be.t==='engine'&&be.burn>0);
}
function mcRecomputePower(){
  MC_POW.clear();
  const eng=[];
  for(const k of machs)
    if(getBlockKey(k)===B.ENGINE&&mcEngineBurning(k))eng.push(mcParse(k));
  if(!eng.length)return;
  for(const k of machs){
    if(getBlockKey(k)!==B.CONV)continue;
    const p=mcParse(k);
    for(const e of eng){
      if(Math.abs(p.x-e.x)+Math.abs(p.y-e.y)+Math.abs(p.z-e.z)<=3){MC_POW.add(k);break;}
    }
  }
}
function getBlockKey(k){const p=mcParse(k);return getBlock(p.x,p.y,p.z);}

/* ----- the belt's axis, derived the same on every client ---------------- */
function mcAxis(x,y,z){
  let nx=0,nz=0;
  if(getBlock(x-1,y,z)===B.CONV)nx++;if(getBlock(x+1,y,z)===B.CONV)nx++;
  if(getBlock(x,y,z-1)===B.CONV)nz++;if(getBlock(x,y,z+1)===B.CONV)nz++;
  if(nx!==nz)return nx>nz?0:1;             /* 0: along X, 1: along Z */
  return ((x+z)%2+2)%2;                     /* a lone belt: deterministic parity */
}
/* ----- heated sections: a belt next to a burning furnace smelts cargo --- */
function mcHeated(x,y,z){
  const hot=(a,b,c)=>{
    if(getBlock(a,b,c)!==B.FURNACE)return false;
    const be=blockEnts.get(bkey(a,b,c));
    return !!(be&&be.t==='furnace'&&be.burn>0);
  };
  return hot(x+1,y,z)||hot(x-1,y,z)||hot(x,y+1,z)||hot(x,y-1,z)||hot(x,y,z+1)||hot(x,y,z-1);
}

/* ----- the tick -------------------------------------------------------- */
function machTick(dt){
  if(!machs.size)return;
  MC_powAcc+=dt;
  if(MC_powAcc>0.35){MC_powAcc=0;mcRecomputePower();}
  for(const k of machs){
    const p=mcParse(k);
    if(getBlock(p.x,p.y,p.z)===B.ENGINE)mcEngine(k,p,dt);
  }
  mcBelts(dt);
}
function mcEngine(k,p,dt){
  const be=blockEnts.get(k);
  if(!be||be.t!=='engine')return;
  const was=be.burn>0;
  if(be.burn>0){
    be.burn-=dt;
    /* smoke, but only near the player and not every frame */
    const d2=(p.x+0.5-P.x)*(p.x+0.5-P.x)+(p.z+0.5-P.z)*(p.z+0.5-P.z);
    if(d2<1600){MC_puff-=dt;if(MC_puff<=0){MC_puff=0.9;
      burstParticles(p.x+0.5,p.y+1.15,p.z+0.5,B.COBBLE,2,0.4);}}
  }
  if(be.burn<=0){
    be.burn=0;
    if(be.fuel&&FUELS[be.fuel.id]!=null){
      be.burnMax=be.burn=FUELS[be.fuel.id];
      be.fuel.count--;if(be.fuel.count<=0)be.fuel=null;
      if(MODAL.kind==='engine'&&MODAL.bek===k)redrawModal();
    }
  }
  if(was!==(be.burn>0))mcSync(k,be);
}
/* belts: push drops, mobs and you along the axis while powered */
function mcBelts(dt){
  if(!MC_POW.size)return;
  const spd=2.1;
  for(const e of entities){
    if(e.dead)continue;
    if(e.t!=='drop'&&e.t!=='mob')continue;
    if(e.t==='mob'&&(e.bot||(e.netmid!=null&&!e.netown)))continue;
    mcPush(e,dt,spd);
  }
  if(P&&!P.dead&&!P.flying)mcPush(P,dt,spd*0.9);
}
function mcPush(e,dt,spd){
  const bx=Math.floor(e.x),by=Math.floor(e.y-0.15),bz=Math.floor(e.z);
  const id=getBlock(bx,by,bz);
  if(id!==B.CONV)return;
  const k=bkey(bx,by,bz);
  if(!MC_POW.has(k))return;
  if(mcAxis(bx,by,bz)===0)e.x+=spd*dt;
  else e.z+=spd*dt;
  if(e.t==='drop'){e.vx=lerp(e.vx,0,dt*4);e.vz=lerp(e.vz,0,dt*4);mcSmelt(e,k,bx,by,bz,dt);}
}
/* the heated section: ore rides in, ingots ride out */
function mcSmelt(e,k,bx,by,bz,dt){
  e.smeltCD=Math.max(0,(e.smeltCD||0)-dt);
  if(e.smeltCD>0||!e.st||!SMELT[e.st.id])return;
  if(!mcHeated(bx,by,bz))return;
  const from=e.st.id,to=SMELT[from];
  e.st.id=to;
  if(e.st.dur!=null)delete e.st.dur;
  e.smeltCD=2;
  burstParticles(e.x,e.y+0.3,e.z,B.TORCH,4,0.4);
  playS('pop');
}

/* ----- multiplayer: relay the engine's (and furnace's) burn timer ------- */
function mcSync(k,be){
  if(NET.on&&!NET.suppress)netSend({t:'mach',k:k,on:be.burn>0?1:0,
    burn:+be.burn.toFixed(2),burnMax:+be.burnMax.toFixed(2)});
}
function netMach(m){
  const k=m.k||'';
  if(!k||k.indexOf(',')<0)return;
  const p=mcParse(k);
  const id=getBlock(p.x,p.y,p.z);
  if(id!==B.ENGINE&&id!==B.FURNACE)return;
  let be=blockEnts.get(k);
  if(!be){be=id===B.ENGINE?{t:'engine',fuel:null,burn:0,burnMax:0}
                          :{t:'furnace',in:null,fuel:null,out:null,burn:0,burnMax:0,cook:0};
    blockEnts.set(k,be);}
  if(be.t!=='engine'&&be.t!=='furnace')return;
  if(!be._k)be._k=k;
  be.burn=+m.burn||0;be.burnMax=+m.burnMax||0;
  if((MODAL.kind==='engine'||MODAL.kind==='furnace')&&MODAL.bek===k)redrawModal();
}
