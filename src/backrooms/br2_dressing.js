/* =====================================================================
   THE BACKROOMS, part 3 — dressing blocks (Tingle Craft).
   The levels used to be one wallpaper texture and four block ids. These
   thirteen blocks (394-406, chunk arrays are Uint16Array now) give every
   level its own material kit so the descent reads like the wiki:

     B.BRWALL2  394  Stained Wallpaper   (level 0's wet patches)
     B.BRCEIL   395  Ceiling Tile        (suspended office tiles)
     B.HOTCARP  396  Hotel Carpet        (level 5's blood-red carpet)
     B.HOTDOOR  397  Hotel Door          (level 5's numbered doors)
     B.METWALL  398  Metal Wall Panel    (levels 6, 15, 17)
     B.PTILE    399  Pool Tile           (the Poolrooms' white square tile)
     B.OFFWALL  400  Office Drywall      (level 4, level 12's skin)
     B.PIPE     401  Pipe                (level 2's maintenance walls)
     B.WHEATB   402  Wheat               (level 10's field, grindable)
     B.CONCRETE 403  Concrete            (levels 1, 11, 13, 20)
     B.GRNSCR   404  Code Screen         (level 12, the green rain)
     B.CRATE    405  Supply Crate        (levels 1 and 20's cargo)
     B.SKYLIGHT 406  Skylight            (Poolrooms' glow from above)

   All decorative-gravity-free, all mineable, all registered in the
   Backrooms creative tab. Wheat grinds into flour in the millstone.
   ===================================================================== */
/* ids 394-406: the ledger below 364 is purgatory and gun items, 376-393
   are the Create blocks; see cr0_create.js */
B.BRWALL2=394;B.BRCEIL=395;B.HOTCARP=396;B.HOTDOOR=397;B.METWALL=398;
B.PTILE=399;B.OFFWALL=400;B.PIPE=401;B.WHEATB=402;B.CONCRETE=403;
B.GRNSCR=404;B.CRATE=405;B.SKYLIGHT=406;

def(B.BRWALL2,{name:'Stained Wallpaper',tiles:'brwall2',hard:0.7,cat:'backrooms'});
def(B.BRCEIL,{name:'Ceiling Tile',tiles:'brceil',hard:0.4,cat:'backrooms'});
def(B.HOTCARP,{name:'Hotel Carpet',tiles:{top:'hotcarp',side:'brwall',bot:'brwall'},hard:0.4,toolClass:'shovel',cat:'backrooms'});
def(B.HOTDOOR,{name:'Hotel Door',tiles:'hotdoor',hard:1.2,toolClass:'axe',cat:'backrooms'});
def(B.METWALL,{name:'Metal Wall Panel',tiles:'metwall',hard:2.2,toolClass:'pick',req:true,cat:'backrooms'});
def(B.PTILE,{name:'Pool Tile',tiles:'ptile',hard:1,toolClass:'pick',cat:'backrooms'});
def(B.OFFWALL,{name:'Office Drywall',tiles:'offwall',hard:0.6,cat:'backrooms'});
def(B.PIPE,{name:'Pipe',tiles:'brpipe',hard:1.6,toolClass:'pick',cat:'backrooms'});
def(B.WHEATB,{name:'Wheat',tiles:'wheatb',hard:0.1,solid:false,opq:false,bucket:'cut',cullSame:true,cross:true,cat:'backrooms'});
def(B.CONCRETE,{name:'Concrete',tiles:'concrete',hard:2.4,toolClass:'pick',req:true,cat:'backrooms'});
def(B.GRNSCR,{name:'Code Screen',tiles:'grnscr',hard:1,cat:'backrooms'});
def(B.CRATE,{name:'Supply Crate',tiles:{top:'crate_t',side:'crate_s',bot:'crate_t'},hard:1.8,toolClass:'axe',cat:'backrooms'});
def(B.SKYLIGHT,{name:'Skylight',tiles:'skylight',hard:0.4,light:true,cat:'backrooms'});

tile('brwall2',(c,R)=>{fillN(c,R,'#c2ad51',.07);
  c.fillStyle='#a89438';c.fillRect(0,7,16,1);
  c.fillStyle='#d3c066';for(let x=1;x<16;x+=4)c.fillRect(x,0,1,7);
  /* the water stains that gave Level 0 its smell */
  c.fillStyle='rgba(122,96,30,0.55)';
  c.fillRect(3,8,4,7);c.fillRect(4,8,2,3);
  c.fillRect(10,9,3,5);c.fillRect(11,9,1,7);
  c.fillStyle='#8f7c2c';c.fillRect(0,15,16,1);});
tile('brceil',(c,R)=>{fillF(c,'#e8e4d4');
  c.fillStyle='#cfcbb8';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#d8d4c2';c.fillRect(2,2,12,12);
  c.fillStyle='#b8b4a0';px(c,4,4,'#b8b4a0');px(c,11,7,'#b8b4a0');px(c,6,12,'#b8b4a0');});
tile('hotcarp',(c,R)=>{fillN(c,R,'#7a1f1f',.1);
  c.fillStyle='#8f2626';for(let i=0;i<6;i++)c.fillRect((R()*14)|0,(R()*14)|0,2,2);
  c.fillStyle='#5c1414';c.fillRect(0,7,16,1);c.fillRect(7,0,1,16);
  c.fillStyle='#a23a3a';c.fillRect(2,2,3,1);c.fillRect(11,10,3,1);});
