/* =====================================================================
   MULTIPLAYER CLIENT (Tingle Craft) — net0_client.js
   Speaks JSON-over-WebSocket with server.py (repo root). Protocol v2:
   C->S: login/register {name,pass}, pos {x,y,z,yaw,pitch,dim,hp,held},
         set {ck,lk,id}, chat {txt}, cmd {txt}, rtp_res, spawnset,
         buy {item,count}, sell {id,count}, sethome {name}, home {name},
         delhome {name}, homes, adm {act,...}, mach {k,on,burn,burnMax},
         mobres {pid,ok,x,y,z,dim,type}, mobpos {mid,...}, mobhit {mid,dmg},
         mobhitp {mid,name,dmg}, mobdead {mid}, ping
   S->C: welcome {seed,edits,spawn,balance,motd,players,shop,homes,mobs,...},
         denied, join/leave, pos {name,...,held}, set, chat, whisper, sys,
         teleport, balance, give, sold, kick, admin, rtp_req, time {v},
         plist {ps,motd,mobs}, homes {homes}, opensell, mach,
         mobprobe {pid,x,z}, mobadd/mobown/mobpos/mobhp/mobdel/mobdmg
   Remote humans render as tagged humanoids (agHumanoid + agTag) holding
   whatever their client says they hold. The server owns the clock: the
   `time` messages gently steer the local sun. Mobs are brokered: the
   server picks a spot, one client resolves + simulates each mob, everyone
   else interpolates (netMobLerp). Addresses accept ws://host:port/path and
   wss:// — put server.py behind any reverse proxy (docs/MULTIPLAYER.md).
   ===================================================================== */
const NET={on:false,ws:null,host:'',port:0,path:'',name:null,admin:false,suppress:false,
  bal:0,lastSend:0,lastPing:0,lastMobSend:0,remotes:new Map(),mobs:new Map(),status:'',
  shop:[],sell:{},homes:{},plist:[],motd:'',mobsOn:true};

function netBoot(){}   /* reserved: in-game net UI wiring (the panels live on the title screen) */

function netSend(o){
  try{if(NET.ws&&NET.ws.readyState===1)NET.ws.send(JSON.stringify(o));}catch(e){}
}
/* addresses: "host", "host:port", "host/path", "ws://host:port/path",
   "wss://host/whatever" — any reverse-proxy path works */
