import {initial,transition} from './wind-state.mjs?v=wind15';
const panel=document.querySelector('.wind-tunnel');
if(panel){
 const field=panel.querySelector('.wind-field'),btn=panel.querySelector('#wind-hold'),label=panel.querySelector('#wind-status');
 const media={in:panel.querySelector('#wind-in'),loop:panel.querySelector('#wind-loop'),out:panel.querySelector('#wind-out')};
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const portrait=matchMedia('(max-width:700px) and (orientation:portrait)');
 const portraitCanvas=panel.querySelector('.wind-portrait-film');
 const brush=portraitCanvas?.getContext('2d',{alpha:false});
 let paintId=0,paintVideo=null,paintAt=-1;
 function clearPortrait(){
   if(paintId)cancelAnimationFrame(paintId);
   paintId=0;paintVideo=null;paintAt=-1;
   delete portraitCanvas.dataset.painted;
 }
 function paintPortrait(){
   paintId=0;
   const v=displayed;
   if(!portrait.matches||!brush||!v||document.hidden){clearPortrait();return}
   if(v.readyState>=2&&(v!==paintVideo||v.currentTime!==paintAt)){
    try {
     brush.drawImage(v,0,0,portraitCanvas.width,portraitCanvas.height);
     paintVideo=v;paintAt=v.currentTime;portraitCanvas.dataset.painted='true';
    } catch {/* Physical video element remains as fallback. */}
   }
   if(!v.paused||v.readyState<2)paintId=requestAnimationFrame(paintPortrait);
 }
 function schedulePortrait(){
   if(!portrait.matches||!brush){clearPortrait();return}
   if(!paintId)paintId=requestAnimationFrame(paintPortrait);
 }
 portrait.addEventListener?.('change',()=>{clearPortrait();if(displayed)schedulePortrait()});

 let state=initial,timer=0,displayed=null,lingerTimer=0,pointer=null,dwell=0,keyboard=null,previousButtonInput=-Infinity,liveStatus='';
 const asset=n=>'./media/'+n+'?v=wind15';
 const cue=Number(panel.dataset.cue)||.72;
 const fallback=(epoch)=>dispatch({type:'failure',epoch});
 const visible=()=>state.visible&&!document.hidden;
 const current=epoch=>visible()&&state.epoch===epoch;
 const finish=epoch=>dispatch({type:'done',epoch});
 function preload(key){
   const v=media[key];if(v.dataset.attached)return v;
   v.dataset.attached='true';v.preload='auto';v.src=asset('wind-'+key+'.mp4');return v;
 }
 function describe(){
   const english=document.documentElement.lang==='en';
   const next=state.error?(english?'Video unavailable; still mode':'Видео не загрузилось. Неподвижный режим.'):state.phase==='release'?(english?'Vortex released':'Вихрь отпущен'):'';
   if(next!==liveStatus){liveStatus=next;label.textContent=next}
 }
 function show(v){
   if(v===displayed&&v){schedulePortrait();return}
   clearTimeout(lingerTimer);
   const old=displayed;displayed=v;
   if(v)schedulePortrait();else clearPortrait();
   for(const t of Object.values(media)){
    delete t.dataset.linger;
    if(t===v){t.dataset.show='true'}
    else{delete t.dataset.show;t.pause()}
   }
   if(old&&v&&old!==v){
     old.dataset.linger='true';
     lingerTimer=setTimeout(()=>{delete old.dataset.linger},135);
   }
 }
 function stopSources(){show(null)}
 function awaitEvent(v,name,epoch,ms=2000){
  return new Promise(resolve=>{
   let h=0;const end=(ok)=>{clearTimeout(h);v.removeEventListener(name,success);v.removeEventListener('error',fail);resolve(ok&&current(epoch))};
   const success=()=>end(true),fail=()=>end(false);v.addEventListener(name,success,{once:true});v.addEventListener('error',fail,{once:true});h=setTimeout(fail,ms);
  });
 }
 async function play(name,at,epoch,{loop=false,stopAt=null}={}){
   const v=preload(name);
   if(v.readyState<2&&!await awaitEvent(v,'loadeddata',epoch))return current(epoch)&&fallback(epoch);
   if(!current(epoch))return;
   v.loop=loop;v.playbackRate=name==='out'?1.36:name==='in'?(stopAt===null?1.65:1.10):1;
   if(Math.abs(v.currentTime-at)>.035){v.currentTime=at;if(!await awaitEvent(v,'seeked',epoch))return current(epoch)&&fallback(epoch)}
   if(!current(epoch))return;
   const guarded=await Promise.race([v.play().then(()=>true).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),1600))]);
   if(!current(epoch)){if(state.phase==='off'||state.phase.startsWith('still'))v.pause();return}
   if(!guarded)return fallback(epoch);
   const commit=()=>{if(current(epoch)){show(v);schedulePortrait()}};
   if(v.requestVideoFrameCallback){v.requestVideoFrameCallback(commit);setTimeout(commit,110)}else commit();
   const ended=()=>{
     if(!current(epoch)||loop)return;
     finish(epoch);
   };
   v.onended=ended;
   v.onerror=()=>current(epoch)&&fallback(epoch);
   const check=()=>{
     if(!current(epoch)||v.paused||stopAt===null)return;
     if(name==='in'&&v.currentTime>=.28&&!panel.dataset.windReflection)panel.dataset.windReflection='once';
     if(v.currentTime>=stopAt){v.pause();schedulePortrait();finish(epoch);return}
     if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(check);else requestAnimationFrame(check);
   };
   if(stopAt!==null){if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(check);else requestAnimationFrame(check);}
 }
 function render(prev,s){
   panel.dataset.wind=s.phase;btn.setAttribute('aria-pressed',String(s.held));describe();
   if(s.phase===prev.phase&&s.epoch===prev.epoch)return;
   clearTimeout(timer);const e=s.epoch;
   if(s.phase==='off'){stopSources();return}
   if(s.phase==='still'||s.phase==='still-max'){stopSources();return}
   if(s.phase==='arrive'){
     preload('in');
     timer=setTimeout(()=>current(e)&&finish(e),480);
   }else if(s.phase==='intro'){
     play('in',0,e,{stopAt:cue});
     preload('loop');preload('out');
   }else if(s.phase==='idle'){
     // A pinned authored still is available for first entry, repeat and errors.
     // After the reveal, keep its last decoded clip if it matches the cue.
     if(prev.phase!=='intro')stopSources();
   }else if(s.phase==='ramp'){
     const t=(prev.phase==='idle'||prev.phase==='intro')?cue:0;
     play('in',t,e);
   }else if(s.phase==='loop')play('loop',0,e,{loop:true});
   else if(s.phase==='release')play('out',0,e);
 }
 function dispatch(event){
   const old=state;state=transition(state,event);
   if(old!==state)render(old,state);
 }
 function clearPointer(){clearTimeout(dwell);dwell=0;pointer=null}
 function lift(){clearPointer();keyboard=null;dispatch({type:'lift'})}
 function grip(p){
   if(pointer!==p||document.hidden||!state.visible)return;
   p.gripped=true;
   // Touch keeps native vertical pan and pinch; a native gesture sends pointercancel.
   if(p.kind==='mouse')btn.setPointerCapture?.(p.id);
   dispatch({type:'press'});
 }
 const reduced=()=>motion.matches||navigator.connection?.saveData;
 dispatch({type:'mode',value:reduced()});
 motion.addEventListener?.('change',()=>{lift();dispatch({type:'mode',value:reduced()})});
 navigator.connection?.addEventListener?.('change',()=>{lift();dispatch({type:'mode',value:reduced()})});
 btn.addEventListener('pointerdown',e=>{
   if(pointer!==null||keyboard!==null||!e.isPrimary||e.button!==0)return;
   previousButtonInput=performance.now();
   const p=pointer={id:e.pointerId,kind:e.pointerType,x:e.clientX,y:e.clientY,gripped:false};
   if(p.kind==='touch')dwell=setTimeout(()=>grip(p),160);
   else grip(p);
 });
 document.addEventListener('pointermove',e=>{
   if(e.pointerId!==pointer?.id||pointer.gripped)return;
   if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>=9)clearPointer();
 },{passive:true});
 document.addEventListener('pointerdown',e=>{
   if(pointer?.kind==='touch'&&pointer.id!==e.pointerId)lift();
 },{passive:true});
 for(const n of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(n,e=>{if(e.pointerId===pointer?.id)lift()},{passive:true});
 btn.addEventListener('keydown',e=>{
   if(e.key!==' '&&e.key!=='Enter')return;e.preventDefault();
   if(e.repeat||pointer!==null||keyboard!==null)return;
   previousButtonInput=performance.now();keyboard=e.key;dispatch({type:'press'});
 });
 btn.addEventListener('keyup',e=>{if(e.key===keyboard){e.preventDefault();lift()}});
 btn.addEventListener('click',e=>{
   if(e.detail!==0||performance.now()-previousButtonInput<700)return;
   dispatch({type:state.held?'lift':'press'});
 });
 btn.addEventListener('contextmenu',e=>e.preventDefault());
 btn.addEventListener('blur',lift);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')lift()});
 window.addEventListener('blur',lift);
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){lift();dispatch({type:'leave'})}
   else if(field.getBoundingClientRect().top<innerHeight*.62&&field.getBoundingClientRect().bottom>innerHeight*.39)dispatch({type:'enter'});
 });
 const observer=new IntersectionObserver(([entry])=>{
   if(entry.isIntersecting&&entry.intersectionRatio>=.4&&!document.hidden)dispatch({type:'enter'});
   if(!entry.isIntersecting){lift();dispatch({type:'leave'})}
 },{threshold:[0,.4]});
 observer.observe(field);
 if('IntersectionObserver' in window){
  const warm=new IntersectionObserver(([e])=>{
    if(e.isIntersecting&&e.boundingClientRect.top<innerHeight+260&&!reduced()){
     preload('in');warm.disconnect();
    }
  },{rootMargin:'260px 0px'});
  warm.observe(field);
 }
 new MutationObserver(describe).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
}
