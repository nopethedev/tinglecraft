/* =====================================================================
   MULTIPLAYER SYNC (Tingle Craft) — net3_sync.js
   The "everything saves and syncs" layer between the client and server.py:

   - player state snapshots: inventory, position, hp, hunger, xp, armor and
     hotbar stream to the server every few seconds (and right after big
     changes), so rejoining never wipes progress again
   - per-account gamerule settings: admins' debug toggles follow them
     between sessions (the server only hands them back to admins)
   - block entities: chests, furnaces and steam engines sync to the server
     whenever their contents change, and are replayed from the welcome
   - ships: assembly data up, the driver's physics streamed out, other
     people's ships gliding in, teardown relayed
   - batched block edits: ships and big digs arrive as one `sets` message
     instead of hundreds of `set` messages
   ===================================================================== */
const N3={lastState:0,lastBe:0,beCache:new Map(),setQ:[],lastFlush:0,
  riding:null,lastShip:0,lastBePush:{}};

/* ---- batched block edits (netSendSet is called by the setBlock funnel) -- */
function netQueueSet(ck,lk,id,old){
  N3.setQ.push([ck,lk,id|0,old!=null?(old|0):-1]);
  const now=performance.now();
  if(N3.setQ.length>=2000||now-N3.lastFlush>180)netFlushSets(now);
}
function netFlushSets(force){
  const now=performance.now();
  if(!force&&now-N3.lastFlush<180)return;
  N3.lastFlush=now;
  if(!N3.setQ.length)return;
  const list=N3.setQ.splice(0,3000);
  if(NET.on&&NET.ws&&NET.ws.readyState===1)
    netSend({t:list.length===1?'set':'sets',
      ...(list.length===1?{ck:list[0][0],lk:list[0][1],id:list[0][2],old:list[0][3]}
                         :{list:list})});
}

/* ---- player state snapshots ---- */
function netStateSend(){
  if(!NET.on||!P)return;
  const inv=P.inv.map(s=>s?[s.id|0,s.count|0,(s.dur!=null?Math.round(s.dur):null)]:null);
  const armor=(P.armor||[]).slice(0,4).map(a=>a?[a.id|0,(a.dur!=null?Math.round(a.dur):null)]:null);
  netSend({t:'state',x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),
    yaw:+P.yaw.toFixed(3),pitch:+P.pitch.toFixed(3),dim:DIM,
    hp:Math.round(P.hp),hun:Math.round(P.hunger),sel:P.sel|0,
    xp:Math.round(P.xp||0),inv:inv,armor:armor,
    spawn:(P.spawn||[]).map(v=>+v.toFixed(1))});
}
/* ---- per-account settings (admins) ---- */
function netSendSettings(){
  if(!NET.on||!NET.admin)return;
  const keep={};
  for(const k of ['keepInv','god','mobGrief','mobSpawn','dayCycle','fireTick','fallDmg',
    'snail','instaKill','freezeMobs','ghosts','bots','botPvP','botGrief','botPurg',
    'fbOK','store','powers','cheats'])keep[k]=!!GR[k];
  keep.jsc=GR.jsc|0;
  netSend({t:'settings',d:keep});
}
function netApplySettings(d){
  if(!d||!NET.admin)return;
  const g=GR_DEF();
  for(const k in g){
    if(d[k]!==undefined&&k!=='dayCycle')g[k]=(typeof g[k]==='boolean')?!!d[k]:d[k];
  }
  g.dayCycle=true;                 /* the server owns the sun */
  Object.assign(GR,g);
  if(typeof grApplyUI==='function')grApplyUI();
}
/* ---- block entities (chests / furnaces / engines) ---- */
function beSerialize(b){
  const o={t:b.t};
  if(b.inv)o.inv=b.inv.map(s=>s?{id:s.id,count:s.count,dur:s.dur}:null);
  if(b.fuel)o.fuel=b.fuel?{id:b.fuel.id,count:b.fuel.count,dur:b.fuel.dur}:null;
  if(b.in)o.in=b.in?{id:b.in.id,count:b.in.count,dur:b.in.dur}:null;
  if(b.out)o.out=b.out?{id:b.out.id,count:b.out.count,dur:b.out.dur}:null;
  if(b.burn!=null)o.burn=Math.round(b.burn*10)/10;
  if(b.burnMax!=null)o.burnMax=Math.round(b.burnMax*10)/10;
  if(b.cook!=null)o.cook=Math.round(b.cook*10)/10;
  return o;
}
function netBePush(k){
  const b=blockEnts.get(k);
  if(!b)return;
  const j=JSON.stringify(beSerialize(b));
  if(N3.beCache.get(k)===j)return;
  N3.beCache.set(k,j);
  netSend({t:'be',k:k,d:beSerialize(b)});
}
function netBeTick(now){
  if(now-N3.lastBe<2500)return;
  N3.lastBe=now;
  for(const [k,b] of blockEnts){
    if(N3.lastBePush[k]&&now-N3.lastBePush[k]<8000)continue;
    const p=dimP(k);
    if(!p)continue;
    const dx=p[0]-P.x,dy=p[1]-P.y,dz=p[2]-P.z;
    if(dx*dx+dy*dy+dz*dz>2500)continue;
    N3.lastBePush[k]=now;
    netBePush(k);
  }
}
function netBeApply(k,d){
  if(!k||!d||!d.t)return;
  const b=JSON.parse(JSON.stringify(d));
  if(b.t==='chest'){b.inv=(b.inv||[]).slice(0,27);while(b.inv.length<27)b.inv.push(null);}
  b._k=k;
  blockEnts.set(k,b);
  N3.beCache.set(k,JSON.stringify(beSerialize(b)));
  if(MODAL.kind&&MODAL.bek===k){MODAL.be=b;redrawModal();}
}
/* ---- ships ---- */
function netShipTick(now){
  const sh=(P&&P.ride&&P.ride.t==='ship')?P.ride:null;
  const sid=sh?sh.sid:null;
  if(N3.riding&&N3.riding!==sid){
    netSend({t:'shipride',sid:N3.riding,on:0});
    N3.riding=null;
  }
  if(!sh)return;
  if(N3.riding!==sid){
    N3.riding=sid;
    netSend({t:'shipride',sid:sid,on:1});
    N3.lastShip=0;
  }
  if(now-N3.lastShip>100&&sh.sid){
    N3.lastShip=now;
    netSend({t:'shippos',sid:sh.sid,x:+sh.x.toFixed(2),y:+sh.y.toFixed(2),
      z:+sh.z.toFixed(2),yaw:+sh.yaw.toFixed(3)});
  }
}
/* ---- the per-frame entry point (called from netTick) ---- */
function n3Tick(dt){
  if(!NET.on||!P||P.dead)return;
  const now=performance.now();
  netFlushSets(false);
  if(now-N3.lastState>5000){N3.lastState=now;netStateSend();}
  netBeTick(now);
  netShipTick(now);
}
