/* =====================================================================
   CREATE PACK, part 1 — blocks, tiles, recipes, the kinetic grid.
   (Tingle Craft) The old two-block machine shop (engine + belt) grows
   into a proper Create-flavoured factory kit. The block-id ledger under
   256 is fully allocated, so chunks are now Uint16Array and the pack
   lives on ids 300+ (309 and 339 stay spare forever).

   POWER (the kinetic grid): machine blocks that touch form a network.
   Each burning Steam Engine supplies 256, a Water Wheel sitting next to
   water supplies 128, a spinning Windmill Bearing supplies 32 per sail.
   Consumers: belt 8, press 64, millstone 48, mixer 64, funnel/chute 4.
   A network runs when supply >= load. Recomputed every 0.35 s into
   MC_POW (powered bkeys) exactly like the old within-3 rule — which the
   grid replaces, and improves: an engine now powers belts through shafts
   and cogwheels instead of by proximity.

   Blocks:
     B.ANDESITE 376  Andesite           B.BASIN    385  Basin
     B.CASING   377  Andesite Casing    B.FUNNEL   386  Brass Funnel
     B.COG      378  Cogwheel           B.CHUTE    387  Chute
     B.SHAFT    379  Shaft              B.VAULT    388  Item Vault
     B.WHEEL    380  Water Wheel        B.TANK     389  Fluid Tank
     B.PRESS    381  Mechanical Press   B.BEARING  390  Windmill Bearing
     B.DEPOT    382  Depot              B.INDIRON  391  Industrial Iron
     B.MILL     383  Millstone          B.SAIL     392  Windmill Sail
     B.MIXER    384  Mechanical Mixer   B.GRATE    393  Iron Grate
   Items: IT.AALLOY 370, IT.SHEET 371, IT.WAND 372 (WorldEdit), IT.FLOUR 373,
   IT.BREAD 374, IT.GSHEET 375.
   ===================================================================== */
/* Blocks live at 376+ (the ledger under 256 is full, purgatory items own
   285-364, p58 the 366-369 guns); items take 370-375. */
B.ANDESITE=376;B.CASING=377;B.COG=378;B.SHAFT=379;B.WHEEL=380;
B.PRESS=381;B.DEPOT=382;B.MILL=383;B.MIXER=384;B.BASIN=385;
B.FUNNEL=386;B.CHUTE=387;B.VAULT=388;B.TANK=389;B.BEARING=390;
B.INDIRON=391;B.SAIL=392;B.GRATE=393;
IT.AALLOY=370;IT.SHEET=371;IT.WAND=372;IT.FLOUR=373;IT.BREAD=374;IT.GSHEET=375;

