// A minimal PostgREST adapter for the same conditional-write storage contract.
// The secret is supplied by the Edge runtime and never sent to the browser.
export class SupabaseBucket {
  constructor(url, secret, fetcher=fetch) {
    this.base=url.replace(/\/$/,'')+'/rest/v1';
    this.headers={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'};
    this.fetcher=fetcher;
  }
  key(key) { if(!/^(capacity|reviews\/[a-f0-9]{64})$/.test(key))throw new Error('Invalid storage key'); return key; }
  async request(path,method='GET',body) {
    const res=await this.fetcher(this.base+path,{method,headers:this.headers,...(body?{body:JSON.stringify(body)}:{})});
    if(!res.ok)throw new Error('Review storage unavailable');
    return res.status===204?null:res.json();
  }
  async get(key) {
    const rows=await this.request('/social_hub_review_objects?key=eq.'+encodeURIComponent(this.key(key))+'&select=body,etag');
    const row=rows[0];return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;
  }
  async put(key,body,options={}) {
    const etag=crypto.randomUUID();
    const saved=await this.request('/rpc/social_hub_review_put','POST',{
      p_key:this.key(key),p_body:body,p_etag:etag,
      p_expected:options.onlyIf?.etagMatches||null,p_create:options.onlyIf?.etagDoesNotMatch==='*'
    });
    return saved?{etag:saved}:null;
  }
  async delete(keys) {
    const list=(Array.isArray(keys)?keys:[keys]).map(k=>'"'+this.key(k)+'"').join(',');
    await this.request('/social_hub_review_objects?key=in.'+encodeURIComponent('('+list+')'),'DELETE');
  }
}