function netAddr(s){
  s=(''+(s||'')).trim();
  if(!s)return null;
  let proto=null,host='',port=0,path='';
  let m=/^(wss?:\/\/)([^\/:\s]+)(?::(\d+))?([\/\?].*)?$/i.exec(s);
  if(m){
    proto=m[1].toLowerCase()==='wss://'?'wss':'ws';
    host=m[2];port=m[3]?+m[3]:(proto==='wss'?443:8765);path=m[4]||'';
  }else{
    m=/^([^\/:\s]+)(?::(\d+))?([\/].*)?$/.exec(s);
    if(!m||!m[1])return null;
    host=m[1];port=m[2]?+m[2]:0;path=m[3]||'';
    proto=(typeof location!=='undefined'&&location.protocol==='https:')?'wss':'ws';
    if(!port)port=proto==='wss'?443:8765;
  }
  return {host:host,port:port,proto:proto,path:path};
}
function netAddrStr(a){return a.host+':'+a.port+(a.path||'');}
function netConnect(addrStr){
  const a=netAddr(addrStr);
  const st=$('mp_status');
  if(!a){if(st)st.textContent='That address does not look right — try 127.0.0.1:8765 or wss://host/path';return false;}
  netDisconnect(true);
  NET.on=false;NET.name=null;NET.admin=false;NET.bal=0;NET.remotes.clear();NET.mobs.clear();
  if(st)st.textContent='Connecting to '+netAddrStr(a)+' ...';
  let ws=null;
  try{ws=new WebSocket(a.proto+'://'+a.host+':'+a.port+(a.path||''));}catch(e){
    if(st)st.textContent='Could not open the connection.';return false;}
  NET.ws=ws;NET.host=a.host;NET.port=a.port;NET.path=a.path||'';
  ws.onopen=()=>{const s=$('mp_status');
    if(s)s.textContent='Connected. Log in — or Register if it is your first time:';};
  ws.onmessage=e=>{try{netMsg(JSON.parse(e.data));}catch(err){}};
  ws.onclose=()=>{
    if(NET.on){netDisconnect(false);showToast('Disconnected from the server');}
    else if(TM.view==='mplogin'){const s=$('mp_status');
      if(s)s.textContent='Could not connect. Is the server running? (python server.py)';}};
  ws.onerror=()=>{};
  return true;
}
/* leaving: quiet=true also from quitToTitle (no toasts, no ws fuss) */
function netDisconnect(quiet){
  const was=NET.on;
  NET.on=false;
  for(const [name,r] of NET.remotes){if(r.e&&!r.e.dead)removeEnt(r.e);}
  NET.remotes.clear();
  for(const [mid,rec] of NET.mobs){if(rec.e&&!rec.e.dead)removeEnt(rec.e);}
  NET.mobs.clear();
  mpGUIReset();
  if(NET.ws){try{NET.ws.onclose=null;NET.ws.close();}catch(e){}NET.ws=null;}
  if(was&&!quiet)sysMsg('You left the server.');
}
/* ---- outgoing chat + commands (hooked from chatSubmit in a9_ui.js) ---- */
function netChatSubmit(t){
  const c=t.split(' ')[0].toLowerCase();
  if(c==='/shop'){openShop();return;}
  if(c==='/sell'){openSell();return;}
  if(c==='/homes'){openHomes();return;}
  if(c==='/admin'&&NET.admin){openAdm();return;}
  if(t[0]==='/')netSend({t:'cmd',txt:t});
  else netSend({t:'chat',txt:t});
}
/* ---- block edit hook (called from setBlock, p03c) ---- */
function netSendSet(ck,lk,id,old){
  /* batched: ships and big digs leave as one `sets` message (net3_sync) */
  if(typeof netQueueSet==='function'){netQueueSet(ck,lk,id,old);return;}
  netSend({t:'set',ck:ck,lk:lk,id:id,old:old!=null?old:-1});
}
/* ---- incoming edits: through the setBlock funnel, or straight into
        chunkEdits when the chunk is not loaded (createChunk replays them) ---- */
