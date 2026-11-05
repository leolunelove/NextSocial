/* One motion language. Interruptions settle safely; reduced motion stays instant. */
(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map(), closing = new WeakMap(), disclosures=new WeakMap();
  const ease = 'cubic-bezier(.22,1,.36,1)';
  function stop(node) { const animation=active.get(node); if(animation){active.delete(node);animation.cancel();} }
  function play(node, frames, options={}) {
    if(!node) return Promise.resolve();
    stop(node);
    if(preference.matches || !node.animate) return Promise.resolve();
    const animation=node.animate(frames,{duration:280,easing:ease,...options});
    active.set(node,animation);
    return animation.finished.catch(()=>{}).finally(()=>{if(active.get(node)===animation)active.delete(node);});
  }
  function enter(node, distance=8) { return play(node,[{opacity:0,translate:`0 ${distance}px`},{opacity:1,translate:'0 0'}]); }
  function pulse(node) { return play(node,[{scale:'1'},{scale:'1.12',offset:.35},{scale:'1'}],{duration:360}); }
  function open(dialog) {
    if(dialog.open)return;
    dialog.showModal();document.body.classList.add('modal-open');
    dialog.classList.add('motion-opening');
    play(dialog,[{opacity:0,translate:'0 14px',scale:'.985'},{opacity:1,translate:'0 0',scale:'1'}],{duration:300}).then(()=>dialog.classList.remove('motion-opening'));
  }
  function close(dialog) {
    if(closing.has(dialog))return closing.get(dialog);
    if(!dialog.open)return Promise.resolve();
    dialog.classList.add('motion-closing');
    const promise=play(dialog,[{opacity:1,translate:'0 0',scale:'1'},{opacity:0,translate:'0 8px',scale:'.99'}],{duration:170,easing:'cubic-bezier(.4,0,1,1)'}).then(()=>{
      const toast=dialog.querySelector('#toast');if(toast)document.body.append(toast);
      dialog.close();dialog.classList.remove('motion-closing','motion-opening');
      if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open');
    }).finally(()=>closing.delete(dialog));
    closing.set(dialog,promise);return promise;
  }
  function disclosure(node) {
    if(!node||disclosures.has(node))return;
    const summary=node.querySelector('summary');let target=node.open,animating=false,sequence=0;
    disclosures.set(node,open=>{sequence++;target=open;animating=false;stop(node);node.open=open;node.style.overflow='';});
    summary.addEventListener('click',event=>{
      event.preventDefault();target=animating?!target:!node.open;animating=true;const version=++sequence;
      const start=node.getBoundingClientRect().height;stop(node);
      node.open=target;const end=node.getBoundingClientRect().height;node.open=true;node.style.overflow='hidden';
      play(node,[{height:start+'px'},{height:end+'px'}],{duration:240}).then(()=>{
        if(version!==sequence)return;node.open=target;node.style.overflow='';animating=false;
      });
    });
  }
  function setDisclosure(node,open){if(!node)return;const settle=disclosures.get(node);if(settle)settle(!!open);else node.open=!!open;}
  preference.addEventListener('change',()=>{if(preference.matches)for(const node of [...active.keys()])stop(node);});
  window.HubMotion={play,enter,pulse,open,close,stop,disclosure,setDisclosure,reduced:()=>preference.matches};
})();
