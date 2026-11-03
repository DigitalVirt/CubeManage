export type Row=Record<string,any>;
export type Session={username:string;baseUrl:string;csrf:string;expires?:string};
export type List={data:Row[];meta:{page:number;per_page:number;total:number;total_pages:number}};
export class ApiError extends Error{fields?:Record<string,string>;status:number;constructor(message:string,status:number,fields?:Record<string,string>){super(message);this.status=status;this.fields=fields;}}
let csrf='',platformOrigin='';
export function setSession(session:Session|null){csrf=session?.csrf||'';try{platformOrigin=session?.baseUrl?new URL(session.baseUrl).origin:'';}catch{platformOrigin='';}}
/** OS icon served by the platform itself (public, no auth): {platform origin}/common/system/{svg}.svg — the same path its own admin UI uses. */
export function osIconUrl(svg:unknown){return platformOrigin&&svg!=null&&svg!==''&&/^\d+$/.test(String(svg))?`${platformOrigin}/common/system/${svg}.svg`:'';}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{const res=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers}});let data;try{data=await res.json();}catch{throw new ApiError('服务返回了无效响应，请检查本地服务是否启动',res.status);}if(!res.ok){if(res.status===401&&!path.includes('login'))window.dispatchEvent(new Event('session-expired'));throw new ApiError(data.error||'请求失败',res.status,data.fields);}return data;}
export const send=(method:string,body:unknown)=>({method,body:JSON.stringify(body)});
/** 页面告诉页头自己的标签页标题（例如实例详情的主机名）：window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT,{detail:{path,title}})) */
export const PAGE_TITLE_EVENT='cubemanage:page-title';
export const titles:Record<string,string>={images:'镜像管理',isos:'ISO 管理',users:'用户管理','system-logs':'系统日志','login-logs':'登录日志','task-logs':'任务日志','adsl-logs':'ADSL 日志','log-cleanup':'日志清理',blacklists:'黑名单记录',vpcs:'VPC 网络',disks:'磁盘管理','disk-recycle':'磁盘回收站','security-groups':'安全组',templates:'实例模板','ssh-keys':'密钥管理',ipv4:'IPv4 管理',ipv6:'IPv6 管理',adsl:'ADSL 维护',overview:'控制台',system:'系统设置',recycle:'回收站',clouds:'实例管理',areas:'区域管理',nodes:'节点管理',tasks:'任务中心',settings:'连接设置',guidelines:'设计规范'};
export function label(value:unknown):string{if(value==null||value==='')return '—';if(typeof value==='object')return (value as Row).name||JSON.stringify(value);return String(value);}
export function date(value:unknown){if(!value)return '—';const d=new Date(typeof value==='number'?value*1000:String(value));return Number.isNaN(+d)?String(value):d.toLocaleString('zh-CN',{hour12:false});}
