/* =====================================================================
   MULTIPLAYER CLIENT (Tingle Craft) — net0_client.js
   Speaks JSON-over-WebSocket with server.py (repo root). Protocol:
   C->S: login/register {name,pass}, pos {x,y,z,yaw,pitch,dim,hp},
         set {ck,lk,id} (chunk key, local key, block id), chat {txt},
         cmd {txt} (a "/..." command for the server), rtp_res {x,y,z,dim},
         spawnset {x,y,z}, ping
   S->C: welcome {seed,edits,spawn,balance,motd,players,...}, denied {reason},
         join/leave {name}, pos {name,...}, set {ck,lk,id}, chat {from,txt},
         whisper {from,txt}, sys {txt}, teleport {x,y,z,dim}, balance {amt},
         give {id,count,name}, kick {reason}, admin {on}, rtp_req {tx,tz}
   Remote humans render as tagged humanoids (agHumanoid + agTag from PART 53)
   with exponential interpolation in netTick(). Block edits funnel through
   setBlock (p03c) via the netSendSet hook; incoming edits apply silently
   through the same funnel with NET.suppress raised so they never echo.
   ===================================================================== */
const NET={on:false,ws:null,host:'',port:0,name:null,admin:false,suppress:false,
  bal:0,lastSend:0,remotes:new Map(),status:''};

function netBoot(){}   /* reserved: in-game net UI wiring (the panels live on the title screen) */

