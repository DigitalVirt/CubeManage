import {readFileSync} from 'node:fs';
/** package.json version, sent as the User-Agent. */
const APP_VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {normalizeBase} from './config.mjs';
export class HttpError extends Error{constructor(status,message,details){super(message);this.status=status;this.details=details;}}
/** A request that never got an answer: timed out (the platform may still be working on it) or could not connect at all. */
function transportError(e,method){
 if(e?.name==='TimeoutError'||e?.name==='AbortError')return new HttpError(504,method==='GET'?'平台响应超时，请稍后刷新重试':'平台响应超时：操作可能仍在平台上执行，请稍后刷新查看结果，不要重复提交');
 return new HttpError(502,'连接平台失败，请检查地址、网络和 TLS 证书');
}
const privateField=/(password|rootpass|rootpw|secret|token|accesshash|private[_-]?key|ssh_pass|ssh_key|vncpass|vnc_ssl_key|vnc_ssl_pem|authorization)/i;
export function scrub(value){
 if(Array.isArray(value))return value.map(scrub);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!privateField.test(k)&&k!=='key').map(([k,v])=>[k,scrub(v)]));
 return value;
}
function formEncode(body){const form=new URLSearchParams();const add=(key,value)=>{if(Array.isArray(value))value.forEach((v,i)=>add(`${key}[${i}]`,v));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>add(`${key}[${k}]`,v));else if(value!==undefined&&value!==null)form.append(key,typeof value==='boolean'?(value?'1':'0'):String(value));};Object.entries(body||{}).forEach(([k,v])=>add(k,v));return form.toString();}
export class CubeClient {
 constructor(config,{transport=fetch}={}){this.config=config;this.transport=transport;this.token=null;this.expiresAt=0;this.loginPending=null;}
 redact(message){let text=String(message);for(const value of [this.config.password,this.token])if(value)text=text.split(value).join('***');return text.slice(0,800);}
 async login(){
  if(this.token&&this.expiresAt>Date.now()+(this.config.password?30000:0))return this.token;
  if(this.loginPending)return this.loginPending;
  // The password is only present while logging in; afterwards the session lives on the token alone and ends with it.
  if(!this.config.password)throw new HttpError(401,'平台登录已过期，请重新登录');
  this.loginPending=(async()=>{
   const response=await this.raw('POST','login',{username:this.config.username,password:this.config.password},false);
   const data=response?.data??response;const token=typeof data==='string'?data:data?.access_token||data?.['access-token']||data?.token;
   if(typeof token!=='string'||!token)throw new HttpError(502,'平台登录未返回有效的 access-token，请核对管理端 API 地址和账号');
   this.token=token;this.expiresAt=Date.now()+Math.min(Math.max(Number(data?.expires_in)||86400,60),86400)*1000;
   this.config={...this.config,password:undefined};return token; // forget the password once logged in
  })();try{return await this.loginPending;}finally{this.loginPending=null;}
 }
 async raw(method,route,body,auth=true,query={}){
  const base=normalizeBase(this.config.baseUrl);
  if(!/^[a-zA-Z0-9_/-]+$/.test(route)||route.split('/').some(p=>p==='..'))throw new HttpError(400,'不允许的接口路径');
  const url=new URL(base+'/v1/'+route);
  for(const [k,v]of Object.entries(query))if(v!==''&&v!=null){if(Array.isArray(v))v.forEach(item=>url.searchParams.append(k+'[]',String(item)));else url.searchParams.set(k,String(v));}
  const headers={Accept:'application/json','User-Agent':'CubeManage/'+APP_VERSION};
  if(auth)headers['access-token']=this.token;
  // 读取 30 秒；写操作（取消迁移、删除、重装等批量接口）平台处理较慢，等 120 秒。
  const options={method,headers,redirect:'error',signal:AbortSignal.timeout(method==='GET'?30000:120000)};
  if(body!==undefined){headers['Content-Type']=this.config.bodyEncoding==='json'?'application/json':'application/x-www-form-urlencoded';options.body=this.config.bodyEncoding==='json'?JSON.stringify(body):formEncode(body);}
  let response;try{response=await this.transport(url,options);}catch(e){throw transportError(e,method);}
  let result;const text=await response.text();try{result=text.trim()?JSON.parse(text):null;}catch{throw new HttpError(502,`平台返回非 JSON 内容（HTTP ${response.status}），请核对 API 目录或网站防护规则`);}
  if(!response.ok)throw new HttpError(response.status===401?401:response.status===403?403:502,this.redact(typeof result?.error==='string'?result.error:result?.message||`平台请求失败（HTTP ${response.status}）`));
  if(result&&typeof result==='object'&&result.error)throw new HttpError(422,this.redact(typeof result.error==='string'?result.error:JSON.stringify(result.error)));
  if(result&&typeof result==='object'&&typeof result.status==='number'&&result.status>=400)throw new HttpError(422,this.redact(result.msg||result.message||'平台拒绝执行此操作'));
  return result;
 }
 async request(method,route,{body,query={}}={}){
  await this.login();
  try{return await this.raw(method,route,body,true,query);}catch(e){if(e.status!==401)throw e;this.token=null;throw new HttpError(401,'平台登录已过期，请重新登录');}
 }
 /** For endpoints that answer with a file (CSV export), not JSON. Same auth, timeout and retry. */
 async requestText(method,route,{query={}}={}){
  await this.login();
  const attempt=async()=>{
   if(!/^[a-zA-Z0-9_/-]+$/.test(route)||route.split('/').some(p=>p==='..'))throw new HttpError(400,'不允许的接口路径');
   const url=new URL(normalizeBase(this.config.baseUrl)+'/v1/'+route);
   for(const [k,v]of Object.entries(query))if(v!==''&&v!=null){if(Array.isArray(v))v.forEach(item=>url.searchParams.append(k+'[]',String(item)));else url.searchParams.set(k,String(v));}
   let response;try{response=await this.transport(url,{method,headers:{Accept:'text/csv,*/*','User-Agent':'CubeManage/'+APP_VERSION,'access-token':this.token},redirect:'error',signal:AbortSignal.timeout(60000)});}catch(e){throw transportError(e,'GET');}
   if(response.status===401)throw new HttpError(401,'平台令牌已失效');
   const text=await response.text();
   if(!response.ok)throw new HttpError(502,this.redact(`平台请求失败（HTTP ${response.status}）`));
   if(/^\s*\{/.test(text)){try{const j=JSON.parse(text);if(j?.error||typeof j?.status==='number'&&j.status>=400)throw new HttpError(422,this.redact(j.error||j.msg||j.message||'平台拒绝导出'));}catch(e){if(e instanceof HttpError)throw e;}}
   return text;
  };
  try{return await attempt();}catch(e){if(e.status!==401)throw e;this.token=null;throw new HttpError(401,'平台登录已过期，请重新登录');}
 }
 route(resource,id){const route=this.config.routes?.[resource]||resource;if(!/^[A-Za-z0-9_/-]+$/.test(route))throw new HttpError(500,'资源路由配置无效');return id?route+'/'+id:route;}
 mapBody(resource,body){return Object.fromEntries(Object.entries(body).map(([key,value])=>[this.config.fieldMap?.[resource]?.[key]||key,value]));}
}
export function listResult(value,page=1,perPage=20){
 const rows=Array.isArray(value)?value:Array.isArray(value?.data)?value.data:Array.isArray(value?.data?.data)?value.data.data:[];
 const meta=value?.meta||value?.data?.meta||{};
 return {data:scrub(rows),meta:{page:Number(meta.current_page??meta.page??page),per_page:Number(meta.per_page??perPage),total:Number(meta.total??rows.length),total_pages:Number(meta.last_page??meta.total_page??meta.total_pages??Math.max(1,Math.ceil((meta.total??rows.length)/perPage)))}};
}
