/* =====================================================================
   THE BACKROOMS — a new dimension (Tingle Craft addition).
   Mono-yellow office rooms, damp carpet, the hum of fluorescent lights.
   A dimension is six coordinated pieces (see docs/ARCHITECTURE.md):
   1. block ids + defs + tiles (below)
   2. key prefix 'b;' + genChunk dispatch (edits in p03b_dimkeys_genchunk.js)
   3. a sky branch (p07c_sky_lights.js)
   4. travel: brUseDoor / travelBackrooms (the Exit Door block, /backrooms)
   5. a per-frame tick: processBackrooms (light flicker) in p07h_boot_loop.js
   6. save/load: 'backrooms' in the DIM whitelist + brSaveFields/brLoad
   Everything is deterministic from SEED: h2/h3 only, no Math.random in gen.
   ===================================================================== */
/* The game's block-id space under 256 is fully allocated (see the id ledger in
   p_static.js), so the Backrooms lives on the four ids the ledger leaves free:
   212, 217, 218, 219 (not spares 248/249, not the v6.0 tombstones). Four blocks
   is the classic look anyway: wallpaper everywhere, carpet, light panels, door. */
B.BRWALL=212;B.BRCARP=217;B.BRLIGHT=218;B.BREXIT=219;
def(B.BRWALL,{name:'Yellow Wallpaper',tiles:'brwall',hard:0.7});
def(B.BRCARP,{name:'Damp Carpet',tiles:{top:'brcarp',side:'brwall',bot:'brwall'},hard:0.4,toolClass:'shovel'});
def(B.BRLIGHT,{name:'Fluorescent Light',tiles:{top:'brlight',side:'brlight_s',bot:'brwall'},hard:0.35,drop:null});
def(B.BREXIT,{name:'Exit Door',tiles:{top:'brwall',side:'brexit',bot:'brwall'},hard:1.4,interact:'brexit'});
tile('brwall',(c,R)=>{fillN(c,R,'#c9b45a',.06);
  c.fillStyle='#b7a24a';c.fillRect(0,7,16,1);
  c.fillStyle='#d3c066';for(let x=1;x<16;x+=4)c.fillRect(x,0,1,7);
  for(let i=0;i<4;i++)px(c,(R()*16)|0,(R()*16)|0,'#a8953c');
  c.fillStyle='#ab9740';c.fillRect(0,15,16,1);});
tile('brcarp',(c,R)=>{fillN(c,R,'#a8933e',.14);
  c.fillStyle='#6d5e2c';c.fillRect(2,3,4,3);c.fillRect(10,9,4,4);
  for(let i=0;i<10;i++)px(c,(R()*16)|0,(R()*16)|0,'#8a7730');
  for(let i=0;i<6;i++)px(c,(R()*16)|0,(R()*16)|0,'#bda851');});
