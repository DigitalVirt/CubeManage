/**
 * 登录过的平台地址，保存在浏览器的 localStorage 里，下次登录时可以直接从下拉框选择。
 * 只保存地址：用户名、密码和令牌都不保存。最近登录的排在最前面，最多保留 10 个。
 * 存储不可用（隐私模式、禁用站点数据）时什么也不做，登录页照常手动输入。
 */
const KEY='cubemanage.platforms';
const MAX=10;

const same=(a:string,b:string)=>a.replace(/\/+$/,'').toLowerCase()===b.replace(/\/+$/,'').toLowerCase();

export function loadPlatforms():string[]{
 try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&/^https?:\/\//i.test(x)).slice(0,MAX):[];}
 catch{return [];}
}

function save(list:string[]){try{if(list.length)localStorage.setItem(KEY,JSON.stringify(list.slice(0,MAX)));else localStorage.removeItem(KEY);}catch{/* storage unavailable */}}

/** 登录成功后调用：把地址移到最前面（去掉末尾的斜杠，忽略大小写去重）。 */
export function rememberPlatform(url:string){
 const clean=url.trim().replace(/\/+$/,'');if(!/^https?:\/\//i.test(clean))return;
 save([clean,...loadPlatforms().filter(x=>!same(x,clean))]);
}

export function forgetPlatform(url:string){const list=loadPlatforms().filter(x=>!same(x,url));save(list);return list;}
