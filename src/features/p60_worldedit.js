/* =====================================================================
   WORLDEDIT (Tingle Craft) — p60_worldedit.js
   The classic in-game editor, commands on the double slash: //help shows
   the commands (never /help — that one stays the game's own help).

     //help                  this list
     //wand                  gives the wand (LMB = pos1, RMB = pos2)
     //pos1 / //pos2         set a corner to the block you're standing in
     //hpos1 / //hpos2       set a corner to the block you're looking at
     //set <block>           fill the selection
     //replace <a> <b>       swap one block for another in the selection
     //walls / //outline     hollow shell / just the walls
     //count <block>         how many of a block the selection holds
     //size                  selection dimensions
     //expand <n> [dir]      grow the selection (dir: me,up,down,n,s,e,w)
     //contract <n> [dir]    shrink it
     //shift <n> [dir]       move it
     //copy / //cut          clipboard (relative to where you stand)
     //paste                 put the clipboard down at your feet
     //undo / //redo         eight steps back and forth
     //limit <n>             cap blocks per op (default 200000)
     //schem                 open the litematic / schematic loader

   Block names accept our names ("damp carpet"), ids ("317"), and the
   usual Minecraft names ("minecraft:polished_andesite"). In multiplayer
   WorldEdit is admin-only (the server would reject far edits anyway);
   in singleplayer it always works.
   ===================================================================== */
const WE={p1:null,p2:null,undo:[],redo:[],clip:null,limit:200000};

function weAllowed(){
  if(typeof NET!=='undefined'&&NET.on)return !!NET.admin;
  return true;
}
function weDeny(){
  sysMsg('WorldEdit is admin-only on this server.');
}
function weSetPos(n,hit){
  if(!weAllowed()){weDeny();return;}
  const p=[hit.x,hit.y,hit.z];
  if(n===1)WE.p1=p;else WE.p2=p;
  showToast('Position '+n+': '+p[0]+', '+p[1]+', '+p[2]);
  playS('place');
}
function weLookPos(){
  const e=eyePos(),d=lookDir();
  const h=raycastB(e[0],e[1],e[2],d[0],d[1],d[2],REACH);
  return h?[h.x,h.y,h.z]:null;
}
function weRegion(){
  if(!WE.p1||!WE.p2)return null;
  return {x0:Math.min(WE.p1[0],WE.p2[0]),x1:Math.max(WE.p1[0],WE.p2[0]),
          y0:Math.min(WE.p1[1],WE.p2[1]),y1:Math.max(WE.p1[1],WE.p2[1]),
          z0:Math.min(WE.p1[2],WE.p2[2]),z1:Math.max(WE.p1[2],WE.p2[2])};
}
function weVolume(r){return (r.x1-r.x0+1)*(r.y1-r.y0+1)*(r.z1-r.z0+1);}
/* ---- block argument parsing: id, our name, or minecraft name ---- */
const WE_MC={
  'stone':()=>B.STONE,'cobblestone':()=>B.COBBLE,'cobbled_deepslate':()=>B.COBBLE,
  'dirt':()=>B.DIRT,'grass_block':()=>B.GRASS,'grass':()=>B.GRASS,
  'planks':()=>B.PLANK_O,'oak_planks':()=>B.PLANK_O,'birch_planks':()=>B.PLANK_B,
  'spruce_planks':()=>B.PLANK_S,'oak_log':()=>B.LOG_O,'birch_log':()=>B.LOG_B,
  'spruce_log':()=>B.LOG_S,'log':()=>B.LOG_O,'glass':()=>B.GLASS,'sand':()=>B.SAND,
  'gravel':()=>B.GRAVEL,'sandstone':()=>B.SANDSTONE,'smooth_sandstone':()=>B.SANDSTONE,
  'bricks':()=>B.BRICK,'brick_block':()=>B.BRICK,'stone_bricks':()=>B.STONEBRICK,
  'stone_brick':()=>B.STONEBRICK,'wool':()=>B.WOOL,'white_wool':()=>B.WOOL,
  'snow_block':()=>B.SNOWGRASS,'cactus':()=>B.CACTUS,'clay':()=>B.CLAY,
  'ice':()=>B.ICE,'coal_ore':()=>B.COAL_ORE,'iron_ore':()=>B.IRON_ORE,
  'gold_ore':()=>B.GOLD_ORE,'diamond_ore':()=>B.DIA_ORE,'bedrock':()=>B.BEDROCK,
  'water':()=>B.WATER,'flowing_water':()=>B.WATER,'crafting_table':()=>B.CRAFT,
  'furnace':()=>B.FURNACE,'chest':()=>B.CHEST,'tnt':()=>B.TNT,'torch':()=>B.TORCH,
  'wall_torch':()=>B.TORCH,'glowstone':()=>B.GLOWSTONE,'obsidian':()=>B.OBSIDIAN,
  'netherrack':()=>B.NETHROCK,'iron_block':()=>B.IRON,'gold_block':()=>B.GOLD,
  'diamond_block':()=>B.DIAMOND,'coal_block':()=>B.COAL,'oak_leaves':()=>B.LEAF_O,
  'birch_leaves':()=>B.LEAF_B,'spruce_leaves':()=>B.LEAF_S,'leaves':()=>B.LEAF_O,
  'tallgrass':()=>B.TALLGRASS,'tall_grass':()=>B.TALLGRASS,'dandelion':()=>B.FLOWER_Y,
  'poppy':()=>B.FLOWER_R,'red_flower':()=>B.FLOWER_R,'yellow_flower':()=>B.FLOWER_Y,
  'bookshelf':()=>B.SHELF,'andesite':()=>B.ANDESITE,'polished_andesite':()=>B.ANDESITE,
  'white_concrete':()=>B.CONCRETE,'concrete':()=>B.CONCRETE,
  'iron_bars':()=>B.GRATE,'chain_command_block':()=>B.INDIRON,
  'yellow_wallpaper':()=>B.BRWALL,'damp_carpet':()=>B.BRCARP,
};
function weBlockArg(s){
  if(s==null||s==='')return null;
  s=(''+s).trim().toLowerCase().replace(/^minecraft:/,'');
  if(/^\d+$/.test(s)){const id=+s;return (id>0&&DEFS[id]&&!DEFS[id].item)?id:null;}
  for(const id in DEFS){
    const d=DEFS[id];
    if(d.item||!d.name)continue;
    if(d.name.toLowerCase().replace(/[^a-z0-9]+/g,'_')===s)return +id;
  }
  if(WE_MC[s])return WE_MC[s]();
  return null;
}
function weNameOf(id){return (DEFS[id]&&DEFS[id].name)||('id '+id);}

