import {createVideoScrubber} from './scrub-video.js?v=kling2';
import {createFrameBankScrubber} from './scrub-bank.js?v=native10';
import {createAtlasScrubber} from './scrub-atlas.js?v=native10';
import {clamp,progressFor,yFor,stageFor,words,filmFPS,filmFrames,assembledAt,displayPhaseFor,mediaAtPhase} from './routing.js?v=r8hold19';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s)), root=document.documentElement;
const story=$('#story'),stage=$('#stage'),detail=$('#detail'),macroHeading=$('#detail-title'),video=$('#media'),projection=$('#projection'),scrub=$('#scrub');
const field=$('.field');
const ctx=projection.getContext('2d',{alpha:false}),portrait=matchMedia('(max-width:700px) and (orientation:portrait)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
let lang='ru',engine=null,generation=0,raf=0,resizeRaf=0,hidden=document.hidden,mode='static',reason='',displayP=1,latest=0,cached=null,frameData=null,cfgMobile=null,stored=null;
let errors=[],detailTrip=null,rectify=0,studioSource=-1;
let fetchCtl=null,blobSrc='',explicitMotion=false,recoverP=0,sourceKind='none';
try{lang=localStorage.getItem('r8-language')==='en'?'en':'ru'}catch{}
const stageLabels=$('#stage-label'),progress=$('#progress'),cue=$('#cue'),retry=$('#motion-retry'),ui={cssProgress:-1,stage:-1,percent:-1,range:-1,lang:'',ending:null,cue:''};
const FPS=filmFPS, inspect=new URLSearchParams(location.search).get('inspect')==='1';
function metrics(){const rect=story.getBoundingClientRect();return{top:rect.top+window.scrollY,height:rect.height,travel:Math.max(0,rect.height-stage.getBoundingClientRect().height),stageH:stage.getBoundingClientRect().height,detailTop:detail.getBoundingClientRect().top+window.scrollY,viewport:innerHeight,width:innerWidth}}
function y(){return window.scrollY||0}
function jumpY(top){window.scrollTo({top:Math.max(0,top),behavior:'instant'})}
function remember(p){stored=clamp(p);return stored}
function hs(){try{return history.state&&typeof history.state==='object'?history.state:{}}catch{return{}}}
function stateWrite(kind,values,hash){try{history[kind+'State']({...hs(),...values},'',hash||location.pathname+location.search)}catch{}}
function applyP(p,force=false){
 displayP=clamp(p);const strings=words[lang],idx=stageFor(displayP),percent=Math.round(100*displayP),range=Math.round(10000*displayP),end=(mode==='static'&&reason!=='reduced')||displayP>=assembledAt;
 const changed=force||ui.lang!==lang;if(force||ui.cssProgress!==displayP){root.style.setProperty('--progress',displayP*100+'%');ui.cssProgress=displayP;}
 if(changed||ui.ending!==end){root.dataset.end=String(end);ui.ending=end;}
 const pausedByPreference=reason==='reduced'||reason==='save-data';
 const label=mode==='loading'?strings.loading:mode==='static'?(pausedByPreference?strings.motionOff:strings.unavailable):end?strings.complete:strings.hint;
 if(cue.textContent!==label)cue.textContent=label;
 const showRetry=mode==='static',retryLabel=pausedByPreference?strings.enableMotion:strings.retryMotion;
 if(retry.hidden===showRetry)retry.hidden=!showRetry;if(retry.textContent!==retryLabel)retry.textContent=retryLabel;
 if(changed||ui.percent!==percent){progress.textContent=percent+'%';ui.percent=percent}
 if(changed||ui.stage!==idx){stageLabels.textContent=strings.stages[idx];ui.stage=idx}
 if(changed||ui.range!==range){if(document.activeElement!==scrub||!scrub.matches(':active'))scrub.value=String(range);scrub.setAttribute('aria-valuetext',percent+'%, '+strings.stages[idx]);ui.range=range}
 ui.lang=lang;
}
function language(next,persist=true){lang=next==='en'?'en':'ru';const t=words[lang];root.lang=lang;document.title='Audi R8 · '+t.title1+' '+t.title2;for(const n of $$('[data-i18n]'))n.textContent=t[n.dataset.i18n];for(const n of $$('[data-alt]'))n.alt=t[n.dataset.alt];for(const n of $$('[data-label]'))n.setAttribute('aria-label',t[n.dataset.label]);$('#lang-ru').setAttribute('aria-pressed',String(lang==='ru'));$('#lang-en').setAttribute('aria-pressed',String(lang==='en'));if(persist)try{localStorage.setItem('r8-language',lang)}catch{}applyP(displayP,true)}
function setMode(m,r){mode=m;reason=r;root.dataset.mode=m;root.dataset.reason=r;}
function detach(){
 generation++;engine?.destroy();engine=null;
 fetchCtl?.abort();fetchCtl=null;
 video.pause();if(video.hasAttribute('src')){video.removeAttribute('src');try{video.load()}catch{}}
 if(blobSrc){URL.revokeObjectURL(blobSrc);blobSrc=''}
 sourceKind='none';
}
function failed(why){
 const before=cached||metrics(),inDetail=y()>before.top+before.travel+8||(location.hash==='#detail'&&!root.hasAttribute('data-app')),offset=inDetail?Math.max(0,y()-before.detailTop):0;
 if(why!=='reduced'&&why!=='save-data')errors.push(why);recoverP=latest;detach();field.style.removeProperty('--seamless-field');root.dataset.frame='none';frameData=null;setMode('static',why);applyP(why==='reduced'?0:1,true);
 cached=metrics();if(inDetail){if(location.hash==='#detail')detail.scrollIntoView({block:'start',behavior:'instant'});else jumpY(cached.detailTop+offset)}else if(y()>cached.top)jumpY(cached.top);
}
function actualFrame(token,data){
 if(token!==generation||!ctx)return;
 const w=data.width||video.videoWidth,h=data.height||video.videoHeight;
 if(!w||!h||(!data.image&&video.readyState<2))return;
 if(projection.width!==w||projection.height!==h){projection.width=w;projection.height=h}
 try{
  if(data.image)ctx.drawImage(data.image,data.sx,data.sy,data.sw,data.sh,0,0,w,h);
  else ctx.drawImage(video,0,0,w,h);
 }catch{if(sourceKind==='frame-bank')startVideo('frame-bank-draw');else if(data.image)failed('atlas-draw');else startAtlas('video-draw');return}
 const studioKey=token+'-'+w+'-'+h;
 if(studioSource!==studioKey){
  studioSource=studioKey;
  // Avoid readback on the hot projection canvas. Sample only the source,
  // on a 3-pixel scratch surface, once for each mobile crop.
  if(cfgMobile)try{
   const palette=document.createElement('canvas');palette.width=3;palette.height=1;
   const sample=palette.getContext('2d',{willReadFrequently:true});
   const input=data.image||video,sx=data.sx||0,sy=data.sy||0,sw=data.sw||video.videoWidth,sh=data.sh||video.videoHeight;
   [.01,.5,.99].forEach((x,i)=>sample.drawImage(input,Math.floor(sx+sw*x),Math.floor(sy+sh*.012),1,1,i,0,1,1));
   const px=sample.getImageData(0,0,3,1).data,pick=i=>'rgb('+Array.from(px.slice(i*4,i*4+3)).join(',')+')';
   field.style.setProperty('--seamless-field','linear-gradient(105deg,'+pick(0)+' 0%, '+pick(1)+' 52%, '+pick(2)+' 100%)');
  }catch{}
 }
 frameData=data;setMode('interactive',sourceKind);root.dataset.frame='ready';
 applyP(displayPhaseFor(data.index,latest));
}
function bind(target){
 engine=target;engine.setVisible(!document.hidden);engine.seek(mediaAtPhase(latest));request();
}
function startAtlas(why){
 if(why)errors.push(why);
 detach();cfgMobile=portrait.matches;sourceKind='film-frames';const token=generation;
 setMode('loading','frames-loading');applyP(displayP,true);
 bind(createAtlasScrubber({base:'./media/kling-atlas-native/',mobile:cfgMobile,onFrame:d=>actualFrame(token,d),onFailure:r=>{if(token===generation)failed(r)}}));
}
function selectMedia(){
 if(!explicitMotion&&(motion.matches||navigator.connection?.saveData)){failed(motion.matches?'reduced':'save-data');return}
 if(!ctx){failed('canvas-unavailable');return}
 const before=cached||metrics(),inDetail=location.hash==='#detail'||(mode!=='static'&&y()>before.top+before.travel+8);
 const keep=(mode==='interactive'||mode==='loading')?latest:location.hash==='#finished'?assembledAt:recoverP;
 const needsPosition=mode==='static',atInitialLoad=reason==='';detach();cfgMobile=portrait.matches;const token=generation;
 sourceKind='frame-bank';setMode('loading','bank-loading');cached=metrics();latest=atInitialLoad&&!location.hash?progressFor(y(),cached.top,cached.travel):keep;
 root.dataset.frame=frameData?'ready':'none';applyP(frameData?displayP:latest,true);
 if(needsPosition){if(inDetail)detail.scrollIntoView({block:'start',behavior:'instant'});else if(!atInitialLoad||location.hash==='#finished')jumpY(yFor(keep,cached.top,cached.travel))}
 bind(createFrameBankScrubber({mobile:cfgMobile,onFrame:d=>actualFrame(token,d),onFailure:r=>{if(token===generation)startVideo(r)}}));
}
function startVideo(why){
 if(why)errors.push(why);
 detach();cfgMobile=portrait.matches;sourceKind='video';const token=generation;
 setMode('loading','video-loading');applyP(displayP,true);
 if(!video.canPlayType('video/mp4; codecs="avc1.64001F"')&&!video.canPlayType('video/mp4')){startAtlas('unsupported-codec');return}
 const path=cfgMobile?'./media/mobile.mp4?v=native10':'./media/desktop.mp4?v=native10';
 // The private host serves MP4 as HTTP 200 even for a Range request. Fetch
 // once and seek against local bytes rather than relying on network ranges.
 const ctrl=fetchCtl=new AbortController();
 const timer=setTimeout(()=>ctrl.abort(),18000);
 fetch(path,{credentials:'same-origin',signal:ctrl.signal,redirect:'error'})
  .then(async res=>{
   if(!res.ok||!/^video\/mp4(?:$|;)/i.test(res.headers.get('content-type')||''))throw Error('video-response');
   const b=await res.blob();if(b.size<4096||b.size>24_000_000)throw Error('video-size');
   return b;
  })
  .then(b=>{
   if(token!==generation)return;
   blobSrc=URL.createObjectURL(b);
   bind(createVideoScrubber(video,{src:blobSrc,fps:FPS,timeoutMs:4500,onFrame:d=>actualFrame(token,d),onFailure:r=>{if(token===generation)startAtlas(r)}}));
  })
  .catch(()=>{if(token===generation)startAtlas('video-download')})
  .finally(()=>{clearTimeout(timer);if(fetchCtl===ctrl)fetchCtl=null});
 request();
}
function update(){raf=0;if(hidden||rectify||!cached||mode==='static')return;
 const sy=y();if(sy>cached.top+cached.travel+cached.stageH*.2){if(!detailTrip){detailTrip='natural';remember(1)}}
 else if(sy<cached.top+cached.travel-3&&detailTrip){detailTrip=null;stored=null}
 latest=progressFor(sy,cached.top,cached.travel);engine?.seek(mediaAtPhase(latest));if(frameData?.index===filmFrames-1)applyP(displayPhaseFor(frameData.index,latest));else if(!frameData&&latest===0)applyP(0)}
function request(){if(!raf&&!hidden)raf=requestAnimationFrame(update)}
function jump(p,focus=false){cached=metrics();latest=(mode==='static')?1:clamp(p);jumpY(mode==='static'?cached.top:yFor(latest,cached.top,cached.travel));engine?.seek(mediaAtPhase(latest));if(focus)stage.focus({preventScroll:true});request()}
function goDetail(save=true){const current=mode==='static'?1:progressFor(y(),cached.top,cached.travel);if(save){detailTrip='link';remember(current);stateWrite('replace',{r8Position:current,r8Detail:false},location.pathname+location.search);stateWrite('push',{r8Position:current,r8Detail:true},'#detail')}detail.scrollIntoView({block:'start',behavior:'instant'});macroHeading.focus({preventScroll:true});request()}
function goBack(){const p=stored??(location.hash==='#detail'&&Number.isFinite(hs().r8Position)?hs().r8Position:1);detailTrip=null;stored=null;stateWrite('replace',{r8Position:p,r8Detail:false},'#assembly');jump(p,true)}
const ordinary=e=>e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey;
for(const a of $$('[data-view-detail]'))a.addEventListener('click',e=>{if(!ordinary(e))return;e.preventDefault();if(location.hash==='#detail'&&detail.getBoundingClientRect().top<innerHeight*.5){macroHeading.focus({preventScroll:true});return}goDetail(true)});
for(const a of $$('[data-return]'))a.addEventListener('click',e=>{if(!ordinary(e))return;e.preventDefault();if(a.classList.contains('model')&&location.hash!=='#detail'&&y()<cached.top+cached.travel){stateWrite('replace',{r8Position:0,r8Detail:false},'#assembly');jump(0,true)}else goBack()});
$('#finish').addEventListener('click',e=>{if(!ordinary(e))return;e.preventDefault();remember(assembledAt);stateWrite('replace',{r8Position:assembledAt,r8Detail:false},'#finished');jump(assembledAt,true)});
scrub.addEventListener('input',()=>{if(mode!=='static')jump(Number(scrub.value)/10000)});
scrub.addEventListener('keydown',e=>{const step={ArrowLeft:-.0025,ArrowRight:.0025,ArrowUp:.0025,ArrowDown:-.0025,PageUp:-.05,PageDown:.05}[e.key];if(step===undefined&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();jump(e.key==='Home'?0:e.key==='End'?1:latest+step*(e.shiftKey?4:1));});
retry.addEventListener('click',()=>{explicitMotion=true;selectMedia();stage.focus({preventScroll:true})});
$('#lang-ru').addEventListener('click',()=>language('ru'));$('#lang-en').addEventListener('click',()=>language('en'));
function resize(){
 if(resizeRaf)return;const old=cached||metrics(),oldY=y(),inDetail=oldY>old.top+old.travel+old.stageH*.15;
 const preserve=latest,rel=oldY-old.detailTop;
 resizeRaf=requestAnimationFrame(()=>{resizeRaf=0;const n=metrics();if(n.width===old.width&&Math.abs(n.travel-old.travel)<.5&&n.stageH===old.stageH){cached=n;return}
  cached=n;if(mode==='static')return;rectify=1;const switchSrc=cfgMobile!==portrait.matches;if(switchSrc){if(sourceKind==='film-frames')startAtlas();else selectMedia()}latest=preserve;if(inDetail)jumpY(n.detailTop+rel);else jumpY(yFor(preserve,n.top,n.travel));engine?.seek(mediaAtPhase(preserve));rectify=0;request();
 });
}
window.addEventListener('scroll',request,{passive:true});window.addEventListener('resize',resize,{passive:true});
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(hidden&&raf){cancelAnimationFrame(raf);raf=0}engine?.setVisible(!hidden);if(!hidden){cached=metrics();request()}});
window.addEventListener('pageshow',e=>{cached=metrics();if(e.persisted){request();return}if(location.hash==='#detail'){detailTrip='link';stored=Number.isFinite(hs().r8Position)?hs().r8Position:1;detail.scrollIntoView({block:'start',behavior:'instant'})}else if(location.hash==='#finished')jump(assembledAt);request()});
window.addEventListener('popstate',e=>{const s=e.state||{};if(location.hash==='#detail'){detailTrip='link';remember(Number.isFinite(s.r8Position)?s.r8Position:1);detail.scrollIntoView({block:'start',behavior:'instant'});macroHeading.focus({preventScroll:true});return}requestAnimationFrame(()=>{if(Number.isFinite(s.r8Position))jump(s.r8Position,true);else request()})});
motion.addEventListener('change',()=>{explicitMotion=false;selectMedia()});navigator.connection?.addEventListener?.('change',()=>{explicitMotion=false;selectMedia()});
if(inspect)window.r8Review=Object.freeze({read(){const s=engine?.read();return{p:latest,displayP,mode,reason,lang,targetIndex:s?.targetIndex??-1,shownIndex:s?.displayedIndex??-1,frameMethod:frameData?.method||null,mediaTime:frameData?.mediaTime??null,duration:sourceKind==='film-frames'||sourceKind==='frame-bank'?filmFrames/FPS:Number.isFinite(video.duration)?video.duration:null,fps:FPS,source:sourceKind,count:s?.count??0,inFlight:s?.inFlight??null,samples:s?.samples||[],bankSheets:s?.bankSheets??0,sharpSheets:s?.sharpSheets??0,quality:s?.quality||null,sourceWidth:frameData?.sourceWidth??null,errors:[...errors],returnP:stored,travel:cached?.travel??0,paused:video.paused}}});
root.dataset.app='true';let qLang=new URLSearchParams(location.search).get('lang');language(qLang==='en'||qLang==='ru'?qLang:lang,false);cached=metrics();selectMedia();
if(location.hash==='#detail'){detailTrip='link';stored=Number.isFinite(hs().r8Position)?hs().r8Position:1;requestAnimationFrame(()=>detail.scrollIntoView({block:'start',behavior:'instant'}));}else if(location.hash==='#finished'){requestAnimationFrame(()=>jump(assembledAt))}
