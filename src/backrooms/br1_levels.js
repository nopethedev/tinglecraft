/* =====================================================================
   THE BACKROOMS: LEVELS 0-22 (Tingle Craft).
   The Backrooms used to be one endless yellow maze. Now it is a descent:
   every level lives 6400 blocks further out on the x axis (400 chunks),
   inside the same 'b;' dimension, so saves, edits and the key prefix all
   keep working. Fall through a hole in the floor to noclip deeper; find
   a rare Exit Door to climb back up. Level 0 keeps the classic maze
   byte-for-byte. Level 21 is the Poolrooms, level 22 is The Exit — a
   small white room whose door takes you back to reality for good.

   Lore-accurate-ish first twenty:
    0 The Lobby        1 Habitable Zone     2 Pipe Dreams
    3 Electrical Station                  4 Abandoned Office
    5 Terror Hotel      6 Lights Out       7 Thalassophobia
    8 Cave System       9 The Suburbs     10 Field of Wheat
   11 The Endless City 12 The Matrix     13 Infinite Apartments
   14 Paradise         15 Futuristic Halls   16 Flooded Halls
   17 The Carrier      18 Memories       19 The Attic
   20 The Warehouse    21 Poolrooms      22 The Exit
   Everything is deterministic from SEED (h2 only). Admins: /backrooms <0-22>.
   ===================================================================== */

/* level = chunk x / 400, clamped so old level-0 builds stay in level 0 */
function brLevelOf(cx){
  return Math.max(0,Math.floor(cx/400));
}
function brLevelAt(){return (typeof P!=='undefined'&&P)?brLevelOf(Math.floor(P.x/CH)):0;}

/* Each spec: n name, wall/floor/ceil block ids, light block (0 = none), ls
   light spacing, ep edge (wall) probability, rp open-hall probability,
   hp hole (descend) probability, dp exit-door probability, water layers
   above the floor, sky [r,g,b, ambient, fogNear, fogFar, ambR,ambG,ambB],
   fH floor y, fC ceiling y, deco extra dressing. */