function netApplySet(ck,lk,id){
  const ch=chunks.get(ck);
  if(ch){
    const p=lk.split(','),c2=ck.split(',');
    const kd=(ck[1]===';')?ck.slice(0,2):'';
    const wx=(kd?+(ck.slice(2).split(',')[0]):+c2[0])*CH+ +p[0];
    const wz=+c2[1]*CH+ +p[2];
    NET.suppress=true;
    try{setBlock(wx,+p[1],wz,id);}finally{NET.suppress=false;}
  }else{
    let m=chunkEdits.get(ck);
    if(!m){m=new Map();chunkEdits.set(ck,m);}
    m.set(lk,id);
    if(isTorch(id)){
      const c2=ck.split(','),p=lk.split(',');
      const kd=(ck[1]===';')?ck.slice(0,2):'';
      torches.add(kd+((+(kd?ck.slice(2).split(',')[0]:c2[0]))*CH+ +p[0])+','+(+p[1])+','+(+c2[1]*CH+ +p[2]));
    }
    if(typeof mcReplayKey==='function')mcReplayKey(ck,lk,id);
  }
}
/* ---- welcome: build the world from the server's seed + edits ---- */
function netStartWorld(m){
  NET.on=true;NET.name=m.name;NET.admin=!!m.admin;NET.bal=m.balance|0;
  NET.shop=Array.isArray(m.shop)?m.shop:[];
  NET.sell=(m.sell&&typeof m.sell==='object')?m.sell:{};
  NET.homes=m.homes||{};
  NET.motd=m.motd||'';
  NET.mobsOn=m.mobs!==0;
  try{window.storage.set('mp:acc',NET.name);}catch(e){}
  const st=(m.st&&typeof m.st==='object')?m.st:null;
  const sp=m.spawn||findSpawn();
  if(!m.spawn&&!st)netSend({t:'spawnset',x:+sp[0].toFixed?+sp[0].toFixed(1):sp[0],y:sp[1],z:sp[2]});
  const px=st?st.x:sp[0],py=st?st.y:sp[1],pz=st?st.z:sp[2];
  applySave({f:1,seed:m.seed|0,mode:'s',time:+m.time||0.3,
    dim:(st&&st.dim)||'over',snl:0,
    nukes:[],edits:m.edits||{},be:m.be||{},ents:[],gr:{},
    player:{x:px,y:py,z:pz,yaw:st?st.yaw:0,pitch:st?st.pitch:0,
      hp:st?st.hp:20,hunger:st?st.hun:20,sel:st?st.sel:0,
      spawn:(st&&st.spawn&&st.spawn.length===3)?st.spawn:[sp[0],sp[1],sp[2]],
      inv:st?st.inv.map(a=>a?{id:a[0],count:a[1],...(a[2]!=null?{dur:a[2]}:{})}:null):[],
      stox:{bal:0,sh:{},cb:{}},xp:st?st.xp:0,
      armor:st?st.armor.map(a=>a?{id:a[0],...(a[1]!=null?{dur:a[1]}:{})}:null):[0,0,0,0],
      db:0,own:[],cos:{},bp:0,bpl:0,pow:{u:{},a:{}}}});
  P.db=Math.max(0,m.balance|0);
  if(st&&st.spawn&&st.spawn.length===3)P.spawn=[st.spawn[0],st.spawn[1],st.spawn[2]];
  if(m.set)netApplySettings(m.set);
  GR.dayCycle=true;                       /* the server owns the clock: keep it running */
  WORLD.name='MP '+netAddrStr({host:NET.host,port:NET.port,path:NET.path});
  enterGame();
  if(typeof mpSaveName==='function')mpSaveName();
  mpShowButtons();
  showToast('Joined as '+NET.name+(NET.admin?' (admin)':''));
  sysMsg('[Server] '+(m.motd||'Welcome.'));
  if(m.players&&m.players.length)sysMsg('[Server] Online: '+m.players.join(', '));
  /* the world you rejoin is alive already: ships, mobs, chests */
  if(Array.isArray(m.ships)&&typeof shipFromNet==='function')
    for(const s of m.ships)shipFromNet(s[0],s[1],+s[2],+s[3],+s[4],+s[5]||0,null);
  if(Array.isArray(m.mobs_list))
    for(const mo of m.mobs_list)
      netSpawnMob(mo[0],mo[1],+mo[2],+mo[3],+mo[4],mo[8]===NET.name,mo[6],mo[5],mo[7]);
  netStateSend();
}
function netApplyTeleport(m){
  if(!P)return;
  let x=+m.x,y=+m.y,z=+m.z;
  if(!isFinite(x))x=0.5;                 /* a NaN teleport must never stick */
  if(!isFinite(y))y=40;
  if(!isFinite(z))z=0.5;
  const d=(m.dim==='backrooms')?'backrooms':'over';
  const farJump=(d===DIM)&&(Math.hypot(x-P.x,z-P.z)>600);
  setDim(d,x,y,z);
  if(farJump){
    /* a Backrooms level jump inside the same dimension: drop the old
       region's chunks right away instead of streaming them out slowly */
    for(const [k,ch] of chunks)disposeChunkMeshes(ch);
    chunks.clear();
  }
  forceChunksNear(P.x,P.z);
  if(d==='over'&&DIM==='over'){
    const h=colInfo(Math.floor(P.x),Math.floor(P.z)).h;
    if(isFinite(h)&&Math.abs(P.y-(h+1.2))>3)P.y=h+1.2;
  }
  P.fallD=0;
}
/* ---- server clock: steer the local sun, gently ---- */
function netTimeSync(v){
  if(!v&&v!==0)return;
  const cur=((timeOfDay%1)+1)%1;
  let d=v-cur;
  if(d>0.5)d-=1;else if(d<-0.5)d+=1;
  timeOfDay+=Math.abs(d)>0.02?d:d*0.15;
}
/* ---- the per-frame tick: throttled position send + interpolation ---- */
function netTick(dt){
  if(!NET.on||!NET.ws||NET.ws.readyState!==1)return;
  if(!P||P.dead)return;
  const now=performance.now();
  if(now-NET.lastSend>100){
    NET.lastSend=now;
    const held=(P.inv&&P.inv[P.sel])?P.inv[P.sel].id:0;
    netSend({t:'pos',x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),
      yaw:+P.yaw.toFixed(3),pitch:+P.pitch.toFixed(3),dim:DIM,hp:Math.round(P.hp),
      held:held|0});
  }
  if(now-NET.lastPing>20000){NET.lastPing=now;netSend({t:'ping'});}
  if(typeof n3Tick==='function')n3Tick(dt);
  /* owned relayed mobs: stream their simulation to the server (~10 Hz) */
  if(now-NET.lastMobSend>100){
    NET.lastMobSend=now;
    if(NET.mobs.size){
      for(const [mid,rec] of NET.mobs){
        const e=rec.e;
        if(!e||e.dead){NET.mobs.delete(mid);continue;}
        if(e.netown&&rec.dim===DIM)
          netSend({t:'mobpos',mid:mid,x:+e.x.toFixed(2),y:+e.y.toFixed(2),
            z:+e.z.toFixed(2),yaw:+e.yaw.toFixed(2),hp:Math.round(e.hp)});
      }
    }
  }
  for(const [name,r] of NET.remotes){
    const e=r.e;
    if(!e||e.dead){NET.remotes.delete(name);continue;}
    if(r.dim!==DIM){e.mesh.visible=false;continue;}
    e.mesh.visible=true;
    const k=1-Math.exp(-dt*12);
    const ox=e.x,oz=e.z;
    e.x=lerp(e.x,r.tx,k);e.y=lerp(e.y,r.ty,k);e.z=lerp(e.z,r.tz,k);
    e.yaw=r.tyaw;e.pitch=r.tpitch;
    const M=e.M;if(!M)continue;
    const spd=dt>0?Math.hypot(e.x-ox,e.z-oz)/dt:0;
    e.anim+=spd*dt*2.4;
    const sw=Math.sin(e.anim)*0.7*clamp(spd/4.4,0,1);
    M.lL.rotation.x=sw;M.lR.rotation.x=-sw;
    M.aL.rotation.x=-sw*0.8;M.aR.rotation.x=sw*0.8-0.35;
    M.head.rotation.x=-(e.pitch||0)*0.8;
    M.G.position.set(e.x,e.y,e.z);
    M.G.rotation.y=e.yaw;
  }
}
/* ---- remote players ---- */
const NET_SHIRTS=[0x3a7a4a,0x8a3a3a,0x3a5a8a,0x8a7a2a,0x5a3a8a,0x2a8a7a,0x8a4a7a,0x4a4a4a];
function netRemoteDef(name){
  let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;
  return {skin:0xd2a07a,shirt:NET_SHIRTS[h%NET_SHIRTS.length],pants:0x34343a,shoe:0x1e1e1e};
}
/* a small prop for another player's hand: real cube for blocks, sprite for items */
function netHeldMesh(id){
  id=id|0;
  if(!id||!DEFS[id])return null;
  const d=DEFS[id];
  if(!d.item&&!d.cross){
    const m=new THREE.Mesh(mkCubeGeo(id,0.3),matOp);
    m.rotation.z=0.4;return m;
  }
  if(typeof mkTool3D==='function'&&(toolIdParts(id)||gunIdParts(id))){
    let m=null;
    try{m=toolIdParts(id)?mkTool3D(id,0.4,true):mkWpn3D(id,0.45);}catch(e){m=null;}
    if(m)return m;
  }
  const s=new THREE.Sprite(iconTex(id));
  s.scale.set(0.36,0.36,0.36);return s;
}
function netSetHeld(r,id){
  id=id|0;
  if(r.held===id)return;
  r.held=id;
  const M=r.e&&r.e.M;
  if(!M)return;
  if(M.heldMesh){M.aR.remove(M.heldMesh);M.heldMesh=null;}
  const m=netHeldMesh(id);
  if(m){m.position.set(0,-0.55,-0.12);M.aR.add(m);M.heldMesh=m;}
}
function netRemoteUpdate(name,x,y,z,yaw,pitch,dim,hp,held){
  let r=NET.remotes.get(name);
  if(!r){
    const M=agHumanoid(netRemoteDef(name));
    M.tag=agTag(name);M.G.add(M.tag);
    shadowify(M.G);
    scene.add(M.G);
    const e={t:'netp',mob:false,name:name,x:x,y:y,z:z,vx:0,vy:0,vz:0,onGround:true,
      yaw:yaw,pitch:pitch,hp:hp||20,hw:0.3,h:1.8,mesh:M.G,legs:[],mats:M.mats,M,anim:0,dim:dim};
    entities.push(e);
    r={e:e,tx:x,ty:y,tz:z,tyaw:yaw,tpitch:pitch,dim:dim,held:-1};
    NET.remotes.set(name,r);
    sysMsg(name+' is here');
  }
  r.tx=x;r.ty=y;r.tz=z;r.tyaw=yaw;r.tpitch=pitch;r.dim=dim;
  r.e.hp=hp||20;
  if(held!=null)netSetHeld(r,held);
}
function netRemoteRemove(name){
  const r=NET.remotes.get(name);
  if(r){if(r.e&&!r.e.dead)removeEnt(r.e);NET.remotes.delete(name);}
}
/* ---- relayed mobs ---------------------------------------------------
   mobadd/mobown: everyone spawns the mob; one client owns the simulation.
   The owner runs the normal AI (updateMob) and streams mobpos; the others
   glide along on netMobLerp. Blows land via mobhit (server tracks hp). */
