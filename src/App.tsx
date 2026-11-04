import {InstanceDetail} from './components/Detail';
import {NodeDetail} from './components/NodeDetail';
import {useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {Button,Avatar,Dropdown,Label,Tooltip,Toast} from '@heroui/react';
import {SlidersHorizontal,Server,Globe2,History,Menu,ChevronDown,HardDrive,Link2,Waypoints,Briefcase,UserRound} from 'lucide-react';
import {cachedSiteName,cacheSiteName,SITE_NAME_EVENT} from './lib/siteName';
import {api,send,setSession as saveSession,titles,PAGE_TITLE_EVENT,type Session} from './lib/api';
import {Brand,ErrorBox,notify} from './components/Shared';
import {ListPageSkeleton,OverviewSkeleton} from './components/PageSkeleton';
import type {Descriptor} from './components/ResourceForm';
import {Login} from './pages/Login';
import {Overview} from './pages/Overview';
import {Resources} from './pages/Resources';
import {Settings} from './pages/Settings';
import {Management,LogCleanup} from './pages/Management';
import {Guidelines} from './pages/Guidelines';
import {SiteConfig} from './pages/SiteConfig';
import {RecycleBin} from './pages/RecycleBin';
import {IPv4Page,IPv6Page,AdslPage} from './pages/Network';
import {CreateInstance} from './pages/CreateInstance';
import {VpcPage,DiskPage,DiskRecyclePage,SecurityGroupPage,TemplatePage,SshKeyPage} from './pages/Business';
import {HeaderSearch} from './components/HeaderSearch';
/** 桌面客户端（Electron）通过 preload 暴露的接口；在浏览器里打开时不存在。 */
const desktop=(window as unknown as {cubemanageDesktop?:{checkUpdate:()=>Promise<void>}}).cubemanageDesktop;
import {managementViews} from './lib/management';
const platformHost=(url:string)=>{try{return new URL(url).host;}catch{return url;}};
type NavEntry=readonly [string,string,typeof Server];
/** Header dropdown menus are plain text: [page, title]. */
const groups:Record<string,readonly (readonly [string,string])[]>={
 business:[['clouds','实例管理'],['users','用户管理'],['vpcs','VPC 网络'],['disks','磁盘管理'],['security-groups','安全组'],['templates','实例模板'],['ssh-keys','密钥管理']],
 infrastructure:[['areas','区域管理'],['nodes','节点管理']],
 network:[['ipv4','管理 IPv4'],['ipv6','管理 IPv6'],['adsl','ADSL 维护']],
 media:[['images','镜像管理'],['isos','ISO 管理']],
 logs:[['system-logs','系统日志'],['login-logs','登录日志'],['task-logs','任务日志'],['adsl-logs','ADSL 日志'],['log-cleanup','日志清理'],['blacklists','黑名单记录']]
};
const nav:readonly NavEntry[]=[['business','业务管理',Briefcase],['infrastructure','区域节点',Globe2],['network','网络管理',Waypoints],['media','镜像管理',HardDrive],['logs','日志',History],['system','设置',SlidersHorizontal]];
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true),[catalog,setCatalog]=useState<Record<string,Descriptor>|null>(null),[catalogError,setCatalogError]=useState('');const location=useLocation(),go=useNavigate();const page=location.pathname.split('/')[1]||'overview';const instanceId=page==='clouds'?location.pathname.split('/')[2]:undefined;const nodeId=page==='nodes'&&/^\d+$/.test(location.pathname.split('/')[2]||'')?location.pathname.split('/')[2]:undefined;const navPage=page==='recycle'?'clouds':page==='disk-recycle'?'disks':page;
 const [siteName,setSiteName]=useState('');
 // 浏览器标签页标题：“页面名 - 网站名称 - CubeManage 云管控制台”（网站名称未设置时省略这一段）。子视图用自己的名称；实例详情由详情页通过 PAGE_TITLE_EVENT 告知主机名。
 const [titleOverride,setTitleOverride]=useState<{path:string;title:string}|null>(null);
 useEffect(()=>{const on=(e:Event)=>{const d=(e as CustomEvent).detail;if(d&&typeof d.title==='string')setTitleOverride({path:String(d.path),title:d.title});};window.addEventListener(PAGE_TITLE_EVENT,on);return()=>window.removeEventListener(PAGE_TITLE_EVENT,on);},[]);
 useEffect(()=>{if(checking)return;const view=new URLSearchParams(location.search).get('view')||'';
  const viewTitles:Record<string,Record<string,string>>={ipv4:{ips:'IP 地址',groups:'IP 分组'},ipv6:{addresses:'IPv6 地址',groups:'IPv6 分组'},'security-groups':{rules:'安全组规则'}};
  const name=!session?'登录':titleOverride&&titleOverride.path===location.pathname?titleOverride.title:instanceId==='new'?'新建实例':instanceId?'实例详情':nodeId?'节点详情':viewTitles[page]?.[view]||(page==='overview'||!titles[page]?'控制台':titles[page]);
  document.title=[name,siteName,'CubeManage 云管控制台'].filter(Boolean).join(' - ');},[checking,session,location.pathname,location.search,siteName,titleOverride,page,instanceId,nodeId]);
 function login(s:Session){saveSession(s);setSession(s);}
 // 打开网站时检查登录状态：没有有效会话就提示并回到登录页；使用中会话失效（平台返回 401）同样提示。
 useEffect(()=>{api<Session>('/session').then(login).catch(()=>{notify('未登录或登录已过期，请先登录','warning');}).finally(()=>setChecking(false));const expire=()=>{saveSession(null);setSession(null);setCatalog(null);notify('登录已过期，请重新登录','warning');};window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire);},[]);
 function loadCatalog(){setCatalogError('');api('/catalog').then(r=>setCatalog({...r.resources,...r.management})).catch(e=>setCatalogError(e.message));}
 useEffect(()=>{if(session)loadCatalog();},[session]);
 // 页头名称：先用本机缓存，再读平台的网站名称；保存网站配置后重新读取。
 useEffect(()=>{if(!session){setSiteName('');return;}const platform=session.baseUrl;setSiteName(cachedSiteName(platform));let live=true;
  const load=()=>{api<{name:string}>('/site-name').then(r=>{if(!live)return;const name=String(r?.name||'').trim();setSiteName(name);cacheSiteName(platform,name);}).catch(()=>{});};
  load();window.addEventListener(SITE_NAME_EVENT,load);return()=>{live=false;window.removeEventListener(SITE_NAME_EVENT,load);};},[session]);
 async function logout(){try{await api('/logout',send('POST',{}));saveSession(null);setSession(null);setCatalog(null);go('/');}catch(e){notify((e as Error).message,'danger');}}
 function navigate(p:string){if(groups[p])return;go('/'+p);}
 // 检查登录状态期间不转圈：显示与页面相同的骨架（深色顶栏 + 当前页面的内容骨架）。
 if(checking)return <div className="app-shell" aria-busy="true"><header className="global-header"><span className="header-brand"><Brand/></span></header><div className="workspace-main"><main className="page-content">{page==='overview'||(!titles[page]&&!instanceId)?<OverviewSkeleton/>:<ListPageSkeleton title={instanceId==='new'?'新建实例':instanceId?undefined:titles[page]}/>}</main></div></div>;
 if(!session)return <><Login onLogin={login}/><Toast.Provider placement="top"/></>;
 // 只有区域 / 节点 / 实例 / 任务列表和管理类列表需要等 catalog（字段描述）；其他页面直接渲染，各自用骨架屏占位。
 const needsCatalog=Boolean(managementViews[page])||(['clouds','areas','nodes','tasks'].includes(page)&&!instanceId&&!nodeId);
 const entries=(key:string)=>groups[key].map(([id,title])=><Dropdown.Item key={id} id={id} textValue={title}><Label>{title}</Label></Dropdown.Item>);
 const groupSelected=(key:string)=>groups[key].some(([id])=>id===navPage);
 return <div className="app-shell"><header className="global-header"><a className="header-brand" href="/" aria-label={(siteName||'CubeManage')+' 首页'} aria-current={page==='overview'?'page':undefined} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0)return;e.preventDefault();go('/');}}><Brand name={siteName}/></a><nav className="header-nav" aria-label="管理导航">{nav.map(([key,title,Icon])=>groups[key]?<Dropdown key={key}><Button size="sm" variant={groupSelected(key)?'secondary':'ghost'} aria-label={title}><Icon size={16}/><span>{title}</span><ChevronDown className="nav-chevron" size={13}/></Button><Dropdown.Popover className="nav-popover"><Dropdown.Menu aria-label={title} selectionMode="single" selectedKeys={groupSelected(key)?[navPage]:[]} onAction={key=>navigate(String(key))}>{entries(key)}</Dropdown.Menu></Dropdown.Popover></Dropdown>:<Button size="sm" variant={key===navPage?'secondary':'ghost'} key={key} aria-current={key===navPage?'page':undefined} onPress={()=>navigate(key)}><Icon size={16}/><span>{title}</span></Button>)}</nav><HeaderSearch onOpen={(p:string)=>go(p)}/><div className="header-account"><Tooltip delay={0}><Button variant="ghost" size="sm" isIconOnly className={'header-link-state is-live'+(page==='settings'?' is-current':'')} aria-label={'已连接到 '+platformHost(session.baseUrl)+'，打开连接设置'} aria-current={page==='settings'?'page':undefined} onPress={()=>navigate('settings')}><Link2 size={18}/><i aria-hidden="true"/></Button><Tooltip.Content>已连接 · {platformHost(session.baseUrl)} · 点击打开连接设置</Tooltip.Content></Tooltip><Dropdown><Button className="compact-navigation" variant="ghost" size="sm" isIconOnly aria-label="打开导航"><Menu size={20}/></Button><Dropdown.Popover className="nav-popover"><Dropdown.Menu aria-label="移动端管理导航" selectedKeys={[page]} selectionMode="single" onAction={key=>navigate(String(key))}>{nav.map(([key,title])=>groups[key]?<Dropdown.SubmenuTrigger key={key}><Dropdown.Item id={key} textValue={title}><Label>{title}</Label><Dropdown.SubmenuIndicator/></Dropdown.Item><Dropdown.Popover className="nav-popover"><Dropdown.Menu aria-label={title} selectionMode="single" selectedKeys={groupSelected(key)?[navPage]:[]} onAction={key=>navigate(String(key))}>{entries(key)}</Dropdown.Menu></Dropdown.Popover></Dropdown.SubmenuTrigger>:<Dropdown.Item key={key} id={key} textValue={title}><Label>{title}</Label></Dropdown.Item>)}</Dropdown.Menu></Dropdown.Popover></Dropdown><Dropdown><Dropdown.Trigger aria-label={'个人菜单，'+session.username}><Avatar size="sm" className="header-avatar"><Avatar.Fallback><UserRound size={18} strokeWidth={2.25} aria-hidden="true"/></Avatar.Fallback></Avatar></Dropdown.Trigger><Dropdown.Popover className="nav-popover" placement="bottom end"><div className="account-menu-heading"><strong>{session.username}</strong><small>平台管理员</small></div><Dropdown.Menu aria-label="个人菜单"><Dropdown.Item id="guidelines" textValue="设计规范" onAction={()=>navigate('guidelines')}><Label>设计规范</Label></Dropdown.Item>{desktop&&<Dropdown.Item id="check-update" textValue="检查更新" onAction={()=>{desktop.checkUpdate();}}><Label>检查更新</Label><small className="account-menu-version">v{__APP_VERSION__}</small></Dropdown.Item>}<Dropdown.Item id="logout" textValue="退出登录" onAction={logout}><Label>退出登录</Label></Dropdown.Item></Dropdown.Menu></Dropdown.Popover></Dropdown></div></header><div className="workspace-main"><main className="page-content" key={location.pathname}>{catalogError&&needsCatalog?<ErrorBox message={catalogError} retry={loadCatalog}/>:!catalog&&needsCatalog?<ListPageSkeleton title={titles[page]}/>:page==='guidelines'?<Guidelines/>:page==='system'?<SiteConfig notify={notify}/>:page==='recycle'?<RecycleBin notify={notify}/>:page==='log-cleanup'?<LogCleanup notify={notify}/>:page==='vpcs'?<VpcPage notify={notify}/>:page==='disks'?<DiskPage notify={notify}/>:page==='disk-recycle'?<DiskRecyclePage notify={notify}/>:page==='security-groups'?<SecurityGroupPage notify={notify}/>:page==='templates'?<TemplatePage notify={notify}/>:page==='ssh-keys'?<SshKeyPage notify={notify}/>:page==='ipv4'?<IPv4Page notify={notify}/>:page==='ipv6'?<IPv6Page notify={notify}/>:page==='adsl'?<AdslPage notify={notify}/>:managementViews[page]?<Management key={page} kind={page} catalog={catalog!} notify={notify}/>:page==='overview'||!titles[page]?<Overview navigate={navigate}/>:instanceId==='new'?<CreateInstance notify={notify}/>:instanceId?<InstanceDetail id={instanceId} onClose={()=>navigate('clouds')} notify={notify}/>:nodeId?<NodeDetail key={nodeId} id={nodeId} onClose={()=>navigate('nodes')} notify={notify}/>:['clouds','areas','nodes','tasks'].includes(page)?<Resources key={page} kind={page} catalog={catalog!} notify={notify}/>:<Settings session={session} onDisconnect={logout}/>}</main><footer className="app-footer"><span>CubeManage Console v{__APP_VERSION__}</span><span>让基础设施管理回归简单。</span></footer></div><Toast.Provider placement="top"/></div>;
}
