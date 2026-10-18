/* NextSocial local workspace. Selected review copies are shared by sharing.js. */
(() => {
  'use strict';
  const H = window.Hub, store = window.PostStore;
  const $ = id => document.getElementById(id);
  const icons = { Instagram: 'instagram', LinkedIn: 'linkedin', X: 'x', Facebook: 'facebook' };
  const statusNames = { pending: 'Pending approval', approved: 'Approved', posted: 'Posted' };
  let posts = [], selectedId = null, previewPlatform = 'Instagram', ready = false, busy = false;
  let dirty = {}, saveTimer, savePromise = Promise.resolve(), toastTimer, archiveOpen = false;
  const urls = new Map();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('social-hub-updates') : null;
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function icon(name, cls = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href', '#i-' + name); svg.setAttribute('aria-hidden','true'); if (cls) svg.setAttribute('class',cls); svg.append(use); return svg;
  }
  function button(text, cls, action, iconName) {
    const n = el('button',cls); if (iconName) n.append(icon(iconName)); n.append(document.createTextNode(text));
    n.addEventListener('click', () => Promise.resolve().then(action).catch(report)); return n;
  }
  // Only the original bundled sample is upgraded; personal uploads never match this digest.
  async function upgradeSampleArtwork() {
    const oldHash = "d881cab387263c9abef81c6bd79c4e3e056ab64910c1fed27b36e8ac9ae24f7e";
    let artwork;
    for (const post of await store.all()) {
      if (!(post.image instanceof Blob) || post.image.size !== 15053) continue;
      const digest = await crypto.subtle.digest("SHA-256", await post.image.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
      if (hash !== oldHash) continue;
      if (!artwork) { const response = await fetch("sample-grow.svg"); if (!response.ok) return; const source = URL.createObjectURL(await response.blob()); const img = new Image(); try { await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=reject; img.src=source; }); const canvas=document.createElement("canvas"); canvas.width=900; canvas.height=1200; canvas.getContext("2d").drawImage(img,0,0); artwork=await new Promise(resolve=>canvas.toBlob(resolve,"image/png")); if (!artwork) return; } finally { URL.revokeObjectURL(source); } }
      await store.update(post.id, p => ({...p, image:artwork, width:900, height:1200, status:p.status === "posted" ? "posted" : "pending", share:undefined, updatedAt:Date.now()}));
    }
  }
  function current() { return posts.find(p => p.id === selectedId); }
  function imageURL(post) { if (!urls.has(post.id)) urls.set(post.id, URL.createObjectURL(post.image)); return urls.get(post.id); }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
  function report(error) {
    console.error(error);
    const message = error?.name === 'QuotaExceededError' ? 'This browser is out of space. Export a backup, then free some space and try again.' : error?.message || 'Something went wrong. Please try again.';
    $('error-banner').textContent = message; $('error-banner').hidden = false;
    if ($('editor').open) { $('save-state').textContent = 'Not saved · please retry'; $('save-state').style.color = '#a36a46'; }
    toast(message);
  }
  function clearError() { $('error-banner').hidden = true; $('save-state').style.color = ''; }
  function notify() { channel?.postMessage('updated'); }
  async function refresh() {
    posts = await store.all();
    for (const [id,url] of urls) if (!posts.some(p => p.id === id)) { URL.revokeObjectURL(url); urls.delete(id); }
    render();
  }
  function empty(title, text, iconName) { const n = el('div','empty-state'); const copy = el('div'); copy.append(el('strong','',title),el('p','',text)); n.append(icon(iconName),copy); return n; }
  function render() {
    const today = H.dateKey();
    for (const status of H.statuses) {
      const items = H.sortPosts(posts,status); $(status + '-count').textContent = items.length;
      const container = $(status + '-list'); container.replaceChildren();
      if (!items.length) {
        const data = status === 'approved' ? ['Ready for what’s next.','Approved posts will line up here, ordered by date.','check'] : status === 'pending' ? ['Every post starts with an idea.','Paste an image above, then add the details and get a second look.','image'] : ['All caught up.','Posts you mark as posted will appear here.','check'];
        container.append(empty(...data));
      }
      for (const p of items) container.append(row(p));
    }
    const count = posts.filter(p => p.status === 'approved' && p.plannedDate === today).length;
    $('today-number').textContent = count; $('today-count').textContent = count === 1 ? '1 post ready' : `${count} posts ready`;
    const done = posts.filter(p => p.status === 'posted').length;
    $('archive-note').textContent = done ? `${done} ${done === 1 ? 'post, out in the world.' : 'posts, out in the world.'}` : 'Your finished posts will find a home here.';
    $('archive-note').hidden = archiveOpen; $('posted-list').hidden = !archiveOpen;
    $('archive-toggle').setAttribute('aria-expanded',String(archiveOpen));
    $('archive-toggle').replaceChildren(document.createTextNode(archiveOpen ? 'Close archive' : 'View archive'),icon('arrow'));
    $('storage-state').textContent = 'Saved locally';
  }
  function appendPostImage(container, source, title, compact = false) {
    const img = el("img"); img.alt = title || "Post image";
    const fallback = el("div", "image-fallback");
    const mark = el("span", "image-fallback-mark"); mark.append(icon("image"));
    fallback.append(mark, el("span", "image-fallback-title", "Image unavailable"));
    if (!compact) fallback.append(el("span", "image-fallback-copy", "The image could not be loaded. Your post details are still here."));
    fallback.hidden = true; fallback.setAttribute("role", "status");
    container.classList.add("image-loading");
    img.onload = () => { container.classList.remove("image-loading", "image-unavailable"); fallback.hidden = true; img.hidden = false; };
    img.onerror = () => { container.classList.remove("image-loading"); container.classList.add("image-unavailable"); img.hidden = true; fallback.hidden = false; };
    container.append(img, fallback); img.src = source;
  }
  function row(p) {
    const n = el('article','post-row'); n.setAttribute('aria-label',p.title || 'Untitled post');
    const thumb = button('','thumbnail',() => openEditor(p.id)); thumb.setAttribute('aria-label',`Preview ${p.title || 'untitled post'}`);
    appendPostImage(thumb, imageURL(p), p.title, true);
    const info = el('div','row-info'), meta = el('div','row-meta'), platform = el('span','row-platform'); platform.append(icon(icons[p.platform]),document.createTextNode(p.platform));
    const date = p.status === 'posted' ? H.dateKey(new Date(p.postedAt)) : p.plannedDate;
    const dateText = H.dateLabel(date), late = p.status === 'approved' && date && date < H.dateKey();
    const label = el('span','row-date' + (date === H.dateKey() ? ' today-date' : late ? ' overdue' : ''), `${late ? 'Overdue · ' : ''}${dateText}`);
    if (date) label.title = new Date(date + 'T12:00:00').toLocaleDateString(undefined,{dateStyle:'full'});
    meta.append(platform,el('span','meta-dot','·'),label);
    const title = button(p.title || 'Untitled post','row-title',() => openEditor(p.id));
    info.append(meta,title,el('span','row-status',window.HubSharing?.statusLabel(p) || statusNames[p.status]));
    const actions = el('div','row-actions'); actions.append(button('Preview','text-button',() => openEditor(p.id)));
    if (p.status !== 'posted') actions.append(button(p.status === 'pending' ? (p.share?.state === 'ready' ? 'Copy link' : 'Get approval') : 'Mark as Posted','secondary',() => p.status === 'pending' ? (p.share?.state === 'ready' ? window.HubSharing.copyLink(p) : openEditor(p.id)) : move(p.id,'post'),p.status==='pending'?'arrow':'check'));
    n.append(thumb,info,actions); return n;
  }
  async function move(id, action) {
    if (busy) return;
    await flushSave(); busy = true;
    try {
      clearError(); await store.update(id,p => H.transition(p,action)); await refresh(); notify();
      if (selectedId === id && $('editor').open) { fillEditor(); renderMockup(); }
      toast({approve:'Approved. Your post is up next.',post:'Marked as posted. Nicely done.',restore:'Moved back to Pending.',unapprove:'Moved back to Pending.'}[action]);
    } finally { busy = false; }
  }
  function openEditor(id) {
    const p = posts.find(p => p.id === id); if (!p) return;
    selectedId = id; dirty = {}; previewPlatform = p.platform; setEditorView('details'); clearError();
    fillEditor(); renderTabs(); renderMockup(); $('editor').showModal(); document.body.classList.add('modal-open');
    // Keep the image and preview tabs visible on opening, including on mobile.
    $('close-editor').focus({preventScroll:true}); $('editor').scrollTop = 0;
  }
  const mobileEditor = window.matchMedia('(max-width:650px)');
  const editorActions = document.querySelector('.editor-actions');
  function positionEditorActions() {
    if(mobileEditor.matches) $('editor-dock').append(editorActions);
    else $('editor-details-pane').insertBefore(editorActions,$('share-explainer'));
  }
  mobileEditor.addEventListener('change',positionEditorActions);
  positionEditorActions();
  function setEditorView(view) {
    $('editor').dataset.view=view;
    $('editor').querySelector('.editor-grid').scrollTop=0;
    $('editor-details-tab').setAttribute('aria-selected',String(view==='details'));
    $('editor-preview-tab').setAttribute('aria-selected',String(view==='preview'));
  }
  $('editor-details-tab').addEventListener('click',()=>setEditorView('details'));
  $('editor-preview-tab').addEventListener('click',()=>setEditorView('preview'));
  for(const id of ['editor-details-tab','editor-preview-tab'])$(id).addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const view=e.key==='Home'?'details':e.key==='End'?'preview':$('editor').dataset.view==='details'?'preview':'details';setEditorView(view);$('editor-'+view+'-tab').focus(); }
  });
  function fillEditor() {
    const p = current(); if (!p) return;
    $('post-title').value = p.title; $('post-caption').value = p.caption; $('post-date').value = p.plannedDate;
    for (const id of ['post-title','post-caption','post-date']) $(id).disabled = p.status === 'posted';
    $('editor-status').textContent = statusNames[p.status]; $('editor-status').className = 'status-badge ' + p.status;
    $('save-state').textContent = 'Saved on this device';
    $('image-metadata').textContent = `${p.width} × ${p.height} · ${H.ratioLabel(p.width,p.height)} · ${sizeLabel(p.image.size)}`;
    const choices = $('platform-choices'); choices.replaceChildren();
    for (const platform of H.platforms) {
      const b = button(platform,'platform-choice',() => {
        if (platform === current().platform) return;
        current().platform = platform; queueSave('platform',platform); previewPlatform = platform; renderChoices(); renderTabs(); renderMockup();
      },icons[platform]);
      b.dataset.platform = platform; b.disabled = p.status === 'posted'; b.setAttribute('aria-pressed',String(platform === p.platform)); choices.append(b);
    }
    const suggestions = H.suggested(p.width,p.height);
    $('suggestion').textContent = `Shape suits ${suggestions.join(', ')}. A guide, not a restriction.`;
    $('date-note').textContent = p.status === 'approved' ? 'Editing this post returns it to Pending for a fresh look.' : p.status === 'posted' ? `Posted ${new Date(p.postedAt).toLocaleDateString(undefined,{dateStyle:'medium'})}. Move to Pending to edit.` : 'No rush. Leave it open, or pick a day.';
    $('editor-action').textContent = p.status === 'pending' ? 'Approve post' : p.status === 'approved' ? 'Mark as Posted' : 'Back to Pending';
    $('secondary-action').hidden = p.status !== 'approved'; captionMeta(); window.HubSharing?.editorState(p);
  }
  function renderChoices() { document.querySelectorAll('.platform-choice').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.platform === current().platform))); }
  function renderTabs() {
    $('preview-tabs').replaceChildren();
    for (const platform of H.platforms) {
      const b = button(platform,'',() => { previewPlatform = platform; renderTabs(); renderMockup(); $('preview-tabs').querySelector('[aria-selected=true]').focus(); },icons[platform]);
      b.id = 'preview-' + platform.toLowerCase(); b.setAttribute('role','tab'); b.setAttribute('aria-selected',String(platform === previewPlatform)); b.setAttribute('aria-controls','mockup'); b.tabIndex = platform === previewPlatform ? 0 : -1;
      b.addEventListener('keydown', e => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const i = H.platforms.indexOf(platform); previewPlatform = H.platforms[e.key === 'Home' ? 0 : e.key === 'End' ? 3 : (i + (e.key === 'ArrowRight' ? 1 : 3)) % 4]; renderTabs(); renderMockup(); $('preview-tabs').querySelector('[aria-selected=true]').focus(); } });
      $('preview-tabs').append(b);
    }
    $('mockup').setAttribute('aria-labelledby','preview-' + previewPlatform.toLowerCase());
  }
  function postPreview(p,platform,source) {
    const card=el('div','social-card '+icons[platform]);
    const head = el('div','social-head'), who = el('div');
    who.append(el('div','social-name','Post preview'));
    who.append(el('div','social-sub',platform));
    const avatar=el('div','avatar review-avatar');avatar.append(icon('image'));head.append(avatar,who,el('span','social-menu','···'));
    const media = el('div','social-media'), ratio = H.previewRatio(platform,p.width,p.height);
    media.style.aspectRatio = String(ratio); appendPostImage(media, source, p.title);
    const caption = el('p','social-caption');
    if (p.caption) {
      caption.append(document.createTextNode(p.caption));
    }
    const tools = el('div','social-tools'); tools.setAttribute('aria-hidden','true');
    if (platform === 'Instagram') tools.append(icon('heart'),icon('comment'),icon('send'),icon('bookmark','bookmark'));
    else if (platform === 'X') tools.append(icon('comment'),icon('repeat'),icon('heart'),icon('bookmark'),icon('send'));
    else for (const [text,name] of [['Like','heart'],['Comment','comment'],[platform === 'LinkedIn' ? 'Repost' : 'Share','repeat']]) { const s = el('span'); s.append(icon(name),document.createTextNode(text)); tools.append(s); }
    if (platform === 'Instagram') card.append(head,media,tools,caption,el('div','social-bottom','JUST NOW'));
    else card.append(head,caption,media,tools);
    return card;
  }
  function renderMockup() {
    const p=current(); if(!p)return;
    const platform=previewPlatform,ratio=H.previewRatio(platform,p.width,p.height);
    $('mockup').replaceChildren(postPreview(p,platform,imageURL(p)));
    const cropped = Math.abs(ratio - p.width/p.height) > .001;
    $('crop-note').textContent = cropped ? 'This feed preview crops the edges to fit. Your original image stays untouched.' : `${H.ratioLabel(p.width,p.height)} · Full image, original proportions.`;
    captionMeta();
  }
  function captionMeta() {
    const p = current(); if (!p) return; const count = [...p.caption].length;
    $('caption-count').textContent = `${count.toLocaleString()} characters`;
    const limits = { X:280, Instagram:2200, LinkedIn:3000 };
    $('caption-warning').textContent = limits[p.platform] && count > limits[p.platform] ? `Longer than a standard ${p.platform} caption.` : '';
    $('copy-caption').disabled = !p.caption;
  }
  function queueSave(field,value) {
    const p = current();
    if (p.status === 'approved') {
      p.status = 'pending'; p.approvedAt = null;
      $('editor-status').textContent = statusNames.pending; $('editor-status').className = 'status-badge pending';
      $('editor-action').textContent = 'Approve post'; $('secondary-action').hidden = true;
      $('date-note').textContent = 'Changed since approval. Give it a fresh look before approving again.';
    }
    dirty[field] = value; $('save-state').textContent = 'Saving…'; clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flushSave().catch(report),250);
  }
  async function flushSave() {
    clearTimeout(saveTimer);
    if (!Object.keys(dirty).length) return savePromise;
    const id = selectedId, patch = { ...dirty }; dirty = {};
    savePromise = savePromise.catch(() => {}).then(async () => {
      try {
        if (patch.plannedDate !== undefined && !H.validDate(patch.plannedDate)) throw new Error('Please choose a valid planned date.');
        const saved = await store.update(id,p => H.edit(p,patch));
        const local = posts.find(p => p.id === id); if (local) Object.assign(local,saved,id === selectedId ? dirty : {});
        render(); notify();
        if (id === selectedId) {
          $('editor-status').textContent = statusNames[saved.status]; $('editor-status').className = 'status-badge ' + saved.status;
          $('editor-action').textContent = saved.status === 'pending' ? 'Approve post' : 'Mark as Posted';
          $('secondary-action').hidden = saved.status !== 'approved';
          $('save-state').textContent = Object.keys(dirty).length ? 'Saving…' : 'Saved on this device';
          clearError(); window.HubSharing?.editorState(local);
        }
      } catch (e) { if (id === selectedId) dirty = { ...patch, ...dirty }; throw e; }
    });
    return savePromise;
  }
  async function closeEditor() { await flushSave(); $('editor').close(); document.body.classList.remove('modal-open'); selectedId = null; }
  function sizeLabel(bytes) { return bytes >= 1024*1024 ? (bytes/1024/1024).toFixed(1) + ' MB' : Math.max(1,Math.round(bytes/1024)) + ' KB'; }
  function dimensions(blob) {
    return new Promise((resolve,reject) => {
      const img = new Image(), url = URL.createObjectURL(blob);
      const cleanup = () => { URL.revokeObjectURL(url); clearTimeout(timer); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('This image took too long to open. Try a smaller image.')); },15000);
      img.onload = () => { cleanup(); if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth*img.naturalHeight > 100000000) reject(new Error('Please use an image smaller than 100 megapixels.')); else resolve({width:img.naturalWidth,height:img.naturalHeight}); };
      img.onerror = () => { cleanup(); reject(new Error('One image could not be read. Use a valid PNG, JPEG, WebP, or GIF.')); }; img.src = url;
    });
  }
  async function ingest(files) {
    if (!ready || busy || !files.length) return;
    if ($('editor').open) await closeEditor();
    busy = true; $('add').disabled = true; $('dropzone').disabled = true; clearError();
    try {
      if (files.length > 100) throw new Error('Please add up to 100 images at a time.');
      const records = [], errors = [];
      for (const file of files) {
        try {
          if (!H.imageTypes.includes(file.type)) throw new Error(`${file.name || 'This file'}: use PNG, JPEG, WebP, or GIF.`);
          if (!file.size || file.size > H.limits.image) throw new Error(`${file.name || 'This image'}: please keep images under 20 MB.`);
          const d = await dimensions(file), now = new Date().toISOString();
          records.push({id:crypto.randomUUID(),title:(file.name && !/^(image|pasted)[.-]/i.test(file.name) ? file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ') : 'Untitled post').slice(0,200),caption:'',platform:H.suggested(d.width,d.height)[0],plannedDate:'',status:'pending',createdAt:now,updatedAt:now,approvedAt:null,postedAt:null,filename:(file.name || 'image.png').slice(0,300),image:new Blob([file],{type:file.type}),...d});
        } catch (e) { errors.push(e.message); }
      }
      if (records.length) { await store.addMany(records); await refresh(); notify(); if (records.length === 1) openEditor(records[0].id); toast(`${records.length === 1 ? 'Image saved' : records.length + ' images saved'}. Ready for a little polish.`); }
      if (errors.length) report(new Error(errors.slice(0,3).join(' ') + (errors.length > 3 ? ` ${errors.length-3} more files skipped.` : '')));
    } finally { busy = false; $('add').disabled = false; $('dropzone').disabled = false; $('file-input').value = ''; }
  }
  function download(blob,name) { const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),60000); }
  function dataURL(blob) { return new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); }); }
  async function exportBackup() {
    if (busy) return; await flushSave(); busy = true; $('export').disabled = true; toast('Preparing your backup, including every image…');
    try {
      const data = await store.all(), records = [];
      if (data.length > H.limits.records || data.reduce((sum,p) => sum + p.image.size,0) * 1.38 > H.limits.backup) throw new Error('A backup supports up to 1,000 posts and 250 MB. Download originals and reduce this library first.');
      for (const p of data) { const { image,...metadata } = p; records.push({...metadata,image:await dataURL(image)}); }
      const blob = new Blob([JSON.stringify({app:'social-hub',version:1,exportedAt:new Date().toISOString(),posts:records})],{type:'application/json'});
      if (blob.size > H.limits.backup) throw new Error('This backup exceeds the 250 MB import limit.');
      download(blob,`nextsocial-backup-${H.dateKey()}.json`); toast(`Backup downloaded. ${data.length} ${data.length === 1 ? 'post' : 'posts'}, images included.`);
    } finally { busy = false; $('export').disabled = false; }
  }
  async function importBackup(file) {
    if (!file || busy) return; busy = true; $('import').disabled = true; clearError();
    try {
      if (file.size > H.limits.backup) throw new Error('Please import a backup smaller than 250 MB.');
      toast('Checking your backup…'); let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('This is not a valid JSON backup.'); }
      if (data.app !== 'social-hub' || data.version !== 1 || !Array.isArray(data.posts) || data.posts.length > H.limits.records) throw new Error('Use a NextSocial or Social Hub version 1 backup with up to 1,000 posts.');
      const records = [], ids = new Set();
      for (const raw of data.posts) {
        H.validateRecord(raw);
        if (ids.has(raw.id)) throw new Error('This backup contains duplicate post identifiers. Nothing was imported.'); ids.add(raw.id);
        if (typeof raw.image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/.test(raw.image)) throw new Error('An image is missing or invalid in this backup. Nothing was imported.');
        const [header,payload] = raw.image.split(',');
        if (payload.length > Math.ceil(H.limits.image/3)*4) throw new Error('An image in this backup exceeds 20 MB.');
        let binary; try { binary = atob(payload); } catch { throw new Error('An image is damaged in this backup.'); }
        const bytes = new Uint8Array(binary.length); for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
        const image = new Blob([bytes],{type:header.slice(5,-7)});
        if (!image.size || image.size > H.limits.image) throw new Error('Invalid image size in backup.');
        const d = await dimensions(image);
        records.push({id:raw.id,title:raw.title,caption:raw.caption,platform:raw.platform,plannedDate:raw.plannedDate,status:raw.status,createdAt:new Date(raw.createdAt).toISOString(),updatedAt:new Date(raw.updatedAt).toISOString(),approvedAt:raw.approvedAt ? new Date(raw.approvedAt).toISOString() : null,postedAt:raw.postedAt ? new Date(raw.postedAt).toISOString() : null,filename:raw.filename,image,...d,...(raw.share?{share:window.HubSharing.validateShare(raw.share)}:{})});
      }
      const count = await store.merge(records); await refresh(); notify(); toast(`${count} ${count === 1 ? 'post restored' : 'posts restored'}. ${records.length-count ? `${records.length-count} already here; kept unchanged.` : 'Images included.'}`);
    } finally { busy = false; $('import').disabled = false; $('import-input').value = ''; }
  }
  $('add').addEventListener('click',() => $('file-input').click()); $('dropzone').addEventListener('click',() => $('file-input').click());
  $('file-input').addEventListener('change',e => ingest([...e.target.files]).catch(report));
  document.addEventListener('paste',e => {
    if ($('confirm-dialog').open) return;
    const files = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file').map(x => x.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); ingest(files).catch(report); }
  });
  let dragDepth = 0;
  document.addEventListener('dragenter',e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dragDepth++; if (ready && !busy && !$('editor').open) $('drop-overlay').hidden = false; } });
  document.addEventListener('dragover',e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('dragleave',e => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; } });
  document.addEventListener('drop',e => { e.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true; if (!$('confirm-dialog').open) ingest([...e.dataTransfer.files]).catch(report); });
  window.addEventListener('blur',() => { dragDepth = 0; $('drop-overlay').hidden = true; });
  $('archive-toggle').addEventListener('click',() => { archiveOpen = !archiveOpen; render(); });
  $('close-editor').addEventListener('click',() => closeEditor().catch(report));
  $('editor').addEventListener('cancel',e => { e.preventDefault(); closeEditor().catch(report); });
  for (const [id,field] of [['post-title','title'],['post-caption','caption'],['post-date','plannedDate']]) {
    $(id).addEventListener('input',e => { const p = current(); if (!p) return; if (field === 'plannedDate' && !e.target.validity.valid) { $('save-state').textContent = 'Choose a valid date'; return; } p[field] = e.target.value; queueSave(field,e.target.value); if (field === 'caption') renderMockup(); });
  }
  $('editor-action').addEventListener('click',() => { const p = current(); if (p) (window.HubSharing ? window.HubSharing.mainAction(p) : move(p.id,p.status === 'pending' ? 'approve' : p.status === 'approved' ? 'post' : 'restore')).catch(report); });
  $('secondary-action').addEventListener('click',async () => { try { await window.HubSharing?.revoke(current()); await move(selectedId,'unapprove'); } catch(e){report(e);} });
  $('download-image').addEventListener('click',() => { const p = current(); if (p) download(p.image,p.filename || 'post-image.png'); });
  $('copy-caption').addEventListener('click',async () => {
    try { await navigator.clipboard.writeText(current().caption); toast('Caption copied. Ready when you are.'); }
    catch { $('post-caption').focus(); $('post-caption').select(); toast('Select and copy the caption with ⌘ C or Ctrl C.'); }
  });
  $('delete-post').addEventListener('click',() => $('confirm-dialog').showModal());
  $('cancel-delete').addEventListener('click',() => $('confirm-dialog').close());
  $('confirm-delete').addEventListener('click',async () => {
    try { await flushSave(); await window.HubSharing?.revoke(current()); await store.update(selectedId,() => null); $('confirm-dialog').close(); await closeEditor(); await refresh(); notify(); toast('Post deleted from this browser.'); } catch(e) { report(e); }
  });
  $('export').addEventListener('click',() => exportBackup().catch(report));
  $('import').addEventListener('click',() => $('import-input').click());
  $('import-input').addEventListener('change',e => importBackup(e.target.files[0]).catch(report));
  window.addEventListener('beforeunload',e => { if (Object.keys(dirty).length || $('save-state').textContent === 'Saving…') { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange',() => { if (document.hidden) flushSave().catch(report); else if (ready && !$('editor').open) refresh().catch(report); });
  channel?.addEventListener('message',() => { if (!$('editor').open && !busy) refresh().catch(report); });
  setInterval(() => { if (ready && !document.hidden) render(); },60000);
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $('paste-shortcut').textContent = 'Ctrl V';
  const workspaceLinks=[...document.querySelectorAll('.workspace-nav a')];
  workspaceLinks.forEach(link=>link.addEventListener('click',()=>{workspaceLinks.forEach(item=>item.removeAttribute('aria-current'));link.setAttribute('aria-current','location');}));
  window.HubApp = { current, all:()=>posts, refresh, fillEditor, closeEditor, flushSave, move, renderMockup, postPreview, report, toast, notify, openEditor, render, icon, el, button, isReady:()=>ready, isBusy:()=>busy || Object.keys(dirty).length>0 || (selectedId && $('save-state').textContent==='Saving…'), setBusy:value=>{busy=value;} };
  if (new URLSearchParams(location.hash.slice(1)).has('review')) return;
  (async () => {
    try { await store.open(); await upgradeSampleArtwork().catch(console.warn); await refresh(); ready = true; for (const id of ['add','dropzone','export','import']) $(id).disabled = false; }
    catch(e) { $('storage-state').textContent = 'Storage unavailable'; report(new Error('Local storage could not open. Use a regular browser window with storage enabled, then reload. ' + (e.message || ''))); }
  })();
})();
