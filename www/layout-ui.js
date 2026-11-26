// Layout only: no credentials, storage or network calls.
export function validatedInsets(value){
 const result={};for(const key of ['top','right','bottom','left']){const n=value?.[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>200)return null;result[key]=n;}return result;
}
export function applyInsets(root,value){const insets=validatedInsets(value);if(!insets)return false;for(const [key,n] of Object.entries(insets))root.style.setProperty('--native-'+key,`${n}px`);return true;}
if(typeof document!=='undefined'){
 let seq=0;
 async function measure(){const id=++seq;try{const bridge=globalThis.Capacitor?.Plugins?.DKPVault;if(!bridge?.readSafeArea)return;const v=await bridge.readSafeArea();if(id===seq)applyInsets(document.documentElement,v);}catch{/* CSS env remains available. */}}
 for(const el of document.querySelectorAll('[data-jump]'))el.addEventListener('click',()=>document.getElementById(el.dataset.jump)?.scrollIntoView({block:'start',behavior:'auto'}));
 window.addEventListener('resize',measure);window.addEventListener('orientationchange',()=>{measure();setTimeout(measure,250);});document.addEventListener('visibilitychange',()=>{if(!document.hidden)measure();});measure();setTimeout(measure,250);setTimeout(measure,1000);
}
