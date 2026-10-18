(() => {
  'use strict';
  const A=window.HubApp,H=window.Hub,S=window.PostStore,$=id=>document.getElementById(id);
  const HOST='https://leolunelove.github.io/NextSocial';
  const LEGACY_HOST='https://leolunelove.github.io/social-hub';
  const API='https://qbkrqibmolaetilruxki.supabase.co/functions/v1/social-hub-reviews';
  const TOKEN=/^[a-f0-9]{64}$/;
  let sharing=false,syncing=false;
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
    if(!s||!TOKEN.test(s.reviewToken)||!TOKEN.test(s.ownerToken)||(s.id&&!TOKEN.test(s.id))||!['creating','ready'].includes(s.state)||![API,HOST,LEGACY_HOST,'https://social-hub-studio.leolunelove.chatgpt.site','http://localhost:8765','http://127.0.0.1:8765'].includes(s.origin)||!['pending','approved','changes','expired','revoked'].includes(s.decision)||!Number.isFinite(s.expiresAt))throw new Error('This backup has invalid approval-link data.');
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
    catch{if(A.current()?.id!==p.id)A.openEditor(p.id);editorState(p);$('approval-url')?.focus();$('approval-url')?.select();A.toast('Copy the selected approval link.');}
  }
  function statusLabel(p){
    if(p.status!=='pending'||!p.share)return null;
    return {pending:p.share.state==='creating'?'Link not sent yet':'Waiting for approval',approved:'Approved',changes:'Changes requested',expired:'Approval link expired',revoked:'Approval link unavailable'}[p.share.decision];
  }
  function editorState(p){
    if(!p)return;const has=!!p.share,posted=p.status==='posted';
    for(const id of ['post-title','post-caption','post-date'])$(id).disabled=has||posted;
    document.querySelectorAll('.platform-choice').forEach(b=>b.disabled=has||posted);
    $('self-approve').hidden=p.status!=='pending';$('revoke-link').hidden=!has||posted;
    $('secondary-action').hidden=p.status!=='approved'||has;
    $('share-explainer').hidden=has||p.status!=='pending';
    $('copy-caption').style.display=p.status==='pending'?'none':'inline-flex';
    $('editor-status').textContent=statusLabel(p)||{pending:'Draft',approved:'Approved',posted:'Posted'}[p.status];
    $('editor-action').textContent=p.status==='posted'?'Back to Pending':p.status==='approved'?'Mark as Posted':has?(p.share.state==='creating'?'Retry approval link':p.share.decision==='expired'||p.share.decision==='revoked'?'Replace approval link':'Copy approval link'):'Create approval link';
    $('editor-action').disabled=sharing;
    const info=$('share-info');info.replaceChildren();info.hidden=!has;
    if(has){
      const title=A.el('strong','',p.share.decision==='approved'?'A green light.':p.share.decision==='changes'?'A little feedback.':p.share.decision==='expired'?'Time for a fresh link.':p.share.state==='creating'?'Your link is not ready yet.':'Ready for a second pair of eyes.');
      info.append(title);
      const summary=p.share.decision==='approved'?`Approved${p.share.reviewer?' by '+p.share.reviewer:''}.`:p.share.decision==='changes'?`${p.share.reviewer||'Your reviewer'} requested changes.`:p.share.state==='creating'?'Retry to finish uploading this review copy.':`Available until ${new Date(p.share.expiresAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}. Anyone with this link can respond.`;
      info.append(A.el('p','',summary));
      if(p.share.feedback)info.append(A.el('blockquote','',p.share.feedback));
      if(p.share.state==='ready'){
        const input=A.el('input');input.id='approval-url';input.readOnly=true;input.value=link(p);input.setAttribute('aria-label','Approval link');input.addEventListener('click',()=>input.select());info.append(input);
        const controls=A.el('div','share-controls');controls.append(A.button('Check for a response','text-button',()=>sync(true)),A.button('Revoke link','text-button',()=>revokeAndRefresh(p)));info.append(controls);
      }
      $('date-note').textContent='This is the exact version your reviewer sees. Choose “Edit & replace link” to change it.';
    }
  }
  async function createLink(p){
    if(sharing)return;sharing=true;A.setBusy(true);$('editor-action').disabled=true;
    try{
      await A.flushSave();p=A.current()||p;
      if(!p.share){
        // Check availability before freezing a local draft for a shared snapshot.
        await request('/api/health','');
        const share={reviewToken:makeToken(),ownerToken:makeToken(),id:'',state:'creating',origin:API,decision:'pending',expiresAt:Date.now()+7*86400000,reviewer:'',feedback:'',decidedAt:null};
        await S.update(p.id,post=>({...post,share,status:'pending',approvedAt:null}));await A.refresh();p=A.current()||A.all().find(x=>x.id===p.id);
      }
      editorState(p);A.toast('Making a private review copy…');
      const image=await reviewImage(p);
      const result=await request('/api/reviews',p.share.ownerToken,'POST',{reviewToken:p.share.reviewToken,title:p.title,caption:p.caption,platform:p.platform,plannedDate:p.plannedDate,...image},endpoint(p.share));
      await S.update(p.id,post=>({...post,share:{...post.share,id:result.id,state:'ready',expiresAt:result.expiresAt}}));
      await A.refresh();A.notify();A.fillEditor();await copyLink(A.current());
    }finally{sharing=false;A.setBusy(false);if(A.current())editorState(A.current());}
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
      if(['expired','revoked'].includes(p.share.decision)||p.share.expiresAt<=Date.now()){await revoke(p);await A.refresh();return createLink(A.current());}
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
      else if(visible)A.toast('No new response yet.');
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
    const fitKeyboard=()=>{const offset=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;page.style.setProperty('--review-keyboard',offset+'px');};
    viewport?.addEventListener('resize',fitKeyboard);viewport?.addEventListener('scroll',fitKeyboard);fitKeyboard();
    const head=A.el('header','review-header'),brand=A.el('a','wordmark','NextSocial');brand.href=location.pathname;head.append(brand,A.el('span','review-topnote','A SECOND PAIR OF EYES'));page.append(head);
    const content=A.el('div','review-content');content.append(A.el('p','eyebrow','SENT FOR YOUR REVIEW'),A.el('h1','','One moment.'));page.append(content);
    if(!TOKEN.test(secret)){content.replaceChildren(A.el('h1','','This link isn’t quite right.'),A.el('p','subtitle','Ask the sender for a new approval link.'));return;}
    try{
      const p=await request('/api/review',secret);draw(p);
    }catch(e){content.replaceChildren(A.el('p','eyebrow','NEXTSOCIAL'),A.el('h1','',e.status===410?'This link has expired.':'This review is unavailable.'),A.el('p','subtitle',e.status===410?'Ask the sender for a fresh approval link. Your post has not been approved.':e.message));}
    function draw(p,justResponded=false){
      page.classList.remove('review-awaiting');
      content.replaceChildren(A.el('p','eyebrow','SENT FOR YOUR REVIEW'),A.el('h1','',p.title||'A post for your review.'),A.el('p','subtitle',`${p.platform} · ${H.dateLabel(p.plannedDate)}`));
      const grid=A.el('div','review-grid'),preview=A.el('div','review-preview'),form=A.el('div','review-response');
      const card=A.postPreview(p,p.platform,p.image);
      const cropped=Math.abs(H.previewRatio(p.platform,p.width,p.height)-p.width/p.height)>.001;
      preview.append(card,A.el('p','preview-note',cropped?'Feed preview crops the edges to fit this platform. Your feedback applies to this version.':'Feed preview · Full image, original proportions.'));grid.append(preview,form);content.append(grid);
      if(p.decision!=='pending'){
        page.classList.add('review-complete');
        const confirmation=A.el('section','review-confirmation');confirmation.setAttribute('aria-label','Review response');
        const heading=A.el('h2','',p.decision==='approved'?'Post approved.':'Changes requested.');heading.tabIndex=-1;
        const mark=A.el('div','review-confirmation-mark');mark.setAttribute('aria-hidden','true');mark.append(A.icon(p.decision==='approved'?'check':'comment'));
        confirmation.append(mark,A.el('p','eyebrow','RESPONSE SAVED'),heading,A.el('p','',p.decision==='approved'?'You’re all done. The sender can see your approval.':'You’re all done. Your feedback has been sent to the sender.'));
        if(p.feedback)confirmation.append(A.el('blockquote','review-feedback',p.feedback));
        content.insertBefore(confirmation,grid);form.hidden=true;
        if(justResponded){heading.focus({preventScroll:true});confirmation.scrollIntoView({block:'start',behavior:'instant'});}
        return;
      }
      page.classList.remove('review-complete');
      form.append(A.el('h2','','Ready to post?'),A.el('p','review-copy','Check the post above, then approve it or ask for a change.'));
      const nameLabel=A.el('label','','Your name');nameLabel.htmlFor='review-name';const name=A.el('input');name.id='review-name';name.maxLength=100;name.placeholder='Optional';name.autocomplete='name';
      const noteLabel=A.el('label','','A note for the sender');noteLabel.htmlFor='review-note';const note=A.el('textarea');note.id='review-note';note.rows=4;note.maxLength=2000;note.placeholder='Anything you’d like to change?';
      const error=A.el('p','review-error');error.setAttribute('role','alert');
      const extras=A.el('details','review-extras'),summary=A.el('summary','','Add your name or a note');extras.append(summary,nameLabel,name,noteLabel,note);
      const actions=A.el('div','review-actions');
      const approve=A.button('Approve post','primary',()=>respond('approved'),'check'),changes=A.button('Request changes','secondary',()=>respond('changes'));actions.append(approve,changes);
      form.append(extras,error,actions,A.el('p','field-hint','No account needed. Your response goes straight to the sender.'));
      page.classList.add('review-awaiting');
      async function respond(decision){
        error.textContent='';if(decision==='changes'&&!note.value.trim()){extras.open=true;error.textContent='Leave a short note so the sender knows what to change, then tap Request changes.';note.focus();return;}
        approve.disabled=changes.disabled=true;approve.textContent=decision==='approved'?'Saving approval…':'Approve post';changes.textContent=decision==='changes'?'Sending…':'Request changes';
        try{const result=await request('/api/review',secret,'POST',{decision,reviewer:name.value,feedback:note.value});draw({...p,...result},true);}
        catch(e){error.textContent=e.message;if(e.status===410){page.classList.remove('review-awaiting');actions.remove();error.textContent='This link has expired. Ask the sender for a fresh approval link. Your response was not saved.';}else{approve.disabled=changes.disabled=false;approve.textContent='Approve post';changes.textContent='Request changes';}error.tabIndex=-1;error.focus();error.scrollIntoView({block:'center'});}
      }
    }
  }
})();
