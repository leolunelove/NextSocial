(function () {
  'use strict';
  if (location.hash.startsWith('#review')) return;
  const $ = id => document.getElementById(id);
  const dialog = $('profile-dialog');
  let db, photoUrl, renderedPhoto, saveTimer, state = {photo:null,zoom:1,x:50,y:50,story:false,notes:false,note:'A little thought…'}, saveChain=Promise.resolve();
  const opened = new Promise((resolve,reject) => {
    const r=indexedDB.open('social-hub-profile',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('settings');
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{db=r.result;db.onversionchange=()=>db.close();const tx=db.transaction('settings');const q=tx.objectStore('settings').get('preview');q.onsuccess=()=>{if(q.result)state={...state,...q.result};resolve();};q.onerror=()=>reject(q.error);};
  });
  function save() {
    clearTimeout(saveTimer);
    saveTimer=setTimeout(persist,180);
  }
  function persist() {
    clearTimeout(saveTimer);
    const snapshot={...state};
    saveChain=saveChain.catch(()=>{}).then(()=>opened).then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(snapshot,'preview');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}));
    saveChain.catch(window.HubApp.report);
  }
  function render() {
    if(renderedPhoto!==state.photo){
      if(photoUrl)URL.revokeObjectURL(photoUrl);
      photoUrl=state.photo?URL.createObjectURL(state.photo):null;
      renderedPhoto=state.photo;
    }
    for(const face of dialog.querySelectorAll('.profile-face')){
      const img=face.querySelector('img');img.hidden=!photoUrl;if(photoUrl)img.src=photoUrl;else img.removeAttribute('src');
      img.style.objectPosition=`${state.x}% ${state.y}%`;img.style.transform=`translate(${(50-state.x)*(state.zoom-1)}%, ${(50-state.y)*(state.zoom-1)}%) scale(${state.zoom})`;
      face.classList.toggle('has-photo',!!photoUrl);
    }
    dialog.querySelectorAll('.profile-ring').forEach(r=>r.classList.toggle('with-story',state.story));
    $('profile-bubble').hidden=!state.notes;$('profile-bubble').textContent=state.note.trim()||'A little thought…';
    $('profile-story').checked=state.story;$('profile-notes').checked=state.notes;
    $('profile-note-field').hidden=!state.notes;$('profile-note').value=state.note;
    for(const key of ['zoom','x','y']){$('profile-'+key).value=state[key];$('profile-'+key).disabled=!state.photo;}
    $('profile-remove').hidden=!state.photo;
  }
  async function load(file) {
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>20*1024*1024)throw new Error('Choose a PNG, JPEG, WebP or GIF under 20 MB.');
    const url=URL.createObjectURL(file);
    try {const img=new Image();img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>100000000)throw new Error('This photo is too large. Choose a smaller image.');}finally{URL.revokeObjectURL(url);}
    state={...state,photo:file,zoom:1,x:50,y:50};render();save();
  }
  $('profile-tool').addEventListener('click',async()=>{try{await opened;render();dialog.showModal();dialog.scrollTop=0;$('profile-controls').scrollTop=0;document.body.classList.add('modal-open');}catch(e){window.HubApp.report(e);}});
  $('profile-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{persist();document.body.classList.remove('modal-open');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveTimer)persist();});
  $('profile-upload').addEventListener('click',()=>$('profile-file').click());
  $('profile-file').addEventListener('change',e=>{load(e.target.files[0]).catch(window.HubApp.report);e.target.value='';});
  for(const key of ['zoom','x','y'])$('profile-'+key).addEventListener('input',e=>{state[key]=Number(e.target.value);render();save();});
  for(const key of ['story','notes'])$('profile-'+key).addEventListener('change',e=>{state[key]=e.target.checked;render();save();});
  $('profile-note').addEventListener('input',e=>{state.note=e.target.value;$('profile-bubble').textContent=state.note.trim()||'A little thought…';save();});
  $('profile-remove').addEventListener('click',()=>{state.photo=null;state.zoom=1;state.x=state.y=50;render();save();});
  document.addEventListener('paste',e=>{if(!dialog.open)return;const f=[...(e.clipboardData?.items||[])].find(i=>i.kind==='file'&&i.type.startsWith('image/'));if(f){e.preventDefault();e.stopImmediatePropagation();load(f.getAsFile()).catch(window.HubApp.report);}},true);
  for(const event of ['dragenter','dragover','dragleave','drop'])document.addEventListener(event,e=>{if(!dialog.open||![...(e.dataTransfer?.types||[])].includes('Files'))return;e.preventDefault();e.stopImmediatePropagation();if(event==='drop')load(e.dataTransfer.files[0]).catch(window.HubApp.report);},true);
  opened.catch(()=>{});
})();
