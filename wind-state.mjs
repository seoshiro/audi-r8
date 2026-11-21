export const initial=Object.freeze({phase:'off',visible:false,held:false,seen:false,reduced:false,error:false,epoch:0});
const advance=(s,phase,more={})=>({...s,...more,phase,epoch:s.epoch+1});
export function transition(s,event){
 switch(event.type){
 case 'mode': {
   const next={...s,reduced:!!event.value,held:false,error:false};
   if(!s.visible)return advance(next,'off');
   if(next.reduced)return advance(next,'still');
   return advance(next,s.seen?'idle':'arrive');
 }
 case 'enter':
   if(s.visible)return s;
   return advance({...s,visible:true},s.reduced?'still':s.seen?'idle':'arrive');
 case 'leave':
   if(!s.visible)return s;
   return advance(s,'off',{visible:false,held:false});
 case 'press':
   if(!s.visible||s.held)return s;
   if(s.phase==='idle')return advance(s,'ramp',{held:true});
   if(s.phase==='still')return advance(s,'still-max',{held:true});
   if(s.phase==='intro'||s.phase==='arrive'||s.phase==='release')return {...s,held:true};
   return s;
 case 'lift':
   if(!s.held)return s;
   if(s.phase==='loop')return advance(s,'release',{held:false});
   if(s.phase==='still-max')return advance(s,'still',{held:false});
   return {...s,held:false};
 case 'done':
   if(event.epoch!==s.epoch||!s.visible)return s;
   if(s.phase==='arrive')return advance(s,'intro');
   if(s.phase==='intro')return advance(s,s.held?'ramp':'idle',{seen:true});
   if(s.phase==='ramp')return advance(s,s.held?'loop':'release');
   if(s.phase==='release')return advance(s,s.held?'ramp':'idle');
   return s;
 case 'failure':
   if(event.epoch!==s.epoch)return s;
   return advance(s,'still',{held:false,seen:true,error:true});
 default: return s;
 }
}