const BR_LEVELS=[
 {n:'Level 0 — The Lobby',          wall:B.BRWALL,   floor:B.BRCARP,  ceil:B.BRWALL,   light:B.BRLIGHT,  ls:8, ep:0.5, rp:0.16, hp:0.004, dp:0.012, fH:8, fC:14, sky:[0.40,0.35,0.15,0.80,0.16,0.55,1.00,0.96,0.80]},
 {n:'Level 1 — Habitable Zone',     wall:B.STONEBRICK,floor:B.STONE,  ceil:B.STONEBRICK,light:B.BRLIGHT, ls:10,ep:0.42,rp:0.30, hp:0.006, dp:0.012, fH:8, fC:15, sky:[0.30,0.30,0.30,0.72,0.18,0.60,0.92,0.92,0.92]},
 {n:'Level 2 — Pipe Dreams',        wall:B.COBBLE,   floor:B.STONE,   ceil:B.COBBLE,   light:0,          ls:0, ep:0.62,rp:0.05, hp:0.008, dp:0.010, fH:8, fC:12, sky:[0.06,0.05,0.04,0.30,0.10,0.34,0.70,0.62,0.50]},
 {n:'Level 3 — Electrical Station', wall:B.BRICK,    floor:B.STONEBRICK,ceil:B.BRICK,  light:B.GLOWSTONE,ls:12,ep:0.55,rp:0.08, hp:0.008, dp:0.010, fH:8, fC:14, sky:[0.12,0.10,0.08,0.55,0.14,0.45,0.90,0.82,0.62]},
 {n:'Level 4 — Abandoned Office',   wall:B.PLANK_B,  floor:B.PLANK_O, ceil:B.PLANK_B,  light:B.BRLIGHT,  ls:9, ep:0.45,rp:0.25, hp:0.008, dp:0.010, fH:8, fC:15, sky:[0.35,0.33,0.28,0.75,0.18,0.55,0.95,0.93,0.85]},
 {n:'Level 5 — Terror Hotel',       wall:B.PLANK_S,  floor:B.BRCARP,  ceil:B.PLANK_S,  light:B.GLOWSTONE,ls:10,ep:0.50,rp:0.12, hp:0.008, dp:0.010, fH:8, fC:16, sky:[0.20,0.12,0.08,0.55,0.14,0.45,1.00,0.85,0.68]},
 {n:'Level 6 — Lights Out',         wall:B.COBBLE,   floor:B.STONE,   ceil:B.COBBLE,   light:0,          ls:0, ep:0.60,rp:0.06, hp:0.010, dp:0.008, fH:8, fC:14, sky:[0.015,0.015,0.02,0.20,0.08,0.28,0.45,0.45,0.55]},
 {n:'Level 7 — Thalassophobia',     wall:B.SANDSTONE,floor:B.SAND,    ceil:B.SANDSTONE,light:0,          ls:0, ep:0.45,rp:0.20, hp:0.008, dp:0.008, fH:8, fC:15, water:5, sky:[0.02,0.07,0.10,0.42,0.12,0.40,0.55,0.72,0.85]},
 {n:'Level 8 — Cave System',        wall:B.STONE,    floor:B.GRAVEL,  ceil:B.STONE,    light:B.GLOWSTONE,ls:14,ep:0.35,rp:0.40, hp:0.010, dp:0.008, fH:8, fC:13, sky:[0.05,0.04,0.03,0.50,0.12,0.40,0.85,0.78,0.62]},
 {n:'Level 9 — The Suburbs',        wall:B.PLANK_O,  floor:B.GRASS,   ceil:B.PLANK_O,  light:B.GLOWSTONE,ls:12,ep:0.55,rp:0.10, hp:0.010, dp:0.008, fH:8, fC:15, deco:'grass', sky:[0.10,0.12,0.14,0.62,0.16,0.50,0.85,0.90,0.88]},
 {n:'Level 10 — Field of Wheat',    wall:B.PLANK_S,  floor:B.GRASS,   ceil:B.PLANK_S,  light:B.GLOWSTONE,ls:14,ep:0.20,rp:0.60, hp:0.010, dp:0.008, fH:8, fC:16, deco:'wheat', sky:[0.24,0.22,0.12,0.78,0.20,0.60,1.00,0.96,0.78]},
 {n:'Level 11 — The Endless City',  wall:B.STONEBRICK,floor:B.STONEBRICK,ceil:B.STONEBRICK,light:B.GLOWSTONE,ls:7,ep:0.48,rp:0.10,hp:0.010, dp:0.008, fH:8, fC:18, sky:[0.14,0.14,0.16,0.66,0.18,0.55,0.85,0.85,0.90]},
 {n:'Level 12 — The Matrix',        wall:B.WOOL,     floor:B.WOOL,    ceil:B.WOOL,     light:B.GLOWSTONE,ls:11,ep:0.30,rp:0.40, hp:0.010, dp:0.008, fH:8, fC:16, sky:[0.85,0.85,0.88,1.00,0.30,0.85,1.00,1.00,1.00]},
 {n:'Level 13 — Infinite Apartments',wall:B.BRICK,   floor:B.PLANK_B, ceil:B.BRICK,    light:B.GLOWSTONE,ls:9, ep:0.58,rp:0.08, hp:0.010, dp:0.008, fH:8, fC:15, sky:[0.16,0.10,0.08,0.58,0.14,0.45,0.95,0.82,0.72]},
 {n:'Level 14 — Paradise',          wall:B.PLANK_O,  floor:B.GRASS,   ceil:B.PLANK_O,  light:B.GLOWSTONE,ls:12,ep:0.22,rp:0.55, hp:0.010, dp:0.010, fH:8, fC:16, deco:'flowers', sky:[0.30,0.34,0.20,0.90,0.24,0.70,1.00,1.00,0.92]},
 {n:'Level 15 — Futuristic Halls',  wall:B.ALIENM,   floor:B.ALIENL,  ceil:B.ALIENM,   light:B.GLOWSTONE,ls:10,ep:0.50,rp:0.12, hp:0.010, dp:0.008, fH:8, fC:15, sky:[0.05,0.10,0.12,0.60,0.16,0.50,0.70,0.92,1.00]},
 {n:'Level 16 — Flooded Halls',     wall:B.STONE,    floor:B.STONEBRICK,ceil:B.STONE,  light:B.GLOWSTONE,ls:13,ep:0.52,rp:0.10, hp:0.010, dp:0.008, fH:8, fC:14, water:1, sky:[0.06,0.10,0.14,0.55,0.14,0.45,0.68,0.82,0.95]},
 {n:'Level 17 — The Carrier',       wall:B.PLANK_S,  floor:B.PLANK_S, ceil:B.PLANK_O,  light:B.GLOWSTONE,ls:11,ep:0.50,rp:0.14, hp:0.010, dp:0.008, fH:8, fC:17, sky:[0.10,0.10,0.12,0.60,0.16,0.50,0.90,0.88,0.80]},
 {n:'Level 18 — Memories',          wall:B.PLANK_B,  floor:B.BRCARP,  ceil:B.PLANK_B,  light:B.GLOWSTONE,ls:10,ep:0.45,rp:0.20, hp:0.010, dp:0.010, fH:8, fC:14, sky:[0.28,0.20,0.14,0.78,0.20,0.60,1.00,0.92,0.80]},
 {n:'Level 19 — The Attic',         wall:B.LOG_S,    floor:B.PLANK_S, ceil:B.LOG_S,    light:B.GLOWSTONE,ls:15,ep:0.55,rp:0.10, hp:0.010, dp:0.008, fH:8, fC:11, sky:[0.08,0.05,0.03,0.42,0.10,0.35,0.85,0.70,0.55]},
 {n:'Level 20 — The Warehouse',     wall:B.BUNKER,   floor:B.STONE,   ceil:B.BUNKER,   light:B.GLOWSTONE,ls:12,ep:0.40,rp:0.25, hp:0.012, dp:0.008, fH:8, fC:22, sky:[0.12,0.12,0.13,0.65,0.20,0.60,0.88,0.88,0.92]},
 {n:'The Poolrooms',                wall:B.CLOUDSTONE,floor:B.CLOUDSTONE,ceil:B.CLOUDSTONE,light:B.GLOWSTONE,ls:10,ep:0.35,rp:0.30,hp:0,   dp:0,    fH:8, fC:16, pools:true, sky:[0.80,0.86,0.90,1.00,0.30,0.85,1.00,1.00,1.00]},
 {n:'The Exit',                     wall:B.CLOUDSTONE,floor:B.CLOUDSTONE,ceil:B.CLOUDSTONE,light:B.GLOWSTONE,ls:0,ep:0,  rp:0,   hp:0,   dp:0,    fH:8, fC:14, exit:true, sky:[0.92,0.95,1.00,1.05,0.40,1.00,1.00,1.00,1.00]},
];
function brSpec(lvl){return BR_LEVELS[Math.min(lvl,BR_LEVELS.length-1)]||BR_LEVELS[0];}