function netSpawnMob(mid,mt,x,y,z,own,hp,yaw,dim){
  if(!MOBT[mt])return;
  let rec=NET.mobs.get(mid);
  if(rec&&rec.e&&!rec.e.dead){
    rec.dim=dim||rec.dim;
    rec.e.netown=!!own;
    return;
  }
  spawnMob(mt,x,y,z);
  const e=entities[entities.length-1];
  if(!e||!e.mob)return;
  e.netmid=mid;e.netown=!!own;
  if(hp!=null)e.hp=hp;
  if(yaw!=null)e.yaw=yaw;
  e.ntx=x;e.nty=y;e.ntz=z;e.ntyaw=e.yaw;
  e.lx=x;e.lz=z;
  NET.mobs.set(mid,{e:e,dim:dim||DIM});
}
function netMobRemove(mid,fx){
  const rec=NET.mobs.get(mid);
  if(!rec)return;
  const e=rec.e;
  if(e&&!e.dead){
    if(fx)burstParticles(e.x,e.y+e.h*0.5,e.z,B.TNT,8,0.5);
    removeEnt(e);
  }
  NET.mobs.delete(mid);
}
/* non-owner interpolation: no AI, no physics — just the glide */
function netMobLerp(e,dt){
  const k=1-Math.exp(-dt*9);
  e.x=lerp(e.x,e.ntx!=null?e.ntx:e.x,k);
  e.y=lerp(e.y,e.nty!=null?e.nty:e.y,k);
  e.z=lerp(e.z,e.ntz!=null?e.ntz:e.z,k);
  if(e.ntyaw!=null)e.yaw+=(((e.ntyaw-e.yaw+Math.PI*3)%(Math.PI*2))-Math.PI)*Math.min(1,dt*8);
  e.mesh.position.set(e.x,e.y,e.z);
  e.mesh.rotation.y=e.yaw;
  const dtm=dt||0.016;
  const hv=Math.hypot(e.x-(e.lx!=null?e.lx:e.x),e.z-(e.lz!=null?e.lz:e.z))/dtm;
  e.lx=e.x;e.lz=e.z;
  e.anim=(e.anim||0)+dt*hv*3.2;
  for(const L of e.legs){
    const sw=Math.sin(e.anim+L.ph)*L.amp*Math.min(1,Math.max(0.15,hv*0.5));
    if(L.ax==='x')L.g.rotation.x=sw;
    else L.g.rotation.z=L.base+sw*0.6;
  }
}
/* the server asked us to resolve a spawn spot (we own whatever hatches) */
function netMobProbe(m){
  let ok=false,y=0,type='';
  const x=m.x|0,z=m.z|0;
  if(DIM==='over'&&P&&!P.dead&&chunkAt(x,z)){
    const d=Math.hypot(x-P.x,z-P.z);
    if(d<72){
      const sy=surfaceTop(x,z);
      if(!sunUp()){
        if(sy>SEA-1&&!torchNear(x,sy+1,z)){ok=true;y=sy+1;
          const r=Math.random();type=r<0.35?'zombie':r<0.62?'skel':r<0.82?'boomer':'spider';}
      }else{
        const g=getBlock(x,sy,z);
        if((g===B.GRASS||g===B.SNOWGRASS)&&Math.random()<0.7){ok=true;y=sy+1;
          const r=Math.random();type=r<0.08?'pig':r<0.5?'cow':'sheep';}
      }
    }
  }
  netSend({t:'mobres',pid:m.pid,ok:ok?1:0,x:x+0.5,y:y,z:z+0.5,dim:DIM,type:type});
}
/* ---- the message pump ---- */
function netMsg(m){
  switch(m.t){
    case 'welcome':netStartWorld(m);break;
    case 'denied':{const s=$('mp_status');if(s)s.textContent=m.reason||'Rejected.';break;}
    case 'join':sysMsg(m.name+' joined the game');break;
    case 'leave':netRemoteRemove(m.name);sysMsg(m.name+' left the game');break;
    case 'pos':netRemoteUpdate(m.name,+m.x,+m.y,+m.z,+m.yaw||0,+m.pitch||0,m.dim||'over',m.hp,m.held);break;
    case 'set':netApplySet(m.ck,m.lk,m.id|0);break;
    case 'chat':chatPush({k:'chat',from:m.from,txt:m.txt});break;
    case 'whisper':chatPush({k:'whisper',from:m.from,txt:m.txt});break;
    case 'sys':sysMsg(m.txt);break;
    case 'teleport':netApplyTeleport(m);break;
    case 'balance':NET.bal=m.amt|0;if(P){P.db=NET.bal;drawStats&&drawStats();}showToast('Balance: '+NET.bal+' DB');mpRefreshGuis();break;
    case 'give':{if(typeof givePlayer==='function'){givePlayer(m.id|0,m.count||1);
      const nm=m.name&&m.name!=='loot'?m.name:(DEFS[m.id]&&DEFS[m.id].name)||('item '+m.id);
      showToast((m.name&&m.name!=='loot'?'Bought ':'Got ')+(m.count||1)+' x '+nm);}break;}
    case 'sold':showToast('Sold '+(m.count|0)+' for '+(m.earn|0)+' DB');if(sellOpen)renderSell();break;
    case 'kick':netDisconnect(true);showToast(m.reason||'Kicked');if(playing)quitToTitle();break;
    case 'admin':NET.admin=!!m.on;showToast(NET.admin?'You are now an admin':'Admin taken away');mpShowButtons();break;
    case 'time':netTimeSync(+m.v);break;
    case 'plist':NET.plist=m.ps||[];NET.motd=m.motd||NET.motd;NET.mobsOn=!!m.mobs;if(admOpen)renderAdm();break;
    case 'homes':NET.homes=m.homes||{};if(homesOpen)renderHomes();break;
    case 'opensell':if(NET.on)openSell();break;
    case 'mach':if(typeof netMach==='function')netMach(m);break;
    case 'be':if(typeof netBeApply==='function')netBeApply(m.k,m.d);break;
    case 'shipadd':if(typeof shipFromNet==='function')
      shipFromNet(m.sid,m.d,+m.x,+m.y,+m.z,+m.yaw||0,m.rider);break;
    case 'shippos':{
      const e=(typeof NSH!=='undefined')&&NSH.list.get(m.sid);
      if(e&&!e.dead){e.ntx=+m.x;e.nty=+m.y;e.ntz=+m.z;e.ntyaw=+m.yaw||0;}
      break;}
    case 'shipdel':if(typeof shipNetRemove==='function')shipNetRemove(m.sid);break;
    case 'shipride':
      if(m.on&&m.name&&m.name!==NET.name)sysMsg(m.name+' took the helm');
      break;
    case 'pvdmg':{
      if(P&&!P.dead){LASTDMG={by:m.from||'player',how:'shot',t:AG_T};damagePlayer(m.dmg|0,0,0);}
      break;}
    case 'mobprobe':netMobProbe(m);break;
    case 'mobadd':netSpawnMob(m.mid,m.type,+m.x,+m.y,+m.z,m.own===NET.name,undefined,undefined,m.dim);break;
    case 'mobown':netSpawnMob(m.mid,m.type,+m.x,+m.y,+m.z,true,m.hp,m.yaw,m.dim);break;
    case 'mobpos':{
      const rec=NET.mobs.get(m.mid);
      if(rec&&rec.e&&!rec.e.dead){const e=rec.e;e.ntx=+m.x;e.nty=+m.y;e.ntz=+m.z;e.ntyaw=+m.yaw||0;e.hp=m.hp|0;}
      break;}
    case 'mobhp':{
      const rec=NET.mobs.get(m.mid);
      if(rec&&rec.e&&!rec.e.dead){const e=rec.e;e.hp=m.hp|0;e.hurtT=0.35;
        for(const mm of e.mats)mm.emissive&&mm.emissive.setRGB(0.45,0,0);}
      break;}
    case 'mobdel':netMobRemove(m.mid,true);break;
    case 'mobdmg':{
      if(P&&!P.dead){LASTDMG={by:m.type||'mob',how:'mob',t:AG_T};damagePlayer(m.dmg|0,0,0);}
      break;}
    case 'rtp_req':{
      /* the server offers candidates; colInfo is pure terrain math, so we
         can judge every one without loading a single chunk. Pick the first
         honest dry spot: land height, not ocean biome, room to stand. */
      const cs=Array.isArray(m.cs)?m.cs:[];
      let best=-1,bx=0.5,by=40,bz=0.5;
      for(let i=0;i<cs.length;i++){
        const tx=cs[i][0]|0,tz=cs[i][1]|0;
        try{
          const ci=colInfo(tx,tz);
          if(ci&&ci.h>=SEA+1&&ci.b!==0&&ci.h<WH-10){best=i;bx=tx+0.5;by=ci.h+2;bz=tz+0.5;break;}
        }catch(e){}
      }
      netSend({t:'rtp_res',i:best,x:bx,y:by,z:bz});
      break;}
    case 'pong':break;
  }
}
