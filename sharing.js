(() => {
  'use strict';
  const A=window.HubApp,H=window.Hub,S=window.PostStore,$=id=>document.getElementById(id);
  const HOST='https://nextsocial.leolune.fun';
  const PREVIOUS_HOST='https://leolunelove.github.io/NextSocial';
  const LEGACY_HOST='https://leolunelove.github.io/social-hub';
  const API='https://qbkrqibmolaetilruxki.supabase.co/functions/v1/social-hub-reviews';
  const TOKEN=/^[a-f0-9]{64}$/;
  let sharing=false,sharingPostId=null,syncing=false;
  const makeToken=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const endpoint=()=>API;
  async function request(path,secret,method='GET',data,origin=API){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+secret,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      let value;try{value=await response.json();}catch{throw new Error('Approval links are not connected here yet. Your local post is safe.');}
      if(!response.ok){const error=new Error(value.error||'Could not reach the approval service.');error.status=response.status;throw error;}
      return value;
    }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('Could not connect. Check your connection and try again. Your local post is safe.');throw e;}finally{clearTimeout(timeout);}
  }
  function validateShare(s){
    if(!s||!TOKEN.test(s.reviewToken)||!TOKEN.test(s.ownerToken)||(s.id&&!TOKEN.test(s.id))||!['creating','ready'].includes(s.state)||![API,HOST,PREVIOUS_HOST,LEGACY_HOST,'https://social-hub-studio.leolunelove.chatgpt.site','http://localhost:8765','http://127.0.0.1:8765'].includes(s.origin)||!['pending','approved','changes','expired','revoked'].includes(s.decision)||!Number.isFinite(s.expiresAt))throw new Error('This backup has invalid approval-link data.');
    return {reviewToken:s.reviewToken,ownerToken:s.ownerToken,id:s.id||'',state:s.state,origin:s.origin,decision:s.decision,expiresAt:s.expiresAt,reviewer:String(s.reviewer||'').slice(0,100),feedback:String(s.feedback||'').slice(0,2000),decidedAt:s.decidedAt||null};
  }
  async function reviewImage(p){
    const img=new Image(),url=URL.createObjectURL(p.image);
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Could not prepare this image.'));img.src=url;});
      const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      let image;for(const quality of [.84,.68,.5,.35,.2]){image=canvas.toDataURL('image/jpeg',quality);if(image.length<=690000)break;}
      if(image.length>690000)throw new Error('Please use a smaller image for this approval link.');
      return {image,width:canvas.width,height:canvas.height};
    }finally{URL.revokeObjectURL(url);}
  }
  function link(p){return (['http://localhost:8765','http://127.0.0.1:8765'].includes(p.share.origin)?p.share.origin:HOST)+'/#review='+p.share.reviewToken;}
  async function copyLink(p){
    if(!p.share)return;
    if(p.share.decision==='expired'||p.share.expiresAt<=Date.now())throw new Error('This link has expired. Open the post and replace its link.');
    try{await navigator.clipboard.writeText(link(p));A.toast('Approval link copied. Send it to your reviewer.');}
    catch{if(A.current()?.id!==p.id)A.openEditor(p.id);editorState(p);const details=$('approval-url')?.closest('details');if(details)details.open=true;$('approval-url')?.focus();$('approval-url')?.select();A.toast('Copy the selected approval link.');}
  }
  function effectiveDecision(p){return p.share?.decision==='pending'&&p.share.expiresAt<=Date.now()?'expired':p.share?.decision;}
  function statusLabel(p){
    if(p.status!=='pending'||!p.share)return null;
    return {pending:p.share.state==='creating'?(sharing&&sharingPostId===p.id?'Preparing approval link':'Link not sent yet'):'Waiting for approval',approved:'Approved',changes:'Changes requested',expired:'Approval link expired',revoked:'Approval link unavailable'}[effectiveDecision(p)];
  }
  function editorState(p){
    if(!p)return;const has=!!p.share,posted=p.status==='posted',decision=effectiveDecision(p),uploading=sharing&&p.id===sharingPostId;
    for(const id of ['post-title','post-caption','post-date'])$(id).disabled=has||posted||uploading;
    document.querySelectorAll('.platform-choice').forEach(b=>b.disabled=has||posted||uploading);
    for(const id of ['self-approve','revoke-link','secondary-action','delete-post'])$(id).disabled=uploading;
    $('self-approve').hidden=p.status!=='pending';$('revoke-link').hidden=!has||posted||decision==='changes';
    $('secondary-action').hidden=p.status!=='approved'||has;
    $('share-explainer').hidden=has||p.status!=='pending';
    $('copy-caption').style.display=p.status==='pending'?'none':'inline-flex';
    $('editor-status').textContent=statusLabel(p)||{pending:'Draft',approved:'Approved',posted:'Posted'}[p.status];
    $('editor-action').textContent=p.status==='posted'?'Back to Pending':p.status==='approved'?'Mark as Posted':has?(decision==='changes'?'Make changes':p.share.state==='creating'?'Retry approval link':decision==='expired'||decision==='revoked'?'Replace approval link':'Copy approval link'):'Create approval link';
    $('editor-action').disabled=sharing;
    if(sharing){$('editor-action').textContent=p.id===sharingPostId?'Creating your link…':'Finishing another link…';$('editor-action').setAttribute('aria-busy','true');}else $('editor-action').removeAttribute('aria-busy');
    const info=$('share-info');info.replaceChildren();info.hidden=!has;
    if(has){
      const title=A.el('strong','',decision==='approved'?'A green light.':decision==='changes'?'A little feedback.':decision==='expired'?'Time for a fresh link.':p.share.state==='creating'?(sharing?'Preparing your review copy.':'Your link is not ready yet.'):'Ready for a second pair of eyes.');
      info.append(title);
      const summary=decision==='approved'?`Approved${p.share.reviewer?' by '+p.share.reviewer:''}.`:decision==='changes'?`${p.share.reviewer||'Your reviewer'} requested changes.`:decision==='expired'?'This link has expired. Create a fresh one for your reviewer.':p.share.state==='creating'?(sharing?'Just a moment. Your image and caption are on their way.':'Retry to finish uploading this review copy.'):`Available until ${new Date(p.share.expiresAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}. Anyone with this link can respond.`;
      info.append(A.el('p','',summary));
      if(p.share.feedback)info.append(A.el('blockquote','',p.share.feedback));
      if(p.share.state==='ready'){
        const input=A.el('input');input.id='approval-url';input.readOnly=true;input.value=link(p);input.setAttribute('aria-label','Approval link');input.addEventListener('click',()=>input.select());info.append(input);
        const controls=A.el('div','share-controls');if(decision==='pending')controls.append(A.button('Check for a response','text-button',()=>sync(true)));controls.append(A.button('Revoke link','text-button',()=>revokeAndRefresh(p)));info.append(controls);
      }
      $('date-note').textContent='This is the exact version your reviewer sees. Choose “Edit & replace link” to change it.';
    }
  }
  async function createLink(p){
    if(sharing)return;const id=p.id;sharing=true;sharingPostId=id;A.setBusy(true);$('editor-action').disabled=true;$('editor-action').textContent='Creating your link…';$('editor-action').setAttribute('aria-busy','true');
    if(A.current()?.id===id)editorState(p);
    try{
      await A.flushSave();p=A.all().find(post=>post.id===id)||p;
      if(!p.share){
        // Check availability before freezing a local draft for a shared snapshot.
        await request('/api/health','');
        const share={reviewToken:makeToken(),ownerToken:makeToken(),id:'',state:'creating',origin:API,decision:'pending',expiresAt:Date.now()+7*86400000,reviewer:'',feedback:'',decidedAt:null};
        await S.update(p.id,post=>({...post,share,status:'pending',approvedAt:null}));await A.refresh();p=A.all().find(post=>post.id===id);if(!p)throw new Error('This post no longer exists.');
      }
      if(A.current()?.id===id)editorState(p);A.toast('Making a private review copy…');
      const image=await reviewImage(p);
      const result=await request('/api/reviews',p.share.ownerToken,'POST',{reviewToken:p.share.reviewToken,title:p.title,caption:p.caption,platform:p.platform,plannedDate:p.plannedDate,...image},endpoint(p.share));
      await S.update(p.id,post=>({...post,share:{...post.share,id:result.id,state:'ready',expiresAt:result.expiresAt}}));
      await A.refresh();A.notify();const saved=A.all().find(post=>post.id===id);
      if(A.current()?.id===id){A.fillEditor();await copyLink(saved);}else A.toast('Approval link ready. Open the post to copy it.');
    }finally{sharing=false;sharingPostId=null;A.setBusy(false);if(A.current())editorState(A.current());}
  }
  async function revoke(p){
    if(!p?.share)return;
    // Uncertain creates use the same deterministic ID, so a lost response is revocable.
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.share.reviewToken));
    const id=p.share.id||[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    await request('/api/manage/'+id,p.share.ownerToken,'DELETE',null,endpoint(p.share));
    await S.update(p.id,post=>({...post,share:null}));await A.refresh();A.notify();
  }
  async function revokeAndRefresh(p){await revoke(p);if(A.current())A.fillEditor();A.toast('Link revoked. Your post is still saved here.');}
  async function editShared(p){await revoke(p);const latest=A.all().find(x=>x.id===p.id);if(latest?.status==='approved')await A.move(p.id,'unapprove');A.fillEditor();A.toast('Old link revoked. You can edit this post and send a fresh link.');}
  async function mainAction(p){
    if(p.status==='posted'){await revoke(p);return A.move(p.id,'restore');}
    if(p.status==='approved')return A.move(p.id,'post');
    if(p.share?.state==='ready'){
      if(p.share.decision==='changes')return editShared(p);
      if(['expired','revoked'].includes(p.share.decision)||p.share.expiresAt<=Date.now()){await revoke(p);await A.refresh();const latest=A.all().find(post=>post.id===p.id);if(latest)return createLink(latest);return;}
      return copyLink(p);
    }
    return createLink(p);
  }
  async function sync(visible=false){
    if(syncing||sharing||!A.isReady()||A.isBusy()||document.hidden)return;syncing=true;let changed=false;
    try{
      for(const p of A.all().filter(p=>p.share?.state==='ready'&&p.share.decision==='pending')){
        let result;try{result=await request('/api/manage/'+p.share.id,p.share.ownerToken,'GET',null,endpoint(p.share));}
        catch(e){if(e.status===404)result={decision:'revoked'};else if(visible)throw e;else continue;}
        if(result.decision!==p.share.decision){
          await S.update(p.id,post=>{
            if(post.share?.id!==p.share.id)return post;
            return {...post,share:{...post.share,...result},...(result.decision==='approved'&&post.status==='pending'?{status:'approved',approvedAt:result.decidedAt}:{}),updatedAt:new Date().toISOString()};
          });changed=true;
        }
      }
      if(changed){await A.refresh();A.notify();if(A.current())A.fillEditor();if(visible)A.toast('Latest response saved.');}
      else if(visible)A.toast(A.all().some(p=>p.share?.decision==='pending')?'No new response yet.':'You’re up to date.');
    }finally{syncing=false;}
  }
  $('self-approve').addEventListener('click',async()=>{try{const p=A.current();await revoke(p);await A.move(p.id,'approve');}catch(e){A.report(e);}});
  $('revoke-link').addEventListener('click',()=>editShared(A.current()).catch(A.report));
  window.HubSharing={mainAction,copyLink,statusLabel,editorState,revoke,validateShare,sync};
  const reviewToken=new URLSearchParams(location.hash.slice(1)).get('review');
  if(reviewToken!==null){reviewPage(reviewToken);return;}
  const timer=setInterval(()=>{if(A.isReady()){clearInterval(timer);A.render();sync().catch(()=>{});}},100);
  setInterval(()=>sync().catch(()=>{}),30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(()=>{});});
  async function reviewPage(secret){
    document.querySelector('.workspace').hidden=true;document.title='A post for your review — NextSocial';
    const page=A.el('main','review-page');document.body.append(page);
    const viewport=window.visualViewport;
    const fitKeyboard=()=>{const offset=H.viewportGeometry(window.innerHeight,viewport).bottom;page.style.setProperty('--review-keyboard',offset+'px');};
    viewport?.addEventListener('resize',fitKeyboard);viewport?.addEventListener('scroll',fitKeyboard);fitKeyboard();
    const head=A.el('header','review-header'),brand=A.el('a','wordmark','NextSocial'),brandIcon=A.el('img','review-brand-icon');brandIcon.src='icon.svg';brandIcon.alt='';brand.prepend(brandIcon);brand.href=location.pathname;head.append(brand,A.el('span','review-topnote','A SECOND PAIR OF EYES'));page.append(head);
    const content=A.el('div','review-content');page.append(content);
    function unavailable(title,copy,retry=false){
      page.classList.remove('review-awaiting');content.removeAttribute('aria-busy');
      const panel=A.el('section','review-empty'),mark=A.el('div','review-empty-mark');mark.setAttribute('aria-hidden','true');mark.append(A.icon('send'));
      panel.append(mark,A.el('h1','',title),A.el('p','subtitle',copy));
      if(retry)panel.append(A.button('Try again','text-button',load,'repeat'));
      content.replaceChildren(panel);window.HubMotion?.enter(panel);
    }
    async function load(){
      const loading=A.el('p','review-loading','Opening your review…');loading.setAttribute('role','status');content.replaceChildren(loading);
      if(!TOKEN.test(secret)){unavailable('This link isn’t quite right.','Ask the sender for a new approval link.');return;}
      try{const p=await request('/api/review',secret);draw(p);}
      catch(e){unavailable(e.status===410?'This link has expired.':e.status===404?'This review is unavailable.':'Couldn’t open the review.',e.status===410?'Good ideas don’t expire. This link has, though. Ask the sender for a fresh one. Nothing has been approved.':e.status===404?'The sender may have removed this review. Ask them for a fresh approval link.':'Check your connection, then give it another try. Your response has not been sent.',![404,410].includes(e.status));}
    }
    await load();
    function draw(p,justResponded=false){
      page.classList.remove('review-awaiting');
      content.replaceChildren(A.el('p','eyebrow','SENT FOR YOUR REVIEW'),A.el('h1','',p.title||'A post for your review.'),A.el('p','subtitle',`${p.platform} · ${H.dateLabel(p.plannedDate)}`));
      const grid=A.el('div','review-grid'),preview=A.el('div','review-preview'),form=A.el('div','review-response');
      const card=A.postPreview(p,p.platform,p.image);
      const cropped=Math.abs(H.previewRatio(p.platform,p.width,p.height)-p.width/p.height)>.001;
      preview.append(card,A.el('p','preview-note',cropped?'Feed preview crops the edges to fit this platform. Your feedback applies to this version.':'Feed preview · Full image, original proportions.'));grid.append(preview,form);content.append(grid);
      if(p.decision!=='pending'){
        page.classList.add('review-complete');
        const confirmation=A.el('section','review-confirmation'+(justResponded?' is-new':''));confirmation.setAttribute('aria-label','Review response');
        const heading=A.el('h2','',p.decision==='approved'?'That’s a green light.':'Feedback, delivered.');heading.tabIndex=-1;
        const mark=A.el('div','review-confirmation-mark');mark.setAttribute('aria-hidden','true');mark.append(A.icon(p.decision==='approved'?'check':'comment'));
        confirmation.append(mark,A.el('p','eyebrow','RESPONSE SAVED'),heading,A.el('p','',p.decision==='approved'?'Post approved. You’re all done—the sender can take it from here.':'Changes requested. Your note is with the sender. Thanks for the second pair of eyes.'));
        if(p.feedback)confirmation.append(A.el('blockquote','review-feedback',p.feedback));
        content.insertBefore(confirmation,grid);form.hidden=true;
        if(justResponded){window.HubMotion?.enter(confirmation,10);heading.focus({preventScroll:true});confirmation.scrollIntoView({block:'start',behavior:'instant'});}
        return;
      }
      page.classList.remove('review-complete');window.HubMotion?.enter(grid,6);
      form.append(A.el('h2','','Give it the green light.'),A.el('p','review-copy','Take a look. Love it? Approve it. A small tweak? Leave a note.'));
      const nameLabel=A.el('label','','Your name');nameLabel.htmlFor='review-name';const name=A.el('input');name.id='review-name';name.maxLength=100;name.placeholder='Optional';name.autocomplete='name';
      const noteLabel=A.el('label','','A note for the sender');noteLabel.htmlFor='review-note';const note=A.el('textarea');note.id='review-note';note.rows=4;note.maxLength=2000;note.placeholder='Anything you’d like to change?';
      const error=A.el('p','review-error');error.id='review-error';error.setAttribute('role','alert');note.setAttribute('aria-describedby','review-error');
      note.addEventListener('input',()=>{if(note.value.trim()){note.removeAttribute('aria-invalid');error.textContent='';}});
      const extras=A.el('details','review-extras'),summary=A.el('summary','','Add your name or a note'),fields=A.el('div','review-fields');fields.append(nameLabel,name,noteLabel,note);extras.append(summary,fields);window.HubMotion?.disclosure(extras);extras.addEventListener('toggle',()=>{if(extras.open)window.HubMotion?.enter(fields,4);});
      const actions=A.el('div','review-actions');
      const approve=A.button('Approve post','primary',()=>respond('approved'),'check'),changes=A.button('Request changes','secondary',()=>respond('changes'));actions.append(approve,changes);
      form.append(extras,error,actions,A.el('p','field-hint','No account needed. Your response goes straight to the sender.'));
      page.classList.add('review-awaiting');
      async function respond(decision){
        error.textContent='';note.removeAttribute('aria-invalid');if(decision==='changes'&&!note.value.trim()){extras.open=true;note.setAttribute('aria-invalid','true');error.textContent='What would you like changed? Add a quick note, then send it.';note.focus();return;}
        approve.disabled=changes.disabled=true;(decision==='approved'?approve:changes).setAttribute('aria-busy','true');approve.textContent=decision==='approved'?'Saving approval…':'Approve post';changes.textContent=decision==='changes'?'Sending…':'Request changes';
        try{const result=await request('/api/review',secret,'POST',{decision,reviewer:name.value,feedback:note.value});draw({...p,...result},true);}
        catch(e){approve.removeAttribute('aria-busy');changes.removeAttribute('aria-busy');error.textContent=e.message;if(e.status===410){page.classList.remove('review-awaiting');actions.remove();error.textContent='This link has expired. Ask the sender for a fresh approval link. Your response was not saved.';}else{approve.disabled=changes.disabled=false;approve.textContent='Approve post';changes.textContent='Request changes';}error.tabIndex=-1;error.focus();error.scrollIntoView({block:'center'});}
      }
    }
  }
})();
