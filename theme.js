(() => {
  const button=document.getElementById('theme-toggle');
  let dark=false;try{dark=localStorage.getItem('cai-theme')==='dark';}catch{}
  function apply(){document.documentElement.dataset.theme=dark?'dark':'light';button?.setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式');button?.setAttribute('aria-pressed',String(dark));}
  button?.addEventListener('click',()=>{dark=!dark;apply();try{localStorage.setItem('cai-theme',dark?'dark':'light');}catch{}});apply();
  const scroll=()=>document.body.classList.toggle('header-scrolled',window.scrollY>40);
  addEventListener('scroll',scroll,{passive:true});scroll();
})();