tile('hotdoor',(c,R)=>{fillN(c,R,'#4e3016',.05);
  c.fillStyle='#3a2210';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#63421f';c.fillRect(2,2,12,12);
  c.fillStyle='#4e3016';c.fillRect(2,7,12,1);c.fillRect(7,2,1,12);
  c.fillStyle='#c9a23a';c.fillRect(12,8,2,2);          /* the knob */
  c.fillStyle='#e8e0c8';c.fillRect(4,3,2,3);           /* the room number plate */
  c.fillStyle='#3a2210';c.fillRect(5,4,1,1);});
tile('metwall',(c,R)=>{fillN(c,R,'#5c6167',.05);
  c.fillStyle='#454a50';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);
  c.fillStyle='#6e747c';c.fillRect(0,7,16,1);
  c.fillStyle='#3a3e44';c.fillRect(3,2,2,2);c.fillRect(11,2,2,2);c.fillRect(3,11,2,2);c.fillRect(11,11,2,2);
  c.fillStyle='#787e86';c.fillRect(1,1,14,1);});
tile('ptile',(c,R)=>{fillF(c,'#e8ecf0');
  c.fillStyle='#c4ccd4';c.fillRect(0,0,16,1);c.fillRect(0,8,16,1);c.fillRect(0,0,1,16);c.fillRect(8,0,1,16);c.fillRect(0,15,16,1);c.fillRect(15,0,1,16);
  c.fillStyle='#d4dce2';c.fillRect(1,1,6,6);c.fillRect(9,9,6,6);});
tile('offwall',(c,R)=>{fillF(c,'#d8d5cc');
  c.fillStyle='#c2bfb4';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);
  c.fillStyle='#cac7bc';c.fillRect(0,5,16,1);
  c.fillStyle='#b0ada2';px(c,3,9,'#b0ada2');px(c,12,3,'#b0ada2');});
tile('brpipe',(c,R)=>{fillN(c,R,'#3a3e44',.06);
  c.fillStyle='#54585c';c.fillRect(2,0,12,16);
  c.fillStyle='#6e747c';c.fillRect(3,0,3,16);
  c.fillStyle='#2a2d31';c.fillRect(2,4,12,2);c.fillRect(2,11,12,2);
  c.fillStyle='#8a5f2a';c.fillRect(2,7,12,1);});
tile('wheatb',(c,R)=>{c.clearRect(0,0,16,16);
  c.fillStyle='#c8a832';
  for(const x of [3,7,11]){c.fillRect(x,4,1,12);}
  c.fillStyle='#e0c050';
  c.fillRect(2,2,3,3);c.fillRect(6,1,3,3);c.fillRect(10,2,3,3);
  c.fillRect(2,6,3,2);c.fillRect(11,6,3,2);
  c.fillStyle='#8a7020';c.fillRect(3,13,1,3);c.fillRect(11,13,1,3);});
tile('concrete',(c,R)=>{fillN(c,R,'#8a8a88',.05);
  c.fillStyle='#7a7a78';c.fillRect(0,7,16,1);
  c.fillStyle='#93938f';c.fillRect(0,0,16,1);
  c.fillStyle='#7f7f7d';c.fillRect(5,8,1,8);c.fillRect(11,0,1,7);
  c.fillStyle='#95958f';c.fillRect(2,2,3,1);});
tile('grnscr',(c,R)=>{fillF(c,'#0a1f0a');
  c.fillStyle='#1a4a1a';c.fillRect(0,0,16,16);
  c.fillStyle='#2a7a2a';
  for(let i=0;i<10;i++)c.fillRect((R()*15)|0,(R()*15)|0,1,2+(R()*3|0));
  c.fillStyle='#48c848';
  c.fillRect(3,1,1,4);c.fillRect(9,5,1,6);c.fillRect(13,2,1,3);c.fillRect(5,10,1,5);
  c.fillStyle='#8af08a';px(c,3,1,'#8af08a');px(c,9,5,'#8af08a');px(c,13,2,'#8af08a');});
tile('crate_t',(c,R)=>{fillN(c,R,'#8a6a3a',.07);
  c.fillStyle='#6e542c';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);c.fillRect(0,0,2,16);c.fillRect(14,0,2,16);
  c.fillStyle='#9a7d42';c.fillRect(3,3,10,10);
  c.fillStyle='#6e542c';c.fillRect(7,3,2,10);c.fillRect(3,7,10,2);});
tile('crate_s',(c,R)=>{fillN(c,R,'#8a6a3a',.07);
  c.fillStyle='#6e542c';c.fillRect(0,0,16,2);c.fillRect(0,14,16,2);c.fillRect(0,0,2,16);c.fillRect(14,0,2,16);
  c.fillStyle='#9a7d42';c.fillRect(2,2,12,12);
  c.fillStyle='#5c4520';c.fillRect(2,2,12,3);
  c.fillStyle='#e0d8b8';c.fillRect(5,7,6,4);          /* the stencilled panel */
  c.fillStyle='#5c4520';c.fillRect(6,8,2,1);c.fillRect(9,9,1,1);});
tile('skylight',(c,R)=>{fillF(c,'#f4f9ff');
  c.fillStyle='#dce8f4';c.fillRect(0,0,16,1);c.fillRect(0,15,16,1);c.fillRect(0,0,1,16);c.fillRect(15,0,1,16);
  c.fillStyle='#ffffff';c.fillRect(2,2,12,12);
  c.fillStyle='#dce8f4';c.fillRect(7,2,1,12);c.fillRect(2,7,12,1);});
