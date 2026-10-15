/* =====================================================================
   SCHEMATICS (Tingle Craft) — p61_schematics.js
   Loads Minecraft's world files and pastes them into your world:

     .litematic   Litematica's format (gzip + NBT, bit-packed palette)
     .schem       Sponge Schematic v2/v3 (gzip + NBT)
     .schematic   the old MCEdit format (gzip + NBT, legacy ids)

   The NBT reader below is deliberately tiny: big-endian tags 1-12, no
   gymnastics. Gzip is decompressed with the browser's DecompressionStream.
   Minecraft block names map onto the game's ledger (WE_MC in p60 plus a
   legacy-id table here); anything unknown lands as cobblestone so builds
   keep their shape. Paste honours the WorldEdit //limit, streams through
   setBlock (so multiplayer syncs and the world save keeps it), and is
   undoable with //undo like any other edit.
   Open it from the pause menu (Schematics) or //schem.
   ===================================================================== */
let schemOpen=false;

/* ------------------------------ NBT ---------------------------------- */
function schemGunzip(buf){
  return new Promise((res,rej)=>{
    try{
      const ds=new DecompressionStream('gzip');
      new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer()
        .then(res,rej);
    }catch(e){rej(e);}
  });
}
function schemNbt(buf){
  const dv=new DataView(buf),td=new TextDecoder('utf-8');
  let o=0;
  const u8=()=>dv.getUint8(o++);
  const i16=()=>{const v=dv.getInt16(o);o+=2;return v;};
  const i32=()=>{const v=dv.getInt32(o);o+=4;return v;};
  const i64=()=>{const v=dv.getBigInt64(o);o+=8;return v;};
  const f32=()=>{const v=dv.getFloat32(o);o+=4;return v;};
  const f64=()=>{const v=dv.getFloat64(o);o+=8;return v;};
  const str=()=>{const n=dv.getUint16(o);o+=2;const s=td.decode(new Uint8Array(buf,o,n));o+=n;return s;};
  const byteArray=()=>{const n=i32();const a=new Int8Array(buf,o,n);o+=n;return a;};
  const intArray=()=>{const n=i32();const a=new Int32Array(n);for(let i=0;i<n;i++)a[i]=i32();return a;};
  const longArray=()=>{const n=i32();const a=new BigInt64Array(n);for(let i=0;i<n;i++)a[i]=i64();return a;};
  function payload(t){
    switch(t){
      case 1:return u8();
      case 2:return i16();
      case 3:return i32();
      case 4:return i64();
      case 5:return f32();
      case 6:return f64();
      case 7:return byteArray();
      case 8:return str();
      case 9:{
        const et=u8(),n=i32(),arr=[];
        for(let i=0;i<n;i++)arr.push(payload(et));
        return arr;
      }
      case 10:{
        const obj={};
        for(;;){const t2=u8();if(t2===0)break;const nm=str();obj[nm]=payload(t2);}
        return obj;
      }
      case 11:return intArray();
      case 12:return longArray();
      default:throw new Error('bad NBT tag '+t);
    }
  }
  const t=u8();
  if(t!==10)throw new Error('NBT root is not a compound');
  const name=str();
  return {name:name,v:payload(10)};
}
/* number from maybe-BigInt */
const schemNum=v=>typeof v==='bigint'?Number(v):v;

/* --------------------- bit unpacking (litematica) ---------------------- */
/* entries packed little-endian across 64-bit words, `bits` wide each */
function schemUnpackBits(longs,count,bits){
  const out=new Uint16Array(count);
  const mask=(1n<<BigInt(bits))-1n;
  for(let e=0;e<count;e++){
    const b=e*bits,li=b>>6,off=BigInt(b&63);
    let v=(BigInt.asUintN(64,longs[li])>>off)&mask;
    if(off+BigInt(bits)>64n)
      v|=BigInt.asUintN(64,longs[li+1])<<(64n-off)&mask;
    out[e]=Number(v);
  }
  return out;
}
function schemBitsFor(n){
  let b=2;
  while((1<<b)<n)b++;
  return b;
}

/* ---------------------- format readers ---------------------------------
   Each returns {dims:[sx,sy,sz], pal:[ids], data:Uint16Array (palette
   indices), origin:[ox,oy,oz], name, unknown:N} */
