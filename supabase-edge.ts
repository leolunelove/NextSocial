import { api } from './approval.mjs';
import { SupabaseBucket } from './supabase-bucket.mjs';

const allowed = new Set(['https://nextsocial.leolune.fun','https://leolunelove.github.io','http://127.0.0.1:8765','http://localhost:8765']);
Deno.serve(async (request: Request) => {
  const origin=request.headers.get('origin');
  if(origin && !allowed.has(origin))return new Response('Origin not allowed',{status:403});
  const cors={'Access-Control-Allow-Origin':origin||'https://leolunelove.github.io','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const url=new URL(request.url);
  url.pathname=url.pathname.replace(/^\/social-hub-reviews/,'').replace(/^\/functions\/v1\/social-hub-reviews/,'');
  // The shared API validates unguessable review/owner capabilities itself.
  // Platform JWT verification is disabled because reviewers have no accounts.
  const bucket=new SupabaseBucket(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const response=await api(new Request(url,request),{BUCKET:bucket});
  const headers=new Headers(response.headers);for(const [k,v] of Object.entries(cors))headers.set(k,v);
  return new Response(response.body,{status:response.status,headers});
});