def(B.ANDESITE,{name:'Andesite',tiles:'andst',hard:1.5,toolClass:'pick',req:true,cat:'create'});
def(B.CASING,{name:'Andesite Casing',tiles:{top:'casing_t',side:'casing_s',bot:'andst'},hard:1.8,toolClass:'axe',cat:'create'});
def(B.COG,{name:'Cogwheel',tiles:{top:'cog',side:'cog_s',bot:'cog'},hard:1.2,toolClass:'axe',cat:'create'});
def(B.SHAFT,{name:'Shaft',tiles:{top:'shaft_t',side:'shaft_s',bot:'shaft_t'},hard:1.2,toolClass:'axe',cat:'create'});
def(B.WHEEL,{name:'Water Wheel',tiles:{top:'wheel_t',side:'wheel_s',bot:'wheel_t'},hard:2,toolClass:'axe',cat:'create'});
def(B.PRESS,{name:'Mechanical Press',tiles:{top:'press_t',side:'press_s',bot:'casing_t'},hard:2.5,toolClass:'pick',req:true,cat:'create'});
def(B.DEPOT,{name:'Depot',tiles:{top:'depot_t',side:'depot_s',bot:'andst'},hard:1.6,toolClass:'pick',cat:'create'});
def(B.MILL,{name:'Millstone',tiles:{top:'mill_t',side:'mill_s',bot:'casing_t'},hard:2.2,toolClass:'pick',req:true,cat:'create'});
def(B.MIXER,{name:'Mechanical Mixer',tiles:{top:'mixer_t',side:'mixer_s',bot:'casing_t'},hard:2.5,toolClass:'pick',req:true,cat:'create'});
def(B.BASIN,{name:'Basin',tiles:{top:'basin_t',side:'basin_s',bot:'andst'},hard:1.8,toolClass:'pick',cat:'create'});
def(B.FUNNEL,{name:'Brass Funnel',tiles:{top:'funnel_t',side:'funnel_s',bot:'andst'},hard:1.4,toolClass:'pick',cat:'create'});
def(B.CHUTE,{name:'Chute',tiles:{top:'chute_t',side:'chute_s',bot:'chute_t'},hard:1.4,toolClass:'pick',cat:'create'});
def(B.VAULT,{name:'Item Vault',tiles:{top:'vault_t',side:'vault_s',bot:'vault_t'},hard:3,toolClass:'pick',req:true,interact:'vault',cat:'create'});
def(B.TANK,{name:'Fluid Tank',tiles:{top:'tank_t',side:'tank_s',bot:'tank_t'},hard:2,toolClass:'pick',cat:'create'});
def(B.BEARING,{name:'Windmill Bearing',tiles:{top:'bear_t',side:'bear_s',bot:'casing_t'},hard:2,toolClass:'axe',interact:'bearing',cat:'create'});
def(B.INDIRON,{name:'Industrial Iron',tiles:'indiron',hard:3,toolClass:'pick',req:true,cat:'create'});
def(B.SAIL,{name:'Windmill Sail',tiles:'sail',hard:0.6,toolClass:'axe',cat:'create'});
def(B.GRATE,{name:'Iron Grate',tiles:'grate',hard:2,toolClass:'pick',opq:false,bucket:'cut',cullSame:true,cat:'create'});

idef(IT.AALLOY,{name:'Andesite Alloy',icon:'i_alloy',cat:'create'});
idef(IT.SHEET,{name:'Iron Sheet',icon:'i_sheet',cat:'create'});
idef(IT.GSHEET,{name:'Gold Sheet',icon:'i_gsheet',cat:'create'});
idef(IT.FLOUR,{name:'Flour',icon:'i_flour',food:1,cat:'create'});
idef(IT.BREAD,{name:'Bread',icon:'i_bread',food:5,cat:'create'});
idef(IT.WAND,{name:'WorldEdit Wand',icon:'i_wand',stack:1,
  lore:'Left-click a block: position 1. Right-click: position 2. Type //help.'});

tile('andst',(c,R)=>{fillN(c,R,'#8d9188',.09);
  c.fillStyle='#7b7f77';for(let i=0;i<5;i++)c.fillRect((R()*13)|0,(R()*13)|0,3,2);
  c.fillStyle='#9aa094';c.fillRect(2,3,4,2);c.fillRect(9,10,4,2);});
tile('casing_t',(c,R)=>{fillN(c,R,'#9a7d52',.07);
  c.fillStyle='#7c6142';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#b09268';c.fillRect(3,3,10,10);
  c.fillStyle='#7c6142';c.fillRect(7,3,2,10);c.fillRect(3,7,10,2);});
tile('casing_s',(c,R)=>{fillN(c,R,'#8d9188',.08);
  c.fillStyle='#6e7269';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);
  c.fillStyle='#9a7d52';c.fillRect(0,4,16,8);
  c.fillStyle='#7c6142';for(let x=0;x<16;x+=4)c.fillRect(x,4,1,8);
  c.fillStyle='#b09268';c.fillRect(1,5,14,2);});
tile('cog',(c,R)=>{fillF(c,'#9a7d52');
  c.fillStyle='#7c6142';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#b09268';c.fillRect(4,4,8,8);
  c.fillStyle='#5c452c';c.fillRect(7,7,2,2);
  for(let i=0;i<4;i++){c.fillStyle='#6e5535';c.fillRect(3+i*4,1,2,2);c.fillRect(3+i*4,13,2,2);c.fillRect(1,3+i*4,2,2);c.fillRect(13,3+i*4,2,2);}});
