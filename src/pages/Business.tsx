import {useEffect,useState,type ReactNode} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Button,Checkbox,Chip,Input,Label,Switch,TextArea,TextField,Tooltip} from '@heroui/react';
import {Clipboard,ClipboardCheck,Download,KeyRound,Link2,ListTree,Plug,RotateCcw,Trash2,TriangleAlert,Unplug,X} from 'lucide-react';
import {api,send,date,ApiError,type Row} from '../lib/api';
import {Choice} from '../components/Controls';
import {Dialog,ErrorBox,type Notify} from '../components/Shared';
import {StatusIcon,type StatusSpec} from '../components/StatusIcon';
import {CopyIp} from '../components/CloudCells';
/** IP 加复制按钮：悬停该行（tooltip 里悬停该项）时显示，复制后绿色对勾 1.5 秒，与实例列表主 IP 相同。 */
const ipCopy=(ip:unknown,what='IP')=>ip?<span className="cloud-ip-cell"><span className="mono">{String(ip)}</span><CopyIp ip={String(ip)} what={what}/></span>:null;
import {NetList,LookupPicker,useOptions,useView,back,Names,Two,IconAction,fmt,type Config} from './Network';

/**
 * 业务管理（digitalvirt-v1-api.md）：VPC 网络、磁盘管理、安全组（含规则）、实例模板、密钥管理（SSH 密钥）。
 * 列表与通用增删改走 /api/net/:kind（server/network.mjs），专用操作走 /api/biz/*（server/business.mjs）。
 */
