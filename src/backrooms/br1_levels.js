/* =====================================================================
   THE BACKROOMS: LEVELS 0-22, lore pass (Tingle Craft).
   The Backrooms is a descent: every level lives 6400 blocks further out
   on the x axis (400 chunks), inside the same 'b;' dimension, so saves,
   edits and the key prefix all keep working. Fall through a hole in the
   floor to noclip deeper; find a rare Exit Door to climb back up.
   Level 0 keeps the classic maze byte-for-byte. Level 21 is the
   Poolrooms, level 22 is The Exit.

   The lore pass gives every level its own material kit (br2_dressing.js)
   and generator quirks:
     0 The Lobby           yellow maze, stained wallpaper, buzzing lights
     1 Habitable Zone      grey concrete, supply crates, distant hum
     2 Pipe Dreams         narrow maintenance tunnels lined with pipes
     3 Electrical Station  brick halls, humming machinery clusters
     4 Abandoned Office    drywall, ceiling tiles, forgotten desks
     5 Terror Hotel        red carpet, numbered doors, brass sconces
     6 Lights Out          pitch-black metal corridors. Bring a torch.
     7 Thalassophobia      sandstone halls flooded to the waist
     8 Cave System         rough stone galleries, gravel floors
     9 The Suburbs         a neighborhood that shouldn't be indoors
    10 Field of Wheat      endless wheat under an overcast sky
    11 The Endless City    concrete towers with glass windows
    12 The Matrix          green code rains down the office walls
    13 Infinite Apartments brick corridors, a door every few metres
    14 Paradise            grass, flowers, trees, suspicious niceness
    15 Futuristic Halls    white metal, alien lamps, cold light
    16 Flooded Halls       pool-tiled halls, ankle-deep water
    17 The Carrier         steel bulkheads, pipes, wooden decking
    18 Memories            party rooms: carpet, confetti-coloured wool
    19 The Attic           low beams, splinters, very little headroom
    20 The Warehouse       crates and shelving to the ceiling
    21 The Poolrooms       white tile, skylights, pools of every depth
    22 The Exit            a small bright room, and a door home

   Everything is deterministic from SEED (h2 only). Admins: /backrooms <0-22>.
   ===================================================================== */

/* level = chunk x / 400, clamped so old level-0 builds stay in level 0 */
function brLevelOf(cx){
  return Math.max(0,Math.floor(cx/400));
}
function brLevelAt(){return (typeof P!=='undefined'&&P)?brLevelOf(Math.floor(P.x/CH)):0;}

/* Each spec: n name, wall/floor/ceil block ids, wl random second wall id
   (chance wp), light block (0 = none), ls light spacing, ep edge (wall)
   probability, rp open-hall probability, hp hole (descend) probability,
   dp exit-door probability, water layers above the floor, tunnels for the
   pipe-grid generator, sky [r,g,b, ambient, fogNear, fogFar, ambR,ambG,ambB],
   fH floor y, fC ceiling y, deco dressing id. */
