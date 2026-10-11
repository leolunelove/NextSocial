// Capability-based review copies. No workspace listing or account database.
const TOKEN = /^[a-f0-9]{64}$/;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 768 * 1024;
const MAX_ACTIVE = 20;
export async function hash(text) { const b = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
class Problem extends Error { constructor(status,message) { super(message); this.status=status; } }
function fail(status,message) { throw new Problem(status,message); }
function json(value,status=200) { return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}}); }
async function body(request,max=MAX_BODY) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'Use JSON for this request.');
  if (Number(request.headers.get('content-length')) > max) fail(413,'This review copy is too large.');
  const reader=request.body?.getReader(); if(!reader)fail(400,'Missing request body.');
  let total=0,parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();fail(413,'This review copy is too large.');}parts.push(value);}
  const bytes=new Uint8Array(total);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid request.');}
}
function token(request) { const t=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!TOKEN.test(t))fail(404,'This review link is unavailable.');return t; }
function publicRecord(r,includeImage=true) {
  return {title:r.title,caption:r.caption,platform:r.platform,plannedDate:r.plannedDate,width:r.width,height:r.height,...(includeImage?{image:r.image}:{}),createdAt:r.createdAt,expiresAt:r.expiresAt,decision:r.decision,decidedAt:r.decidedAt,reviewer:r.reviewer,feedback:r.feedback};
}
async function read(bucket,key,now) {
  const obj=await bucket.get(key);if(!obj)fail(404,'This review link was revoked or does not exist.');
  const record=await obj.json();if(record.expiresAt<=now)fail(410,'This review link has expired. Ask for a fresh link.');
  return {obj,record};
}
async function capacity(bucket,id,expiresAt,now) {
  // Conditional writes make the storage ceiling hold even under concurrent creates.
  for(let n=0;n<6;n++){
    const object=await bucket.get('capacity');const entries=object?await object.json():[];
    const active=entries.filter(x=>x.expiresAt>now);
    const same=active.find(x=>x.id===id);if(same)return;
    if(active.length>=MAX_ACTIVE)fail(429,'The 20-link review space is full. Revoke an old link or try again after a link expires.');
    const next=[...active,{id,expiresAt}];
    const saved=await bucket.put('capacity',JSON.stringify(next),{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});
    if(saved){const expired=entries.filter(x=>x.expiresAt<=now);if(expired.length)await bucket.delete(expired.map(x=>'reviews/'+x.id));return;}
  }
  fail(409,'A review is being saved. Please try again.');
}
async function release(bucket,id) {
  for(let n=0;n<6;n++){
    const obj=await bucket.get('capacity');if(!obj)return;
    const entries=await obj.json();const next=entries.filter(x=>x.id!==id);if(entries.length===next.length)return;
    if(await bucket.put('capacity',JSON.stringify(next),{onlyIf:{etagMatches:obj.etag}}))return;
  }
}
function snapshot(data) {
  for(const [key,max] of [['title',200],['caption',20000]]) if(typeof data[key]!=='string'||data[key].length>max)fail(400,'Invalid post details.');
  if(!['Instagram','LinkedIn','X','Facebook'].includes(data.platform))fail(400,'Choose a platform.');
  if(typeof data.plannedDate!=='string'||(data.plannedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(data.plannedDate)))fail(400,'Invalid planned date.');
  if(data.plannedDate){const d=new Date(data.plannedDate+'T12:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==data.plannedDate)fail(400,'Invalid planned date.');}
  if(!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<1||data.height<1||data.width>2400||data.height>2400)fail(400,'Invalid review image dimensions.');
  if(typeof data.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image)||data.image.length>700000)fail(400,'Use a review image smaller than 512 KB.');
  let binary;try{binary=atob(data.image.split(',')[1]);}catch{fail(400,'Invalid review image.');}
  if(binary.length>512*1024)fail(413,'Use a review image smaller than 512 KB.');
  const mime=data.image.slice(5,data.image.indexOf(';'));
  if(!(mime==='image/jpeg'&&binary.startsWith('\xff\xd8\xff'))&&!(mime==='image/png'&&binary.startsWith('\x89PNG\r\n\x1a\n'))&&!(mime==='image/webp'&&binary.startsWith('RIFF')&&binary.slice(8,12)==='WEBP'))fail(400,'The review image is not a supported image.');
  return {title:data.title,caption:data.caption,platform:data.platform,plannedDate:data.plannedDate,width:data.width,height:data.height,image:data.image};
}
export async function api(request,env,now=Date.now()) {
  const url=new URL(request.url);const route=url.pathname;
  try{
    if(!env.BUCKET)fail(503,'Approval links are not available yet. Your local post is safe.');
    if(route==='/api/health'&&request.method==='GET')return json({ready:true});
    if(route==='/api/reviews'&&request.method==='POST'){
      const owner=token(request);const data=await body(request);if(!TOKEN.test(data.reviewToken))fail(400,'Invalid review key.');
      if(owner===data.reviewToken)fail(400,'Use separate owner and review keys.');
      const id=await hash(data.reviewToken),ownerHash=await hash(owner),key='reviews/'+id;
      const old=await env.BUCKET.get(key);
      if(old){const record=await old.json();if(record.ownerHash!==ownerHash)fail(409,'This link already exists.');if(record.expiresAt<=now)fail(410,'This link has expired. Create a new link.');return json({id,expiresAt:record.expiresAt});}
      const details=snapshot(data),expiresAt=now+WEEK;
      await capacity(env.BUCKET,id,expiresAt,now);
      const record={...details,ownerHash,createdAt:new Date(now).toISOString(),expiresAt,decision:'pending',decidedAt:null,reviewer:'',feedback:''};
      const result=await env.BUCKET.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'}});
      if(!result)fail(409,'This link is already being created. Please retry.');
      return json({id,expiresAt},201);
    }
    if(route==='/api/review'&&(request.method==='GET'||request.method==='POST')){
      const id=await hash(token(request)),key='reviews/'+id;const {obj,record}=await read(env.BUCKET,key,now);
      if(request.method==='GET')return json(publicRecord(record));
      const data=await body(request,12000);
      if(!['approved','changes'].includes(data.decision)||typeof data.reviewer!=='string'||data.reviewer.length>100||typeof data.feedback!=='string'||data.feedback.length>2000)fail(400,'Please check your response.');
      if(data.decision==='changes'&&!data.feedback.trim())fail(400,'Add a short note about what needs changing.');
      if(record.decision!=='pending')fail(409,'A response has already been submitted for this version.');
      const updated={...record,decision:data.decision,reviewer:data.reviewer.trim(),feedback:data.feedback.trim(),decidedAt:new Date(now).toISOString()};
      const saved=await env.BUCKET.put(key,JSON.stringify(updated),{onlyIf:{etagMatches:obj.etag}});
      if(!saved)fail(409,'This link changed while you were reviewing it. Reload to see the latest state.');
      return json(publicRecord(updated,false));
    }
    const ownerRoute=route.match(/^\/api\/manage\/([a-f0-9]{64})$/);
    if(ownerRoute&&['GET','DELETE'].includes(request.method)){
      const ownerHash=await hash(token(request)),id=ownerRoute[1],key='reviews/'+id;
      const obj=await env.BUCKET.get(key);
      if(!obj){if(request.method==='DELETE')return json({revoked:true});fail(404,'This review copy no longer exists.');}
      const record=await obj.json();if(record.ownerHash!==ownerHash)fail(404,'This review copy is unavailable.');
      if(request.method==='DELETE'){await env.BUCKET.delete(key);await release(env.BUCKET,id);return json({revoked:true});}
      if(record.expiresAt<=now) return json({...publicRecord(record,false),decision:'expired'});
      return json(publicRecord(record,false));
    }
    return json({error:'Not found.'},404);
  }catch(e){if(!(e instanceof Problem))console.error('Approval storage operation failed');return json({error:e instanceof Problem?e.message:'Could not save the review. Please try again.'},e.status||503);}
}