tile('cog_s',(c,R)=>{fillN(c,R,'#9a7d52',.07);
  c.fillStyle='#5c452c';c.fillRect(6,2,4,12);
  c.fillStyle='#b09268';c.fillRect(7,2,2,12);
  c.fillStyle='#7c6142';c.fillRect(2,7,12,2);});
tile('shaft_t',(c,R)=>{fillN(c,R,'#8d9188',.06);
  c.fillStyle='#6e5535';c.fillRect(5,5,6,6);
  c.fillStyle='#9a7d52';c.fillRect(6,6,4,4);
  c.fillStyle='#5c452c';c.fillRect(7,7,2,2);});
tile('shaft_s',(c,R)=>{fillN(c,R,'#8d9188',.06);
  c.fillStyle='#6e5535';c.fillRect(6,0,4,16);
  c.fillStyle='#b09268';c.fillRect(7,0,1,16);
  c.fillStyle='#5c452c';for(let y=2;y<16;y+=5)c.fillRect(6,y,4,1);});
tile('wheel_t',(c,R)=>{fillN(c,R,'#7c6142',.07);
  c.fillStyle='#9a7d52';c.fillRect(2,2,12,12);
  c.fillStyle='#5c452c';c.fillRect(7,7,2,2);
  for(let i=0;i<4;i++){c.fillRect(4+i*3,4,1,8);}   /* spokes */});
tile('wheel_s',(c,R)=>{fillN(c,R,'#9a7d52',.07);
  c.fillStyle='#7c6142';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);
  c.fillStyle='#5c452c';c.fillRect(0,7,16,2);
  c.fillStyle='#6e5535';for(let x=2;x<16;x+=5)c.fillRect(x,2,2,12);});
tile('press_t',(c,R)=>{fillN(c,R,'#6e7269',.06);
  c.fillStyle='#4a4e52';c.fillRect(2,2,12,12);
  c.fillStyle='#8a8f96';c.fillRect(4,4,8,8);
  c.fillStyle='#c9a23a';c.fillRect(7,7,2,2);});
tile('press_s',(c,R)=>{fillN(c,R,'#8a8f96',.07);
  c.fillStyle='#5c6167';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);
  c.fillStyle='#3d4147';c.fillRect(6,4,4,9);
  c.fillStyle='#8a6440';c.fillRect(0,10,16,3);
  c.fillStyle='#c9a23a';c.fillRect(7,6,2,2);});
tile('depot_t',(c,R)=>{fillN(c,R,'#7c6142',.06);
  c.fillStyle='#9a7d52';c.fillRect(1,1,14,14);
  c.fillStyle='#5c452c';c.fillRect(3,3,10,10);c.fillRect(5,5,6,6);});
tile('depot_s',(c,R)=>{fillN(c,R,'#8d9188',.07);
  c.fillStyle='#6e5535';c.fillRect(2,2,12,12);
  c.fillStyle='#9a7d52';c.fillRect(4,4,8,8);
  c.fillStyle='#5c452c';c.fillRect(0,13,16,3);});
tile('mill_t',(c,R)=>{fillN(c,R,'#6e7269',.08);
  c.fillStyle='#54585c';c.fillRect(1,1,14,14);
  c.fillStyle='#8a8f96';for(let a=0;a<8;a++){const x=8+Math.round(Math.cos(a*0.785)*5),y=8+Math.round(Math.sin(a*0.785)*5);c.fillRect(x-1,y-1,2,2);}
  c.fillStyle='#3d4147';c.fillRect(7,7,2,2);});
tile('mill_s',(c,R)=>{fillN(c,R,'#7a7e76',.08);
  c.fillStyle='#54585c';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);
  c.fillStyle='#4a4e46';c.fillRect(0,5,16,2);c.fillRect(0,9,16,2);
  c.fillStyle='#8a8f96';c.fillRect(3,1,2,14);c.fillRect(11,1,2,14);});
tile('mixer_t',(c,R)=>{fillN(c,R,'#6e7269',.06);
  c.fillStyle='#3d4147';c.fillRect(6,6,4,4);
  c.fillStyle='#8a8f96';c.fillRect(7,2,2,12);c.fillRect(2,7,12,2);});