const BR_LEVELS=[
 {n:'Level 0 — The Lobby',          wall:B.BRWALL,  wl:B.BRWALL2,wp:0.25,floor:B.BRCARP,  ceil:B.BRWALL,   light:B.BRLIGHT,  ls:8, ep:0.5, rp:0.16, hp:0.004, dp:0.012, fH:8, fC:14, sky:[0.40,0.35,0.15,0.80,0.16,0.55,1.00,0.96,0.80]},
 {n:'Level 1 — Habitable Zone',     wall:B.CONCRETE,wl:B.METWALL,wp:0.18,floor:B.CONCRETE,ceil:B.CONCRETE, light:B.BRLIGHT,  ls:14,ep:0.42,rp:0.30, hp:0.006, dp:0.012, fH:8, fC:15, deco:'crates', sky:[0.30,0.30,0.30,0.72,0.18,0.60,0.92,0.92,0.92]},
 {n:'Level 2 — Pipe Dreams',        wall:B.COBBLE,  wl:B.PIPE,   wp:0.4, floor:B.STONE,   ceil:B.COBBLE,   light:0,          ls:0, ep:0.62,rp:0.05, hp:0.008, dp:0.010, fH:8, fC:12, tunnels:true, sky:[0.06,0.05,0.04,0.30,0.10,0.34,0.70,0.62,0.50]},
 {n:'Level 3 — Electrical Station', wall:B.BRICK,   wl:B.INDIRON,wp:0.12,floor:B.STONEBRICK,ceil:B.BRICK,  light:B.GLOWSTONE,ls:12,ep:0.55,rp:0.08, hp:0.008, dp:0.010, fH:8, fC:14, deco:'machinery', sky:[0.12,0.10,0.08,0.55,0.14,0.45,0.90,0.82,0.62]},
 {n:'Level 4 — Abandoned Office',   wall:B.OFFWALL, wl:B.BRWALL2,wp:0.15,floor:B.PLANK_O, ceil:B.BRCEIL,   light:B.BRLIGHT,  ls:9, ep:0.45,rp:0.25, hp:0.008, dp:0.010, fH:8, fC:15, deco:'desks', sky:[0.35,0.33,0.28,0.75,0.18,0.55,0.95,0.93,0.85]},
 {n:'Level 5 — Terror Hotel',       wall:B.PLANK_S, wl:B.HOTDOOR,wp:0.14,floor:B.HOTCARP, ceil:B.PLANK_S,  light:B.GLOWSTONE,ls:10,ep:0.50,rp:0.12, hp:0.008, dp:0.010, fH:8, fC:16, deco:'hotel', sky:[0.20,0.12,0.08,0.55,0.14,0.45,1.00,0.85,0.68]},
 {n:'Level 6 — Lights Out',         wall:B.METWALL, wl:B.METWALL,wp:0,   floor:B.STONE,   ceil:B.METWALL,  light:0,          ls:0, ep:0.60,rp:0.06, hp:0.010, dp:0.008, fH:8, fC:14, sky:[0.015,0.015,0.02,0.20,0.08,0.28,0.45,0.45,0.55]},
 {n:'Level 7 — Thalassophobia',     wall:B.SANDSTONE,wl:B.SANDSTONE,wp:0, floor:B.SAND,    ceil:B.SANDSTONE,light:0,          ls:0, ep:0.45,rp:0.20, hp:0.008, dp:0.008, fH:8, fC:15, water:4, sky:[0.02,0.07,0.10,0.42,0.12,0.40,0.55,0.72,0.85]},
 {n:'Level 8 — Cave System',        wall:B.STONE,   wl:B.GRAVEL, wp:0.2, floor:B.GRAVEL,  ceil:B.STONE,    light:B.GLOWSTONE,ls:14,ep:0.35,rp:0.40, hp:0.010, dp:0.008, fH:8, fC:13, deco:'rough', sky:[0.05,0.04,0.03,0.50,0.12,0.40,0.85,0.78,0.62]},
 {n:'Level 9 — The Suburbs',        wall:B.PLANK_O, wl:B.PLANK_O,wp:0,   floor:B.GRASS,   ceil:B.PLANK_O,  light:B.GLOWSTONE,ls:12,ep:0.55,rp:0.10, hp:0.010, dp:0.008, fH:8, fC:15, deco:'houses', sky:[0.10,0.12,0.14,0.62,0.16,0.50,0.85,0.90,0.88]},
 {n:'Level 10 — Field of Wheat',    wall:B.PLANK_S, wl:B.PLANK_S,wp:0,   floor:B.GRASS,   ceil:B.PLANK_S,  light:B.GLOWSTONE,ls:14,ep:0.20,rp:0.60, hp:0.010, dp:0.008, fH:8, fC:16, deco:'wheat', sky:[0.24,0.22,0.12,0.78,0.20,0.60,1.00,0.96,0.78]},
 {n:'Level 11 — The Endless City',  wall:B.CONCRETE,wl:B.CONCRETE,wp:0,  floor:B.STONEBRICK,ceil:B.CONCRETE,light:B.GLOWSTONE,ls:7,ep:0.48,rp:0.10,hp:0.010, dp:0.008, fH:8, fC:20, deco:'city', sky:[0.14,0.14,0.16,0.66,0.18,0.55,0.85,0.85,0.90]},
 {n:'Level 12 — The Matrix',        wall:B.OFFWALL, wl:B.GRNSCR, wp:0.3, floor:B.OFFWALL, ceil:B.OFFWALL,  light:B.GLOWSTONE,ls:11,ep:0.30,rp:0.40, hp:0.010, dp:0.008, fH:8, fC:16, sky:[0.20,0.42,0.20,0.85,0.30,0.85,0.72,1.00,0.72]},
 {n:'Level 13 — Infinite Apartments',wall:B.BRICK,  wl:B.HOTDOOR,wp:0.2, floor:B.CONCRETE,ceil:B.BRICK,    light:B.GLOWSTONE,ls:9, ep:0.58,rp:0.08, hp:0.010, dp:0.008, fH:8, fC:15, deco:'hotel', sky:[0.16,0.10,0.08,0.58,0.14,0.45,0.95,0.82,0.72]},
 {n:'Level 14 — Paradise',          wall:B.PLANK_O, wl:B.PLANK_O,wp:0,   floor:B.GRASS,   ceil:B.PLANK_O,  light:B.GLOWSTONE,ls:12,ep:0.22,rp:0.55, hp:0.010, dp:0.010, fH:8, fC:16, deco:'paradise', sky:[0.30,0.34,0.20,0.90,0.24,0.70,1.00,1.00,0.92]},
 {n:'Level 15 — Futuristic Halls',  wall:B.METWALL, wl:B.METWALL,wp:0,   floor:B.CONCRETE,ceil:B.METWALL,  light:B.ALIENL,   ls:10,ep:0.50,rp:0.12, hp:0.010, dp:0.008, fH:8, fC:15, deco:'pipes', sky:[0.05,0.10,0.12,0.60,0.16,0.50,0.70,0.92,1.00]},
 {n:'Level 16 — Flooded Halls',     wall:B.PTILE,   wl:B.PTILE,  wp:0,   floor:B.STONEBRICK,ceil:B.PTILE,   light:B.GLOWSTONE,ls:13,ep:0.52,rp:0.10, hp:0.010, dp:0.008, fH:8, fC:14, water:2, deco:'pipes', sky:[0.06,0.10,0.14,0.55,0.14,0.45,0.68,0.82,0.95]},
 {n:'Level 17 — The Carrier',       wall:B.METWALL, wl:B.PIPE,   wp:0.15,floor:B.PLANK_S, ceil:B.METWALL,  light:B.GLOWSTONE,ls:11,ep:0.50,rp:0.14, hp:0.010, dp:0.008, fH:8, fC:17, deco:'machinery', sky:[0.10,0.10,0.12,0.60,0.16,0.50,0.90,0.88,0.80]},
 {n:'Level 18 — Memories',          wall:B.BRWALL,  wl:B.WOOL,   wp:0.12,floor:B.HOTCARP, ceil:B.BRCEIL,   light:B.GLOWSTONE,ls:10,ep:0.45,rp:0.20, hp:0.010, dp:0.010, fH:8, fC:14, sky:[0.28,0.20,0.14,0.78,0.20,0.60,1.00,0.92,0.80]},
 {n:'Level 19 — The Attic',         wall:B.LOG_S,   wl:B.LOG_S,  wp:0,   floor:B.PLANK_S, ceil:B.LOG_S,    light:B.GLOWSTONE,ls:15,ep:0.55,rp:0.10, hp:0.010, dp:0.008, fH:8, fC:11, deco:'beams', sky:[0.08,0.05,0.03,0.42,0.10,0.35,0.85,0.70,0.55]},
 {n:'Level 20 — The Warehouse',     wall:B.CONCRETE,wl:B.METWALL,wp:0.15,floor:B.STONE,   ceil:B.CONCRETE, light:B.GLOWSTONE,ls:12,ep:0.40,rp:0.25, hp:0.012, dp:0.008, fH:8, fC:24, deco:'warehouse', sky:[0.12,0.12,0.13,0.65,0.20,0.60,0.88,0.88,0.92]},
 {n:'The Poolrooms',                wall:B.PTILE,   wl:B.CLOUDSTONE,wp:0.2,floor:B.PTILE,  ceil:B.PTILE,    light:B.SKYLIGHT, ls:10,ep:0.35,rp:0.30,hp:0,   dp:0,    fH:8, fC:16, pools:true, sky:[0.80,0.86,0.90,1.00,0.30,0.85,1.00,1.00,1.00]},
 {n:'The Exit',                     wall:B.CLOUDSTONE,floor:B.CLOUDSTONE,ceil:B.CLOUDSTONE,light:B.GLOWSTONE,ls:0,ep:0,  rp:0,   hp:0,   dp:0,    fH:8, fC:14, exit:true, sky:[0.92,0.95,1.00,1.05,0.40,1.00,1.00,1.00,1.00]},
];
function brSpec(lvl){return BR_LEVELS[Math.min(lvl,BR_LEVELS.length-1)]||BR_LEVELS[0];}