/* per-level hash salt: deterministic per level, no Math.random in gen */
function brHash(a,b,lvl,tag){return h2(a,b,SEED^(0xb2e1+lvl*2654435761)+(tag||0)*7919);}

function brGenLevel(cx,cz){
  const lvl=brLevelOf(cx);
  const L=brSpec(lvl);
  if(L.exit)return brGenExitRoom(cx,cz);
  const blocks=new Uint8Array(CH*WH*CH);
  const x0=cx*CH,z0=cz*CH;
  const fH=L.fH,fC=L.fC,water=L.water||0,pools=!!L.pools;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const wx=x0+lx,wz=z0+lz;
    const mx=((wx%5)+5)%5,mz=((wz%5)+5)%5;
    const gx=Math.floor(wx/5),gz=Math.floor(wz/5);
    let wall=false;
    if(mx===0&&mz===0)wall=true;
    else if(mx===0&&mz>0)wall=!((L.rp>0)&&brHash(gx>>2,gz>>2,lvl,4)<L.rp)&&brHash(gx,gz,lvl,1)<L.ep;
    else if(mz===0&&mx>0)wall=!((L.rp>0)&&brHash(gx>>2,gz>>2,lvl,4)<L.rp)&&brHash(gx,gz,lvl,2)<L.ep;
    /* poolrooms: sunken water pools in every 4th cell, drain in the middle */
    const pool=pools&&(gx%4===2)&&(gz%4===2)&&(mx>0&&mz>0);
    const floorY=pool?(fH-4):fH;
    const hole=(mx===2&&mz===2)&&L.hp>0&&brHash(gx,gz,lvl,3)<L.hp&&!(gx===0&&gz===0);
    for(let y=0;y<WH;y++){
      let id;
      if(y===0)id=B.BEDROCK;
      else if(y<=floorY)id=(y===floorY)?((pool)?B.CLOUDSTONE:L.floor):L.wall;
      else if(y<fC)id=wall?L.wall:B.AIR;
      else if(y===fC)id=(L.ls>0&&(wx%L.ls)<2&&(wz%L.ls)<2)?L.light:L.ceil;
      else id=L.wall;
      if(pool&&y>floorY&&y<=fH)id=B.WATER;                     /* the pool */
      else if(!pool&&water>0&&y>floorY&&y<=floorY+water&&!wall)id=B.WATER;
      if(hole&&y>=1&&y<=floorY)id=B.AIR;         /* the noclip pit */
      blocks[bidx(lx,y,lz)]=id;
    }
    if(pool&&mx===2&&mz===2){                    /* the drain at the pool's heart */
      for(let y=1;y<=floorY;y++)blocks[bidx(lx,y,lz)]=B.AIR;
    }
    if(!wall&&!pool&&y1Free(blocks,lx,floorY+1,lz,fH)){
      if(L.deco==='wheat'&&h2(wx,wz,SEED^(0x11+lvl))<0.30)blocks[bidx(lx,floorY+1,lz)]=B.TALLGRASS;
      else if(L.deco==='grass'&&h2(wx,wz,SEED^(0x22+lvl))<0.06)blocks[bidx(lx,floorY+1,lz)]=B.TALLGRASS;
      else if(L.deco==='flowers'){
        const r2=h2(wx,wz,SEED^(0x33+lvl));
        if(r2<0.05)blocks[bidx(lx,floorY+1,lz)]=r2<0.025?B.FLOWER_R:B.FLOWER_Y;
        else if(r2<0.16)blocks[bidx(lx,floorY+1,lz)]=B.TALLGRASS;
      }
    }
  }
  /* rare exit doors at cell centres (rarer the deeper you go) */
  if(L.dp>0){
    for(let gx=Math.floor((x0-1)/5);gx<=Math.floor((x0+CH+1)/5);gx++)
    for(let gz=Math.floor((z0-1)/5);gz<=Math.floor((z0+CH+1)/5);gz++){
      if(brHash(gx,gz,lvl,5)>=L.dp)continue;
      const dx2=gx*5+2,dz2=gz*5+2;
      const lx=dx2-x0,lz=dz2-z0;
      if(lx<0||lx>=CH||lz<0||lz>=CH)continue;
      if(blocks[bidx(lx,L.fH+1,lz)]===B.AIR)blocks[bidx(lx,L.fH+1,lz)]=B.BREXIT;
    }
  }
  return blocks;
}
function y1Free(blocks,lx,y,lz,fH){
  if(y>=fH+2)return false;
  for(let yy=y;yy<fH+2;yy++)if(blocks[bidx(lx,yy,lz)]!==B.AIR)return false;
  return true;
}
/* The Exit: a small bright room at the heart of region 22; everywhere else
   is solid wall so the only way out is the door. */