tile('mixer_s',(c,R)=>{fillN(c,R,'#8a8f96',.07);
  c.fillStyle='#5c6167';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);
  c.fillStyle='#3d4147';c.fillRect(6,3,4,10);
  c.fillStyle='#c9a23a';c.fillRect(7,6,2,3);});
tile('basin_t',(c,R)=>{fillN(c,R,'#73766e',.08);
  c.fillStyle='#4a4e46';c.fillRect(2,2,12,12);
  c.fillStyle='#565a52';c.fillRect(3,3,10,10);});
tile('basin_s',(c,R)=>{fillN(c,R,'#73766e',.08);
  c.fillStyle='#4a4e46';c.fillRect(0,0,16,2);c.fillRect(0,13,16,3);c.fillRect(0,0,2,16);c.fillRect(14,0,2,16);
  c.fillStyle='#565a52';c.fillRect(2,3,12,9);});
tile('funnel_t',(c,R)=>{fillN(c,R,'#8d9188',.06);
  c.fillStyle='#c9a23a';c.fillRect(3,3,10,10);
  c.fillStyle='#2c2c33';c.fillRect(5,5,6,6);
  c.fillStyle='#c9a23a';c.fillRect(7,7,2,2);});
tile('funnel_s',(c,R)=>{fillN(c,R,'#8d9188',.06);
  c.fillStyle='#c9a23a';c.fillRect(4,0,8,6);
  c.fillStyle='#2c2c33';c.fillRect(6,4,4,10);
  c.fillStyle='#a8862e';c.fillRect(4,0,8,1);});
tile('chute_t',(c,R)=>{fillN(c,R,'#8d9188',.06);
  c.fillStyle='#54585c';c.fillRect(3,3,10,10);
  c.fillStyle='#2c2c33';c.fillRect(5,5,6,6);});
tile('chute_s',(c,R)=>{fillN(c,R,'#8d9188',.06);
  c.fillStyle='#54585c';c.fillRect(4,0,8,16);
  c.fillStyle='#2c2c33';c.fillRect(6,2,4,12);});
tile('vault_t',(c,R)=>{fillN(c,R,'#54585c',.06);
  c.fillStyle='#3d4147';c.fillRect(1,1,14,14);
  c.fillStyle='#6e7269';c.fillRect(3,3,10,10);
  c.fillStyle='#c9a23a';c.fillRect(7,7,2,2);c.fillRect(4,4,2,2);c.fillRect(10,10,2,2);});
tile('vault_s',(c,R)=>{fillN(c,R,'#54585c',.06);
  c.fillStyle='#3d4147';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);
  c.fillStyle='#6e7269';c.fillRect(2,2,12,12);
  c.fillStyle='#45484c';for(let y=4;y<12;y+=3)c.fillRect(3,y,10,1);
  c.fillStyle='#c9a23a';c.fillRect(7,7,2,2);});
tile('tank_t',(c,R)=>{fillN(c,R,'#9a6a3a',.07);
  c.fillStyle='#b8824a';c.fillRect(1,1,14,14);
  c.fillStyle='#7c5230';c.fillRect(3,3,10,10);
  c.fillStyle='#5aa0c8';c.fillRect(5,5,6,6);});
tile('tank_s',(c,R)=>{fillN(c,R,'#9a6a3a',.07);
  c.fillStyle='#b8824a';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);c.fillRect(0,0,2,16);c.fillRect(14,0,2,16);
  c.fillStyle='#7c5230';c.fillRect(2,2,12,12);
  c.fillStyle='#5aa0c8';c.fillRect(4,4,8,8);
  c.fillStyle='#8ac8e8';c.fillRect(5,5,2,3);});
tile('bear_t',(c,R)=>{fillN(c,R,'#9a7d52',.06);
  c.fillStyle='#5c452c';c.fillRect(5,5,6,6);
  c.fillStyle='#c9a23a';c.fillRect(7,7,2,2);});
tile('bear_s',(c,R)=>{fillN(c,R,'#9a7d52',.06);
  c.fillStyle='#7c6142';c.fillRect(0,0,16,3);c.fillRect(0,13,16,3);
  c.fillStyle='#5c452c';c.fillRect(6,3,4,10);
  c.fillStyle='#c9a23a';c.fillRect(7,6,2,4);});
