/* =====================================================================
   OVERWORLD STRUCTURES (Tingle Craft) — p59_structures.js
   Five new reasons to go exploring, deterministic from the seed like the
   villages and parks (a region grid, a rare cell roll, colInfo for the
   ground, and a stamp that only touches its own chunk's columns):

     DESERT PYRAMID  sandstone, a hollow tomb, a chest, a TNT surprise
     IGLOO           a snow dome with a furnace and a torch inside
     RUINED TOWER    a broken cobble watchtower with a chest up top
     STONE CIRCLE    standing stones capped with glowstone
     SHIPWRECK       a splintered hull beached or sunk, chest in the hold

   Chests are plain chest blocks (open them for an empty inventory — the
   structures are landmarks and building material, not loot machines).
   ===================================================================== */
const S59_GRID=104;
function s59Cell(gx,gz,salt,biomeOk){
  if(h2(gx*11+3,gz*13-7,SEED+salt)>0.30)return null;         /* rare in the region grid */
  const ox=20+Math.floor(h2(gx,gz,SEED+salt+1)*(S59_GRID-40));
  const oz=20+Math.floor(h2(gx,gz,SEED+salt+2)*(S59_GRID-40));
  const cx=gx*S59_GRID+ox,cz=gz*S59_GRID+oz;
  const ci=colInfo(cx,cz);
  if(ci.h<SEA-1||ci.h>WH-20)return null;
  if(!biomeOk(ci))return null;
  if(mgNoStruct(cx,cz))return null;
  return {cx:cx,cz:cz,gy:ci.h,b:ci.b};
}
function s59Put(bl,x0,z0,x,y,z,id,keep){
  const lx=x-x0,lz=z-z0;
  if(lx<0||lx>=CH||lz<0||lz>=CH||y<1||y>=WH)return;
  if(keep&&bl[bidx(lx,y,lz)]!==B.AIR&&bl[bidx(lx,y,lz)]!==B.WATER)return;
  bl[bidx(lx,y,lz)]=id;
}
/* --------------------------- desert pyramid --------------------------- */
function s59Pyramid(bl,x0,z0,c){
  const h=c.gy;
  for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++){
    const d=Math.abs(dx)+Math.abs(dz);
    for(let y=h-2;y<=h;y++)s59Put(bl,x0,z0,c.cx+dx,y,c.cz+dz,B.SANDSTONE);
    for(let y=0;y<=6-d;y++)s59Put(bl,x0,z0,c.cx+dx,h+1+y,c.cz+dz,Math.abs(dx)<=6-d-2&&Math.abs(dz)<=6-d-2?B.AIR:B.SANDSTONE);
    s59Put(bl,x0,z0,c.cx+dx,h+7-d<1?h+1:h+7-d,c.cz+dz,d>4?B.SANDSTONE:B.AIR,true);
  }
  /* the tomb: a 5x5 chamber under the apex, chest + a TNT surprise */
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
    for(let y=h-1;y<=h+1;y++)s59Put(bl,x0,z0,c.cx+dx,y,c.cz+dz,
      (Math.abs(dx)===2||Math.abs(dz)===2||y===h+1)?B.SANDSTONE:B.AIR);
    s59Put(bl,x0,z0,c.cx+dx,h-2,c.cz+dz,B.SANDSTONE);
  }
  s59Put(bl,x0,z0,c.cx,h,c.cz,B.CHEST);
  s59Put(bl,x0,z0,c.cx,h-1,c.cz,B.TNT);
  s59Put(bl,x0,z0,c.cx,h+2,c.cz,B.GLOWSTONE);
}
/* ------------------------------- igloo -------------------------------- */
function s59Igloo(bl,x0,z0,c){
  const h=c.gy;
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
    const d=Math.round(Math.hypot(dx,dz));
    for(let y=h-1;y<=h;y++)s59Put(bl,x0,z0,c.cx+dx,y,c.cz+dz,B.SNOWGRASS);
    if(d<=3)s59Put(bl,x0,z0,c.cx+dx,h+1,c.cz+dz,B.ICE,true);
    if(d<=2)s59Put(bl,x0,z0,c.cx+dx,h+2,c.cz+dz,d<=1?B.ICE:B.AIR,true);
    if(d<=1)s59Put(bl,x0,z0,c.cx+dx,h+3,c.cz+dz,B.ICE,true);
  }
  s59Put(bl,x0,z0,c.cx,h+1,c.cz+3,B.AIR);      /* the doorway */
  s59Put(bl,x0,z0,c.cx,h+2,c.cz+3,B.AIR);
  s59Put(bl,x0,z0,c.cx+2,h+1,c.cz-2,B.FURNACE);
  s59Put(bl,x0,z0,c.cx-2,h+2,c.cz-2,B.TORCH);
}
/* --------------------------- ruined tower ------------------------------ */
function s59Tower(bl,x0,z0,c){
  const h=c.gy,th=6+Math.floor(h2(c.cx,c.cz,SEED+5923)*4);
  for(let y=h+1;y<=h+th;y++){
    const broken=h2(c.cx+y,c.cz,SEED+5924)<(y-h)/th*0.5;
    for(const [dx,dz] of [[-2,-2],[2,-2],[-2,2],[2,2]])
      if(!broken)s59Put(bl,x0,z0,c.cx+dx,y,c.cz+dz,B.COBBLE);
    for(const [dx,dz] of [[-1,-2],[0,-2],[1,-2],[-1,2],[0,2],[1,2],[-2,-1],[-2,0],[-2,1],[2,-1],[2,0],[2,1]])
      if(h2(c.cx*3+y,c.cz*7+dx*3+dz,SEED+5925)>0.18)s59Put(bl,x0,z0,c.cx+dx,y,c.cz+dz,B.COBBLE);
  }
  s59Put(bl,x0,z0,c.cx,h+1,c.cz,B.AIR);s59Put(bl,x0,z0,c.cx,h+2,c.cz,B.AIR);
  s59Put(bl,x0,z0,c.cx,h+th,c.cz,B.CHEST);
  s59Put(bl,x0,z0,c.cx,h+th+1,c.cz,B.TORCH);
}
/* --------------------------- stone circle ------------------------------ */
function s59Circle(bl,x0,z0,c){
  const h=c.gy;
  for(let i=0;i<10;i++){
    const a=i/10*Math.PI*2;
    const px=c.cx+Math.round(Math.cos(a)*6),pz=c.cz+Math.round(Math.sin(a)*6);
    const ph=2+Math.floor(h2(px,pz,SEED+5931)*3);
    for(let y=1;y<=ph;y++)s59Put(bl,x0,z0,px,h+y,pz,y===ph?B.STONEBRICK:B.STONE);
    s59Put(bl,x0,z0,px,h+ph+1,pz,i%3===0?B.GLOWSTONE:B.AIR,true);
  }
  s59Put(bl,x0,z0,c.cx,h+1,c.cz,B.GLOWSTONE);
}
/* ----------------------------- shipwreck ------------------------------- */
function s59Wreck(bl,x0,z0,c){
  const h=c.gy;
  const along=h2(c.cx,c.cz,SEED+5941)<0.5;   /* hull runs along x or z */
  for(let i=-6;i<=6;i++){
    const hole=h2(c.cx+i,c.cz,SEED+5942)<0.22;    /* the splinters */
    const hh=3-Math.floor(Math.abs(i)/3);
    for(let s=-1;s<=1;s+=2){
      const wx=along?c.cx+i:c.cx+s*2;
      const wz=along?c.cz+s*2:c.cz+i;
      for(let y=1;y<=hh;y++)
        if(!hole)s59Put(bl,x0,z0,wx,h+y,wz,y===hh?B.PLANK_S:B.LOG_O);
    }
    /* ribs across the hull */
    if(i%3===0&&!hole){
      for(let s=-1;s<=1;s++){
        const wx=along?c.cx+i:c.cx+s;
        const wz=along?c.cz+s:c.cz+i;
        s59Put(bl,x0,z0,wx,h+1,wz,B.PLANK_O);
      }
    }
  }
  s59Put(bl,x0,z0,c.cx,h+1,c.cz,B.CHEST);       /* the hold */
  if(c.b===BIOME.OCEAN){
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)
      for(let y=h+2;y<h+5;y++)s59Put(bl,x0,z0,c.cx+dx,y,c.cz+dz,B.WATER,true);
  }
}
/* ------------------------------ the stamp ------------------------------ */
const S59_TYPES=[
  {salt:5901,b:ci=>ci.b===BIOME.DESERT,make:s59Pyramid},
  {salt:5911,b:ci=>ci.b===BIOME.SNOWY,make:s59Igloo},
  {salt:5921,b:ci=>ci.h>=SEA+1&&ci.b!==BIOME.OCEAN,make:s59Tower},
  {salt:5931,b:ci=>ci.h>=SEA+1&&ci.b!==BIOME.OCEAN&&ci.b!==BIOME.DESERT,make:s59Circle},
  {salt:5941,b:ci=>ci.b===BIOME.OCEAN||ci.h<=SEA+1,make:s59Wreck},
];
function stampStructures(bl,x0,z0){
  for(let ti=0;ti<S59_TYPES.length;ti++){
    const T=S59_TYPES[ti];
    for(let gx=Math.floor((x0-24)/S59_GRID);gx<=Math.floor((x0+CH+24)/S59_GRID);gx++)
    for(let gz=Math.floor((z0-24)/S59_GRID);gz<=Math.floor((z0+CH+24)/S59_GRID);gz++){
      const c=s59Cell(gx,gz,T.salt,T.b);
      if(!c)continue;
      if(c.cx+16<x0||c.cx-16>=x0+CH||c.cz+16<z0||c.cz-16>=z0+CH)continue;
      T.make(bl,x0,z0,c);
    }
  }
}
