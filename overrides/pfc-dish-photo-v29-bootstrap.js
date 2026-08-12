// Shared scan modal bootstrap for D9. Compatible with the D8 scan sheet markup.
(() => {
  'use strict';
  function ensure() {
    if (document.getElementById('pfc-scan-v28-modal')) return;
    const modal=document.createElement('div');
    modal.id='pfc-scan-v28-modal';
    modal.className='scan-v28-modal';
    modal.innerHTML='<div class="scan-v28-sheet"><div class="scan-v28-head"><strong id="scan-v28-title">スキャン</strong><button type="button" id="scan-v28-close" aria-label="閉じる">×</button></div><div id="scan-v28-body"></div></div>';
    document.body.appendChild(modal);
    const close=()=>{
      try{document.getElementById('scan-v28-video')?.srcObject?.getTracks?.().forEach(t=>t.stop());}catch{}
      modal.classList.remove('show');
    };
    modal.querySelector('#scan-v28-close').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();
