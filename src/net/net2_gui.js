/* =====================================================================
   MULTIPLAYER GUIS (Tingle Craft) — net2_gui.js
   The in-game panels that talk to server.py: the Shop (buy blocks/items
   for DB), the Sell menu (unload loot for DB), Homes (set / go / delete,
   stored per-account on the server) and the Admin panel (set balances,
   kick/ban/op, bring/teleport, set the clock, spawn, MOTD, mob spawning).
   All four are plain DOM overlays in dom/mp2.html, in the style of the
   Dingle Store: open from the pause menu buttons (multiplayer only) or
   /shop /sell /homes /admin. Esc closes them (p06b), and modalOpen()
   counts them so the game pauses politely (mpGUIOpen).
   ===================================================================== */
var shopOpen=false,sellOpen=false,homesOpen=false,admOpen=false;
var SHOP_SEL=null,SHOP_CNT=1;
function mpGUIOpen(){return shopOpen||sellOpen||homesOpen||admOpen;}
function mpGUIReset(){shopOpen=sellOpen=homesOpen=admOpen=false;
  for(const id of['mpshop','mpsell','mphomes','mpadm']){const el=$(id);if(el)el.style.display='none';}
  if(typeof mpShowButtons==='function')mpShowButtons();}
function mpShowButtons(){
  const on=!!NET.on,adm=on&&NET.admin;
  const show=(id,v)=>{const b=$(id);if(b)b.style.display=v?'':'none';};
  show('p_shop',on);show('p_sell',on);show('p_homes',on);show('p_admin',adm);
}
function mpRefreshGuis(){
  const sb=$('mpshop_bal');if(sb)sb.textContent=NET.bal+' DB';
  const slb=$('mpsell_bal');if(slb)slb.textContent=NET.bal+' DB';
  if(shopOpen)renderShop();
  if(sellOpen)renderSell();
  if(homesOpen)renderHomes();
  if(admOpen)renderAdm();
}
function mpIcon(id,sz){
  const c=document.createElement('canvas');c.width=c.height=sz||36;
  try{const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.drawImage(getIcon(id),0,0,c.width,c.height);}catch(e){}
  c.className='mpg-ic';return c;
}
function mpOpenPanel(id,flagSet){
  hidePause();
  document.exitPointerLock&&document.exitPointerLock();
  mpGUIReset();
  flagSet();
  const el=$(id);if(el)el.style.display='flex';
}
/* ---------------------------------------------------------------- shop */
function openShop(){
  if(!NET.on)return;
  SHOP_SEL=null;SHOP_CNT=1;
  mpOpenPanel('mpshop',()=>{shopOpen=true;});
  renderShop();
}
function closeShop(){shopOpen=false;const el=$('mpshop');if(el)el.style.display='none';restorePause();}
function renderShop(){
  const bal=$('mpshop_bal');if(bal)bal.textContent=NET.bal+' DB';
  const list=$('mpshop_list');if(!list)return;
  list.innerHTML='';
  if(!NET.shop.length){
    const d=document.createElement('div');d.className='mlabel';
    d.textContent='The server has not stocked a shop yet.';list.appendChild(d);return;
  }
  for(const it of NET.shop){
    const row=document.createElement('div');row.className='mpg-row'+(SHOP_SEL===it?' sel':'');
    row.appendChild(mpIcon(it.id));
    const nm=document.createElement('span');nm.className='mpg-nm';
    nm.textContent=(it.n||DEFS[it.id]&&DEFS[it.id].name||it.id);
    const pr=document.createElement('span');pr.className='mpg-pr';
    pr.textContent=it.p+' DB';
    row.appendChild(nm);row.appendChild(pr);
    row.onclick=()=>{SHOP_SEL=it;playS('click');renderShop();};
    list.appendChild(row);
  }
  const it=SHOP_SEL;
  const inm=$('mpshop_item'),ic=$('mpshop_count'),co=$('mpshop_cost');
  if(it){
    if(inm)inm.textContent=(it.n||it.id)+' — '+it.p+' DB each';
    if(ic)ic.textContent=SHOP_CNT;
    if(co)co.textContent=(it.p*SHOP_CNT)+' DB';
  }else{
    if(inm)inm.textContent='Pick an item below';
    if(ic)ic.textContent='1';
    if(co)co.textContent='—';
  }
}
function shopCount(d){
  SHOP_CNT=clamp(SHOP_CNT+d,1,64);
  const ic=$('mpshop_count'),co=$('mpshop_cost');
  if(ic)ic.textContent=SHOP_CNT;
  if(SHOP_SEL&&co)co.textContent=(SHOP_SEL.p*SHOP_CNT)+' DB';
}
function shopBuy(){
  if(!SHOP_SEL){showToast('Pick an item first');return;}
  netSend({t:'buy',item:SHOP_SEL.n,count:SHOP_CNT});
}
/* ---------------------------------------------------------------- sell */
function openSell(){
  if(!NET.on)return;
  mpOpenPanel('mpsell',()=>{sellOpen=true;});
  renderSell();
}
function closeSell(){sellOpen=false;const el=$('mpsell');if(el)el.style.display='none';restorePause();}
function mpSellPrice(id){return (NET.sell&&NET.sell[id])||0;}
function renderSell(){
  const bal=$('mpsell_bal');if(bal)bal.textContent=NET.bal+' DB';
  const list=$('mpsell_list');if(!list)return;
  list.innerHTML='';
  let any=false;
  for(let i=0;i<P.inv.length;i++){
    const st=P.inv[i];
    if(!st)continue;
    const pr=mpSellPrice(st.id);
    if(!pr)continue;
    any=true;
    const row=document.createElement('div');row.className='mpg-row';
    row.appendChild(mpIcon(st.id));
    const nm=document.createElement('span');nm.className='mpg-nm';
    nm.textContent=(DEFS[st.id]?DEFS[st.id].name:st.id)+' x '+st.count;
    const pr2=document.createElement('span');pr2.className='mpg-pr';
    pr2.textContent=pr+' DB each';
    row.appendChild(nm);row.appendChild(pr2);
    const b1=document.createElement('button');b1.className='mc-btn small';b1.textContent='Sell 1';
    b1.onclick=()=>{netSend({t:'sell',id:st.id,count:1});};
    const ba=document.createElement('button');ba.className='mc-btn small tgo';ba.textContent='Sell '+st.count;
    ba.onclick=()=>{netSend({t:'sell',id:st.id,count:st.count});};
    row.appendChild(b1);row.appendChild(ba);
    list.appendChild(row);
  }
  if(!any){
    const d=document.createElement('div');d.className='mlabel';
    d.textContent='Nothing sellable in your inventory. Mine, farm, fight — then come back.';list.appendChild(d);
  }
}
function sellEverything(){
  let n=0;
  for(const st of P.inv){
    if(st&&mpSellPrice(st.id)){netSend({t:'sell',id:st.id,count:st.count});n++;}
  }
  showToast(n?'Offered '+n+' stack'+(n>1?'s':'')+' for sale':'Nothing sellable');
}
/* --------------------------------------------------------------- homes */
function openHomes(){
  if(!NET.on)return;
  mpOpenPanel('mphomes',()=>{homesOpen=true;});
  netSend({t:'homes'});
  renderHomes();
}
function closeHomes(){homesOpen=false;const el=$('mphomes');if(el)el.style.display='none';restorePause();}
function renderHomes(){
  const cnt=$('mphomes_count');
  if(cnt)cnt.textContent=Object.keys(NET.homes).length+' / '+(NET.admin?10:5)+' homes';
  const list=$('mphomes_list');if(!list)return;
  list.innerHTML='';
  const names=Object.keys(NET.homes);
  if(!names.length){
    const d=document.createElement('div');d.className='mlabel';
    d.textContent='No homes yet. Stand somewhere nice and Set home here.';list.appendChild(d);
  }
  for(const nm of names){
    const h=NET.homes[nm];
    const row=document.createElement('div');row.className='mpg-row';
    const n2=document.createElement('span');n2.className='mpg-nm';
    n2.textContent=nm;
    const co=document.createElement('span');co.className='mpg-pr';
    co.textContent=Math.round(h[0])+', '+Math.round(h[1])+', '+Math.round(h[2]);
    row.appendChild(n2);row.appendChild(co);
    const bg=document.createElement('button');bg.className='mc-btn small tgo';bg.textContent='Go';
    bg.onclick=()=>{netSend({t:'home',name:nm});closeHomes();};
    const bd=document.createElement('button');bd.className='mc-btn small mpdel';bd.textContent='✕';
    bd.onclick=()=>{netSend({t:'delhome',name:nm});};
    row.appendChild(bg);row.appendChild(bd);
    list.appendChild(row);
  }
}
function mpSetHome(){
  const inp=$('mphomes_name');
  const nm=(inp&&inp.value||'').trim();
  if(!nm){showToast('Give the home a name first');if(inp)inp.focus();return;}
  netSend({t:'sethome',name:nm});
  if(inp)inp.value='';
}
/* --------------------------------------------------------------- admin */
function openAdm(){
  if(!NET.on||!NET.admin)return;
  mpOpenPanel('mpadm',()=>{admOpen=true;});
  renderAdm();
}
function closeAdm(){admOpen=false;const el=$('mpadm');if(el)el.style.display='none';restorePause();}
function renderAdm(){
  const st=$('mpadm_state');
  if(st)st.textContent=(NET.mobsOn?'Mobs on':'Mobs off')+' — '+(NET.plist?NET.plist.length:'?')+' online';
  const list=$('mpadm_list');if(!list)return;
  list.innerHTML='';
  if(!NET.plist||!NET.plist.length){
    const d=document.createElement('div');d.className='mlabel';d.textContent='Nobody else is online.';list.appendChild(d);
  }
  for(const ps of (NET.plist||[])){
    const nm=ps[0],isa=!!ps[1];
    const row=document.createElement('div');row.className='mpg-row admg';
    const n2=document.createElement('span');n2.className='mpg-nm';
    n2.textContent=nm+(isa?' ★':'');
    row.appendChild(n2);
    const mk=(label,fn)=>{const b=document.createElement('button');
      b.className='mc-btn small';b.textContent=label;b.onclick=fn;row.appendChild(b);};
    const inp=document.createElement('input');inp.className='mc-in mpg-amt';
    inp.type='number';inp.min='0';inp.max='1000000';inp.placeholder='DB';
    row.appendChild(inp);
    mk('+Set DB',()=>{netSend({t:'adm',act:'money',name:nm,amt:Math.max(0,Math.round(+inp.value||0))});});
    mk('Kick',()=>{netSend({t:'adm',act:'kick',name:nm});});
    mk('Ban',()=>{netSend({t:'adm',act:'ban',name:nm});});
    mk(isa?'Deop':'Op',()=>{netSend({t:'adm',act:isa?'deop':'op',name:nm});});
    mk('Bring',()=>{netSend({t:'adm',act:'tome',name:nm});});
    mk('Go to',()=>{netSend({t:'adm',act:'tothem',name:nm});closeAdm();});
    list.appendChild(row);
  }
  const mb=$('mpadm_mobs');if(mb)mb.textContent='Mobs: '+(NET.mobsOn?'On':'Off');
}
function admTime(v){netSend({t:'adm',act:'time',val:v});}
/* ------------------------------------------------------------- wiring */
(function mpGUIWire(){
  if(typeof window==='undefined')return;
  const on=(id,f)=>{const b=(typeof $==='function')&&$(id);if(b)b.onclick=f;};
  on('mpshop_close',()=>{playS('click');closeShop();});
  on('mpshop_minus',()=>{playS('click');shopCount(-1);});
  on('mpshop_plus',()=>{playS('click');shopCount(1);});
  on('mpshop_buy',()=>{playS('click');shopBuy();});
  on('mpsell_close',()=>{playS('click');closeSell();});
  on('mpsell_all',()=>{playS('click');sellEverything();});
  on('mphomes_close',()=>{playS('click');closeHomes();});
  on('mphomes_set',()=>{playS('click');mpSetHome();});
  on('mpadm_close',()=>{playS('click');closeAdm();});
  on('mpadm_spawn',()=>{playS('click');netSend({t:'adm',act:'spawn'});});
  on('mpadm_mobs',()=>{playS('click');netSend({t:'adm',act:'mobs',on:!NET.mobsOn?1:0});});
  on('mpadm_save',()=>{playS('click');netSend({t:'adm',act:'save'});});
  on('mpadm_motdset',()=>{playS('click');const i=$('mpadm_motd');
    if(i&&i.value.trim()){netSend({t:'adm',act:'motd',txt:i.value.trim()});i.value='';}});
  document.querySelectorAll&&document.querySelectorAll('#mpadm [data-time]').forEach(b=>{
    b.onclick=()=>{playS('click');admTime(b.getAttribute('data-time'));};});
  /* pause-menu buttons (multiplayer only; mpShowButtons toggles visibility) */
  on('p_shop',()=>{playS('click');openShop();});
  on('p_sell',()=>{playS('click');openSell();});
  on('p_homes',()=>{playS('click');openHomes();});
  on('p_admin',()=>{playS('click');openAdm();});
})();