tile('indiron',(c,R)=>{fillN(c,R,'#b4b8bf',.05);
  c.fillStyle='#8a8f96';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#979ca4';c.fillRect(2,2,5,5);c.fillRect(9,2,5,5);c.fillRect(2,9,5,5);c.fillRect(9,9,5,5);
  c.fillStyle='#5c6167';px(c,4,4,'#5c6167');px(c,11,4,'#5c6167');px(c,4,11,'#5c6167');px(c,11,11,'#5c6167');});
tile('sail',(c,R)=>{fillN(c,R,'#e6e0d0',.06);
  c.fillStyle='#c9bf9e';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#b8a878';c.fillRect(2,2,12,12);
  c.fillStyle='#e6e0d0';c.fillRect(3,3,10,10);
  c.fillStyle='#c9bf9e';c.fillRect(3,3,4,4);c.fillRect(9,9,4,4);});
tile('grate',(c,R)=>{c.clearRect(0,0,16,16);
  c.fillStyle='#8a8f96';
  for(let i=0;i<16;i+=3){c.fillRect(i,0,1,16);c.fillRect(0,i,16,1);}
  c.fillStyle='#5c6167';for(let i=0;i<16;i+=3)c.fillRect(i,0,1,1);});

tile('i_alloy',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#6e7269';c.fillRect(2,4,12,9);
  c.fillStyle='#8d9188';c.fillRect(3,5,10,7);
  c.fillStyle='#54585c';c.fillRect(3,7,10,1);c.fillRect(3,10,10,1);
  c.fillStyle='#b4b8bf';c.fillRect(4,5,3,1);});
tile('i_sheet',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#b4b8bf';c.fillRect(2,5,12,7);
  c.fillStyle='#d4d8df';c.fillRect(3,6,10,2);
  c.fillStyle='#8a8f96';c.fillRect(2,11,12,1);c.fillRect(13,5,1,7);});
tile('i_gsheet',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#e8c84a';c.fillRect(2,5,12,7);
  c.fillStyle='#f8e48a';c.fillRect(3,6,10,2);
  c.fillStyle='#b8961e';c.fillRect(2,11,12,1);c.fillRect(13,5,1,7);});
tile('i_flour',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#d8d0c0';c.fillRect(4,3,8,11);
  c.fillStyle='#f4f0e4';c.fillRect(5,4,6,9);
  c.fillStyle='#b0a890';c.fillRect(4,3,8,2);
  c.fillStyle='#e8e0cc';c.fillRect(6,8,4,3);});
tile('i_bread',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#a86828';c.fillRect(2,6,12,6);
  c.fillStyle='#c88a3a';c.fillRect(3,6,10,3);
  c.fillStyle='#e8b870';c.fillRect(4,6,2,1);c.fillRect(8,7,2,1);c.fillRect(11,6,1,1);
  c.fillStyle='#8a5218';c.fillRect(2,11,12,1);});
tile('i_wand',c=>{c.clearRect(0,0,16,16);
  c.fillStyle='#8a6440';c.fillRect(7,3,2,10);
  c.fillStyle='#6b4a2e';c.fillRect(8,3,1,10);
  c.fillStyle='#c9a23a';c.fillRect(6,1,4,3);
  c.fillStyle='#ffe98a';c.fillRect(7,1,2,1);
  c.fillStyle='#5c3a1e';c.fillRect(7,12,2,2);});