tile('brlight',(c,R)=>{fillF(c,'#fff7c4');c.fillStyle='#e9e2ac';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#d8d2a0';c.fillRect(2,7,12,2);});
tile('brlight_s',(c,R)=>{fillF(c,'#e9e2ac');c.fillStyle='#fff7c4';c.fillRect(0,0,16,4);c.fillStyle='#b8b28a';c.fillRect(0,14,16,2);});
tile('brexit',(c,R)=>{fillN(c,R,'#8a8f96',.05);
  c.fillStyle='#5c6167';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#3d4147';c.fillRect(3,2,10,12);
  c.fillStyle='#b8bcc4';c.fillRect(4,7,8,2);
  c.fillStyle='#2a2d31';px(c,12,9,'#2a2d31');px(c,13,9,'#2a2d31');});
R(['PGP','PDP','PGP'],{P:'planks',G:B.GLOWSTONE,D:IT.DIAMOND},B.BREXIT,2);

/* ----- the maze: rooms and pillars on a 5-block lattice ----- */
const BR_FLOOR=8,BR_CEIL=14;
function brEdgeX(gx,gz){return h2(gx,gz,SEED^0xb2e1)<0.5;}   /* wall on the west edge of cell (gx,gz) */
function brEdgeZ(gx,gz){return h2(gx,gz,SEED^0xb2e2)<0.5;}   /* wall on the north edge of cell (gx,gz) */
function brRoom(gx,gz){return h2(gx>>2,gz>>2,SEED^0xb2e4)<0.16;}  /* open halls: no internal walls in a 4x4-cell block */
function brWallId(wx,y,wz){return B.BRWALL;}
function genChunkBackrooms(cx,cz){
  const blocks=new Uint8Array(CH*WH*CH);
  const x0=cx*CH,z0=cz*CH;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const wx=x0+lx,wz=z0+lz;
    const mx=((wx%5)+5)%5,mz=((wz%5)+5)%5;      /* 0 marks a lattice line */
    const gx=Math.floor(wx/5),gz=Math.floor(wz/5);
    /* walls: on lattice lines, skipping edges that open into a hall */
    let wall=false;
    if(mx===0&&mz===0)wall=true;                /* pillar at every lattice crossing */
    else if(mx===0&&mz>0)wall=!brRoom(gx,gz)&&brEdgeX(gx,gz);
    else if(mz===0&&mx>0)wall=!brRoom(gx,gz)&&brEdgeZ(gx,gz);
    for(let y=0;y<WH;y++){
      let id;
      if(y===0)id=B.BEDROCK;
      else if(y<=BR_FLOOR)id=(y===BR_FLOOR)?B.BRCARP:brWallId(wx,y,wz);
      else if(y<BR_CEIL)id=wall?brWallId(wx,y,wz):B.AIR;
      else if(y===BR_CEIL)id=((wx&7)<2&&(wz&7)<2)?B.BRLIGHT:B.BRWALL;
      else id=brWallId(wx,y,wz);
      blocks[bidx(lx,y,lz)]=id;
    }
  }
  /* exit doors, sparsely, at cell centres */
  for(let gx=Math.floor((x0-1)/5);gx<=Math.floor((x0+CH+1)/5);gx++)
  for(let gz=Math.floor((z0-1)/5);gz<=Math.floor((z0+CH+1)/5);gz++){
    if(h2(gx,gz,SEED^0xb2e3)>=0.045)continue;
    const dx2=gx*5+2,dz2=gz*5+2;
    const lx=dx2-x0,lz=dz2-z0;
    if(lx<0||lx>=CH||lz<0||lz>=CH)continue;
    blocks[bidx(lx,BR_FLOOR+1,lz)]=B.BREXIT;
  }
  return blocks;
}
/* a deterministic open spot to arrive at (cell centres are never walled) */
function brOpenSpot(){
  for(let r=0;r<64;r++){
    const gx=(r===0)?0:((h2(r,7,SEED^0xb2e7)<0.5?-r:r)),gz=(r===0)?0:((h2(7,r,SEED^0xb2e8)<0.5?-r:r));
    return [gx*5+2.5,BR_FLOOR+1.05,gz*5+2.5];
  }
  return [2.5,BR_FLOOR+1.05,2.5];
}
/* ----- travel: the Exit Door works from both sides ----- */
const BR={over:null};
function brUseDoor(){
  if(DIM==='backrooms')travelOutBackrooms();
  else travelBackrooms();
}
function travelBackrooms(){
  if(DIM==='backrooms')return;
  BR.over={x:P.x,y:P.y,z:P.z};
  const s=brOpenSpot();
  setDim('backrooms',s[0],s[1],s[2]);
  forceChunksNear(P.x,P.z);
  showToast('You noclipped out of reality. The hum is everywhere.');
  playS('portal');
}
function travelOutBackrooms(){
  const o=BR.over||findSpawn();
  setDim('over',o.x,10,o.z);
  forceChunksNear(P.x,P.z);
  P.y=colInfo(Math.floor(P.x),Math.floor(P.z)).h+1.2;
  showToast('You found an exit. Reality resumes, sticky carpet smell gone.');
  playS('portal');
}
/* /backrooms from chat (singleplayer; on a server the command goes to server.py) */
function brChatCmd(){
  if(!playing||!P){return;}
  if(DIM==='backrooms')travelOutBackrooms();else travelBackrooms();
}
/* ----- per-frame: the lights flicker, sometimes the hum stutters ----- */
const BRFL={t:1,dip:0,ph:0};
function processBackrooms(dt){
  if(DIM!=='backrooms'||!P||P.dead)return;
  BRFL.t-=dt;
  if(BRFL.t<=0){
    BRFL.t=2.5+Math.random()*4.5;
    BRFL.dip=(Math.random()<0.42)?(0.10+Math.random()*0.22):0;
    BRFL.ph=Math.random()*10;
  }
  if(ambL&&!(fullbright&&GR.fbOK)){
    const f=BRFL.dip?(BRFL.dip*(0.5+0.5*Math.sin(performance.now()*0.02+BRFL.ph))):0;
    ambL.intensity=0.8-f;
  }
}
/* save fields: where you were in the overworld when you noclipped in */
function brSaveFields(){
  return {brover:BR.over?{x:+(+BR.over.x).toFixed(1),y:+(+BR.over.y).toFixed(1),z:+(+BR.over.z).toFixed(1)}:null};
}
function brLoad(d){BR.over=(d&&d.brover)||null;}
