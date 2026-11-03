/**
 * 页头的网站名称（网站配置 → 基本信息 → company_name）。名称缓存在浏览器的 localStorage 中，
 * 下次打开时先显示缓存，再向平台读取最新值。缓存只记平台地址的指纹，不保存地址本身；换了平台就不会用错名称。
 */
const KEY='cubemanage.site-name';
export const SITE_NAME_EVENT='cubemanage:site-name-changed';

/** FNV-1a: a short, one-way key for "which platform this name belongs to". */
function fingerprint(text:string){let h=0x811c9dc5;for(const ch of text){h^=ch.codePointAt(0)!;h=Math.imul(h,0x01000193)>>>0;}return h.toString(36);}

export function cachedSiteName(platform:string){
 try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&v.k===fingerprint(platform)&&typeof v.name==='string'?v.name:'';}catch{return '';}
}
export function cacheSiteName(platform:string,name:string){
 try{if(name)localStorage.setItem(KEY,JSON.stringify({k:fingerprint(platform),name}));else localStorage.removeItem(KEY);}catch{/* storage unavailable: just no cache */}
}
