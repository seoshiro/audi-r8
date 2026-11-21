// Random access to the exact 288 Higgsfield film frames. No clock that advances
// playback, hidden video seek, interpolated imagery, nor separately generated stills.
const COUNT=288,FPS=24;
const LOW={w:320,h:180,c:4,r:3,magic:0x52384c36,file:'instant-native.bin'};
const MOBILE={w:1088,h:614,c:3,r:2,magic:0x52384837,file:'motion-mobile-native.bin'};
const DESKTOP={w:1920,h:1080,c:2,r:1,magic:0x52384a38,jpeg:true};
const DESKTOP_PARTS=3;
for(const g of [LOW,MOBILE,DESKTOP]){g.per=g.c*g.r;g.count=COUNT/g.per;}
const MAX_PACK_BYTES=24*1024*1024;
const clamp=p=>Math.max(0,Math.min(1,Number.isFinite(p)?p:0));
const close=im=>{try{im?.close?.()}catch{}};
const imageDir=new URL('./media/kling-bank/',import.meta.url);

// Each size-bounded entry is a standalone JPEG or WebP atlas, in source timestamp order.
const validItem=(v,at,grid)=>grid.jpeg?v.getUint16(at)===0xffd8:
 v.getUint32(at)===0x52494646&&v.getUint32(at+8)===0x57454250;
