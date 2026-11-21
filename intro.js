(() => {
  const root = document.documentElement;
  const key = 'r8-intro-seen-v1';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const nav = performance.getEntriesByType('navigation')[0]?.type;
  let seen = false;
  try { seen = sessionStorage.getItem(key) === '1'; } catch {}
  if (seen || location.hash || scrollY > 0 || nav === 'back_forward') return;
  let quick = false, ended = false, ready = false, mounted = false;
  let video, scene, button, timer, posterTimer, sceneWatch;
  const noVideo = motion.matches || navigator.connection?.saveData;
  const playBudget = noVideo ? 900 : 2900;
  const started = performance.now();
  root.dataset.intro = noVideo ? 'still' : 'lit';

  function remember() {
    try { sessionStorage.setItem(key, '1'); } catch {}
  }

  function finish(fast = false) {
    if (ended) return;
    ended = true;
    remember();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKey, true);
    clearTimeout(timer);
    clearTimeout(posterTimer);
    sceneWatch?.disconnect();
    if (video) video.pause();
    root.dataset.intro = noVideo ? 'gone' : fast ? 'skip' : 'reveal';
    if (button) button.tabIndex = -1;
    setTimeout(() => {
      root.dataset.intro = 'gone';
      if (scene) scene.hidden = true;
      if (video?.hasAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
    }, noVideo ? 0 : fast ? 180 : 605);
  }

  function onScroll() { if (scrollY > 3) finish(true); }
  function onKey(event) { if (event.key === 'Escape') finish(true); }
  function afterReady() {
    ready = true;
    if (quick || performance.now() - started >= playBudget || (video && video.ended)) finish();
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    scene = document.getElementById('opening');
    if (!scene) { finish(true); return; }
    video = scene.querySelector('video');
    button = scene.querySelector('button');
    const search = new URLSearchParams(location.search);
    let current = search.get('lang');
    if (current !== 'en' && current !== 'ru') try { current = localStorage.getItem('r8-language'); } catch {}
    if (current === 'en') {
      scene.querySelector('.opening-caption').textContent = 'Preparing the scene';
      button.textContent = 'Skip intro';
    }
    if (ended) { scene.hidden = true; return; }
    scene.hidden = false;
    button.addEventListener('click', () => {
      finish(true);
      document.getElementById('stage')?.focus({preventScroll:true});
    });
    onScroll();
    if (ended) return;
    if (noVideo) {
      remember();
      timer = setTimeout(() => finish(), playBudget);
      return;
    }
    const frameReady = () => {
      if (root.dataset.frame === 'ready' || root.dataset.mode === 'static') {
        sceneWatch?.disconnect();
        afterReady();
      }
    };
    sceneWatch = new MutationObserver(frameReady);
    sceneWatch.observe(root, {attributes:true,attributeFilter:['data-frame','data-mode']});
    frameReady();
    // Start the lightweight intro after the page has parsed, without delaying
    // startup or altering the native scroll path of the assembly.
    video.addEventListener('playing', () => { if (!ended) { video.dataset.shown = 'true'; root.dataset.intro = 'playing'; } });
    video.addEventListener('ended', () => {
      if (ended) return;
      root.dataset.intro = 'hold';
      if (ready) finish();
    });
    video.addEventListener('error', () => { if (!ended) root.dataset.intro = 'hold'; });
    timer = setTimeout(() => {
      quick = true;
      if (ready) finish();
      else if (!ended && video.paused) root.dataset.intro = 'hold';
    }, playBudget);
    // A lightweight poster must never become a blocking loading screen.
    posterTimer = setTimeout(() => finish(), 5000);
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => {
      if (ended) return;
      video.src = video.dataset.file;
      video.play().catch(() => { if (!ended) root.dataset.intro = 'hold'; });
    }), {once:true});
    remember();
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pageshow', e => { if (e.persisted) finish(true); });
  window.addEventListener('hashchange', () => { if (location.hash) finish(true); });
  window.addEventListener('focusin', e => { if (scene && !scene.contains(e.target)) finish(true); });
  motion.addEventListener?.('change', () => finish(true));
  document.addEventListener('r8-opening-mounted', mount, {once:true});
})();
