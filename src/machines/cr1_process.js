/* =====================================================================
   CREATE PACK, part 2 — machine behaviours (Tingle Craft).
   Runs after mc0's tick: belts push, engines burn; this file adds the
   press, millstone, mixer, funnels, chutes and the windmill bearing.

   THE PRESS (powered): every 1.4 s it stomps the gap between itself and
   the block it stands on. Anything in the gap that has a pressing recipe
   becomes its pressed form (iron -> iron sheet, sand -> sandstone...).
   THE MILLSTONE (powered): grinds drops that rest on top of it every
   0.9 s (cobble -> gravel -> sand, wheat -> flour, logs -> planks).
   THE MIXER (powered): washes drops sitting on an adjacent basin every
   1.1 s (gravel -> sand, with a chance of iron panning out).
   FUNNEL (powered): every 0.5 s takes the drops resting on top of it and
   files them into the container underneath (chest, vault, furnace's top
   slot, engine's fuel slot).
   CHUTE: anything that falls into it drops out of the bottom of the
   column — a one-way vertical item lift powered by gravity itself.
   WINDMILL BEARING: right-click to start. It counts the sails (and wool)
   attached to it; six or more and it spins, powering the network with
   32 per sail. Right-click again to brake.

   Recipes live in PRESS_OUT / MILL_OUT / MIX_OUT below.
   ===================================================================== */
const PRESS_OUT={};
PRESS_OUT[IT.IRON]=IT.SHEET;
PRESS_OUT[IT.GOLD]=IT.GSHEET;
PRESS_OUT[B.SAND]=B.SANDSTONE;
PRESS_OUT[IT.CLAYBALL]=IT.BRICKIT;
const MILL_OUT={};
MILL_OUT[B.COBBLE]=[B.GRAVEL,1];
MILL_OUT[B.GRAVEL]=[B.SAND,1];
MILL_OUT[B.WHEATB]=[IT.FLOUR,2];
MILL_OUT[B.LOG_O]=[B.PLANK_O,4];
MILL_OUT[B.LOG_B]=[B.PLANK_B,4];
MILL_OUT[B.LOG_S]=[B.PLANK_S,4];
const MIX_OUT={};
MIX_OUT[B.GRAVEL]=[B.SAND,1];

const CR_CD=new Map();          /* bkey -> next stomp time */
const CR_ACC={t:0};

/* wrap the v7.1 tick: engines + belts first, then the factory floor */
const _mcTick0=machTick;
machTick=function(dt){
  _mcTick0(dt);
  crTick(dt);
};
/* the old proximity rule still runs; union the kinetic grid on top */
const _mcRecompute=mcRecomputePower;
mcRecomputePower=function(){
  _mcRecompute();
  crRecomputePower();
};