/* per-level hash salt: deterministic per level, no Math.random in gen */
function brHash(a,b,lvl,tag){return h2(a,b,SEED^(0xb2e1+lvl*2654435761)+(tag||0)*7919);}

/* the pipe-grid generator (level 2): three-wide maintenance tunnels on a
   12-block lattice, everything else solid rock laced with pipes */
function brTunnelOpen(wx,wz){
  const mx=((wx%12)+12)%12,mz=((wz%12)+12)%12;
  return mx<3||mz<3;
}

/* towers for the Endless City: a deterministic 5x5 shell per cell */
function brTowerCell(gx,gz,lvl){
  return brHash(gx,gz,lvl,8)<0.30;
}

function brGenLevel(cx,cz){
  const lvl=brLevelOf(cx);
  const L=brSpec(lvl);
  if(L.exit)return brGenExitRoom(cx,cz);
  const blocks=new Uint16Array(CH*WH*CH);
  const x0=cx*CH,z0=cz*CH;
  const fH=L.fH,fC=L.fC,water=L.water||0,pools=!!L.pools;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const wx=x0+lx,wz=z0+lz;
    const mx=((wx%5)+5)%5,mz=((wz%5)+5)%5;
    const gx=Math.floor(wx/5),gz=Math.floor(wz/5);
    /* level 2 swaps the maze for a pipe tunnel grid */
    let wall,wallId;
    if(L.tunnels){
      wall=!brTunnelOpen(wx,wz);
      wallId=wall?(brHash(wx>>1,wz>>1,lvl,9)<L.wp?L.wl:L.wall):0;
    }else{
      wall=false;
      if(mx===0&&mz===0)wall=true;
      else if(mx===0&&mz>0)wall=!((L.rp>0)&&brHash(gx>>2,gz>>2,lvl,4)<L.rp)&&brHash(gx,gz,lvl,1)<L.ep;
      else if(mz===0&&mx>0)wall=!((L.rp>0)&&brHash(gx>>2,gz>>2,lvl,4)<L.rp)&&brHash(gx,gz,lvl,2)<L.ep;
      wallId=(L.wp>0&&brHash(wx,wz,lvl,6)<L.wp)?L.wl:L.wall;
    }
    /* poolrooms: sunken water pools in every 4th cell, drain in the middle */
    const pool=pools&&(gx%4===2)&&(gz%4===2)&&(mx>0&&mz>0);
    const pd=pools?2+Math.floor(brHash(gx,gz,lvl,10)*4):0;   /* pool depth 2..5 */
    const floorY=pool?(fH-pd):fH;
    const hole=(mx===2&&mz===2)&&L.hp>0&&brHash(gx,gz,lvl,3)<L.hp&&!(gx===0&&gz===0);
    /* endless city: tower cells swallow the maze walls */
    const tower=(!L.tunnels&&L.deco==='city'&&brTowerCell(gx,gz,lvl));
    for(let y=0;y<WH;y++){
      let id;
      if(y===0)id=B.BEDROCK;
      else if(y<=floorY)id=(y===floorY)?((pool)?B.CLOUDSTONE:L.floor):L.wall;
      else if(y<fC){
        if(tower){
          /* tower shell: hollow, glass windows in bands, a doorway south */
          const tx=((wx%5)+5)%5,tz=((wz%5)+5)%5;
          const shell=tx===0||tx===4||tz===0||tz===4;
          if(!shell)id=B.AIR;
          else{
            const band=((y-fH)%4===1)&&tx>0&&tx<4&&tz>0&&tz<4;
            const doorway=tz===4&&tx===2&&y<fH+3;
            id=band?B.GLASS:B.CONCRETE;
            if(doorway)id=B.AIR;
          }
        }else id=wall?wallId:B.AIR;
      }
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
    const house=(L.deco==='houses'&&!(gx===0&&gz===0)&&brHash(gx,gz,lvl,14)<0.09);
    if(house){
      /* a little suburban house filling its whole 5x5 cell */
      const tx=wx-gx*5,tz=wz-gz*5;
      const shell=tx===0||tx===4||tz===0||tz===4;
      const doorway=tz===4&&tx===2;
      for(let y=fH+1;y<=fC-1;y++){
        const hh=y-fH;
        let id=B.AIR;
        if(hh<=3)id=(!shell||doorway)?B.AIR:(hh===2&&brHash(wx*3+y,wz,lvl,15)<0.4?B.GLASS:B.PLANK_O);
        else if(hh===4)id=(tx===2||tz===2)?B.PLANK_S:B.PLANK_O;
        else if(hh===5)id=(tx>=1&&tx<=3&&tz>=1&&tz<=3)?B.PLANK_S:B.AIR;
        blocks[bidx(lx,y,lz)]=id;
      }
      blocks[bidx(lx,floorY,lz)]=B.PLANK_O;    /* floorboards inside */
      if(tx===2&&tz===2)blocks[bidx(lx,fH+1,lz)]=B.GLOWSTONE;   /* the porch light */
    }
    if(!wall&&!tower&&!pool&&!house&&y1Free(blocks,lx,floorY+1,lz,fH)){
      brDecoColumn(blocks,lx,floorY+1,lz,wx,wz,lvl,L,fC);
    }
    /* wall dressing: pipes on tunnel walls, sconces in the hotel */
    brDecoWall(blocks,lx,floorY+1,lz,wx,wz,lvl,L,wall,tower);
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
/* things that grow on open floor */
function brDecoColumn(blocks,lx,y,lz,wx,wz,lvl,L,fC){
  const put=(yy,id)=>{if(yy>0&&yy<WH&&blocks[bidx(lx,yy,lz)]===B.AIR)blocks[bidx(lx,yy,lz)]=id;};
  const r=brHash(wx,wz,lvl,7);
  switch(L.deco){
    case 'wheat':
      if(r<0.62)put(y,B.WHEATB);
      else if(r<0.66)put(y,B.TALLGRASS);
      return;
    case 'paradise':
      if(r<0.05)put(y,r<0.025?B.FLOWER_R:B.FLOWER_Y);
      else if(r<0.2)put(y,B.TALLGRASS);
      else if(r<0.205&&fC-y>5){        /* the occasional suspicious tree */
        for(let i=0;i<4;i++)put(y+i,B.LOG_O);
        for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=3;dy<=4;dy++){
          if(Math.abs(dx)===2&&Math.abs(dz)===2)continue;
          const nx=lx+dx,nz=lz+dz;
          if(nx<0||nx>=CH||nz<0||nz>=CH)continue;
          if(blocks[bidx(nx,y+dy,nz)]===B.AIR)blocks[bidx(nx,y+dy,nz)]=B.LEAF_O;
        }
      }
      return;
    case 'crates':
      if(r<0.045){put(y,B.CRATE);if(r<0.018)put(y+1,B.CRATE);}
      return;
    case 'warehouse':
      if(r<0.06){                       /* crate stacks two to four tall */
        const h2n=2+Math.floor(brHash(wx,wz,lvl,11)*3);
        for(let i=0;i<h2n&&y+i<fC;i++)put(y+i,B.CRATE);
      }else if(r<0.075)put(y,B.SHELF);
      return;
    case 'desks':
      if(r<0.05){put(y,B.PLANK_B);if(r<0.02)put(y+1,B.JAR);}   /* a desk, sometimes with a jar on it */
      return;
    case 'machinery':
      if(r<0.03){put(y,B.INDIRON);put(y+1,B.INDIRON);}
      else if(r<0.036)put(y,B.PIPE);
      return;
    case 'rough':
      if(r<0.04){const h=1+Math.floor(brHash(wx,wz,lvl,12)*3);
        for(let i=0;i<h;i++)put(y+i,B.STONE);}
      return;
    case 'houses':
      if(r<0.02)put(y,B.FLOWER_Y);
      return;
    default: return;
  }
}
/* things attached to walls: hotel doors + sconces line the lattice,
   maintenance levels run pipes along the corridor walls */
function brDecoWall(blocks,lx,y,lz,wx,wz,lvl,L,wall,tower){
  if(wall||tower)return;
  if(L.deco!=='hotel'&&L.deco!=='pipes')return;
  const put=(yy,id)=>{if(yy>0&&yy<WH&&blocks[bidx(lx,yy,lz)]===B.AIR)blocks[bidx(lx,yy,lz)]=id;};
  const r=brHash(wx,wz,lvl,13);
  const mx=((wx%5)+5)%5,mz=((wz%5)+5)%5;
  if(L.deco==='hotel'){
    if((mx===1||mz===1)&&r<0.10)put(y,B.HOTDOOR);
    else if((mx===1||mz===1)&&r>0.94)put(y+1,B.GLOWSTONE);
  }else if(L.deco==='pipes'){
    if((mx===1||mz===1)&&r<0.16)put(y,B.PIPE);
  }
}
function y1Free(blocks,lx,y,lz,fH){
  if(y>=fH+2)return false;
  for(let yy=y;yy<fH+2;yy++)if(blocks[bidx(lx,yy,lz)]!==B.AIR)return false;
  return true;
}
/* The Exit: a small bright room at the heart of region 22; everywhere else
   is solid wall so the only way out is the door. */
function brGenExitRoom(cx,cz){
  const blocks=new Uint16Array(CH*WH*CH);
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