R(['CC','CC'],{C:B.COBBLE},B.ANDESITE,4);           /* rough stone pressed into andesite */
R(['C C','CAC','C C'],{C:B.ANDESITE,A:B.PLANK_O},B.CASING,2);
R(['P P','PAP','P P'],{P:B.PLANK_O,A:IT.AALLOY},B.COG,2);
R(['A','S','A'],{A:IT.AALLOY,S:IT.STICK},B.SHAFT,4);
R(['PPP','PAP','PPP'],{P:B.PLANK_O,A:IT.AALLOY},B.WHEEL,1);
R(['ICI','IAI','III'],{I:IT.IRON,C:B.CASING,A:IT.AALLOY},B.PRESS,1);
R(['C','S','S'],{C:B.CASING,S:B.STONE},B.DEPOT,2);
R(['SSS','SCS','SSS'],{S:B.STONE,C:B.CASING},B.MILL,1);
R([' I ','ICI','IAI'],{I:IT.IRON,C:B.CASING,A:IT.AALLOY},B.MIXER,1);
R(['S S','S S','SSS'],{S:B.STONE},B.BASIN,1);
R(['AI','AI'],{A:IT.AALLOY,I:IT.IRON},B.FUNNEL,2);
R(['A','A','I'],{A:IT.AALLOY,I:IT.IRON},B.CHUTE,3);
R(['III','ICI','III'],{I:IT.IRON,C:B.CHEST},B.VAULT,1);
R(['GGG','GIG','GGG'],{G:B.GLASS,I:IT.IRON},B.TANK,1);
R([' A ','ACA',' P '],{A:IT.AALLOY,C:B.COG,P:B.PLANK_O},B.BEARING,1);
R(['III','IAI','III'],{I:IT.IRON,A:IT.AALLOY},B.INDIRON,2);
R(['WW','WW'],{W:B.WOOL},B.SAIL,4);
R(['I I','III','I I'],{I:IT.IRON},B.GRATE,8);
R(['AC','CA'],{A:B.ANDESITE,C:IT.CLAYBALL},IT.AALLOY,2);
R(['FFF'],{F:IT.FLOUR},IT.BREAD,1);

/* ----- the kinetic grid ------------------------------------------------ */
/* the machine set grows from v7.1's two blocks to the whole factory; the
   v7.1 hook (mcOnSet) keeps working because the binding is reassigned */
function crIsMach(id){
  return id===B.ENGINE||id===B.CONV||id===B.COG||id===B.SHAFT||id===B.WHEEL||
         id===B.PRESS||id===B.MILL||id===B.MIXER||id===B.FUNNEL||id===B.CHUTE||
         id===B.BEARING||id===B.DEPOT;
}
isMach=crIsMach;
/* generators must run; consumers load the network */
function machSupply(id,k){
  if(id===B.ENGINE&&mcEngineBurning(k))return 256;
  if(id===B.WHEEL){
    const p=mcParse(k);
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
      if(getBlock(p.x+dx,p.y+dy,p.z+dz)===B.WATER)return 128;
    return 0;
  }
  if(id===B.BEARING){
    const be=blockEnts.get(k);
    return (be&&be.t==='bearing'&&be.on&&be.sails>0)?Math.min(256,be.sails*32):0;
  }
  return 0;
}
function machLoad(id){
  switch(id){
    case B.CONV:return 8;
    case B.PRESS:return 64;
    case B.MILL:return 48;
    case B.MIXER:return 64;
    case B.FUNNEL:case B.CHUTE:return 4;
    default:return 0;
  }
}
/* flood one network out of seed k; returns {supply,load,ks:[bkeys]} */
const CR_SEEN=new Set();
function crNetwork(k0){
  const ks=[],q=[k0];
  CR_SEEN.add(k0);
  let supply=0,load=0;
  while(q.length){
    const k=q.pop();
    ks.push(k);
    const p=mcParse(k),id=getBlock(p.x,p.y,p.z);
    supply+=machSupply(id,k);
    load+=machLoad(id);
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const nk=bkey(p.x+dx,p.y+dy,p.z+dz);
      if(CR_SEEN.has(nk)||!machs.has(nk))continue;
      CR_SEEN.add(nk);
      q.push(nk);
    }
  }
  return {supply:supply,load:load,ks:ks};
}
function crRecomputePower(){
  /* NOTE: does NOT clear MC_POW — the v7.1 proximity rule runs first and
     this unions the kinetic grid's networks on top of it. */
  CR_SEEN.clear();
  for(const k of machs){
    if(CR_SEEN.has(k))continue;
    const net=crNetwork(k);
    const on=net.supply>=net.load&&net.supply>0;
    if(!on)continue;
    for(const k2 of net.ks)MC_POW.add(k2);
  }
}
/* every powered machine of one kind, as world positions */
function crPoweredOf(id){
  const out=[];
  for(const k of MC_POW){
    if(getBlockKey(k)!==id)continue;
    out.push(mcParse(k));
  }
  return out;
}