function brGenExitRoom(cx,cz){
  const blocks=new Uint8Array(CH*WH*CH);
  const x0=cx*CH,z0=cz*CH;
  const bx0=22*6400-8,bz0=-8,bw=40;             /* the room's world box */
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const wx=x0+lx,wz=z0+lz;
    const inside=wx>=bx0&&wx<bx0+bw&&wz>=bz0&&wz<bz0+bw;
    for(let y=0;y<WH;y++){
      let id;
      if(y===0)id=B.BEDROCK;
      else if(!inside)id=B.CLOUDSTONE;
      else if(y<=8)id=B.CLOUDSTONE;
      else if(y<14)id=B.AIR;
      else if(y===14)id=(((wx-1)%8)+8)%8<2&&(((wz-1)%8)+8)%8<2?B.GLOWSTONE:B.CLOUDSTONE;
      else id=B.CLOUDSTONE;
      blocks[bidx(lx,y,lz)]=id;
    }
  }
  /* the final door, a few steps from where you arrive */
  const dx=(22*6400+6)-x0,dz=6-z0;
  if(dx>=0&&dx<CH&&dz>=0&&dz<CH)blocks[bidx(dx,9,dz)]=B.BREXIT;
  return blocks;
}
/* a deterministic open arrival spot on a given level */
function brOpenSpotLevel(lvl){
  const x0=lvl*6400;
  return [x0+2.5,9.05,2.5];
}
/* travel: jump to a level (works in singleplayer AND multiplayer — position
   is streamed, edits are deterministic, chunks reflow around you) */
function brGo(lvl){
  lvl=Math.max(0,Math.min(22,lvl|0));
  const s=brOpenSpotLevel(lvl);
  if(DIM!=='backrooms'){
    BR.over={x:P.x,y:P.y,z:P.z,d:P.dim?P.dim:DIM};
    setDim('backrooms',s[0],s[1],s[2]);
  }else{
    for(const [k,ch] of chunks)disposeChunkMeshes(ch);
    chunks.clear();
    P.x=s[0];P.y=s[1];P.z=s[2];P.vx=P.vy=P.vz=0;P.fallD=0;
  }
  forceChunksNear(P.x,P.z);
  showToast('The Backrooms: '+(brSpec(lvl).n));
  playS('portal');
}
/* falling through a noclip pit: descend (the Exit room has no pits) */
function brDescend(){
  const lvl=brLevelAt();
  if(lvl>=22)return;
  brGo(lvl+1);
  showToast('You fall through the floor... deeper.');
}
/* the sky, tinted per level (called from updateSky) */
function brSkyMod(){
  const L=brSpec(brLevelAt());
  return L.sky;
}
function brLevelName(lvl){return brSpec(lvl).n;}