/* ---- the edit engine: record + apply ---- */
function weRecord(list,x,y,z){
  const old=getBlock(x,y,z);
  if(old===undefined)return false;
  list.push([x,y,z,old]);
  return true;
}
function weApply(list,x,y,z,id){
  const old=getBlock(x,y,z);
  if(old===undefined)return;
  list.push([x,y,z,old,id]);
  setBlock(x,y,z,id);
}
function wePushUndo(list){
  if(!list.length)return 0;
  WE.undo.push(list);
  if(WE.undo.length>8)WE.undo.shift();
  WE.redo.length=0;
  return list.length;
}
function weForRegion(r,fn){
  let n=0,missed=0;
  for(let x=r.x0;x<=r.x1;x++)for(let y=Math.max(1,r.y0);y<=Math.min(WH-1,r.y1);y++)
  for(let z=r.z0;z<=r.z1;z++){
    if(!chunkAt(x,z)){missed++;continue;}
    fn(x,y,z);n++;
    if(n>WE.limit)return {n:n,missed:missed,capped:true};
  }
  return {n:n,missed:missed,capped:false};
}
function weAirId(){return B.AIR;}

/* ---- commands ---- */
function weCmd(raw){
  if(!weAllowed()){weDeny();return true;}
  const parts=raw.slice(2).trim().split(/\s+/);
  const c=(parts.shift()||'').toLowerCase();
  const a=parts;
  const r=weRegion();
  switch(c){
    case '':case 'help':{
      sysMsg('WorldEdit (//commands): //wand //pos1 //pos2 //hpos1 //hpos2');
      sysMsg('//set <block> //replace <from> <to> //walls //outline //count <block> //size');
      sysMsg('//expand <n> [up|down|n|s|e|w] //contract <n> [dir] //shift <n> [dir]');
      sysMsg('//copy //cut //paste //undo //redo //limit <n> //schem');
      sysMsg('Block names: ours ("damp carpet"), ids, or Minecraft names ("minecraft:stone").');
      return true;}
    case 'wand':{
      givePlayer(IT.WAND,1);
      showToast('The wand! Left-click = pos1, right-click = pos2.');
      return true;}
    case 'pos1':{
      if(!P)return true;
      WE.p1=[Math.floor(P.x),Math.floor(P.y-0.6),Math.floor(P.z)];
      showToast('Position 1: '+WE.p1.join(', '));return true;}
    case 'pos2':{
      if(!P)return true;
      WE.p2=[Math.floor(P.x),Math.floor(P.y-0.6),Math.floor(P.z)];
      showToast('Position 2: '+WE.p2.join(', '));return true;}
    case 'hpos1':case 'hpos2':{
      const h=weLookPos();
      if(!h){sysMsg('Aim at a block first.');return true;}
      if(c==='hpos1')WE.p1=h;else WE.p2=h;
      showToast('Position '+(c==='hpos1'?1:2)+': '+h.join(', '));return true;}
    case 'size':{
      if(!r){sysMsg('Select two corners first (//wand).');return true;}
      sysMsg('Region: '+(r.x1-r.x0+1)+' x '+(r.y1-r.y0+1)+' x '+(r.z1-r.z0+1)+
        ' = '+weVolume(r)+' blocks');return true;}
    case 'limit':{
      const n=parseInt(a[0],10);
      if(!(n>0)){sysMsg('Usage: //limit <blocks per op>');return true;}
      WE.limit=Math.min(1000000,n);
      sysMsg('Limit set to '+WE.limit+'.');return true;}
    case 'set':{
      if(!r){sysMsg('Select two corners first (//wand).');return true;}
      const id=weBlockArg(a[0]);
      if(id==null){sysMsg('Unknown block: '+(a[0]||'')+' — try //set stone');return true;}
      const list=[];
      const res=weForRegion(r,(x,y,z)=>weApply(list,x,y,z,id));
      const n=wePushUndo(list);
      sysMsg('Set '+n+' blocks to '+weNameOf(id)+
        (res.missed?' ('+res.missed+' in unloaded chunks skipped)':'')+(res.capped?' (limit reached)':''));
      playS('place');return true;}
    case 'replace':{
      if(!r){sysMsg('Select two corners first (//wand).');return true;}
      const from=weBlockArg(a[0]),to=weBlockArg(a[1]);
      if(from==null||to==null){sysMsg('Usage: //replace <from> <to>');return true;}
      const list=[];
      const res=weForRegion(r,(x,y,z)=>{
        if(getBlock(x,y,z)===from)weApply(list,x,y,z,to);
      });
      const n=wePushUndo(list);
      sysMsg('Replaced '+n+' x '+weNameOf(from)+' with '+weNameOf(to)+
        (res.capped?' (limit reached)':''));playS('place');return true;}
    case 'walls':case 'outline':{
      if(!r){sysMsg('Select two corners first (//wand).');return true;}
      const id=weBlockArg(a[0]);
      if(id==null){sysMsg('Usage: //'+c+' <block>');return true;}
      const list=[];
      const shell=(x,y,z)=>!(c==='walls'&&x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1);
      const res=weForRegion(r,(x,y,z)=>{
        const onEdge=x===r.x0||x===r.x1||z===r.z0||z===r.z1||y===r.y0||y===r.y1;
        if(c==='walls'?onEdge:shell(x,y,z))weApply(list,x,y,z,id);
      });
      const n=wePushUndo(list);
      sysMsg((c==='walls'?'Walled':'Outlined')+' '+n+' blocks with '+weNameOf(id));playS('place');return true;}
    case 'count':{
      if(!r){sysMsg('Select two corners first (//wand).');return true;}
      const id=weBlockArg(a[0]);
      if(id==null){sysMsg('Usage: //count <block>');return true;}
      let n=0;
      weForRegion(r,(x,y,z)=>{if(getBlock(x,y,z)===id)n++;});
      sysMsg('Counted '+n+' x '+weNameOf(id)+'.');return true;}
    case 'expand':case 'contract':case 'shift':{
      if(!WE.p1||!WE.p2){sysMsg('Select two corners first (//wand).');return true;}
      const n=parseInt(a[0],10);
      if(!(n!==0&&n>-100000&&n<100000)){sysMsg('Usage: //'+c+' <n> [up|down|n|s|e|w]');return true;}
      let dir=a[1]||'me';
      let dv=null;
      if(dir==='up')dv=[0,1,0];else if(dir==='down')dv=[0,-1,0];
      else if(dir==='n')dv=[0,0,-1];else if(dir==='s')dv=[0,0,1];
      else if(dir==='e')dv=[1,0,0];else if(dir==='w')dv=[-1,0,0];
      else{
        /* 'me': toward the player, horizontally */
        const yaw=P?P.yaw:0;
        const sx=-Math.sin(yaw),sz=-Math.cos(yaw);
        dv=Math.abs(sx)>Math.abs(sz)?[Math.sign(sx),0,0]:[0,0,Math.sign(sz)];
      }
      const sgn=c==='contract'?-1:1;
      const cx=(dv[0]!==0)?[0,0,0]:null;
      void cx;
      const grow=(pt)=>[pt[0]+sgn*n*dv[0],pt[1]+sgn*n*dv[1],pt[2]+sgn*n*dv[2]];
      const shrink=(pt)=>[pt[0]-sgn*n*dv[0],pt[1]-sgn*n*dv[1],pt[2]-sgn*n*dv[2]];
      let p1,p2;
      /* grow the face toward the direction, shrink the opposite for contract */
      const toward=Math.sign(dv[0]+dv[1]+dv[2]);
      const d1=(WE.p1[0]*dv[0]+WE.p1[1]*dv[1]+WE.p1[2]*dv[2]);
      const d2=(WE.p2[0]*dv[0]+WE.p2[1]*dv[1]+WE.p2[2]*dv[2]);
      const nearIsP1=(c==='shift')||(d1*toward<=d2*toward);
      if(c==='shift'){p1=grow(WE.p1);p2=grow(WE.p2);}
      else{
        p1=nearIsP1?grow(WE.p1):shrink(WE.p1);
        p2=nearIsP1?shrink(WE.p2):grow(WE.p2);
      }
      WE.p1=p1;WE.p2=p2;
      sysMsg('Selection '+(c==='shift'?'moved':c)+'d. Now '+
        (r?weVolume(r):weVolume(weRegion()))+' blocks at '+p1.join(',')+' .. '+p2.join(','));
      return true;}
    case 'copy':case 'cut':{
      if(!r){sysMsg('Select two corners first (//wand).');return true;}
      const vol=weVolume(r);
      if(vol>WE.limit){sysMsg('Region too big ('+vol+' > '+WE.limit+'). //limit higher first.');return true;}
      const data=[];
      weForRegion(r,(x,y,z)=>data.push([x-r.x0,y-r.y0,z-r.z0,getBlock(x,y,z)]));
      WE.clip={data:data,w:r.x1-r.x0+1,h:r.y1-r.y0+1,d:r.z1-r.z0+1,
        rel:[r.x0-Math.floor(P.x),r.y0-Math.floor(P.y),r.z0-Math.floor(P.z)]};
      if(c==='cut'){
        const list=[];
        weForRegion(r,(x,y,z)=>weApply(list,x,y,z,B.AIR));
        wePushUndo(list);
      }
      sysMsg((c==='cut'?'Cut ':'Copied ')+data.length+' blocks ('+WE.clip.w+'x'+WE.clip.h+'x'+WE.clip.d+').');
      return true;}
    case 'paste':{
      if(!WE.clip){sysMsg('Nothing on the clipboard. //copy first.');return true;}
      if(!P)return true;
      const cl=WE.clip;
      const bx=Math.floor(P.x)+cl.rel[0],by=Math.floor(P.y)+cl.rel[1],bz=Math.floor(P.z)+cl.rel[2];
      if(cl.data.length>WE.limit){sysMsg('Clipboard bigger than the limit ('+WE.limit+').');return true;}
      const list=[];
      let n=0,missed=0;
      for(const [dx,dy,dz,id] of cl.data){
        const x=bx+dx,y=by+dy,z=bz+dz;
        if(y<1||y>=WH)continue;
        if(!chunkAt(x,z)){missed++;continue;}
        weApply(list,x,y,z,id);n++;
        if(n>WE.limit)break;
      }
      wePushUndo(list);
      sysMsg('Pasted '+n+' blocks'+(missed?' ('+missed+' in unloaded chunks skipped)':'')+'.');
      playS('place');return true;}
    case 'undo':{
      const u=WE.undo.pop();
      if(!u){sysMsg('Nothing to undo.');return true;}
      for(let i=u.length-1;i>=0;i--){
        const [x,y,z,old]=u[i];
        if(chunkAt(x,y,z))setBlock(x,y,z,old);
      }
      WE.redo.push(u);
      sysMsg('Undid '+u.length+' blocks.');playS('pop');return true;}
    case 'redo':{
      const u=WE.redo.pop();
      if(!u){sysMsg('Nothing to redo.');return true;}
      for(const [x,y,z,old,id] of u){
        void old;
        if(chunkAt(x,y,z))setBlock(x,y,z,id);
      }
      WE.undo.push(u);
      sysMsg('Redid '+u.length+' blocks.');playS('pop');return true;}
    case 'schem':{
      if(typeof weOpenSchem==='function')weOpenSchem();
      else sysMsg('The schematic loader is not available here.');
      return true;}
  }
  sysMsg('Unknown WorldEdit command. //help lists them.');
  return true;
}