export function unpackFrameBank(bytes,kind='instant'){
 const grid=kind==='desktop'?{...DESKTOP,count:DESKTOP.count/DESKTOP_PARTS}:kind==='motion'?MOBILE:LOW;
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<8+4*grid.count||bytes.byteLength>MAX_PACK_BYTES)throw Error('bank-size');
 const v=new DataView(bytes);
 if(v.getUint32(0)!==grid.magic||v.getUint32(4,true)!==grid.count)throw Error('bank-header');
 let at=8+4*grid.count;const out=[];
 for(let n=0;n<grid.count;n++){
  const length=v.getUint32(8+4*n,true);
  if(length<16||at+length>bytes.byteLength||!validItem(v,at,grid))throw Error('bank-item');
  out.push(new Uint8Array(bytes,at,length));at+=length;
 }
 if(at!==bytes.byteLength)throw Error('bank-trailing');
 return out;
}
async function decodeSheet(bytes,grid,signal){
 const blob=new Blob([bytes],{type:grid.jpeg?'image/jpeg':'image/webp'});
 let image;
 if(typeof createImageBitmap==='function'){
  try{image=await createImageBitmap(blob)}catch{}
 }
 if(!image&&!signal.aborted){
  const url=URL.createObjectURL(blob);
  try{image=new Image();image.decoding='async';image.src=url;await image.decode()}
  finally{URL.revokeObjectURL(url)}
 }
 if(signal.aborted||!image||image.width!==grid.w*grid.c||image.height!==grid.h*grid.r){close(image);throw Error('bank-decode')}
 return image;
}
async function getPack(kind,grid,signal,onEntry){
 const r=await fetch(new URL(grid.file,imageDir),{credentials:'same-origin',redirect:'error',signal,priority:kind==='instant'?'low':'auto'});
 if(!r.ok)throw Error('bank-http');
 // Ordered streaming exposes the first sharp sheets while the rest is still
 // downloading. The compact full timeline is fetched independently.
 if(!onEntry||!r.body?.getReader)return unpackFrameBank(await r.arrayBuffer(),kind);
 return streamFrameBank(r.body,kind,onEntry);
}
export async function streamFrameBank(stream,kind,onEntry){
 const grid=kind==='desktop'?{...DESKTOP,count:DESKTOP.count/DESKTOP_PARTS}:kind==='motion'?MOBILE:LOW;
 const reader=stream.getReader(),entries=new Array(grid.count);
 const headerBytes=8+4*grid.count;let sizes=null,pending=new Uint8Array(0),received=0,n=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   received+=value.byteLength;if(received>MAX_PACK_BYTES)throw Error('bank-size');
   let merged=new Uint8Array(pending.length+value.length);
   merged.set(pending);merged.set(value,pending.length);pending=merged;
   let at=0;
   if(!sizes&&pending.length>=headerBytes){
    const v=new DataView(pending.buffer,pending.byteOffset,headerBytes);
    if(v.getUint32(0)!==grid.magic||v.getUint32(4,true)!==grid.count)throw Error('bank-header');
    sizes=Array.from({length:grid.count},(_,i)=>v.getUint32(8+4*i,true));
    if(sizes.some(k=>k<16)||sizes.reduce((a,b)=>a+b,headerBytes)>MAX_PACK_BYTES)throw Error('bank-size');
    at=headerBytes;
   }
   if(sizes)while(n<grid.count&&pending.length-at>=sizes[n]){
    const size=sizes[n],v=new DataView(pending.buffer,pending.byteOffset+at,size);
    if(!validItem(v,0,grid))throw Error('bank-item');
    const entry=pending.slice(at,at+size);
    entries[n]=entry;onEntry(n,entry);n++;at+=size;
   }
   if(at)pending=pending.slice(at);
   if(n===grid.count&&pending.length)throw Error('bank-trailing');
  }
  if(n!==grid.count||pending.length)throw Error('bank-incomplete');
  return entries;
 }finally{reader.releaseLock()}
}
// Stage startup gets the first few Full HD sheets before the later acts
// compete for bandwidth. Failed later parts do not discard healthy frames.
async function getDesktopPack(signal,onEntry){
 const count=DESKTOP.count/DESKTOP_PARTS,entries=new Array(DESKTOP.count);
 let remaining;
 const load=part=>getPack('desktop',{file:part===2?'motion-fhd-native-2.bin':'motion-fhd-v8-'+part+'.bin'},signal,(n,entry)=>{
  entries[part*count+n]=entry;onEntry(part*count+n,entry);
  if(part===0&&n===4)startLater();
 }).then(data=>{data.forEach((entry,n)=>{entries[part*count+n]=entry});});
 function startLater(){remaining??=Promise.allSettled([load(1),load(2)]);return remaining;}
 const first=load(0).catch(()=>{});
 await first;await startLater();
 if(!entries.some(Boolean))throw Error('bank-http');
 return entries;
}
const lowPack=signal=>getPack('instant',LOW,signal);
const lowDecode=(bytes,signal)=>decodeSheet(bytes,LOW,signal);
/**
 * Main fidelity is the locally packed full timeline at 1920×1080 / 1088×614. Decompress a
 * direction-aware neighborhood with bounded residency. Desktop never loads the
 * low-resolution tier: keep the nearest ready sharp frame until the exact one arrives.
 */
