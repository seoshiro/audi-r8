// Low-bandwidth rescue for browsers that cannot decode/seek the local H.264.
// Tiles are sequential samples of the *same* 288-frame film, not a second animation.
// See tools/build-atlas.py. No clock, interpolation, crossfade or synthetic frames.
const W=1024,H=576,COLS=3,ROWS=2,PER=COLS*ROWS,COUNT=288,FPS=24,SHEETS=COUNT/PER;
const bounded=p=>Math.max(0,Math.min(1,Number.isFinite(p)?p:0));
const close=image=>{try{image?.close?.()}catch{}};
async function fromBlob(blob,signal){
 let image;
 if(typeof createImageBitmap==='function'){
  try{image=await createImageBitmap(blob)}catch{}
 }
 if(!image&&!signal.aborted){
  const url=URL.createObjectURL(blob);
  try{
   image=new Image();image.decoding='async';
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('decode'));image.src=url;});
  }finally{URL.revokeObjectURL(url)}
 }
 if(signal.aborted){close(image);throw Error('cancelled')}
 if(!image||image.width!==W*COLS||image.height!==H*ROWS){close(image);throw Error('dimensions')}
 return image;
}
/**
 * seek() takes normalized **media** phase (the same mediaAtPhase() output used for MP4).
 * onFrame receives a decoded sheet and the exact crop: drawImage(image,sx,sy,sw,sh,0,0,width,height).
 * The optional base is a folder URL, resolved relative to the module, not the document hash.
 * Paint synchronously in onFrame; do not retain sheet ownership. read() has no side effects.
 */
export function createAtlasScrubber({mobile=false,base='./media/kling-atlas/',onFrame=()=>{},onFailure=()=>{},timeoutMs=7500}={}){
 const folder=new URL(base,import.meta.url);if(!folder.pathname.endsWith('/'))folder.pathname+='/';
 const cap=mobile?2:3,cache=new Map(),pending=new Map(),samples=[];
 let dead=false,failure=null,visible=true,queued=false,p=0,target=0,displayed=-1,dir=1,at=performance.now(),timer=0;
 const sheetFor=i=>Math.floor(i/PER),name=n=>'sheet-'+String(n).padStart(2,'0')+'.webp';
 function forget(n){const im=cache.get(n);cache.delete(n);close(im)}
 function stop(j){if(pending.get(j.n)===j)pending.delete(j.n);clearTimeout(j.timeout);j.controller.abort()}
 function schedule(){if(queued||dead||failure||!visible)return;queued=true;queueMicrotask(()=>{queued=false;pump()})}
 function cancelAll(){for(const j of [...pending.values()])stop(j);clearTimeout(timer);timer=0}
 function fail(why){if(dead||failure)return;failure=why;cancelAll();onFailure(why)}
 function finishLoad(j,image,error){
  if(pending.get(j.n)!==j||dead||failure){close(image);return}
  pending.delete(j.n);clearTimeout(j.timeout);
  if(!image){
   if(visible&&sheetFor(target)===j.n){
    if(j.attempt<2){load(j.n,false,j.attempt+1);return}
    fail('atlas-'+(error==='timeout'?'timeout':'unavailable'));return;
   }
  }else{
   cache.set(j.n,image);
   while(cache.size>cap){
    const wanted=sheetFor(target);
    const old=[...cache.keys()].find(k=>k!==wanted&&k!==j.n)??cache.keys().next().value;
    forget(old);
   }
  }
  schedule();
 }
 function load(n,warm=false,attempt=1){
  if(!visible||dead||failure||n<0||n>=SHEETS||cache.has(n)||pending.has(n))return;
  if(pending.size>=2){
   if(warm)return;
   const expendable=[...pending.values()].sort((a,b)=>Number(b.warm)-Number(a.warm)||Math.abs(b.n-n)-Math.abs(a.n-n))[0];
   if(expendable)stop(expendable);
  }
  const j={n,warm,attempt,controller:new AbortController(),timeout:0};pending.set(n,j);
  j.timeout=setTimeout(()=>{j.controller.abort();finishLoad(j,null,'timeout')},timeoutMs);
  (async()=>{
   const response=await fetch(new URL(name(n),folder),{signal:j.controller.signal,credentials:'same-origin'});
   if(!response.ok)throw Error('http');
   return fromBlob(await response.blob(),j.controller.signal);
  })().then(image=>finishLoad(j,image),()=>finishLoad(j,null,'load'));
 }
 function warmNext(){
  if(timer||dead||failure||!visible)return;
  timer=setTimeout(()=>{timer=0;if(!dead&&!failure&&visible&&displayed===target)load(sheetFor(target)+dir,true)},70);
 }
 function pump(){
  if(dead||failure||!visible)return;
  const n=sheetFor(target);
  if(!cache.has(n)){const j=pending.get(n);if(j)j.warm=false;else load(n);return}
  if(displayed===target)return;
  const image=cache.get(n);cache.delete(n);cache.set(n,image);
  const cell=target%PER,ox=cell%COLS*W,oy=Math.floor(cell/COLS)*H;
  const sx=ox+(mobile?194*W/1280:0),sw=mobile?1084*W/1280:W;
  const now=performance.now(),latencyMs=Math.max(0,now-at);
  displayed=target;samples.push({index:displayed,latencyMs,method:'webp-atlas'});if(samples.length>120)samples.shift();
  try{onFrame({index:displayed,targetIndex:target,image,sx,sy:oy,sw,sh:H,width:mobile?900:W,height:mobile?598:H,mediaTime:displayed/FPS,at:now,latencyMs,p,method:'webp-atlas'})}
  catch{fail('atlas-paint');return}
  warmNext();
 }
 schedule();
 return {
  seek(value){if(dead||failure)return;p=bounded(value);const next=Math.round(p*(COUNT-1));if(next!==target){dir=Math.sign(next-target);target=next;at=performance.now()}schedule()},
  setVisible(flag){visible=!!flag;if(!visible)cancelAll();else schedule()},
  destroy(){if(dead)return;dead=true;cancelAll();for(const key of [...cache.keys()])forget(key)},
  read(){return {fps:FPS,count:COUNT,duration:COUNT/FPS,p,targetIndex:target,displayedIndex:displayed,inFlight:pending.has(sheetFor(target))?target:null,visible,failure,source:'kling-atlas',cachedSheets:cache.size,pendingSheets:pending.size,samples:samples.slice()}}
 };
}
