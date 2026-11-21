// Native document scroll is authoritative. No synthetic momentum or autoplay.
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
export const progressFor=(y,top,travel)=>travel>0?clamp((y-top)/travel):1;
export const frameFor=(p,n)=>Math.round(clamp(p)*Math.max(0,n-1));
export const yFor=(p,top,travel)=>top+clamp(p)*Math.max(0,travel);
// Keep the finished R8 pinned for the last 9% of the assembly track.
export const assembledAt = .91;
export const anchorStages=Object.freeze([0,.20,.33,.45,.61,.80,.94].map(p=>p*assembledAt));
// Phase knots are synchronized with real Kling edit boundaries. All 72
// middle samples remain independently seekable, forward and backward.
export const filmFPS=24;
export const filmFrames=288;
export const filmPhases=Object.freeze([[0,0],[.20,24],[.33,58],[.42,100],[.45,120],[.61,192],[1,287]].map(([p,f])=>Object.freeze([p*assembledAt,f])));
function mapBetween(value,from,to){
 const v=clamp(value,0,filmPhases.at(-1)[from]);
 for(let i=1;i<filmPhases.length;i++){
  const a=filmPhases[i-1],b=filmPhases[i];
  if(v<=b[from])return a[to]+(b[to]-a[to])*(v-a[from])/(b[from]-a[from]);
 }
 return filmPhases.at(-1)[to];
}
export const frameAtPhase=p=>Math.round(mapBetween(p,0,1));
export const phaseAtFrame=f=>mapBetween(f,1,0);
export const mediaAtPhase=p=>mapBetween(p,0,1)/(filmFrames-1);
export const displayPhaseFor=(frame,scrollPhase)=>frame===filmFrames-1
 ? Math.max(assembledAt,clamp(scrollPhase))
 : phaseAtFrame(frame);

// Optional frame quantization lets captions use the same discrete timeline as playback.
export function stageFor(p,frameCount=0){const actual=frameCount>1?frameFor(p,frameCount):p;let i=0;while(i<anchorStages.length-1&&actual>=(frameCount>1?frameFor(anchorStages[i+1],frameCount):anchorStages[i+1]))i++;return i}
export const words={
 ru:{windHold:'Удерживай R8',loading:'Загружаю ролик. Можно уже прокручивать.',motionOff:'Анимация отключена настройками браузера.',unavailable:'Не удалось загрузить анимацию.',enableMotion:'Включить анимацию',retryMotion:'Загрузить ещё раз',title1:'Четыре кольца.',title2:'Одна форма.',hint:'Прокрути, чтобы собрать',complete:'Сборка завершена',finish:'К готовой машине',details:'К аэротрубе',back:'Вернуться к сборке',detailTitle:'Аэротруба',independent:'Независимый дизайн-концепт',car:'Купе',range:'Положение сборки',scene:'Сборка графитового Audi R8',finalAlt:'Графитовый Audi R8 в тёплой светлой студии, вид спереди в три четверти',detailAlt:'Графитовый Audi R8 в аэротрубе',stages:['Жидкий металл','Рука','Четыре кольца','Магнитное поле','Шасси','Панели','Купе']},
 en:{windHold:'Hold the R8',loading:'Loading the film. You can start scrolling.',motionOff:'Motion is off in your browser settings.',unavailable:'The animation could not load.',enableMotion:'Enable animation',retryMotion:'Load again',title1:'Four rings.',title2:'One form.',hint:'Scroll to assemble',complete:'Assembly complete',finish:'Show the finished car',details:'To the wind tunnel',back:'Back to assembly',detailTitle:'Wind tunnel',independent:'Independent design concept',car:'Coupé',range:'Assembly position',scene:'Assembly of the graphite Audi R8',finalAlt:'Graphite Audi R8 in a warm ivory studio, front three-quarter view',detailAlt:'Graphite Audi R8 in a wind tunnel',stages:['Liquid metal','The hand','Four rings','Magnetic field','Chassis','Panels','Coupé']}
};
