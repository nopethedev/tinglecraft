/* =====================================================================
   MULTIPLAYER UI (Tingle Craft) — net1_ui.js
   The title-screen Multiplayer panels: a server list stored in the
   browser (Add / Edit / Delete, like a certain block game), Direct
   Connect, and the login/register dialog shown while server.py checks
   your account. Servers live in storage key 'mp:servers' (the storage
   shim prefixes it), the last account name in 'mp:acc'.
   ===================================================================== */
const MPS={list:[],editing:-1,direct:false};
/* the featured server: always at the top, cannot be deleted or edited away */
const MP_FEATURED={n:'Arcside — Featured',a:'play.arcside.us.kg',f:1};
async function mpLoadServers(){
  try{
    if(!window.storage||!window.storage.get)return;
    const r=await window.storage.get('mp:servers');
    MPS.list=r&&r.value?JSON.parse(r.value):[];
  }catch(e){MPS.list=[];}
  if(!Array.isArray(MPS.list))MPS.list=[];
  MPS.list=MPS.list.filter(s=>s&&typeof s.a==='string');
  const fi=MPS.list.findIndex(s=>s.a===MP_FEATURED.a);
  if(fi<0)MPS.list.unshift({...MP_FEATURED});
  else MPS.list[fi]={...MP_FEATURED,a:MP_FEATURED.a};
}
function mpSaveServers(){
  try{if(window.storage&&window.storage.set)window.storage.set('mp:servers',JSON.stringify(MPS.list));}catch(e){}
}
function mpOpenList(){
  if(window.storage&&window.storage.get)mpLoadServers().then(mpRenderList);
  else mpRenderList();
}
function mpRenderList(){
  const box=$('mp_list');if(!box)return;
  box.innerHTML='';
  if(!MPS.list.length){
    const d=document.createElement('div');d.className='mlabel tgrhint';
    d.textContent='No servers yet. Add one (the host runs server.py) or use Direct Connect.';
    box.appendChild(d);
  }
  MPS.list.forEach((s,i)=>{
    const row=document.createElement('div');row.className='mprow';
    const b=document.createElement('button');b.className='mc-btn mpjoin'+(s.f?' mpfeat':'');
    const n=document.createElement('span');n.className='mpn';n.textContent=s.n||'Server';
    const a=document.createElement('span');a.className='mpa';a.textContent=s.a||'';
    b.appendChild(n);b.appendChild(a);
    if(s.f){const badge=document.createElement('span');badge.className='mpbadge';
      badge.textContent='FEATURED';b.appendChild(badge);}
    b.onclick=()=>{playS('click');mpJoin(s.a);};
    if(!s.f){
      const e=document.createElement('button');e.className='mc-btn mpmini';e.textContent='Edit';
      e.onclick=()=>{playS('click');mpEditOpen(i);};
      const x=document.createElement('button');x.className='mc-btn mpmini mpdel';x.textContent='X';
      x.onclick=()=>{playS('click');MPS.list.splice(i,1);mpSaveServers();mpRenderList();};
      row.appendChild(e);row.appendChild(x);
    }
    row.appendChild(b);box.appendChild(row);
  });
}
function mpJoin(addrStr){
  const ok=netConnect(addrStr);
  if(ok&&typeof tmShow==='function')tmShow('mplogin');
}
function mpEditOpen(i){
  MPS.editing=i;MPS.direct=false;
  const s=MPS.list[i]||{n:'',a:''};
  const n=$('mp_sname'),a=$('mp_saddr'),del=$('mp_del');
  if(n)n.value=s.n||'';if(a)a.value=s.a||'';
  if(del)del.style.display='';
  const h=$('mpedit_h');if(h)h.textContent='Edit Server';
  if(typeof tmShow==='function')tmShow('mpedit');
}
function mpDirect(){
  MPS.editing=-1;MPS.direct=true;
  const n=$('mp_sname'),a=$('mp_saddr'),del=$('mp_del');
  if(n)n.value='';if(a)a.value='';
  if(del)del.style.display='none';
  const h=$('mpedit_h');if(h)h.textContent='Direct Connect';
  if(typeof tmShow==='function')tmShow('mpedit');
}
function mpSaveEdit(){
  const n=$('mp_sname'),a=$('mp_saddr');
  const name=(n&&n.value||'').trim()||'Server';
  const addr=(a&&a.value||'').trim();
  if(!netAddr(addr)){if(n)a&&a.focus();showToast('Address needed — e.g. 127.0.0.1:8765');return;}
  if(MPS.direct){mpJoin(addr);return;}
  if(MPS.editing>=0&&MPS.list[MPS.editing]){MPS.list[MPS.editing]={n:name,a:addr};}
  else MPS.list.push({n:name,a:addr});
  mpSaveServers();mpRenderList();
  if(typeof tmShow==='function')tmShow('mp');
  playS('click');
}
function mpBackEdit(){
  if(typeof tmShow==='function')tmShow('mp');
  playS('click');
}
function mpLoginReady(){
  const b1=$('mp_login'),b2=$('mp_register');
  if(b1)b1.disabled=false;if(b2)b2.disabled=false;
  const u=$('mp_user');
  if(u&&!u.value)u.value=(typeof PNAME!=='undefined'&&PNAME)||'';
}
function mpLogin(register){
  const u=$('mp_user'),p=$('mp_pass');
  const name=(u&&u.value||'').trim(),pass=(p&&p.value||'');
  if(!NET.ws||NET.ws.readyState!==1){const s=$('mp_status');if(s)s.textContent='Not connected yet — wait for Connected.';return;}
  if(!name){if(u)u.focus();return;}
  if(!pass){if(p)p.focus();return;}
  const b1=$('mp_login'),b2=$('mp_register');
  if(b1)b1.disabled=true;if(b2)b2.disabled=true;
  netSend(register?{t:'register',name:name,pass:pass}:{t:'login',name:name,pass:pass});
  setTimeout(()=>{mpLoginReady();},4000);
}
function mpBackLogin(){
  if(!NET.on)netDisconnect(true);
  if(typeof tmShow==='function')tmShow('mp');
  playS('click');
}
/* one-time wiring (DOM exists by the time the script runs; guarded for node tests) */
(function mpWire(){
  if(typeof window==='undefined')return;
  const on=(id,f)=>{const b=(typeof $==='function')&&$(id);if(b)b.onclick=f;};
  on('mp_add',()=>{playS('click');mpEditOpen(-1);});
  on('mp_direct',()=>{playS('click');mpDirect();});
  on('mp_save',mpSaveEdit);
  on('mp_back_edit',mpBackEdit);
  on('mp_del',()=>{playS('click');
    if(MPS.editing>=0&&MPS.list[MPS.editing]){MPS.list.splice(MPS.editing,1);mpSaveServers();}
    MPS.editing=-1;mpRenderList();if(typeof tmShow==='function')tmShow('mp');});
  on('mp_login',()=>mpLogin(false));
  on('mp_register',()=>mpLogin(true));
  on('mp_back_login',mpBackLogin);
})();