function schemLitematic(root){
  const reg=root.Regions||{};
  const out=[];
  let unknown=0,name=(root.Metadata&&root.Metadata.Name)||'litematic';
  for(const rn in reg){
    const R=reg[rn];
    const sx=Math.abs(schemNum(R.Size.x)),sy=Math.abs(schemNum(R.Size.y)),sz=Math.abs(schemNum(R.Size.z));
    const palList=R.BlockStatePalette||[];
    const pal=palList.map(p=>schemMapName(p.Name,p.Properties,()=>{unknown++;}));
    const n=sx*sy*sz;
    if(!n)continue;
    const idx=schemUnpackBits(R.BlockStates,n,schemBitsFor(pal.length||1));
    const data=new Uint16Array(n);
    /* litematica order: (y*sizeX*sizeZ)+z*sizeX+x; ours: x+z*sx+y*sx*sz */
    for(let y=0;y<sy;y++)for(let z=0;z<sz;z++)for(let x=0;x<sx;x++){
      data[x+z*sx+y*sx*sz]=idx[(y*sx*sz)+z*sx+x];
    }
    out.push({dims:[sx,sy,sz],pal:pal,data:data,
      origin:[schemNum(R.Position.x)||0,schemNum(R.Position.y)||0,schemNum(R.Position.z)||0]});
    if(out.length>=4)break;
  }
  if(!out.length)throw new Error('no regions in the litematic');
  return {name:name,regions:out,unknown:unknown};
}
function schemSponge(root){
  const sx=schemNum(root.Width),sy=schemNum(root.Height),sz=schemNum(root.Length);
  if(!(sx>0&&sy>0&&sz>0))throw new Error('bad schematic size');
  let pal,name=(root.Metadata&&(root.Metadata.Name||''))||'schematic';
  let unknown=0;
  if(Array.isArray(root.BlockStatePalette)){       /* v3 */
    pal=root.BlockStatePalette.map(p=>schemMapName(p.Name,p.Properties,()=>{unknown++;}));
  }else{                                            /* v2: name -> id */
    const maxId=Math.max(-1,...Object.values(root.Palette||{}).map(schemNum));
    pal=new Array(maxId+1).fill(B.COBBLE);
    for(const nm in (root.Palette||{}))
      pal[schemNum(root.Palette[nm])]=schemMapName(nm,null,()=>{unknown++;});
  }
  const n=sx*sy*sz;
  const data=new Uint16Array(n);
  let bd=root.BlockData;
  if(bd&&typeof bd!=='string'&&bd.length!==undefined){
    if(bd.BYTES_PER_ELEMENT===8||typeof bd[0]==='bigint'||bd instanceof BigInt64Array){
      /* v3 long-packed */
      const idx=schemUnpackBits(bd,n,schemBitsFor(pal.length||1));
      data.set(idx);
    }else{
      /* v2: varint byte array, order (y*Length+z)*Width+x */
      let o=0;
      const rd=()=>{let v=0,sh=0,byte=0;
        do{byte=(o<bd.length)?(bd[o]&0xFF):0;o++;v|=(byte&0x7F)<<sh;sh+=7;}while(byte&0x80);
        return v;};
      for(let i=0;i<n;i++)data[i]=rd();
    }
  }else throw new Error('no block data in the schematic');
  /* their order (y*Length+z)*Width+x == ours x+z*sx+y*sx*sz — identical */
  const off=(root.Offset&&root.Offset.length===3)?
    [schemNum(root.Offset[0]),schemNum(root.Offset[1]),schemNum(root.Offset[2])]:[0,0,0];
  return {name:name,regions:[{dims:[sx,sy,sz],pal:pal,data:data,origin:off}],unknown:unknown};
}
function schemLegacy(root){
  const sx=schemNum(root.Width),sy=schemNum(root.Height),sz=schemNum(root.Length);
  if(!(sx>0&&sy>0&&sz>0))throw new Error('bad schematic size');
  const blocks=root.Blocks,data=new Uint16Array(sx*sy*sz);
  let unknown=0;
  for(let i=0;i<data.length&&i<blocks.length;i++)
    data[i]=schemLegacyId(blocks[i]&0xFF,()=>{unknown++;});
  const nm=(root.Materials==='Alpha')?'legacy schematic':'schematic';
  return {name:nm,regions:[{dims:[sx,sy,sz],pal:null,data:data,
    origin:(root.Offset&&root.Offset.length===3)?[schemNum(root.Offset[0]),schemNum(root.Offset[1]),schemNum(root.Offset[2])]:[0,0,0]}],
    unknown:unknown};
}
/* legacy MC numeric ids -> the game's ledger */
const WE_LEGACY={
  0:B.AIR,1:B.STONE,2:B.GRASS,3:B.DIRT,4:B.COBBLE,5:B.PLANK_O,6:B.LEAF_O,7:B.BEDROCK,
  8:B.WATER,9:B.WATER,10:B.LAVA,11:B.LAVA,12:B.SAND,13:B.GRAVEL,14:B.GOLD_ORE,
  15:B.IRON_ORE,16:B.COAL_ORE,17:B.LOG_O,18:B.LEAF_O,20:B.GLASS,21:B.STONE,
  22:B.STONE,24:B.SANDSTONE,30:B.SNOWGRASS,35:B.WOOL,41:B.INDIRON,42:B.INDIRON,45:B.BRICK,
  47:B.SHELF,48:B.COBBLE,49:B.OBSIDIAN,50:B.TORCH,52:B.STONE,54:B.CHEST,
  56:B.DIA_ORE,57:B.INDIRON,58:B.CRAFT,61:B.FURNACE,62:B.FURNACE,65:B.PLANK_O,
  73:B.STONE,74:B.STONE,78:B.SNOWGRASS,79:B.ICE,80:B.SNOWGRASS,81:B.CACTUS,
  82:B.CLAY,86:B.PLANK_O,89:B.GLOWSTONE,91:B.PLANK_O,
  98:B.STONEBRICK,101:B.GRATE,102:B.GLASS,112:B.NETHROCK,121:B.STONE,
  153:B.STONE,155:B.PTILE,159:B.WOOL,170:B.PLANK_O,173:B.INDIRON,174:B.ICE,
};
function schemLegacyId(b,mark){
  if(WE_LEGACY[b]!=null)return WE_LEGACY[b];
  mark();
  return B.COBBLE;
}
/* map a Minecraft name (+ optional properties) to a ledger id */
function schemMapName(nm,props,mark){
  if(!nm){mark();return B.COBBLE;}
  const id=weBlockArg(nm);
  if(id!=null)return id;
  /* colour variants: pink_wool -> wool, *_stained_glass -> glass ... */
  const bare=nm.replace(/^minecraft:/,'').replace(/^white_|^orange_|^magenta_|^light_blue_|^yellow_|^lime_|^pink_|^gray_|^light_gray_|^cyan_|^purple_|^blue_|^brown_|^green_|^red_|^black_/,'');
  if(bare!==nm&&weBlockArg(bare)!=null)return weBlockArg(bare);
  mark();
  return B.COBBLE;
}
/* --------------------------- the loader -------------------------------- */
let SCHEM=null;   /* the parsed load: {name,regions,unknown} */
async function schemLoadFile(file){
  const buf=await file.arrayBuffer();
  let raw=buf;
  try{raw=await schemGunzip(buf);}catch(e){raw=buf;}   /* not gzipped: parse raw */
  let root;
  try{root=schemNbt(raw).v;}
  catch(e){throw new Error('Not an NBT schematic ('+e.message+')');}
  if(root.Regions)return schemLitematic(root);
  if(root.Version!==undefined||root.BlockData)return schemSponge(root);
  if(root.Blocks)return schemLegacy(root);
  throw new Error('Unrecognised schematic format.');
}
function schemRegionBlocks(rg){
  const [sx,sy,sz]=rg.dims;
  const out=[];
  for(let i=0;i<rg.data.length;i++){
    const id=rg.pal?rg.pal[rg.data[i]]:rg.data[i];
    if(id===B.AIR||id==null)continue;
    const x=i%sx,z=((i/sx)|0)%sz,y=(i/(sx*sz))|0;
    out.push([x,y,z,id]);
  }
  return out;
}
function schemTotalBlocks(){
  if(!SCHEM)return 0;
  let n=0;
  for(const rg of SCHEM.regions)n+=rg.data.length;
  return n;
}
/* ------------------------------ the GUI -------------------------------- */
function weOpenSchem(){
  if(!weAllowed()){weDeny();return;}
  schemOpen=true;
  let win=$('schemwin');
  if(!win){
    win=document.createElement('div');win.id='schemwin';win.className='ovl';
    win.innerHTML='<div class="panel"><h2>Schematics</h2>'+
      '<p class="mlabel" style="margin:2px 0 8px">Load a <b>.litematic</b>, <b>.schem</b> or <b>.schematic</b> '+
      'and paste it at your feet. Everything lands as real blocks (and syncs on a server). '+
      'Unknown blocks become cobblestone; size caps at '+SCHEM_CAP.toLocaleString?SCHEM_CAP():'512 per side'+'.</p>'+
      '<input type="file" id="schemfile" accept=".litematic,.schem,.schematic" '+
      'style="margin:0 0 8px;font:13px monospace;color:#fff">'+
      '<div id="scheminfo" class="mlabel" style="min-height:44px;color:#cfcfcf"></div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
      '<button id="schempaste" class="mc-btn" disabled>Paste at my feet</button>'+
      '<button id="schemclose" class="mc-btn">Close</button></div></div>';
    document.body.appendChild(win);
    $('schemclose').onclick=()=>weCloseSchem();
    $('schemfile').onchange=async e=>{
      const f=e.target.files&&e.target.files[0];
      if(!f)return;
      const info=$('scheminfo');
      info.textContent='Reading '+f.name+' ...';
      try{
        SCHEM=await schemLoadFile(f);
        const dims=SCHEM.regions.map(r=>r.dims.join('x')).join(' + ');
        const n=schemTotalBlocks();
        info.innerHTML='<b>'+(SCHEM.name||f.name)+'</b><br>'+dims+' blocks, '+
          n.toLocaleString()+' total, '+SCHEM.regions.length+' region(s)'+
          (SCHEM.unknown?', '+SCHEM.unknown+' unknown -> cobblestone':'');
        $('schempaste').disabled=false;
        playS('pop');
      }catch(err){
        info.textContent='Could not read it: '+err.message;
        SCHEM=null;$('schempaste').disabled=true;
      }
    };
    $('schempaste').onclick=()=>schemPasteHere();
  }
  win.style.display='flex';
  document.exitPointerLock&&document.exitPointerLock();
}
function SCHEM_CAP(){return 512;}
function weCloseSchem(){
  schemOpen=false;
  const w=$('schemwin');if(w)w.style.display='none';
  restorePause();
}
function schemPasteHere(){
  if(!SCHEM||!P)return;
  const total=schemTotalBlocks();
  if(total>2000000){showToast('Too big to paste ('+total+' blocks).');return;}
  for(const rg of SCHEM.regions){
    const [sx,sy,sz]=rg.dims;
    if(sx>512||sy>WH-2||sz>512){showToast('A region is too tall/wide for this world.');return;}
  }
  const list=[];
  let n=0,missed=0;
  const px0=Math.floor(P.x),py0=Math.max(1,Math.floor(P.y)),pz0=Math.floor(P.z);
  for(const rg of SCHEM.regions){
    for(const [x,y,z,id] of schemRegionBlocks(rg)){
      const wx=px0+rg.origin[0]+x,wy=py0+rg.origin[1]+y,wz=pz0+rg.origin[2]+z;
      if(wy<1||wy>=WH)continue;
      if(!chunkAt(wx,wz)){missed++;continue;}
      const old=getBlock(wx,wy,wz);
      list.push([wx,wy,wz,old,id]);
      setBlock(wx,wy,wz,id);
      n++;
    }
  }
  wePushUndo(list);
  weCloseSchem();
  showToast('Pasted '+n+' blocks'+(missed?' ('+missed+' skipped — chunks not loaded)':'')+'.');
  sysMsg('Pasted "'+(SCHEM.name||'schematic')+'": '+n+' blocks. //undo takes it back.');
  playS('jackpot');
}
