import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {Button,ComboBox,Input,InputGroup,Label,ListBox,NumberField as HNumberField,Select,TextField} from '@heroui/react';
import {ChevronRight,Dices,Eye,EyeOff,Info,Monitor,Plus,Sparkles,X} from 'lucide-react';
import {api,send,ApiError,osIconUrl,type List,type Row} from '../lib/api';
import {Choice} from '../components/Controls';
import {ErrorBox,type Notify} from '../components/Shared';
import {BlocksSkeleton} from '../components/PageSkeleton';
import {CountryFlag} from '../components/CountryFlag';
import {Flag,useOptions} from '../components/BatchOperation';
import {IpPicker} from '../components/InstanceActions';

/**
 * 新建实例（/clouds/new，方案 A）：单页分区（位置与镜像 · 实例与登录 · 规格与网络）+ 右侧吸顶的配置摘要与创建按钮。
 * 选项来自 v1/clouds/create_page（区域 → 节点 → 存储）、v1/node_images（按区域或节点）、ssh_keys、ip_groups、vpc_networks；
 * 提交到 POST /api/clouds/create（server/create.mjs 按文档字段校验后调用 POST v1/clouds）。
 */
type Area={id:number;name:string;short_name:string;country_code:string;country_name:string;store:Store[];node:{id:number;name:string;status:number;store:Store[]}[]};
type Store={id:number;name:string;type?:string;status:number;free?:number};
const CPU=[1,2,4,8,16];const MEM=[1,2,4,8,16,32];
const nodeTypeNames:Record<string,string>={host:'KVM 加强版',lightHost:'KVM 轻量版',hyperv:'Hyper-V',adsl:'拨号云'};
const randomPassword=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';const a=new Uint32Array(14);crypto.getRandomValues(a);return Array.from(a,n=>chars[n%chars.length]).join('')+'#7';};

function Panel({n,title,children,error}:{n:number;title:string;children:ReactNode;error?:string}){
 return <section className="ci-panel" id={'ci-'+n}><h2><em>{n}</em>{title}</h2>{error&&<p className="field-error">{error}</p>}{children}</section>;
}
/** 字段宽度按内容取：s 为数字（9.5rem），m 为端口、带宽等短值（11rem），l 为名称、密码等（16rem）；不传时占满所在格。 */
type W='s'|'m'|'l'|'xl';
const wc=(w?:W)=>w?' ci-w-'+w:'';
function Field({label,help,error,children,span=false,w}:{label:ReactNode;help?:string;error?:string;children:ReactNode;span?:boolean;w?:W}){
 return <div className={'ci-field'+(span?' ci-span':'')+wc(w)}><span className="ci-label">{label}</span>{children}{help&&!error&&<small className="field-help">{help}</small>}{error&&<small className="field-error">{error}</small>}</div>;
}
function Stepper({label,value,onChange,min,max,step=1,unit,error,help,disabled}:{label:string;value:string;onChange:(v:string)=>void;min:number;max:number;step?:number;unit?:string;error?:string;help?:string;disabled?:boolean}){
 return <div className="ci-field ci-w-s"><HNumberField className="ci-stepper" isDisabled={disabled} value={value===''?NaN:Number(value)} onChange={n=>onChange(n==null||Number.isNaN(n)?'':String(n))} minValue={min} maxValue={max} step={step} formatOptions={{useGrouping:false,maximumFractionDigits:0}}>
  <Label>{label}{unit&&<span className="batch-unit">（{unit}）</span>}</Label>
  <HNumberField.Group><HNumberField.DecrementButton/><HNumberField.Input/><HNumberField.IncrementButton/></HNumberField.Group>
 </HNumberField>{help&&!error&&<small className="field-help">{help}</small>}{error&&<small className="field-error">{error}</small>}</div>;
}
function Text({label,value,onChange,placeholder,error,help,mono=false,type='text',w}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;error?:string;help?:string;mono?:boolean;type?:'text'|'number';w?:W}){
 return <div className={'ci-field'+wc(w)}><TextField value={value} onChange={onChange} isInvalid={Boolean(error)}><Label>{label}</Label><Input className={mono?'mono':''} type={type} min={type==='number'?0:undefined} placeholder={placeholder} autoComplete="off"/></TextField>{help&&!error&&<small className="field-help">{help}</small>}{error&&<small className="field-error">{error}</small>}</div>;
}
function Chips<T extends number>({items,value,onPick,unit,label}:{items:T[];value:number;onPick:(v:T)=>void;unit:string;label:string}){
 return <div className="ci-chips" role="radiogroup" aria-label={label}>{items.map(v=><button type="button" key={v} role="radio" aria-checked={v===value} className={'ci-chip'+(v===value?' is-on':'')} onClick={()=>onPick(v)}>{v} {unit}</button>)}</div>;
}
function Seg({value,options,onChange,label}:{value:string;options:[string,string][];onChange:(v:string)=>void;label:string}){
 return <div className="rd-seg" role="radiogroup" aria-label={label}>{options.map(([k,t])=><button type="button" key={k} role="radio" aria-checked={value===k} className={value===k?'is-on':''} onClick={()=>onChange(k)}>{t}</button>)}</div>;
}

