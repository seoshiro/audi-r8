// Paused frame decoder for a constant-frame-rate MP4. All UI is owned by the caller.
export function createVideoScrubber(video,{src,fps=30,onFrame=()=>{},onFailure=()=>{},timeoutMs=8000,frameWaitMs=90}={}){
 if(!Number.isFinite(fps)||fps<=0)throw new TypeError('Invalid CFR frame rate');
 let p=0,visible=true,count=0,decodedIndex=-1,displayed=-1,target=-1,requestedAt=performance.now(),job=null,dead=false,failure=null,watch=0,serial=0;
 const samples=[];
 const hasVFC=typeof video.requestVideoFrameCallback==='function';
 const indexAt=time=>Math.max(0,Math.min(count-1,Math.round(time*fps)));
 const timerOff=()=>{clearTimeout(watch);watch=0};
 function fail(reason){if(dead||failure)return;failure=reason;timerOff();resetJob();onFailure(reason);}
 function deadline(reason){timerOff();watch=setTimeout(()=>fail(reason),timeoutMs)}
 function resetJob(){
  if(!job)return;
  clearTimeout(job.fallback);
  if(job.callback!=null)video.cancelVideoFrameCallback?.(job.callback);
  job=null;
 }
 function present(token,mediaTime,method){
  if(job!==token||dead||failure)return;
  resetJob();timerOff();decodedIndex=token.index;
  // Outdated completions may advance the decoder but never reach the UI.
  if(visible&&target===token.index){
   displayed=token.index;
   const at=performance.now(),latencyMs=Math.max(0,at-requestedAt);
   samples.push({index:displayed,latencyMs,method});
   if(samples.length>120)samples.shift();
   onFrame({index:displayed,targetIndex:target,mediaTime,at,latencyMs,p,method});
  }
  pump();
 }
 function fallback(token){
  token.fallback=0;
  // The seeked event (or already loaded, non-seeking data at the exact index)
  // is the fallback only; it is deliberately not called rVFC in diagnostics.
  if(job===token&&!video.seeking&&video.readyState>=2&&indexAt(video.currentTime)===token.index)
   present(token,video.currentTime,'seeked-fallback');
 }
 function decoded(token,now,meta){
  if(job!==token||dead||failure)return;
  token.callback=null;
  const ts=meta?.mediaTime;
  if(Number.isFinite(ts)&&indexAt(ts)===token.index){
   // rVFC can run before seeked. Preserve the confirmation, but don't issue
   // the next native seek until the previous seek has actually settled.
   token.frame=ts;
   if(!video.seeking)present(token,ts,'rvfc');
  }else listenFrame(token);
 }
 function listenFrame(token){
  if(hasVFC&&job===token&&token.callback==null)token.callback=video.requestVideoFrameCallback((n,m)=>decoded(token,n,m));
 }
 function settled(){
  const token=job;
  if(!token||video.seeking||video.readyState<2||indexAt(video.currentTime)!==token.index)return;
  if(token.frame!=null)present(token,token.frame,'rvfc');
  else if(token.fallback===0)token.fallback=setTimeout(()=>fallback(token),hasVFC?frameWaitMs:0);
 }
 function pump(){
  if(dead||failure||!visible||!count||job||video.seeking||(target===displayed&&target===decodedIndex))return;
  const token={id:++serial,index:target,callback:null,fallback:0,frame:null};job=token;
  deadline('seek-timeout');
  listenFrame(token);
  const current=video.currentTime;
  if(video.readyState>=2&&indexAt(current)===target){settled();return;}
  // Seek just inside the frame's display interval, not on a sample boundary.
  const time=Math.min((target+.18)/fps,video.duration-1e-6);
  try{video.currentTime=Math.max(0,time)}catch{fail('seek-error');return}
  settled();
 }
 function metadata(){
  const d=video.duration;
  if(!Number.isFinite(d)||d<=0)return;
  const previous=count;
  count=Math.max(1,Math.round(d*fps));
  target=Math.round(p*(count-1));
  if(!previous)timerOff();
  pump();
 }
 function mediaFailure(){fail(video.error?.code?'media-error-'+video.error.code:'media-error')}
 const listeners={loadedmetadata:metadata,durationchange:metadata,loadeddata:()=>{metadata();settled()},canplay:settled,seeked:()=>{settled();pump()},error:mediaFailure,abort:()=>{if(video.error)mediaFailure()}};
 for(const [name,fn] of Object.entries(listeners))video.addEventListener(name,fn);
 video.pause();
 video.preload='auto';
 if(src&&video.getAttribute('src')!==src)video.src=src;
 deadline('metadata-timeout');metadata();
 return {
  seek(value){
   if(dead||failure)return;
   p=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
   const next=count?Math.round(p*(count-1)):-1;
   if(next!==target||!count)requestedAt=performance.now();
   target=next;pump();
  },
  setVisible(flag){
   if(dead||failure)return;
   visible=Boolean(flag);
   if(!visible){timerOff();return;}
   if(job){if(!watch)deadline('seek-timeout');if(!video.seeking)settled();}if(!count&&!watch)deadline('metadata-timeout');pump();
  },
  destroy(){
   if(dead)return;
   dead=true;timerOff();resetJob();
   for(const [name,fn] of Object.entries(listeners))video.removeEventListener(name,fn);
  },
  read(){return {fps,count,p,targetIndex:target,displayedIndex:displayed,inFlight:job?.index??null,visible,failure,samples:samples.slice()}}
 };
}