function netSend(o){
  try{if(NET.ws&&NET.ws.readyState===1)NET.ws.send(JSON.stringify(o));}catch(e){}
}
function netAddr(s){
  s=(''+(s||'')).trim();
  if(!s)return null;
  const m=/^(wss?:\/\/)?([^\/:\s]+)(?::(\d+))?/.exec(s);
  if(!m||!m[2])return null;
  const host=m[2],port=m[3]?+m[3]:(m[1]==='wss://'?443:8765);
  return {host:host,port:port,proto:m[1]==='wss://'?'wss':'ws'};
}
function netConnect(addrStr){
  const a=netAddr(addrStr);
  const st=$('mp_status');
  if(!a){if(st)st.textContent='That address does not look right — try something like 127.0.0.1:8765';return false;}
  netDisconnect(true);
  NET.on=false;NET.name=null;NET.admin=false;NET.bal=0;NET.remotes.clear();
  if(st)st.textContent='Connecting to '+a.host+':'+a.port+' ...';
  let ws=null;
  try{ws=new WebSocket(a.proto+'://'+a.host+':'+a.port);}catch(e){
    if(st)st.textContent='Could not open the connection.';return false;}
  NET.ws=ws;NET.host=a.host;NET.port=a.port;
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
  if(NET.ws){try{NET.ws.onclose=null;NET.ws.close();}catch(e){}NET.ws=null;}
  if(was&&!quiet)sysMsg('You left the server.');
}
/* ---- outgoing chat + commands (hooked from chatSubmit in a9_ui.js) ---- */
function netChatSubmit(t){
  if(t[0]==='/')netSend({t:'cmd',txt:t});
  else netSend({t:'chat',txt:t});
}
/* ---- block edit hook (called from setBlock, p03c) ---- */
function netSendSet(ck,lk,id){netSend({t:'set',ck:ck,lk:lk,id:id});}
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
  }
}
/* ---- welcome: build the world from the server's seed + edits ---- */
function netStartWorld(m){
  NET.on=true;NET.name=m.name;NET.admin=!!m.admin;NET.bal=m.balance|0;
  try{window.storage.set('mp:acc',NET.name);}catch(e){}
  const sp=m.spawn||findSpawn();
  if(!m.spawn)netSend({t:'spawnset',x:+sp[0].toFixed?+sp[0].toFixed(1):sp[0],y:sp[1],z:sp[2]});
  applySave({f:1,seed:m.seed|0,mode:'s',time:+m.time||0.3,dim:'over',snl:0,
    nukes:[],edits:m.edits||{},be:{},ents:[],gr:{},
    player:{x:sp[0],y:sp[1],z:sp[2],yaw:0,pitch:0,hp:20,hunger:20,sel:0,
      spawn:[sp[0],sp[1],sp[2]],inv:[],stox:{bal:0,sh:{},cb:{}},xp:0,armor:[0,0,0,0],
      db:0,own:[],cos:{},bp:0,bpl:0,pow:{u:{},a:{}}}});
  P.db=Math.max(0,m.balance|0);
  WORLD.name='MP '+NET.host+':'+NET.port;
  enterGame();
  if(typeof mpSaveName==='function')mpSaveName();
  showToast('Joined as '+NET.name+(NET.admin?' (admin)':''));
  sysMsg('[Server] '+(m.motd||'Welcome.'));
  if(m.players&&m.players.length)sysMsg('[Server] Online: '+m.players.join(', '));
}
function netApplyTeleport(m){
  if(!P)return;
  const d=(m.dim==='backrooms')?'backrooms':'over';
  setDim(d,+m.x||0.5,+m.y||40,+m.z||0.5);
  forceChunksNear(P.x,P.z);
  if(d==='over'&&DIM==='over'){
    const h=colInfo(Math.floor(P.x),Math.floor(P.z)).h;
    if(Math.abs(P.y-(h+1.2))>3)P.y=h+1.2;
  }
  P.fallD=0;
}
/* ---- the per-frame tick: throttled position send + remote interpolation ---- */
function netTick(dt){
  if(!NET.on||!NET.ws||NET.ws.readyState!==1)return;
  if(!P||P.dead)return;
  const now=performance.now();
  if(now-NET.lastSend>100){
    NET.lastSend=now;
    netSend({t:'pos',x:+P.x.toFixed(2),y:+P.y.toFixed(2),z:+P.z.toFixed(2),
      yaw:+P.yaw.toFixed(3),pitch:+P.pitch.toFixed(3),dim:DIM,hp:Math.round(P.hp)});
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
    M.aL.rotation.x=-sw*0.8;M.aR.rotation.x=sw*0.8;
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
function netRemoteUpdate(name,x,y,z,yaw,pitch,dim,hp){
  let r=NET.remotes.get(name);
  if(!r){
    const M=agHumanoid(netRemoteDef(name));
    M.tag=agTag(name);M.G.add(M.tag);
    shadowify(M.G);
    scene.add(M.G);
    const e={t:'netp',mob:false,name:name,x:x,y:y,z:z,vx:0,vy:0,vz:0,onGround:true,
      yaw:yaw,pitch:pitch,hp:hp||20,hw:0.3,h:1.8,mesh:M.G,legs:[],mats:M.mats,M,anim:0,dim:dim};
    entities.push(e);
    r={e:e,tx:x,ty:y,tz:z,tyaw:yaw,tpitch:pitch,dim:dim};
    NET.remotes.set(name,r);
    sysMsg(name+' is here');
  }
  r.tx=x;r.ty=y;r.tz=z;r.tyaw=yaw;r.tpitch=pitch;r.dim=dim;
  r.e.hp=hp||20;
}
function netRemoteRemove(name){
  const r=NET.remotes.get(name);
  if(r){if(r.e&&!r.e.dead)removeEnt(r.e);NET.remotes.delete(name);}
}
/* ---- the message pump ---- */
function netMsg(m){
  switch(m.t){
    case 'welcome':netStartWorld(m);break;
    case 'denied':{const s=$('mp_status');if(s)s.textContent=m.reason||'Rejected.';break;}
    case 'join':sysMsg(m.name+' joined the game');break;
    case 'leave':netRemoteRemove(m.name);sysMsg(m.name+' left the game');break;
    case 'pos':netRemoteUpdate(m.name,+m.x,+m.y,+m.z,+m.yaw||0,+m.pitch||0,m.dim||'over',m.hp);break;
    case 'set':netApplySet(m.ck,m.lk,m.id|0);break;
    case 'chat':chatPush({k:'chat',from:m.from,txt:m.txt});break;
    case 'whisper':chatPush({k:'whisper',from:m.from,txt:m.txt});break;
    case 'sys':sysMsg(m.txt);break;
    case 'teleport':netApplyTeleport(m);break;
    case 'balance':NET.bal=m.amt|0;if(P){P.db=NET.bal;drawStats&&drawStats();}showToast('Balance: '+NET.bal+' DB');break;
    case 'give':if(typeof givePlayer==='function'){givePlayer(m.id|0,m.count||1);showToast('Bought '+(m.count||1)+' x '+(m.name||DEFS[m.id]&&DEFS[m.id].name||'item'));}break;
    case 'kick':netDisconnect(true);showToast(m.reason||'Kicked');if(playing)quitToTitle();break;
    case 'admin':NET.admin=!!m.on;showToast(NET.admin?'You are now an admin':'Admin taken away');break;
    case 'rtp_req':{
      const tx=m.tx|0,tz=m.tz|0;
      let y=40;try{y=colInfo(tx,tz).h+2;}catch(e){}
      netSend({t:'rtp_res',x:tx+0.5,y:y,z:tz+0.5,dim:'over'});
      break;}
    case 'pong':break;
  }
}