/** 所属用户：一个可输入的下拉，输入用户名或姓名即筛选（v1/user 的 search），留空由平台使用默认用户。 */
function UserPicker({value,onChange,invalid}:{value:{id:string;name:string};onChange:(v:{id:string;name:string})=>void;invalid?:boolean}){
 const [input,setInput]=useState(value.name),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(false);
 // 选中后输入框显示用户名；只有输入的内容和选中的用户名不同时才按输入搜索。
 const term=input===value.name?'':input.trim();
 useEffect(()=>{let live=true;setLoading(true);const t=setTimeout(()=>{api<List>('/manage/users?per_page=50&search='+encodeURIComponent(term)).then(r=>{if(live)setRows(r.data);}).catch(()=>{if(live)setRows([]);}).finally(()=>{if(live)setLoading(false);});},250);return()=>{live=false;clearTimeout(t);};},[term]);
 const items=value.id&&!rows.some(r=>String(r.id)===value.id)?[{id:value.id,username:value.name},...rows]:rows;
 return <ComboBox aria-label="所属用户" className="ci-user" menuTrigger="focus" allowsEmptyCollection isInvalid={invalid} selectedKey={value.id||null} inputValue={input}
  onInputChange={v=>{setInput(v);if(v===''&&value.id)onChange({id:'',name:''});}}
  onSelectionChange={k=>{if(k==null)return;const r=items.find(x=>String(x.id)===String(k));const name=String(r?.username||'');setInput(name);onChange({id:String(k),name});}}>
  <ComboBox.InputGroup><Input placeholder="平台默认用户，输入用户名筛选"/><ComboBox.Trigger/></ComboBox.InputGroup>
  <ComboBox.Popover><ListBox renderEmptyState={()=><div className="ci-empty-option">{loading?'正在搜索…':'没有找到用户'}</div>}>{items.map(r=><ListBox.Item key={r.id} id={String(r.id)} textValue={String(r.username)}><span className="ci-user-item"><span>{r.username}</span>{r.real_name&&<small>{r.real_name}</small>}</span></ListBox.Item>)}</ListBox></ComboBox.Popover>
 </ComboBox>;
}

