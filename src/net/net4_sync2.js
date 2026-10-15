/* =====================================================================
   MULTIPLAYER SYNC, part 2 (Tingle Craft) — net4_sync2.js
   The things that used to happen only on one client's screen:

   - THROWN ITEMS: Q throws (and death drops) now go out on the wire as
     `dropadd`; everyone else gets the same drop with the same velocity.
     When somebody picks a relayed drop up (`dropdel`) it vanishes for
     everybody. Drops keep their normal client-side physics.
   - THE BIG DINGLE: megaNuke was the most client-sided thing in the
     game — the dropper carved a crater nobody else could see. Now the
     detonation is relayed (`nukex`), every client carves the same crater
     locally, the server stores the nuke list in world.json so craters
     survive restarts, and the welcome hands the list to joiners.
   ===================================================================== */
NET.drops=new Set();
let netDropSeq=0;

/* ---- outgoing: a drop this client created ---- */
function netDropThrow(st,x,y,z,vx,vy,vz){
  if(!NET.on||!NET.ws||NET.ws.readyState!==1||!st)return;
  if(NET.drops.size>400)NET.drops.clear();
  const did=(NET.name||'p')+'-'+(netDropSeq++).toString(36)+Date.now().toString(36);
  NET.drops.add(did);
  netSend({t:'dropadd',did:did,id:st.id|0,count:Math.min(999,st.count|0),
    dur:(st.dur!=null?Math.round(st.dur):null),
    ench:(st.ench?JSON.stringify(st.ench):null),
    x:+(+x).toFixed(2),y:+(+y).toFixed(2),z:+(+z).toFixed(2),
    vx:+(+vx||0).toFixed(2),vy:+(+vy||0).toFixed(2),vz:+(+vz||0).toFixed(2)});
}
function netDropRelease(did){
  if(!did)return;
  NET.drops.delete(did);
  netSend({t:'dropdel',did:did});
}
/* ---- incoming ---- */
function netDropAdd(m){
  if(!P)return;
  const st={id:m.id|0,count:Math.max(1,Math.min(999,m.count|0))};
  if(m.dur!=null)st.dur=+m.dur;
  if(m.ench){try{st.ench=JSON.parse(m.ench);}catch(e){}}
  spawnDrop(+m.x||P.x,+m.y||P.y+2,+m.z||P.z,st,+m.vx||0,+m.vy||0,+m.vz||0);
  const e=entities[entities.length-1];
  if(e&&e.t==='drop')e.netdid=''+(m.did||'');
}
function netDropDel(did){
  if(!did)return;
  for(const e of entities){
    if(e.t==='drop'&&!e.dead&&e.netdid===did){removeEnt(e);break;}
  }
}
/* a nuke somebody else dropped: same crater, same show, no re-relay */
function netNuke(m){
  if(!P)return;
  const dim=['over','nether','aether','puppet','backrooms'][m.dim|0]||'over';
  const x=+m.x||0,y=+m.y||0,z=+m.z||0;
  NUKES.push({x:Math.round(x),y:Math.round(y),z:Math.round(z),d:dim});
  if(DIM!==dim)return;                      /* it happened in another world */
  if(typeof megaNuke==='function')megaNuke(x,y,z,true);
}
/* welcome: the server's crater history (before any chunk generates) */
function netNukesFromWelcome(list){
  if(!Array.isArray(list))return [];
  return list.map(a=>({x:a[0]|0,y:a[1]|0,z:a[2]|0,
    d:['over','nether','aether','puppet','backrooms'][a[3]|0]||'over'}));
}
