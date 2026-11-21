(() => {
  const root=document.documentElement, key='r8-drive-seen-v2';
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let seen=false;
  try {seen=sessionStorage.getItem(key)==='1'} catch {}
  if(seen||location.hash||scrollY>0||motion.matches||navigator.connection?.saveData||
     performance.getEntriesByType('navigation')[0]?.type==='back_forward') return;

  root.dataset.drive='waiting';
  let deck, film, end, endReady=false, startup, limit;
  const current=()=>root.dataset.drive;
  const active=()=>current()==='waiting'||current()==='moving';
  const remember=()=>{try {sessionStorage.setItem(key,'1')}catch{}};
  const clear=()=>{clearTimeout(startup);clearTimeout(limit)};
  function dispose(){
    clear();
    root.dataset.drive='done';
    window.removeEventListener('scroll',scroll);
    window.removeEventListener('keydown',escape,true);
    if(film?.hasAttribute('src')){
      film.pause();
      film.removeAttribute('src');film.load();
    }
  }
  function park(natural=false){
    if(!active())return;
    clear();remember();
    root.dataset.drive='settled';
    if(natural)root.dataset.heroReflection='once';
    if(film&&!film.ended&&!film.paused)film.pause();
  }
  function abortIntro(){
    if(current()==='done')return;
    remember();
    if(active()&&endReady){
      park();
      root.dataset.drive='passing';
      // Give the exact composed endpoint one real paint on a fast skip, then
      // reveal the native scroll position. No delta replay or scroll reset.
      requestAnimationFrame(()=>requestAnimationFrame(dispose));
    }else if(current()!=='passing')dispose();
  }
  function scroll(){if(scrollY>3)abortIntro()}
  function escape(e){if(e.key==='Escape')abortIntro()}
  window.addEventListener('scroll',scroll,{passive:true});
  window.addEventListener('pageshow',e=>{if(e.persisted)abortIntro()});
  window.addEventListener('hashchange',()=>{if(location.hash)abortIntro()});
  window.addEventListener('keydown',escape,true);
  motion.addEventListener?.('change',abortIntro);
  document.addEventListener('r8-drive-mounted',()=>{
    if(!active())return;
    deck=document.querySelector('.drive');
    film=deck.querySelector('video');end=deck.querySelector('.drive-end');
    document.addEventListener('focusin',()=>{if(active())abortIntro()});
    end.addEventListener('load',()=>{endReady=true;end.dataset.ready='true'},{once:true});
    film.addEventListener('playing',()=>{
      if(!active())return;
      clearTimeout(startup);
      film.dataset.painted='true';
      root.dataset.drive='moving';
    });
    film.addEventListener('ended',()=>park(true));
    film.addEventListener('error',()=>park());
    scroll();
    if(!active())return;
    startup=setTimeout(park,2300);
    limit=setTimeout(park,8500);
    // Let the assembly start its independent frame load; the intro never
    // blocks wheel, touch, keyboard, or direct links to the detail.
    document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>{
      if(!active())return;
      end.src=end.dataset.file;
      film.src=film.dataset.file;
      film.play().catch(()=>park());
    }),{once:true});
  },{once:true});
})();