export function createFrameBankScrubber({
 mobile=false,onFrame=()=>{},onFailure=()=>{},loadPack=lowPack,loadHighPack,loadLow=lowDecode,loadHigh,
 clock=()=>performance.now(),raf=requestAnimationFrame,cancelFrame=cancelAnimationFrame,
}={}){
 const startedAt=clock();
 let p=0,target=0,displayed=-1,quality='',dir=1,requestedAt=startedAt,alive=true,visible=true,failReason=null,queued=null,primed=false;
 const make=(grid,pack,load)=>({grid,pack,load,state:'pending',entries:null,cache:new Map(),work:new Set(),bad:new Set(),controller:new AbortController(),timer:0});
 const hiGrid=mobile?MOBILE:DESKTOP,hiKind=mobile?'motion':'desktop';
 const mobileBank=mobile;
 const low=make(LOW,loadPack,loadLow),sharp=make(hiGrid,loadHighPack||((signal,onEntry)=>(mobile?getPack(hiKind,hiGrid,signal,onEntry):getDesktopPack(signal,onEntry))),loadHigh||((bytes,signal)=>decodeSheet(bytes,hiGrid,signal)));
 if(!mobileBank)low.state='disabled';
 const allowLow=()=>mobileBank&&mobile;
 const samples=[];
 const highCap=()=>mobile?5:9;
 const sheetFor=(tier,i=target)=>Math.floor(i/tier.grid.per);
 const valid=(n,count)=>n>=0&&n<count;
 function priority(tier){
  const n=sheetFor(tier);
  return [n,n+dir,n-dir,n+2*dir,n-2*dir,n+3*dir,n-3*dir,n+4*dir,n+5*dir,n+6*dir].filter(k=>valid(k,tier.grid.count));
 }
 function report(value){if(samples.length>=360)samples.shift();samples.push(value)}
 function fail(why){if(!alive||failReason)return;failReason=why;destroy();onFailure(why)}
 function destroy(){
  if(!alive)return;alive=false;
  if(queued!==null)cancelFrame(queued);queued=null;
  for(const tier of [low,sharp]){
   clearTimeout(tier.timer);tier.controller.abort();
   for(const im of tier.cache.values())close(im);
   tier.cache.clear();tier.entries=null;
  }
 }
 function schedule(){
  if(!alive||!visible||queued!==null)return;
  queued=raf(()=>{queued=null;paint();pump()});
 }
 function trim(){
  const near=priority(sharp),wanted=sheetFor(sharp);
  const score=k=>near.includes(k)?near.indexOf(k):Math.abs(k-wanted)+10;
  while(sharp.cache.size>highCap()){
   const far=[...sharp.cache.keys()].sort((a,b)=>score(b)-score(a))[0];
   close(sharp.cache.get(far));sharp.cache.delete(far);
  }
 }
 function start(tier,n){
  tier.work.add(n);const entry=tier.entries[n];
  Promise.resolve().then(()=>tier.load(entry,tier.controller.signal)).then(image=>{
   if(!alive){close(image);return}
   tier.cache.set(n,image);if(tier===sharp)trim();
  },()=>{
   tier.bad.add(n);
   if(alive&&tier===low&&sharp.state==='failed'&&n===sheetFor(low))fail('frame-bank-decode');
  }).finally(()=>{tier.work.delete(n);schedule()});
 }
 function pump(){
  if(!alive||!visible)return;
  const hi=priority(sharp).slice(0,highCap());
  if(!primed&&!sharp.cache.size)hi.push(0,1);
  const fill=(tier,order,workers)=>{
   if(!tier.entries)return;
   for(const n of order){
    if(tier.work.size>=workers)break;
    if(tier.entries[n]!=null&&!tier.cache.has(n)&&!tier.work.has(n)&&!tier.bad.has(n))start(tier,n);
   }
  };
  fill(sharp,hi,mobile?2:4);
  if(allowLow()){
   const lo=[...new Set([...priority(low),...Array.from({length:LOW.count},(_,i)=>i)])];
   fill(low,lo,primed||!sharp.entries?2:1);
   // Keep the portrait instant tiles pinned, releasing their encoded copy.
   if(low.cache.size+low.bad.size===LOW.count)low.entries=null;
  }
  const n=sheetFor(sharp),unusable=tier=>tier.state==='failed'||tier.bad.has(sheetFor(tier));
  const sharpUnavailable=unusable(sharp)||(sharp.state==='ready'&&sharp.entries?.[n]==null);
  if(sharpUnavailable&&!sharp.cache.has(n)&&(!allowLow()||unusable(low)))fail('frame-bank-decode');
 }
 function nearestSharp(){
  const per=sharp.grid.per;
  let best=null,distance=Infinity;
  for(const [sheet,image] of sharp.cache){
   const first=sheet*per,last=first+per-1;
   // If the previously painted frame is still the closest, keep it rather
   // than redrawing. An opposite-direction decode must never pull it away.
   const index=Math.min(last,Math.max(first,target));
   const dist=Math.abs(index-target);
   if(dist<distance||(dist===distance&&index===displayed)){best={index,image};distance=dist;}
  }
  return best;
 }
 function paint(){
  if(!alive||!visible)return;
  const sharpSheet=sheetFor(sharp),sharpImg=sharp.cache.get(sharpSheet);
  const unavailable=sharp.state==='failed'||sharp.bad.has(sharpSheet)||(sharp.state==='ready'&&sharp.entries?.[sharpSheet]==null);
  const instantImg=allowLow()&&unavailable?low.cache.get(sheetFor(low)):null;
  const nearby=sharpImg?{index:target,image:sharpImg}:!instantImg?nearestSharp():null;
  if(!primed){
   primed=!!nearby&&(target!==0||!!sharpImg)||!!instantImg;
   if(!primed)return;
  }
  const image=nearby?.image||instantImg,grid=nearby?hiGrid:LOW,index=nearby?.index??target;
  if(!image)return;
  const q=nearby?'motion-'+hiGrid.w:'instant-320';
  if(displayed===index&&quality===q)return;
  if(index!==target&&displayed!==-1&&quality===q&&Math.abs(displayed-target)<=Math.abs(index-target))return;
  const cell=index%grid.per,ox=cell%grid.c*grid.w,oy=Math.floor(cell/grid.c)*grid.h;
  const sx=ox+(mobile?194*grid.w/1280:0),sw=mobile?1084*grid.w/1280:grid.w;
  const at=clock(),changed=displayed!==index,latencyMs=Math.max(0,at-requestedAt);
  displayed=index;quality=q;
  if(changed)report({index:displayed,latencyMs,method:'kling-frame-bank',quality:q,sourceWidth:grid.w});
  try{onFrame({index:displayed,targetIndex:target,image,sx,sy:oy,sw,sh:grid.h,width:mobile?922:1920,height:mobile?614:1080,mediaTime:displayed/FPS,at,latencyMs,p,method:'kling-frame-bank',quality:q,sourceWidth:grid.w})}
  catch{fail('frame-bank-paint')}
 }
 for(const tier of mobileBank?[sharp,low]:[sharp]){
  const reject=()=>{
   if(!alive||tier.state!=='pending')return;
   clearTimeout(tier.timer);tier.state='failed';tier.entries=null;tier.controller.abort();
   if(sharp.state==='failed'&&(!allowLow()||low.state==='failed'))fail('frame-bank-download');
   else schedule();
  };
  tier.timer=setTimeout(reject,15000);
  const entryProgress=tier===sharp?(n,entry)=>{
   if(!alive||tier.state!=='pending')return;
   if(!tier.entries)tier.entries=new Array(tier.grid.count);
   // Time out a stalled stream, not a large bank steadily arriving over Wi-Fi.
   clearTimeout(tier.timer);tier.timer=setTimeout(reject,15000);
   tier.entries[n]=entry;schedule();
  }:undefined;
  Promise.resolve().then(()=>tier.pack(tier.controller.signal,entryProgress)).then(entries=>{
   if(!alive||tier.state!=='pending')return;
   if(!Array.isArray(entries)||entries.length!==tier.grid.count){reject();return}
   clearTimeout(tier.timer);tier.state='ready';tier.entries=entries;schedule();
  },reject);
 }
 return {
  seek(value){
   if(!alive)return;
   p=clamp(value);const next=Math.round(p*(COUNT-1));
   if(next===target)return;
   dir=Math.sign(next-target);target=next;requestedAt=clock();
   paint();pump();schedule();
  },
  setVisible(flag){visible=!!flag;if(!visible){if(queued!==null)cancelFrame(queued);queued=null;}else schedule()},
  setMobile(flag){if(mobile===!!flag)return;mobile=!!flag;trim();quality='';schedule()},
  destroy,
  read(){return {fps:FPS,count:COUNT,duration:COUNT/FPS,p,targetIndex:target,displayedIndex:displayed,inFlight:displayed===target?null:target,visible,failure:failReason,source:'kling-frame-bank',bankSheets:low.cache.size,sharpSheets:sharp.cache.size,quality,samples:samples.slice()}}
 };
}