function crCdue(k,period){
  const now=performance.now()*0.001;
  const nx=CR_CD.get(k)||0;
  if(now<nx)return false;
  CR_CD.set(k,now+period);
  return true;
}
function crDropsIn(x,y,z){
  const out=[];
  for(const e of entities){
    if(e.dead||e.t!=='drop'||!e.st||!e.st.id)continue;
    if(Math.floor(e.x)!==x||Math.floor(e.y)!==y||Math.floor(e.z)!==z)continue;
    out.push(e);
  }
  return out;
}
function crTick(dt){
  if(!machs.size)return;
  CR_ACC.t+=dt;
  if(CR_ACC.t<0.16)return;      /* the factory floor scans at ~6 Hz */
  CR_ACC.t=0;
  crPresses();
  crMills();
  crMixers();
  crFunnels();
  crChutes();
}
/* ----- the mechanical press ----- */
function crPresses(){
  for(const p of crPoweredOf(B.PRESS)){
    if(!DEFS[getBlock(p.x,p.y-2,p.z)]||!DEFS[getBlock(p.x,p.y-2,p.z)].solid)continue;
    const k=bkey(p.x,p.y,p.z);
    if(!crCdue(k,1.4))continue;
    const drops=crDropsIn(p.x,p.y-1,p.z);
    if(!drops.length){CR_CD.delete(k);continue;}
    let hitAny=false;
    for(const e of drops){
      const to=PRESS_OUT[e.st.id];
      if(to==null)continue;
      e.st.id=to;
      if(e.st.dur!=null)delete e.st.dur;
      hitAny=true;
      burstParticles(e.x,e.y+0.4,e.z,B.PRESS,5,0.5);
    }
    if(hitAny){playS('anvil');playS('pop');}
    else CR_CD.delete(k);
  }
}
/* ----- the millstone ----- */
function crMills(){
  for(const p of crPoweredOf(B.MILL)){
    const k=bkey(p.x,p.y,p.z);
    if(!crCdue(k,0.9))continue;
    const drops=crDropsIn(p.x,p.y+1,p.z);
    if(!drops.length){CR_CD.delete(k);continue;}
    let hitAny=false;
    for(const e of drops){
      const to=MILL_OUT[e.st.id];
      if(!to)continue;
      e.st.id=to[0];
      e.st.count=Math.min(999,e.st.count*to[1]);
      if(e.st.dur!=null)delete e.st.dur;
      hitAny=true;
      burstParticles(e.x,e.y+0.4,e.z,B.MILL,4,0.4);
    }
    if(hitAny)playS('pop');
    else CR_CD.delete(k);
  }
}
/* ----- the mixer (bulk washing over a basin) ----- */
function crMixers(){
  for(const p of crPoweredOf(B.MIXER)){
    const k=bkey(p.x,p.y,p.z);
    if(!crCdue(k,1.1))continue;
    const basins=[[p.x,p.y-1,p.z],[p.x+1,p.y-1,p.z],[p.x-1,p.y-1,p.z],
                  [p.x,p.y-1,p.z+1],[p.x,p.y-1,p.z-1]];
    let hitAny=false;
    for(const [bx,by,bz] of basins){
      if(getBlock(bx,by,bz)!==B.BASIN)continue;
      const drops=crDropsIn(bx,by+1,bz);
      for(const e of drops){
        if(e.st.id===B.GRAVEL){
          e.st.id=B.SAND;
          if(Math.random()<0.18)spawnDrop(e.x,e.y+0.4,e.z,{id:IT.IRON,count:1},0,1,0);
          hitAny=true;
          burstParticles(e.x,e.y+0.4,e.z,B.WATER,4,0.4);
        }else{
          const to=MIX_OUT[e.st.id];
          if(!to)continue;
          e.st.id=to[0];
          if(e.st.dur!=null)delete e.st.dur;
          hitAny=true;
        }
      }
    }
    if(hitAny)playS('splash');
    else CR_CD.delete(k);
  }
}
/* ----- the funnel: drops above go into the container below ----- */
function crFunnels(){
  for(const p of crPoweredOf(B.FUNNEL)){
    const k=bkey(p.x,p.y,p.z);
    if(!crCdue(k,0.5))continue;
    const below=getBlock(p.x,p.y-1,p.z);
    let be=null,field=null;
    if(below===B.CHEST||below===B.VAULT){be=ensureBE(p.x,p.y-1,p.z,'chest');field='inv';}
    else if(below===B.FURNACE){be=ensureBE(p.x,p.y-1,p.z,'furnace');}
    else if(below===B.ENGINE){be=ensureBE(p.x,p.y-1,p.z,'engine');field='fuel';}
    if(!be){CR_CD.delete(k);continue;}
    const drops=crDropsIn(p.x,p.y+1,p.z);
    if(!drops.length){CR_CD.delete(k);continue;}
    let moved=false;
    for(const e of drops){
      if(field==='inv'){
        if(invAddTo(be.inv,e.st)>0)continue;
      }else if(be.t==='furnace'){
        if(FUELS[e.st.id]!=null){if(beAdd(be,'fuel',e.st)>0)continue;}
        else if(beAdd(be,'in',e.st)>0)continue;
      }else{ /* engine fuel */
        if(beAdd(be,'fuel',e.st)>0)continue;
      }
      e.dead=true;removeEnt(e);
      moved=true;
      if(typeof netBePush==='function')netBePush(bkey(p.x,p.y-1,p.z));
    }
    if(!moved)CR_CD.delete(k);
  }
}
/* ----- the chute: gravity's own item lift ----- */
function crChutes(){
  for(const p of crPoweredOf(B.CHUTE)){
    const drops=crDropsIn(p.x,p.y,p.z);
    if(!drops.length)continue;
    let bot=p.y;
    while(bot>1&&getBlock(p.x,bot-1,p.z)===B.CHUTE)bot--;
    for(const e of drops){
      if((e.chuteCD||0)>performance.now()*0.001)continue;
      e.x=p.x+0.5;e.z=p.z+0.5;
      e.y=bot-0.1;                       /* the cell under the lowest chute */
      e.vy=0;e.vx=0;e.vz=0;
      e.chuteCD=performance.now()*0.001+0.4;
      if(typeof netBeTick==='function'){}        /* no-op keep lint calm */
    }
  }
}
/* ----- the windmill bearing ----- */
function crBearingUse(hit){
  const k=bkey(hit.x,hit.y,hit.z);
  const b=ensureBE2(hit.x,hit.y,hit.z);
  if(!b)return;
  if(b.on){
    b.on=false;
    showToast('The windmill brakes. The sails settle.');
    playS('place');
  }else{
    const sails=crCountSails(hit.x,hit.y,hit.z);
    if(sails<6){showToast('The bearing needs at least 6 sails (or wool) attached. Attached: '+sails+'.');return;}
    b.on=true;b.sails=sails;
    showToast('The windmill turns! '+sails+' sails, '+(sails*32)+' power.');
    playS('jackpot');
  }
  if(typeof netBePush==='function')netBePush(k);
}
function ensureBE2(x,y,z){
  const k=bkey(x,y,z);
  let be=blockEnts.get(k);
  if(!be||be.t!=='bearing'){be={t:'bearing',on:false,sails:0};be._k=k;blockEnts.set(k,be);}
  return be;
}
function crCountSails(x,y,z){
  const seen=new Set(['0,0,0']);
  const q=[[x,y,z]];
  let n=0;
  while(q.length&&n<=512){
    const [cx,cy,cz]=q.pop();
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const nx=cx+dx,ny=cy+dy,nz=cz+dz;
      const key=(nx-x)+','+(ny-y)+','+(nz-z);
      if(seen.has(key))continue;
      seen.add(key);
      const id=getBlock(nx,ny,nz);
      if(id!==B.SAIL&&id!==B.WOOL)continue;
      n++;
      q.push([nx,ny,nz]);
    }
  }
  return n;
}