/** 镜像：一行两个下拉，系统分类（带图标，平台顺序，Windows 倒数第二、其他最后）+ 系统版本。 */
type Img={id:number;name:string;group?:string;svg?:unknown;min?:number};
function OsIcon({svg,size=18}:{svg:unknown;size?:number}){const url=osIconUrl(svg);return url?<img src={url} alt="" width={size} height={size} className="ci-os-icon"/>:<Monitor size={size-2} className="ci-os-icon"/>;}
function OsPicker({options,error,value,onChange,invalid}:{options:Img[]|null;error:string;value:string;onChange:(v:string)=>void;invalid?:boolean}){
 const list=options||[];
 const rank=(n:string)=>n==='其他'?2:/windows/i.test(n)?1:0;
 const families=[...new Map(list.map(o=>[o.group||'其他',{name:o.group||'其他',svg:o.svg}])).values()].map((f,i)=>({...f,i})).sort((a,b)=>rank(a.name)-rank(b.name)||a.i-b.i);
 const current=list.find(o=>String(o.id)===value);
 const [family,setFamily]=useState('');
 const active=current?.group||family||families[0]?.name||'';
 const versions=list.filter(o=>(o.group||'其他')===active);
 if(error)return <ErrorBox message={error}/>;
 if(options&&!list.length)return <p className="field-help">这个区域还没有可用镜像，请先在镜像管理中下载到节点。</p>;
 return <div className="ci-fields ci-os-row">
  <Field label="系统分类"><Select aria-label="系统分类" className="ci-fit" isDisabled={!options} selectedKey={active||null} onSelectionChange={k=>{if(k!=null&&String(k)!==active){setFamily(String(k));onChange('');}}}>
   <Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger>
   <Select.Popover><ListBox>{families.map(f=><ListBox.Item key={f.name} id={f.name} textValue={f.name}><span className="ci-os-option"><OsIcon svg={f.svg}/>{f.name}</span></ListBox.Item>)}</ListBox></Select.Popover>
  </Select></Field>
  <Field label="系统版本" w="l" error={invalid?'请选择系统版本':undefined} help={current?.min?`最小系统盘 ${current.min} GB`:undefined}><Choice aria-label="系统版本" value={value} onChange={e=>onChange(e.target.value)}><option value="">{options?'请选择 '+active+' 版本':'加载中…'}</option>{versions.map(o=><option key={o.id} value={String(o.id)}>{o.name}</option>)}</Choice></Field>
 </div>;
}