const typeNames:Record<string,string>={host:'KVM 加强版',lightHost:'KVM 轻量版',hyperv:'Hyper-V',adsl:'拨号云'};
const typeOptions=Object.entries(typeNames) as [string,string][];
const bytes=(v:unknown)=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)return '';const u=['B','KB','MB','GB','TB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toFixed(i?1:0)+' '+u[i];};
const hostLink=(id:unknown,name:unknown)=>id?<Link className="owner-count-link" to={'/clouds/'+id}>{String(name||'#'+id)}</Link>:null;

/** 一个小确认弹窗：标题、说明、可选内容、取消 / 确认。 */
function Confirm({title,note,danger=false,children,confirm,onClose,onDone}:{title:string;note:string;danger?:boolean;children?:React.ReactNode;confirm:()=>Promise<string>;onClose:()=>void;onDone:(m:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Dialog title={title} onClose={()=>{if(!busy)onClose();}} footer={<><Button className="node-switch-btn" variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button className="node-switch-btn" variant={danger?'danger':'primary'} isPending={busy} onPress={async()=>{setBusy(true);setError('');try{onDone(await confirm());}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>确认</Button></>}>
  <div className="node-switch"><div className={danger?'cfg-note':'node-switch-note'}>{danger?<TriangleAlert size={16}/>:<Plug size={16}/>}<span>{note}</span></div>{children}{error&&<ErrorBox message={error}/>}</div>
 </Dialog>;
}

/* ── VPC 网络 ─────────────────────────────────────────────────── */
/** 只显示第一项，其余放进“+N”的 tooltip（tooltip 悬停时保持打开，里面的链接可以点）。 */
function FirstMore({items,label}:{items:ReactNode[];label:string}){
 if(!items.length)return null;
 if(items.length===1)return <div className="vpc-first">{items[0]}</div>;
 return <div className="vpc-first">{items[0]}<Tooltip delay={0} closeDelay={300}><Tooltip.Trigger tabIndex={0} aria-label={`另外 ${items.length-1} 个${label}`}><span className="net-more">+{items.length-1}</span></Tooltip.Trigger><Tooltip.Content placement="bottom"><div className="vpc-more-list">{items.slice(1)}</div></Tooltip.Content></Tooltip></div>;
}
const hostChip=(h:Row)=>h?.id?<Link key={h.id} className="vpc-host-chip" to={'/clouds/'+h.id} aria-label={'打开实例 '+(h.hostname||'#'+h.id)}><Chip variant="soft" color="accent" size="sm">{String(h.hostname||'#'+h.id)}</Chip></Link>:null;
const vpcMacs=(r:Row):Row[]=>(Array.isArray(r.vpc_mac)?r.vpc_mac:[]).filter((m:Row)=>m?.mac);
/** 第一个 MAC 只显示地址（节点在“节点”列）；tooltip 里的其余 MAC 带上节点名，便于对应。 */
const macItems=(r:Row)=>vpcMacs(r).map((m,i)=>i===0?<span key={i} className="mono">{m.mac}</span>:<div key={i} className="net-two"><span className="mono">{m.mac}</span>{m.node_name&&<small>{m.node_name}</small>}</div>);
const nodeItems=(r:Row)=>[...new Set(vpcMacs(r).map(m=>String(m.node_name||'')).filter(Boolean))].map(n=><Chip key={n} variant="soft" size="sm">{n}</Chip>);

export function VpcPage({notify}:{notify:Notify}){
 const options=useOptions(null);
 const config:Config={kind:'vpcs',noun:'VPC 网络',search:'搜索 VPC 名称或用户名',location:true,edit:true,remove:true,select:false,label:r=>r.name||'#'+r.id,
  empty:['还没有 VPC 网络','实例使用 VPC 专有网络创建后，网络会出现在这里。'],deleteNote:'只能删除没有实例在用的 VPC 网络，平台会拒绝删除仍在使用的网络。',
  fields:[{key:'name',label:'接口名称',required:true,span:true}],
  columns:[
   {key:'name',title:'接口名称',rowHeader:true,sk:8,render:r=><strong>{r.name||'—'}</strong>},
   {key:'node',title:'节点',sk:6,render:r=><FirstMore label="节点" items={nodeItems(r)}/>},
   {key:'mac',title:'出口 MAC 地址',sk:8,render:r=><FirstMore label="出口 MAC" items={macItems(r)}/>},
   {key:'ips',title:'网段',sk:7,render:r=>r.ips?<span className="cloud-ip-cell"><Chip variant="soft" size="sm" className="mono">{r.ips}</Chip><CopyIp ip={String(r.ips)} what="网段"/></span>:''},
   {key:'host',title:'网内主机',sk:8,render:r=><FirstMore label="主机" items={(Array.isArray(r.host)?r.host:[]).map(hostChip).filter(Boolean)}/>},
   {key:'username',title:'所属用户',sk:6,render:r=>r.username||''}
  ]};
 return <NetList title="VPC 网络" config={config} options={options} notify={notify}/>;
}

/* ── 磁盘管理 ─────────────────────────────────────────────────────────── */
const diskCols={
 id:{key:'id',title:'ID',sk:3,render:(r:Row)=><span className="num">{r.id}</span>},
 name:{key:'name',title:'磁盘名称',rowHeader:true,sk:8,render:(r:Row)=><strong>{r.remarks||r.name||'—'}</strong>},
 store:{key:'store',title:'存储',sk:6,render:(r:Row)=>r.store_name?<Chip variant="soft" color="accent" size="sm">{r.store_name}</Chip>:''},
 size:{key:'size',title:'磁盘大小',sk:4,render:(r:Row)=><span className="num nowrap">{r.size} GB</span>},
 user:{key:'user',title:'所属用户',sk:6,render:(r:Row)=>r.username||''}
};
/** 磁盘管理：只看列表和新建，没有勾选列和操作列；回收站是单独页面 /disk-recycle。 */
export function DiskPage({notify}:{notify:Notify}){
 const options=useOptions(null);const nav=useNavigate();
 const config:Config={kind:'disks',noun:'磁盘',search:'搜索磁盘名称或主机名',create:true,createLabel:'新建',select:false,label:r=>r.remarks||r.name||'#'+r.id,
  headerActions:<Button variant="outline" size="sm" onPress={()=>nav('/disk-recycle')}><Trash2 size={16}/>回收站</Button>,
  filters:[{key:'type',label:'类型',all:'全部类型',options:()=>[['system','系统盘'],['data','数据盘']]},{key:'status',label:'状态',all:'所有状态',options:()=>[['1','已挂载'],['0','未挂载'],['2','挂载中']]},{key:'independent',label:'来源',all:'全部来源',options:()=>[['0','独立磁盘'],['1','随实例创建']]}],
  empty:['还没有磁盘','实例的系统盘、数据盘和独立磁盘都会显示在这里。'],
  fields:[{key:'uid',label:'所属用户',type:'user',required:true,createOnly:true,span:true},{key:'remarks',label:'磁盘名称',required:true},{key:'size',label:'容量（GB）',type:'number',required:true,min:1}],
  columns:[
   diskCols.id,diskCols.name,diskCols.store,
   {key:'image',title:'源镜像',sk:7,render:r=>{const f=String(r.link_file||'').split(/[\\/]/).pop()||'';return f?<span className="mono disk-image" title={String(r.link_file)}>{f}</span>:'';}},
   diskCols.size,
   {key:'real_size',title:'实际占用',sk:4,render:r=><span className="num nowrap">{bytes(r.real_size)}</span>},
   {key:'host',title:'挂载实例',sk:7,render:r=>hostLink(r.hostid,r.hostname)||''},
   diskCols.user,
   {key:'follow',title:'跟随实例',sk:3,render:r=>{const on=Number(r.delete_with_host)===1;return <Tooltip delay={0}><Tooltip.Trigger tabIndex={-1}><Switch size="sm" isReadOnly isSelected={on} aria-label={(on?'随实例删除':'不随实例删除')+'（只读）'}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch></Tooltip.Trigger><Tooltip.Content>{on?'实例删除时一并删除这块磁盘':'实例删除时保留这块磁盘'}（平台未提供修改接口，只读）</Tooltip.Content></Tooltip>;}},
   {key:'snap',title:'备份 / 快照',sk:4,render:r=><span className="num">{fmt(r.backup_num)} / {fmt(r.snap_num)}</span>}
  ]};
 return <NetList title="磁盘管理" config={config} options={options} notify={notify}/>;
}

/* ── 磁盘回收站（/disk-recycle） ─────────────────────────────────────── */
const when=(v:unknown)=>{if(!v)return '—';const t=String(v);return /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(t)?t.replace('T',' ').slice(0,16):t;};
/** 距离平台彻底删除还有多久："6 天后"“5 小时后”“即将删除”。 */
function remaining(v:unknown){if(!v)return '';const t=new Date(String(v).replace(' ','T')).getTime();if(!Number.isFinite(t))return '';const h=(t-Date.now())/3600000;if(h<=1)return '即将删除';if(h<48)return Math.floor(h)+' 小时后';return Math.floor(h/24)+' 天后';}
export function DiskRecyclePage({notify}:{notify:Notify}){
 const options=useOptions(null);const nav=useNavigate();const [rev,setRev]=useState(0),[restoring,setRestoring]=useState<Row|null>(null);
 const label=(r:Row)=>r.remarks||r.name||'#'+r.id;
 const config:Config={kind:'disks',noun:'磁盘',search:'搜索磁盘名称',fixed:{status:'5'},remove:true,select:false,deleteLabel:'彻底删除',emptyKind:'recycle',label,
  trailingActions:back('返回磁盘管理',()=>nav('/disks')),
  empty:['回收站是空的','删除的磁盘会先放进回收站，到期后由平台彻底删除。'],deleteNote:'彻底删除后磁盘数据无法恢复。',
  rowActions:r=><IconAction label={'恢复 '+label(r)} onPress={()=>setRestoring(r)}><RotateCcw size={15}/></IconAction>,
  columns:[
   diskCols.id,diskCols.name,diskCols.store,diskCols.size,diskCols.user,
   {key:'recycle_time',title:'放入回收站',sk:7,render:r=><span className="num nowrap">{when(r.recycle_time)}</span>},
   {key:'delete_time',title:'到期删除',sk:7,render:r=>{const left=remaining(r.delete_time);return <div className="recycle-expire"><span className="num">{when(r.delete_time)}</span>{left&&<small className={left==='即将删除'||left.endsWith('小时后')?'is-soon':''}>{left}</small>}</div>;}}
  ]};
 return <><NetList key={rev} title="磁盘回收站" config={config} options={options} notify={notify}/>
  {restoring&&<Confirm title="从回收站恢复磁盘" note={`“${label(restoring)}”会恢复为未挂载状态，回到磁盘管理列表。`} onClose={()=>setRestoring(null)} onDone={m=>{setRestoring(null);setRev(v=>v+1);notify(m);}} confirm={async()=>{await api('/biz/disks/restore',send('POST',{ids:[Number(restoring.id)],count:1}));return '磁盘已恢复';}}/>}
 </>;
}

/* ── 安全组 / 安全组规则 ───────────────────────────────────────────────── */
const PROTOCOLS:[string,string][]=[['all','全部'],['all_tcp','全部 TCP'],['all_udp','全部 UDP'],['tcp','TCP'],['udp','UDP'],['icmp','ICMP'],['ssh','SSH (22)'],['telnet','Telnet (23)'],['http','HTTP (80)'],['https','HTTPS (443)'],['mssql','MSSQL (1433)'],['oracle','Oracle (1521)'],['mysql','MySQL (3306)'],['rdp','RDP (3389)'],['postgresql','PostgreSQL (5432)'],['redis','Redis (6379)'],['gre','GRE']];
/** 关联数量：浅蓝标签，悬停时才读取关联实例（v1/clouds?security=），tooltip 里的主机名链接到实例详情。 */
function LinkedClouds({row}:{row:Row}){
 const n=Number(row.cloud_num)||0;const [list,setList]=useState<Row[]|null>(null),[error,setError]=useState('');
 const load=()=>{if(list||!n)return;api<Row>(`/biz/security-groups/${row.id}/clouds`).then(r=>setList(r.data||[])).catch(e=>setError((e as Error).message));};
 if(!n)return <span className="num net-muted">0</span>;
 return <Tooltip delay={150} closeDelay={300} onOpenChange={o=>{if(o)load();}}><Tooltip.Trigger tabIndex={0} aria-label={`关联 ${n} 台实例`}><Chip variant="soft" color="accent" size="sm" className="num">{fmt(n)}</Chip></Tooltip.Trigger><Tooltip.Content placement="bottom">
  {error?<span>{error}</span>:!list?<span className="net-muted">加载中…</span>:list.length?<div className="vpc-more-list">{list.map(h=><span key={h.id}>{hostChip(h)}</span>)}{n>list.length&&<span className="net-muted">另有 {n-list.length} 台</span>}</div>:<span className="net-muted">没有找到关联的实例</span>}
 </Tooltip.Content></Tooltip>;
}
/** 关联实例弹窗：搜索添加（不影响已关联的实例），列出已关联的实例并可逐个解除。 */
function GroupLink({row,onClose,onChanged}:{row:Row;onClose:()=>void;onChanged:(m:string)=>void}){
 const [hosts,setHosts]=useState<Row[]|null>(null),[add,setAdd]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const reload=()=>api<Row>(`/biz/security-groups/${row.id}/clouds`).then(r=>setHosts(r.data||[])).catch(e=>{setHosts([]);setError((e as Error).message);});
 useEffect(()=>{reload();},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function call(method:'POST'|'DELETE',ids:number[],m:string){setBusy(true);setError('');try{await api(`/biz/security-groups/${row.id}/links`,send(method,{cloud:ids}));onChanged(m);await reload();return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 return <Dialog wide title={'关联实例 · '+(row.name||'#'+row.id)} onClose={()=>{if(!busy)onClose();}} footer={<Button className="node-switch-btn" onPress={onClose}>完成</Button>}>
  <div className="rd-field"><span className="rd-label">添加实例</span><div className="key-bind-add"><LookupPicker kind="cloud" label="实例" value={add} onChange={setAdd}/><Button isDisabled={!add||busy} isPending={busy&&Boolean(add)} onPress={async()=>{if(await call('POST',[Number(add)],'已关联实例'))setAdd('');}}><Link2 size={15}/>关联</Button></div><p className="field-help">一台实例只能关联一个安全组，关联后原安全组的规则不再作用于它；实例类型需与安全组的节点类型（{typeNames[row.type]||row.type||'—'}）一致。</p></div>
  <span className="rd-label">已关联 {hosts?hosts.length:'…'} 台</span>
  {!hosts?<p className="net-muted">加载中…</p>:hosts.length?<ul className="recycle-list">{hosts.map(h=><li key={h.id}><strong>{hostLink(h.id,h.hostname)}</strong><span className="key-bind-row">{ipCopy(h.mainip)}<Tooltip delay={0}><Button size="sm" variant="ghost" isIconOnly aria-label={'解除关联 '+(h.hostname||h.id)} isDisabled={busy} onPress={()=>call('DELETE',[Number(h.id)],'已解除关联')}><X size={14}/></Button><Tooltip.Content>解除关联</Tooltip.Content></Tooltip></span></li>)}</ul>:<p className="net-muted">还没有关联实例。</p>}
  {error&&<ErrorBox message={error}/>}
 </Dialog>;
}
export function SecurityGroupPage({notify}:{notify:Notify}){
 const [view,open]=useView(['groups','rules']);const options=useOptions(null);const [params]=useSearchParams();const gid=params.get('group')||'';
 const [group,setGroup]=useState<Row|null>(null),[linking,setLinking]=useState<Row|null>(null),[rev,setRev]=useState(0),[dirty,setDirty]=useState(false);
 useEffect(()=>{if(view!=='rules'||!gid)return;let live=true;api(`/biz/security-groups/${gid}`).then(r=>{if(live)setGroup(r);}).catch(()=>{if(live)setGroup(null);});return()=>{live=false;};},[view,gid]);
 const groups:Config={kind:'security-groups',noun:'安全组',search:'搜索安全组名称',create:true,edit:true,remove:true,select:false,label:r=>r.name||'#'+r.id,
  filters:[{key:'type',label:'节点类型',all:'全部节点类型',options:()=>typeOptions}],
  empty:['还没有安全组','安全组用来控制实例的进出流量，新建后添加规则并关联实例。'],deleteNote:'删除安全组会同时删除它的规则，并解除与实例的关联。',
  createDefaults:()=>({type:'host',create_default_rule:1}),
  fields:[{key:'name',label:'名称',required:true},{key:'type',label:'安全组类型',type:'select',required:true,createOnly:true,options:()=>typeOptions},{key:'uid',label:'所属用户',type:'user',required:true,createOnly:true,span:true},{key:'description',label:'描述',type:'textarea'},{key:'create_default_rule',label:'创建默认规则',type:'bool',createOnly:true}],
  rowActionsEnd:r=><><IconAction label={'关联实例 '+(r.name||'')} onPress={()=>setLinking(r)}><Link2 size={15}/></IconAction><IconAction label={'配置规则 '+(r.name||'')} onPress={()=>open('rules',{group:String(r.id)})}><ListTree size={15}/></IconAction></>,
  columns:[
   {key:'id',title:'ID',sk:3,render:r=><span className="num">{r.id}</span>},
   {key:'name',title:'安全组名称',rowHeader:true,sk:9,render:r=><Two main={<strong>{r.name||'—'}</strong>} sub={r.description?String(r.description):undefined}/>},
   {key:'type',title:'节点类型',sk:6,render:r=>typeNames[r.type]||r.type||''},
   {key:'cloud_num',title:'关联数量',sk:4,render:r=><LinkedClouds row={r}/>},
   {key:'user',title:'所属用户',sk:6,render:r=>r.username||''},
   {key:'rule_num',title:'规则数量',sk:4,render:r=><span className="num">{fmt(r.rule_num)}</span>},
   {key:'create_time',title:'创建时间',sk:8,render:r=><span className="num nowrap">{date(r.create_time)}</span>}
  ]};
 const rules:Config={kind:'security-group-rules',base:`/biz/security-groups/${gid}/rules`,itemBase:'/biz/security-group-rules',noun:'规则',search:'搜索规则',create:true,edit:true,remove:true,label:r=>`${r.direction==='in'?'入':'出'} · ${r.protocol} · ${r.port||'—'}`,
  filters:[{key:'direction',label:'方向',all:'全部方向',options:()=>[['in','入方向'],['out','出方向']]}],
  empty:['还没有规则','添加入方向和出方向规则，控制关联实例的访问。'],deleteNote:'删除后对关联实例立即生效。',
  createDefaults:()=>({direction:'in',protocol:'tcp',ip:'0.0.0.0/0'}),
  initial:r=>({...r,lock:Number(r.lock)===1?1:0}),
  fields:[{key:'direction',label:'方向',type:'select',required:true,options:()=>[['in','入方向'],['out','出方向']]},{key:'protocol',label:'协议',type:'select',required:true,options:()=>PROTOCOLS},{key:'port',label:'端口范围',required:true,mono:true,placeholder:'22 或 1000-2000',help:'all 表示全部端口'},{key:'ip',label:'授权 IP',required:true,mono:true,placeholder:'0.0.0.0/0'},{key:'description',label:'描述',type:'textarea'},{key:'lock',label:'锁定（用户不能修改）',type:'bool'}],
  trailingActions:back('返回安全组',()=>open('groups')),
  columns:[
   {key:'direction',title:'方向',sk:3,render:r=><Chip variant="soft" size="sm" color={r.direction==='in'?'accent':'default'}>{r.direction==='in'?'入方向':'出方向'}</Chip>},
   {key:'protocol',title:'协议',rowHeader:true,sk:5,render:r=>PROTOCOLS.find(([k])=>k===r.protocol)?.[1]||r.protocol},
   {key:'port',title:'端口',sk:5,render:r=><span className="mono">{r.port||(r.start_port?`${r.start_port}-${r.end_port}`:'')}</span>},
   {key:'ip',title:'授权 IP',sk:7,render:r=><span className="mono">{r.ip||(r.start_ip?`${r.start_ip} – ${r.end_ip}`:'')}</span>},
   {key:'description',title:'描述',sk:8,render:r=>r.description||''},
   {key:'lock',title:'锁定',sk:3,render:r=>Number(r.lock)===1?<Chip variant="soft" size="sm" color="warning">已锁定</Chip>:''},
   {key:'create_time',title:'创建时间',sk:8,render:r=><span className="num nowrap">{date(r.create_time)}</span>}
  ]};
 if(view==='rules'&&gid)return <NetList key={'rules'+gid} title={'安全组规则'+(group?.name?' · '+group.name:'')} config={rules} options={options} notify={notify}/>;
 return <><NetList key={'groups'+rev} title="安全组" config={groups} options={options} notify={notify}/>
  {linking&&<GroupLink row={linking} onClose={()=>{setLinking(null);if(dirty){setDirty(false);setRev(v=>v+1);}}} onChanged={m=>{setDirty(true);notify(m);}}/>}
 </>;
}

/* ── 实例模板 ─────────────────────────────────────────────────────────── */
/** 模板状态（v1/templates：0 创建中，1 创建完成），图标与实例状态同一套。 */
const templateStatus=(v:unknown):StatusSpec=>Number(v)===1?{title:'已完成',color:'#15803d',glyph:'check',meaning:'模板已创建完成，可用于创建实例'}:{title:'创建中',color:'#1d4ed8',glyph:'clock',meaning:'正在复制源实例的系统盘'};
export function TemplatePage({notify}:{notify:Notify}){
 const options=useOptions(null);const [rev,setRev]=useState(0),[creating,setCreating]=useState(false),[host,setHost]=useState(''),[name,setName]=useState('');
 const config:Config={kind:'templates',noun:'模板',search:'搜索模板名称',location:true,create:true,createLabel:'从实例创建模板',remove:true,select:false,label:r=>r.name||'#'+r.id,
  createAction:()=>{setHost('');setName('');setCreating(true);},
  filters:[{key:'status',label:'状态',all:'所有状态',options:()=>[['1','已完成'],['0','创建中']]}],
  empty:['还没有实例模板','从现有实例创建模板后，可以用模板快速创建同样配置的实例。'],deleteNote:'删除模板不影响已经用它创建的实例。',
  columns:[
   {key:'id',title:'ID',sk:3,render:r=><span className="num">{r.id}</span>},
   {key:'status',title:'状态',sk:2,render:r=>{const spec=templateStatus(r.status);return <Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={spec.title}><span className="node-status-icon"><StatusIcon spec={spec}/></span></Tooltip.Trigger><Tooltip.Content>{spec.title}</Tooltip.Content></Tooltip>;}},
   {key:'name',title:'名称',rowHeader:true,sk:9,render:r=><strong>{r.name||'—'}</strong>},
   {key:'store',title:'存储节点',sk:7,render:r=><Two main={r.node_name?<Chip variant="soft" color="accent" size="sm">{r.node_name}</Chip>:''} sub={[r.store_name,r.store_type==='ceph'?'CEPH':r.store_type==='local'?'本地':''].filter(Boolean).join(' · ')||undefined}/>},
   {key:'size',title:'大小',sk:3,render:r=>r.size!=null?<span className="num nowrap">{r.size} GB</span>:''},
   {key:'user',title:'用户',sk:6,render:r=>r.username||''},
   {key:'create_time',title:'创建时间',sk:8,render:r=><span className="num nowrap">{date(r.create_time)}</span>}
  ]};
 return <><NetList key={rev} title="实例模板" config={config} options={options} notify={notify}/>
  {creating&&<Confirm title="从实例创建模板" note="平台会复制实例的系统盘生成模板，期间实例可能需要关机，创建进度见任务日志。" onClose={()=>setCreating(false)} onDone={m=>{setCreating(false);setRev(v=>v+1);notify(m);}} confirm={async()=>{if(!host)throw new Error('请选择源实例');if(!name.trim())throw new Error('请填写模板名称');const r=await api<Row>('/biz/templates',send('POST',{hostid:Number(host),name:name.trim()}));const t=r?.result?.taskid??r?.result?.data?.taskid;return '模板创建已提交'+(t?'，任务 #'+t:'');}}>
   <div className="rd-grid"><div className="rd-field rd-span"><span className="rd-label">源实例<span className="rd-req">*</span></span><LookupPicker kind="cloud" label="实例" value={host} onChange={setHost}/></div><div className="rd-field rd-span"><TextField value={name} onChange={setName}><Label>模板名称<span className="rd-req">*</span></Label><Input placeholder="如 web-base-2026"/></TextField></div></div>
  </Confirm>}
 </>;
}

/* ── 密钥管理：SSH 密钥 ───────────────────────────────────────────────── */
function KeyCreate({onClose,onCreated}:{onClose:()=>void;onCreated:(m:string,key:string|null,name:string)=>void}){
 const [type,setType]=useState('0'),[uid,setUid]=useState(''),[name,setName]=useState(''),[pub,setPub]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 async function run(){setBusy(true);setError('');setErrors({});try{const r=await api<Row>('/biz/ssh-keys',send('POST',{type:Number(type),uid:Number(uid)||0,name,public_key:pub}));onCreated('SSH 密钥已创建',r.key||null,name);}catch(e){setError((e as Error).message);if(e instanceof ApiError)setErrors(e.fields||{});}finally{setBusy(false);}}
 return <Dialog title="新建 SSH 密钥" onClose={()=>{if(!busy)onClose();}} footer={<><Button className="node-switch-btn" variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button className="node-switch-btn" isPending={busy} onPress={run}>创建</Button></>}>
  <div className="rd-grid">
   <div className="rd-field rd-span"><span className="rd-label">创建方式</span><div className="rd-seg" role="radiogroup" aria-label="创建方式">{[['0','自动生成'],['1','导入已有公钥']].map(([k,t])=><button type="button" key={k} role="radio" aria-checked={type===k} className={type===k?'is-on':''} onClick={()=>setType(k)}>{t}</button>)}</div></div>
   <div className="rd-field rd-span"><span className="rd-label">所属用户<span className="rd-req">*</span></span><LookupPicker kind="user" label="用户" value={uid} onChange={setUid}/>{errors.uid&&<p className="field-error">{errors.uid}</p>}</div>
   <div className="rd-field rd-span"><TextField value={name} onChange={setName} isInvalid={Boolean(errors.name)}><Label>名称<span className="rd-req">*</span></Label><Input placeholder="如 运维主密钥"/></TextField>{errors.name&&<p className="field-error">{errors.name}</p>}</div>
   {type==='1'&&<div className="rd-field rd-span"><TextField value={pub} onChange={setPub} isInvalid={Boolean(errors.public_key)}><Label>公钥<span className="rd-req">*</span></Label><TextArea rows={5} className="mono" placeholder="ssh-ed25519 AAAA… user@host"/></TextField>{errors.public_key&&<p className="field-error">{errors.public_key}</p>}</div>}
  </div>
  {type==='0'&&<div className="rd-note"><KeyRound size={15}/><span>平台生成密钥对后，私钥只在创建完成时显示一次，请立即下载保存。</span></div>}
  {error&&<ErrorBox message={error}/>}
 </Dialog>;
}
function PrivateKey({name,value,onClose}:{name:string;value:string;onClose:()=>void}){
 const [copied,setCopied]=useState(false);
 const copy=async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{/* clipboard unavailable */}};
 const download=()=>{const url=URL.createObjectURL(new Blob([value.endsWith('\n')?value:value+'\n'],{type:'application/x-pem-file'}));const a=document.createElement('a');a.href=url;a.download=(name||'ssh-key').replace(/[^\w.-]+/g,'_')+'.pem';a.click();URL.revokeObjectURL(url);};
 return <Dialog wide title="保存私钥" onClose={onClose} footer={<><Button variant="outline" className="node-switch-btn" onPress={copy}>{copied?<ClipboardCheck size={15}/>:<Clipboard size={15}/>}{copied?'已复制':'复制'}</Button><Button variant="outline" className="node-switch-btn" onPress={download}><Download size={15}/>下载 .pem</Button><Button className="node-switch-btn" onPress={onClose}>我已保存</Button></>}>
  <div className="cfg-note"><TriangleAlert size={16}/><span>私钥只显示这一次，关闭后无法再次查看。请下载或复制后妥善保存。</span></div>
  <pre className="key-block mono">{value}</pre>
 </Dialog>;
}
/** 绑定：搜索实例并绑定；解绑：列出已绑定的实例，逐个解除。 */
function KeyBind({row,mode,onClose,onChanged}:{row:Row;mode:'bind'|'unbind';onClose:()=>void;onChanged:(m:string)=>void}){
 const [hosts,setHosts]=useState<Row[]>(Array.isArray(row.host)?row.host:[]),[add,setAdd]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(method:'POST'|'DELETE',ids:number[],m:string){setBusy(true);setError('');try{await api(`/biz/ssh-keys/${row.id}/clouds`,send(method,{hostid:ids}));onChanged(m);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 const list=(removable:boolean)=>hosts.length?<ul className="recycle-list">{hosts.map(h=><li key={h.id}><strong>{hostLink(h.id,h.hostname)}</strong><span className="key-bind-row">{ipCopy(h.mainip)}{removable&&<Tooltip delay={0}><Button size="sm" variant="ghost" isIconOnly aria-label={'解绑 '+(h.hostname||h.id)} isDisabled={busy} onPress={async()=>{if(await call('DELETE',[Number(h.id)],'已解绑实例'))setHosts(x=>x.filter(y=>y.id!==h.id));}}><X size={14}/></Button><Tooltip.Content>解绑</Tooltip.Content></Tooltip>}</span></li>)}</ul>:<p className="net-muted">{removable?'已经没有绑定的实例。':'还没有绑定实例。'}</p>;
 return <Dialog wide title={(mode==='bind'?'绑定实例 · ':'解绑实例 · ')+(row.name||'#'+row.id)} onClose={()=>{if(!busy)onClose();}} footer={<Button className="node-switch-btn" onPress={onClose}>完成</Button>}>
  {mode==='bind'?<>
   <div className="rd-field"><span className="rd-label">添加实例</span><div className="key-bind-add"><LookupPicker kind="cloud" label="实例" value={add} onChange={setAdd}/><Button isDisabled={!add||busy} isPending={busy&&Boolean(add)} onPress={async()=>{if(await call('POST',[Number(add)],'已绑定实例')){setHosts(h=>h.some(x=>String(x.id)===add)?h:[...h,{id:Number(add),hostname:'实例 #'+add}]);setAdd('');}}}><Link2 size={15}/>绑定</Button></div><p className="field-help">绑定后，实例重装系统或重置密码时可以使用这把密钥。</p></div>
   <span className="rd-label">已绑定 {hosts.length} 台</span>{list(false)}
  </>:<><div className="node-switch-note"><Unplug size={16}/><span>解绑后实例不再关联这把密钥，实例内已写入的公钥不会被移除。</span></div><span className="rd-label">已绑定 {hosts.length} 台</span>{list(true)}</>}
  {error&&<ErrorBox message={error}/>}
 </Dialog>;
}
export function SshKeyPage({notify}:{notify:Notify}){
 const options=useOptions(null);const [rev,setRev]=useState(0),[creating,setCreating]=useState(false),[secret,setSecret]=useState<{name:string;key:string}|null>(null),[binding,setBinding]=useState<{row:Row;mode:'bind'|'unbind'}|null>(null),[dirty,setDirty]=useState(false);
 const config:Config={kind:'ssh-keys',noun:'SSH 密钥',search:'搜索密钥名称',create:true,remove:true,select:false,label:r=>r.name||'#'+r.id,createAction:()=>setCreating(true),
  empty:['还没有 SSH 密钥','新建或导入 SSH 公钥后，可在创建实例和重装系统时选择密钥登录。'],deleteNote:'删除后已绑定的实例不再关联这把密钥，实例内已写入的公钥不会被移除。',
  rowActions:r=>{const n=Array.isArray(r.host)?r.host.length:0;return <><IconAction label={'绑定实例 '+(r.name||'')} onPress={()=>setBinding({row:r,mode:'bind'})}><Link2 size={15}/></IconAction><IconAction label={n?'解绑实例 '+(r.name||''):'没有绑定的实例'} disabled={!n} onPress={()=>setBinding({row:r,mode:'unbind'})}><Unplug size={15}/></IconAction></>;},
  columns:[
   {key:'id',title:'ID',sk:3,render:r=><span className="num">{r.id}</span>},
   {key:'name',title:'密钥名称',rowHeader:true,sk:8,render:r=><strong>{r.name||'—'}</strong>},
   {key:'user',title:'用户',sk:6,render:r=>r.username||''},
   {key:'host',title:'实例',sk:8,render:r=><FirstMore label="实例" items={(Array.isArray(r.host)?r.host:[]).map(hostChip).filter(Boolean)}/>},
   {key:'ip',title:'实例 IP',sk:7,render:r=><FirstMore label="IP" items={(Array.isArray(r.host)?r.host:[]).filter((h:Row)=>h?.mainip).map((h:Row,i:number)=>i===0?<span key={h.id}>{ipCopy(h.mainip)}</span>:<div key={h.id} className="net-two">{ipCopy(h.mainip)}<small>{h.hostname}</small></div>)}/>},
   {key:'create_time',title:'创建时间',sk:8,render:r=><span className="num nowrap">{date(r.create_time)}</span>}
  ]};
 return <><NetList key={rev} title="密钥管理" config={config} options={options} notify={notify}/>
  {creating&&<KeyCreate onClose={()=>setCreating(false)} onCreated={(m,key,name)=>{setCreating(false);setRev(v=>v+1);notify(m);if(key)setSecret({name,key});}}/>}
  {secret&&<PrivateKey name={secret.name} value={secret.key} onClose={()=>setSecret(null)}/>}
  {binding&&<KeyBind row={binding.row} mode={binding.mode} onClose={()=>{setBinding(null);if(dirty){setRev(v=>v+1);setDirty(false);}}} onChanged={m=>{setDirty(true);notify(m);}}/>}
 </>;
}