/** 区域与节点（不用下拉）：左右两栏，左边区域列表，右边所选区域的节点；“自动分配”在节点列表第一项，异常节点不可选。 */
type PickProps={areas:Area[];area:string;node:string;onPick:(area:string,node:string)=>void};
const nodeNote=(n:Area['node'][number])=>n.status===1?'正常':'异常';
function LocationPicker({areas,area,node,onPick}:PickProps){
 const row=areas.find(a=>String(a.id)===area);
 return <Field label="区域与节点"><div className="ci-split">
  <div className="ci-split-list" role="radiogroup" aria-label="区域">{areas.map(a=>{const on=String(a.id)===area;return <button type="button" key={a.id} role="radio" aria-checked={on} className={'ci-split-item'+(on?' is-on':'')} onClick={()=>onPick(String(a.id),'')}>
   {a.country_code&&<CountryFlag code={a.country_code} name={a.country_name}/>}<span className="ci-split-label">{a.name}</span><small>{a.node.length} 个节点</small><ChevronRight size={14} className="ci-split-arrow"/></button>;})}</div>
  <div className="ci-split-list ci-split-nodes" role="radiogroup" aria-label="计算节点">
   {row&&<><button type="button" role="radio" aria-checked={!node} className={'ci-split-item'+(!node?' is-on':'')} onClick={()=>onPick(area,'')}><Sparkles size={14}/><span className="ci-split-label">自动分配</span><small>由平台按规则选择</small></button>
   {row.node.map(n=>{const on=String(n.id)===node;return <button type="button" key={n.id} role="radio" aria-checked={on} disabled={n.status!==1} className={'ci-split-item'+(on?' is-on':'')} onClick={()=>onPick(area,String(n.id))}><i className={'ci-dot'+(n.status===1?'':' is-bad')}/><span className="ci-split-label mono">{n.name}</span><small>{nodeNote(n)}</small></button>;})}</>}
  </div>
 </div></Field>;
}
export function CreateInstance({notify}:{notify:Notify}){
 const go=useNavigate();
 const [type,setType]=useState('host'),[page,setPage]=useState<{areas:Area[];node_type:string[]}|null>(null),[loadError,setLoadError]=useState('');
 const [area,setArea]=useState(''),[node,setNode]=useState(''),[priority,setPriority]=useState('1'),[store,setStore]=useState('');
 const [os,setOs]=useState('');
 const [cpu,setCpu]=useState('2'),[memGb,setMemGb]=useState('4'),[customCpu,setCustomCpu]=useState(false),[customMem,setCustomMem]=useState(false),[sysDisk,setSysDisk]=useState(''),[dataDisk,setDataDisk]=useState(''),[withData,setWithData]=useState(false);
 const [net,setNet]=useState('normal'),[vpc,setVpc]=useState(''),[vpcName,setVpcName]=useState(''),[vpcIps,setVpcIps]=useState(''),[ipNum,setIpNum]=useState('1'),[ipv6,setIpv6]=useState('0'),[ipGroup,setIpGroup]=useState(''),[inBw,setInBw]=useState(''),[outBw,setOutBw]=useState(''),[quota,setQuota]=useState('');
 const [login,setLogin]=useState('0'),[pass,setPass]=useState(''),[showPass,setShowPass]=useState(false),[sshKey,setSshKey]=useState(''),[port,setPort]=useState('');
 const [hostname,setHostname]=useState(''),[client,setClient]=useState({id:'',name:''}),[num,setNum]=useState('1'),[samePass,setSamePass]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const [vpcs,setVpcs]=useState<Row[]|null>(null);
 // 指定 IP（v1/clouds 的 ipaddress）：空闲 IP 按所选节点读取，自动分配节点时按区域读取；换区域或节点时清空已选。
 const [pickIp,setPickIp]=useState(false),[picked,setPicked]=useState<number[]>([]);
 const [freeIps,setFreeIps]=useState<{segments:Row[]|null;error:string}>({segments:null,error:''});

 useEffect(()=>{let live=true;setPage(null);setLoadError('');api('/clouds/create_page?type='+type).then(r=>{if(!live)return;setPage(r);if(!r.areas.some((a:Area)=>String(a.id)===area)){setArea(r.areas[0]?String(r.areas[0].id):'');setNode('');setStore('');}}).catch(e=>{if(live)setLoadError(e.message);});return()=>{live=false;};},[type]); // eslint-disable-line react-hooks/exhaustive-deps
 const areaRow=page?.areas.find(a=>String(a.id)===area),nodeRow=areaRow?.node.find(n=>String(n.id)===node);
 const stores=(nodeRow?nodeRow.store:areaRow?.store||[]).filter(s=>s.status!==0);
 const pick=(a:string,n:string)=>{if(a!==area||n!==node){setArea(a);setNode(n);setStore('');}};
 // Images available in the chosen area (or on the chosen node).
 const [images,setImages]=useState<{options:Img[]|null;error:string}>({options:null,error:''});
 useEffect(()=>{if(!area)return;let live=true;setImages({options:null,error:''});api(node?'/images/available?nodes='+node:'/images/available?area='+area).then(r=>{if(live)setImages({options:(r.data||[]).map((x:Row)=>({id:x.id,name:x.name,group:x.group,svg:x.group_svg,min:x.min_disk_size})),error:''});}).catch(e=>{if(live)setImages({options:[],error:e.message});});return()=>{live=false;};},[area,node]);
 useEffect(()=>{if(os&&images.options&&!images.options.some(o=>String(o.id)===os))setOs('');},[images.options]); // eslint-disable-line react-hooks/exhaustive-deps
 // SSH 密钥只列出所属用户的密钥（v1/ssh_keys?uid=）；没有选择用户时不列出。换用户时清空已选的密钥。
 const [keys,setKeys]=useState<Row[]|null>(null);
 useEffect(()=>{setSshKey('');if(login!=='1'||!client.id){setKeys(null);return;}let live=true;setKeys(null);api('/lookups/ssh_keys?uid='+client.id).then(r=>{if(live)setKeys(r.data||[]);}).catch(()=>{if(live)setKeys([]);});return()=>{live=false;};},[login,client.id]);
 const groups=useOptions('ip_groups');
 useEffect(()=>{setPicked([]);if(!pickIp||!area)return;let live=true;setFreeIps({segments:null,error:''});api('/clouds/create_ips?'+(node?'node='+node:'area='+area)).then(r=>{if(live)setFreeIps({segments:r.segments||[],error:''});}).catch(e=>{if(live)setFreeIps({segments:[],error:e.message});});return()=>{live=false;};},[pickIp,area,node]);
 // 空闲 IPv6（v1/ipv6_segments 按节点或区域的 free 合计）：为 0 时不显示 IPv6 数量，也不提交；读取失败时照常显示。
 const [v6Free,setV6Free]=useState<number|null>(null);
 useEffect(()=>{setV6Free(null);if(!area||net!=='normal')return;let live=true;api('/clouds/create_ipv6?'+(node?'node='+node:'area='+area)).then(r=>{if(live)setV6Free(Number(r.free)||0);}).catch(()=>{if(live)setV6Free(-1);});return()=>{live=false;};},[area,node,net]);
 const showV6=net==='normal'&&v6Free!==null&&v6Free!==0;
 useEffect(()=>{if(v6Free===0)setIpv6('0');},[v6Free]);
 const ipText=(id:number)=>String((freeIps.segments||[]).flatMap(sg=>sg.ips as Row[]).find(x=>Number(x.id)===id)?.ip??'#'+id);
 useEffect(()=>{if(net!=='vpc'){setVpcs(null);return;}let live=true;const q=new URLSearchParams();if(area)q.set('area',area);if(client.id)q.set('user',client.id);api('/clouds/create_vpcs?'+q).then(r=>{if(live)setVpcs(r.data||[]);}).catch(()=>{if(live)setVpcs([]);});return()=>{live=false;};},[net,area,client.id]);

 const image=images.options?.find(o=>String(o.id)===os);
 const memMb=Math.round(Number(memGb)*1024);
 const keyName=keys?.find(k=>String(k.id)===sshKey)?.name;
 const summary:[string,string][]=[
  ['区域',areaRow?.name||'—'],['节点',nodeRow?.name||'自动分配'],['镜像',image?String(image.name):'未选择'],
  ['所属用户',client.name||'平台默认用户'],['登录',login==='1'?(keyName?'密钥 '+keyName:'密钥'):pass?'自定义密码':'随机密码'],['数量',(pickIp?1:num||1)+' 台'],
  ['规格',`${cpu||'—'} vCPU · ${memGb||'—'} GB`],['系统盘',sysDisk?sysDisk+' GB':'跟随系统设置'],...(withData&&dataDisk?[['数据盘',dataDisk+' GB'] as [string,string]]:[]),
  ['网络',(net==='vpc'?'VPC':'经典')+' · '+(pickIp?(picked.length?(picked.length>1?ipText(picked[0])+' 等 '+picked.length+' 个':ipText(picked[0])):'指定 IP（未选）'):(ipNum||0)+' 个 IPv4')+(showV6&&Number(ipv6)>0?' · '+ipv6+' 个 IPv6':'')],
  ['带宽',(inBw||outBw)?`${inBw||'不限'} / ${outBw||'不限'} Mbps`:'不限'],['流量',quota&&quota!=='0'?quota+' GB':'不限']
 ];

 async function create(){
  const local:Record<string,string>={};
  if(!area)local.area='请选择区域';if(!os)local.os='请选择系统镜像';if(!Number(cpu))local.cpu='请选择 CPU';if(!(memMb>=128))local.memory='请选择内存';
  if(pickIp&&!picked.length)local.ipaddress='请选择要指定的 IP，或改用随机分配';
  if(login==='1'&&!client.id)local.client='使用密钥登录时，请先选择所属用户';else if(login==='1'&&!sshKey)local.ssh_key='请选择密钥';
  if(Object.keys(local).length){setErrors(local);setError('请检查标红的项目');document.getElementById(local.area||local.os?'ci-1':local.client||local.ssh_key?'ci-2':'ci-3')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const body:Row={type,area:Number(area),node:node?Number(node):0,node_priority:Number(priority),store:store?Number(store):0,os:Number(os),cpu:Number(cpu),memory:memMb,network_type:net,ip_num:Number(ipNum||0),password_type:Number(login),num:pickIp?1:Number(num||1)};
  if(pickIp){delete body.ip_num;body.ipaddress=picked;}
  const opt=(k:string,v:string)=>{if(v!=='')body[k]=Number(v);};
  opt('system_disk_size',sysDisk);if(withData)opt('data_disk_size',dataDisk);if(showV6)opt('ipv6_num',ipv6);opt('ip_group',ipGroup);opt('in_bw',inBw);opt('out_bw',outBw);opt('traffic_quota',quota);
  if(net==='vpc'){if(vpc)body.vpc=Number(vpc);else{if(vpcName)body.vpc_name=vpcName;if(vpcIps)body.vpc_ips=vpcIps;}}
  if(login==='1')body.ssh_key=Number(sshKey);else if(pass)body.rootpass=pass;
  if(port)body.port=port;if(hostname)body.hostname=hostname;if(client.id)body.client=Number(client.id);if(!pickIp&&Number(num)>1&&login==='0')body.the_same_pass=samePass?1:0;
  setBusy(true);setError('');setErrors({});
  try{const r=await api<Row>('/clouds/create',send('POST',body));const n=Number(r.num)||1;notify(`已提交创建 ${n} 台实例${r.taskid?'，任务 #'+r.taskid:''}`);go(n===1&&r.ids?.length===1?'/clouds/'+r.ids[0]:'/clouds');}
  catch(e){setError((e as Error).message);if(e instanceof ApiError&&e.fields)setErrors(e.fields);}
  finally{setBusy(false);}
 }

 const typeOptions=useMemo(()=>(page?.node_type?.length?page.node_type:['host']).filter(t=>nodeTypeNames[t]).map(t=>[t,nodeTypeNames[t]] as [string,string]),[page]);
 return <div className="create-instance">
  <nav className="section-kicker inst-crumb ci-crumb" aria-label="面包屑"><button type="button" className="crumb-link" onClick={()=>go('/clouds')}>实例管理</button><span aria-hidden="true"> / </span><span>新建实例</span></nav>
  <div className="page-heading"><div><h1>新建实例</h1></div></div>
  {loadError?<ErrorBox message={loadError} retry={()=>setType(t=>t)}/>:!page?<BlocksSkeleton blocks={3}/>:
  <div className="ci-layout">
   <div className="ci-main">
    <Panel n={1} title="位置与镜像" error={errors.area}>
     {typeOptions.length>1&&<Field label="节点类型"><Seg label="节点类型" value={type} options={typeOptions} onChange={v=>{setType(v);setNode('');setStore('');}}/></Field>}
     {page.areas.length?<LocationPicker areas={page.areas} area={area} node={node} onPick={pick}/>:<p className="field-help">这个节点类型下还没有可用区域。</p>}
     {areaRow&&(!node?<Field label="自动分配方式"><Seg label="自动分配方式" value={priority} options={[['1','实例数量平均'],['2','负载最低'],['3','内存占用最低']]} onChange={setPriority}/></Field>
      :<Field label="存储" error={errors.store}><div className="ci-chips" role="radiogroup" aria-label="存储"><button type="button" role="radio" aria-checked={!store} className={'ci-chip'+(!store?' is-on':'')} onClick={()=>setStore('')}>自动选择</button>{stores.map(s=><button type="button" key={s.id} role="radio" aria-checked={String(s.id)===store} className={'ci-chip'+(String(s.id)===store?' is-on':'')} onClick={()=>setStore(String(s.id))}>{s.name}{s.free!=null&&<small className="ci-chip-note">剩余 {Math.round(Number(s.free))} GB</small>}</button>)}</div></Field>)}
     <div className="ci-divider"/>
     <OsPicker options={images.options} error={images.error} value={os} onChange={setOs} invalid={Boolean(errors.os)}/>
    </Panel>

    <Panel n={2} title="实例与登录">
     <div className="ci-fields">
      <Field label="所属用户" w="l" error={errors.client}><UserPicker value={client} onChange={setClient} invalid={Boolean(errors.client)}/></Field>
      <Text label="主机名" w="l" value={hostname} onChange={setHostname} placeholder="自动生成" help={Number(num)>1?'批量创建时作为前缀，依次加 001、002…':undefined} error={errors.hostname}/>
      <Stepper label="创建数量" unit="台" value={pickIp?'1':num} onChange={setNum} min={1} max={100} disabled={pickIp} error={errors.num} help={pickIp?'指定 IP 时只能创建 1 台':undefined}/>
     </div>
     <Field label="登录方式"><Seg label="登录方式" value={login} options={[['0','密码'],['1','密钥']]} onChange={setLogin}/></Field>
     <div className="ci-fields">
      {login==='0'?<div className="ci-field ci-w-l"><TextField value={pass} onChange={setPass} isInvalid={Boolean(errors.rootpass)}><Label>密码</Label><InputGroup><InputGroup.Input type={showPass?'text':'password'} placeholder="留空由平台随机生成" autoComplete="new-password"/><InputGroup.Suffix><Button variant="ghost" size="sm" isIconOnly aria-label="随机生成密码" onPress={()=>{setPass(randomPassword());setShowPass(true);}}><Dices size={16}/></Button><Button variant="ghost" size="sm" isIconOnly aria-label={showPass?'隐藏密码':'显示密码'} onPress={()=>setShowPass(!showPass)}>{showPass?<EyeOff size={16}/>:<Eye size={16}/>}</Button></InputGroup.Suffix></InputGroup></TextField>{errors.rootpass&&<small className="field-error">{errors.rootpass}</small>}</div>
      :<Field label="密钥" w="l" error={errors.ssh_key} help={!client.id?'只列出所属用户的密钥，请先选择所属用户':keys&&!keys.length?(client.name||'该用户')+' 还没有密钥，可在“密钥管理”中添加':'只列出 '+client.name+' 的密钥'}>
        <Choice aria-label="密钥" value={sshKey} onChange={e=>setSshKey(e.target.value)}><option value="">{!client.id?'请先选择所属用户':!keys?'加载中…':keys.length?'请选择密钥':'没有可用的密钥'}</option>{(keys||[]).map(k=><option key={k.id} value={String(k.id)}>{k.name}</option>)}</Choice></Field>}
      <Text label="SSH / 远程端口" w="m" mono value={port} onChange={setPort} placeholder="跟随系统" error={errors.port}/>
     </div>
     {!pickIp&&Number(num)>1&&login==='0'&&<Flag checked={samePass} onChange={setSamePass}>批量创建的实例使用同一个密码</Flag>}
    </Panel>

    <Panel n={3} title="规格与网络">
     <Field label="CPU" error={errors.cpu}>{customCpu?<div className="ci-inline"><Stepper label="CPU" unit="核" value={cpu} onChange={setCpu} min={1} max={512}/><Button size="sm" variant="ghost" onPress={()=>{setCustomCpu(false);setCpu('2');}}>选择常用档位</Button></div>
      :<div className="ci-inline"><Chips label="CPU" items={CPU} value={Number(cpu)} unit="核" onPick={v=>setCpu(String(v))}/><button type="button" className={'ci-chip'+(!CPU.includes(Number(cpu))?' is-on':'')} onClick={()=>setCustomCpu(true)}>自定义</button></div>}</Field>
     <Field label="内存" error={errors.memory}>{customMem?<div className="ci-inline"><Stepper label="内存" unit="GB" value={memGb} onChange={setMemGb} min={1} max={4096}/><Button size="sm" variant="ghost" onPress={()=>{setCustomMem(false);setMemGb('4');}}>选择常用档位</Button></div>
      :<div className="ci-inline"><Chips label="内存" items={MEM} value={Number(memGb)} unit="GB" onPick={v=>setMemGb(String(v))}/><button type="button" className={'ci-chip'+(!MEM.includes(Number(memGb))?' is-on':'')} onClick={()=>setCustomMem(true)}>自定义</button></div>}</Field>
     <div className="ci-fields">
      <Stepper label="系统盘" unit="GB" value={sysDisk} onChange={setSysDisk} min={1} max={65536} step={10} error={errors.system_disk_size} help="留空跟随系统设置"/>
      {withData?<div className="ci-inline ci-data"><Stepper label="数据盘" unit="GB" value={dataDisk} onChange={setDataDisk} min={1} max={65536} step={10} error={errors.data_disk_size}/><Button size="sm" variant="ghost" isIconOnly aria-label="移除数据盘" onPress={()=>{setWithData(false);setDataDisk('');}}><X size={15}/></Button></div>
      :<Field label="数据盘"><Button size="sm" variant="ghost" className="ci-add" onPress={()=>{setWithData(true);setDataDisk('50');}}><Plus size={15}/>添加数据盘</Button></Field>}
     </div>
     <div className="ci-divider"/>
     <Field label="网络类型"><Seg label="网络类型" value={net} options={[['normal','经典网络'],...(type==='host'?[['vpc','VPC 网络'] as [string,string]]:[])]} onChange={setNet}/></Field>
     {net==='vpc'&&<div className="ci-fields">
      <Field label="VPC 网络" w="l" error={errors.vpc}><Choice aria-label="VPC 网络" value={vpc} onChange={e=>setVpc(e.target.value)}><option value="">新建 VPC 网络</option>{(vpcs||[]).map(v=><option key={v.id} value={String(v.id)}>{v.name} · {v.ips}{v.username?' · '+v.username:''}</option>)}</Choice></Field>
      {!vpc&&<Text label="新 VPC 名称" w="m" value={vpcName} onChange={setVpcName} placeholder="留空自动命名" error={errors.vpc_name}/>}
      {!vpc&&<Text label="新 VPC 网段" w="m" mono value={vpcIps} onChange={setVpcIps} placeholder="10.10.0.0/24" error={errors.vpc_ips} help="192.168 / 172.16 / 10 的 /16～/28 子网"/>}
     </div>}
     <Field label="IPv4 地址" error={errors.ipaddress}><Seg label="IPv4 地址" value={pickIp?'pick':'random'} options={[['random','随机分配'],['pick','指定 IP']]} onChange={v=>{setPickIp(v==='pick');setPicked([]);}}/></Field>
     {pickIp?<div className="ci-fields">
      <Field label={'选择 IP（已选 '+picked.length+' 个）'} w="xl" help={freeIps.segments&&freeIps.segments.length?'列出'+(nodeRow?'节点 '+nodeRow.name:'区域 '+(areaRow?.name||''))+' 的空闲 IP，可多选，第一个为主 IP；平台会把实例分配到这些 IP 所在的节点':undefined}>
       {freeIps.error?<ErrorBox message={freeIps.error}/>:!freeIps.segments?<p className="field-help">正在读取空闲 IP…</p>:!freeIps.segments.length?<p className="field-help">{nodeRow?'这个节点':'这个区域'}暂无空闲 IP，请改用随机分配。</p>:<IpPicker label="选择 IP" segments={freeIps.segments} value={picked} onChange={setPicked}/>}
      </Field>
      {showV6&&<Stepper label="IPv6 数量" unit="个" value={ipv6} onChange={setIpv6} min={0} max={v6Free>0?Math.min(256,v6Free):256} error={errors.ipv6_num} help={v6Free>0?'可用 '+v6Free+' 个':undefined}/>}
     </div>
     :<div className="ci-fields">
      <Stepper label="IPv4 数量" unit="个" value={ipNum} onChange={setIpNum} min={0} max={256} error={errors.ip_num}/>
      {showV6&&<Stepper label="IPv6 数量" unit="个" value={ipv6} onChange={setIpv6} min={0} max={v6Free>0?Math.min(256,v6Free):256} error={errors.ipv6_num} help={v6Free>0?'可用 '+v6Free+' 个':undefined}/>}
      <Field label="IP 分组" w="m" error={errors.ip_group}><Choice aria-label="IP 分组" value={ipGroup} onChange={e=>setIpGroup(e.target.value)}><option value="">不指定</option>{(groups.options||[]).map(g=><option key={g.id} value={String(g.id)}>{g.name}</option>)}</Choice></Field>
     </div>}
     <div className="ci-fields">
      <Text label="入站带宽（Mbps）" w="m" type="number" value={inBw} onChange={setInBw} placeholder="不限" error={errors.in_bw}/>
      <Text label="出站带宽（Mbps）" w="m" type="number" value={outBw} onChange={setOutBw} placeholder="不限" error={errors.out_bw}/>
      <Text label="流量限额（GB）" w="m" type="number" value={quota} onChange={setQuota} placeholder="不限" help="0 或留空表示不限" error={errors.traffic_quota}/>
     </div>
    </Panel>
   </div>

   <aside className="ci-summary" aria-label="配置摘要">
    <h2>配置摘要</h2>
    <dl>{summary.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {error&&<ErrorBox message={error}/>}
    <div className="rd-note"><Info size={15}/><span>提交后可在实例详情或任务日志中查看创建进度。</span></div>
    <Button className="ci-submit" isPending={busy} isDisabled={busy} onPress={create}>创建{!pickIp&&Number(num)>1?` ${num} 台`:''}实例</Button>
    <Button variant="outline" className="ci-submit" isDisabled={busy} onPress={()=>go('/clouds')}>取消</Button>
   </aside>
  </div>}
 </div>;
}
