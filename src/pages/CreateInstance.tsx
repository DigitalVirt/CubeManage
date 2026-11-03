import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {Button,Input,InputGroup,Label,NumberField as HNumberField,TextField} from '@heroui/react';
import {Dices,Eye,EyeOff,Info,Plus,Search,X} from 'lucide-react';
import {api,send,ApiError,type List,type Row} from '../lib/api';
import {Choice} from '../components/Controls';
import {ErrorBox,type Notify} from '../components/Shared';
import {BlocksSkeleton} from '../components/PageSkeleton';
import {CountryFlag} from '../components/CountryFlag';
import {Flag,ImagePicker,useOptions} from '../components/BatchOperation';

/**
 * 新建实例（/clouds/new，方案 A）：单页分区（位置 · 镜像 · 规格 · 网络 · 登录 · 实例信息）+ 右侧吸顶的配置摘要与创建按钮。
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
function Field({label,help,error,children,span=false}:{label:ReactNode;help?:string;error?:string;children:ReactNode;span?:boolean}){
 return <div className={'ci-field'+(span?' ci-span':'')}><span className="ci-label">{label}</span>{children}{help&&!error&&<small className="field-help">{help}</small>}{error&&<small className="field-error">{error}</small>}</div>;
}
function Stepper({label,value,onChange,min,max,step=1,unit,error,help}:{label:string;value:string;onChange:(v:string)=>void;min:number;max:number;step?:number;unit?:string;error?:string;help?:string}){
 return <div className="ci-field"><HNumberField className="ci-stepper" value={value===''?NaN:Number(value)} onChange={n=>onChange(n==null||Number.isNaN(n)?'':String(n))} minValue={min} maxValue={max} step={step} formatOptions={{useGrouping:false,maximumFractionDigits:0}}>
  <Label>{label}{unit&&<span className="batch-unit">（{unit}）</span>}</Label>
  <HNumberField.Group><HNumberField.DecrementButton/><HNumberField.Input/><HNumberField.IncrementButton/></HNumberField.Group>
 </HNumberField>{help&&!error&&<small className="field-help">{help}</small>}{error&&<small className="field-error">{error}</small>}</div>;
}
function Text({label,value,onChange,placeholder,error,help,mono=false,type='text'}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;error?:string;help?:string;mono?:boolean;type?:'text'|'number'}){
 return <div className="ci-field"><TextField value={value} onChange={onChange} isInvalid={Boolean(error)}><Label>{label}</Label><Input className={mono?'mono':''} type={type} min={type==='number'?0:undefined} placeholder={placeholder} autoComplete="off"/></TextField>{help&&!error&&<small className="field-help">{help}</small>}{error&&<small className="field-error">{error}</small>}</div>;
}
function Chips<T extends number>({items,value,onPick,unit,label}:{items:T[];value:number;onPick:(v:T)=>void;unit:string;label:string}){
 return <div className="ci-chips" role="radiogroup" aria-label={label}>{items.map(v=><button type="button" key={v} role="radio" aria-checked={v===value} className={'ci-chip'+(v===value?' is-on':'')} onClick={()=>onPick(v)}>{v} {unit}</button>)}</div>;
}
function Seg({value,options,onChange,label}:{value:string;options:[string,string][];onChange:(v:string)=>void;label:string}){
 return <div className="rd-seg" role="radiogroup" aria-label={label}>{options.map(([k,t])=><button type="button" key={k} role="radio" aria-checked={value===k} className={value===k?'is-on':''} onClick={()=>onChange(k)}>{t}</button>)}</div>;
}

/** 所属用户：按用户名搜索平台用户（v1/user），留空由平台使用默认用户。 */
function UserPicker({value,onChange}:{value:{id:string;name:string};onChange:(v:{id:string;name:string})=>void}){
 const [search,setSearch]=useState(''),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(false);
 useEffect(()=>{let live=true;setLoading(true);const t=setTimeout(()=>{api<List>('/manage/users?per_page=50&search='+encodeURIComponent(search)).then(r=>{if(live)setRows(r.data);}).catch(()=>{if(live)setRows([]);}).finally(()=>{if(live)setLoading(false);});},250);return()=>{live=false;clearTimeout(t);};},[search]);
 return <div className="ci-user">
  <InputGroup className="ci-user-search"><InputGroup.Prefix><Search size={15}/></InputGroup.Prefix><InputGroup.Input aria-label="搜索用户" placeholder="搜索用户名" value={search} onChange={e=>setSearch(e.target.value)}/></InputGroup>
  <Choice aria-label="所属用户" value={value.id} onChange={e=>{const r=rows.find(x=>String(x.id)===e.target.value);onChange({id:e.target.value,name:r?.username||''});}}>
   <option value="">{loading?'加载中…':'平台默认用户'}</option>
   {value.id&&!rows.some(r=>String(r.id)===value.id)&&<option value={value.id}>{value.name||'用户 #'+value.id}</option>}
   {rows.map(r=><option key={r.id} value={String(r.id)}>{r.username}{r.real_name?' · '+r.real_name:''}</option>)}
  </Choice>
 </div>;
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

 useEffect(()=>{let live=true;setPage(null);setLoadError('');api('/clouds/create_page?type='+type).then(r=>{if(!live)return;setPage(r);if(!r.areas.some((a:Area)=>String(a.id)===area)){setArea(r.areas[0]?String(r.areas[0].id):'');setNode('');setStore('');}}).catch(e=>{if(live)setLoadError(e.message);});return()=>{live=false;};},[type]); // eslint-disable-line react-hooks/exhaustive-deps
 const areaRow=page?.areas.find(a=>String(a.id)===area),nodeRow=areaRow?.node.find(n=>String(n.id)===node);
 const stores=(nodeRow?nodeRow.store:areaRow?.store||[]).filter(s=>s.status!==0);
 // Images available in the chosen area (or on the chosen node).
 const [images,setImages]=useState<{options:Row[]|null;error:string}>({options:null,error:''});
 useEffect(()=>{if(!area)return;let live=true;setImages({options:null,error:''});api(node?'/images/available?nodes='+node:'/images/available?area='+area).then(r=>{if(live)setImages({options:(r.data||[]).map((x:Row)=>({id:x.id,name:x.name,group:x.group,svg:x.group_svg,min:x.min_disk_size})),error:''});}).catch(e=>{if(live)setImages({options:[],error:e.message});});return()=>{live=false;};},[area,node]);
 useEffect(()=>{if(os&&images.options&&!images.options.some(o=>String(o.id)===os))setOs('');},[images.options]); // eslint-disable-line react-hooks/exhaustive-deps
 const keys=useOptions(login==='1'?'ssh_keys':null),groups=useOptions('ip_groups');
 useEffect(()=>{if(net!=='vpc'){setVpcs(null);return;}let live=true;const q=new URLSearchParams();if(area)q.set('area',area);if(client.id)q.set('user',client.id);api('/clouds/create_vpcs?'+q).then(r=>{if(live)setVpcs(r.data||[]);}).catch(()=>{if(live)setVpcs([]);});return()=>{live=false;};},[net,area,client.id]);

 const image=images.options?.find(o=>String(o.id)===os);
 const memMb=Math.round(Number(memGb)*1024);
 const summary:[string,string][]=[
  ['区域',areaRow?.name||'—'],['节点',nodeRow?.name||'自动分配'],['镜像',image?String(image.name):'未选择'],
  ['规格',`${cpu||'—'} vCPU · ${memGb||'—'} GB`],['系统盘',sysDisk?sysDisk+' GB':'跟随系统设置'],...(withData&&dataDisk?[['数据盘',dataDisk+' GB'] as [string,string]]:[]),
  ['网络',(net==='vpc'?'VPC':'经典')+' · '+(ipNum||0)+' 个 IPv4'+(Number(ipv6)>0?' · '+ipv6+' 个 IPv6':'')],
  ['带宽',(inBw||outBw)?`${inBw||'不限'} / ${outBw||'不限'} Mbps`:'不限'],['流量',quota&&quota!=='0'?quota+' GB':'不限'],
  ['登录',login==='1'?'SSH 密钥':pass?'自定义密码':'随机密码'],['数量',(num||1)+' 台']
 ];

 async function create(){
  const local:Record<string,string>={};
  if(!area)local.area='请选择区域';if(!os)local.os='请选择系统镜像';if(!Number(cpu))local.cpu='请选择 CPU';if(!(memMb>=128))local.memory='请选择内存';
  if(login==='1'&&!sshKey)local.ssh_key='请选择 SSH 密钥';
  if(Object.keys(local).length){setErrors(local);setError('请检查标红的项目');document.getElementById(local.area?'ci-1':local.os?'ci-2':local.cpu||local.memory?'ci-3':'ci-5')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const body:Row={type,area:Number(area),node:node?Number(node):0,node_priority:Number(priority),store:store?Number(store):0,os:Number(os),cpu:Number(cpu),memory:memMb,network_type:net,ip_num:Number(ipNum||0),password_type:Number(login),num:Number(num||1)};
  const opt=(k:string,v:string)=>{if(v!=='')body[k]=Number(v);};
  opt('system_disk_size',sysDisk);if(withData)opt('data_disk_size',dataDisk);if(net==='normal')opt('ipv6_num',ipv6);opt('ip_group',ipGroup);opt('in_bw',inBw);opt('out_bw',outBw);opt('traffic_quota',quota);
  if(net==='vpc'){if(vpc)body.vpc=Number(vpc);else{if(vpcName)body.vpc_name=vpcName;if(vpcIps)body.vpc_ips=vpcIps;}}
  if(login==='1')body.ssh_key=Number(sshKey);else if(pass)body.rootpass=pass;
  if(port)body.port=port;if(hostname)body.hostname=hostname;if(client.id)body.client=Number(client.id);if(Number(num)>1&&login==='0')body.the_same_pass=samePass?1:0;
  setBusy(true);setError('');setErrors({});
  try{const r=await api<Row>('/clouds/create',send('POST',body));const n=Number(r.num)||1;notify(`已提交创建 ${n} 台实例${r.taskid?'，任务 #'+r.taskid:''}`);go(n===1&&r.ids?.length===1?'/clouds/'+r.ids[0]:'/clouds');}
  catch(e){setError((e as Error).message);if(e instanceof ApiError&&e.fields)setErrors(e.fields);}
  finally{setBusy(false);}
 }

 const typeOptions=useMemo(()=>(page?.node_type?.length?page.node_type:['host']).filter(t=>nodeTypeNames[t]).map(t=>[t,nodeTypeNames[t]] as [string,string]),[page]);
 return <div className="create-instance">
  <nav className="section-kicker inst-crumb ci-crumb" aria-label="面包屑"><button type="button" className="crumb-link" onClick={()=>go('/clouds')}>实例管理</button><span aria-hidden="true"> / </span><span>新建实例</span></nav>
  <div className="page-heading"><div><h1>新建实例</h1></div></div>
  {loadError?<ErrorBox message={loadError} retry={()=>setType(t=>t)}/>:!page?<BlocksSkeleton blocks={4}/>:
  <div className="ci-layout">
   <div className="ci-main">
    <Panel n={1} title="位置" error={errors.area}>
     {typeOptions.length>1&&<Field label="节点类型"><Seg label="节点类型" value={type} options={typeOptions} onChange={v=>{setType(v);setNode('');setStore('');}}/></Field>}
     {page.areas.length?<div className="ci-areas" role="radiogroup" aria-label="区域">{page.areas.map(a=><button type="button" key={a.id} role="radio" aria-checked={String(a.id)===area} className={'ci-area'+(String(a.id)===area?' is-on':'')} onClick={()=>{setArea(String(a.id));setNode('');setStore('');}}>
      <strong>{a.country_code&&<CountryFlag code={a.country_code} name={a.country_name}/>}{a.name}</strong><small>{a.node.length} 个节点{a.short_name?' · '+a.short_name:''}</small></button>)}</div>
     :<p className="field-help">这个节点类型下还没有可用区域。</p>}
     <div className="ci-grid">
      <Field label="计算节点"><Choice aria-label="计算节点" value={node} onChange={e=>{setNode(e.target.value);setStore('');}}><option value="">自动分配</option>{(areaRow?.node||[]).map(n=><option key={n.id} value={String(n.id)}>{n.name}{n.status===1?'':'（异常）'}</option>)}</Choice></Field>
      {!node?<Field label="自动分配方式"><Choice aria-label="自动分配方式" value={priority} onChange={e=>setPriority(e.target.value)}><option value="1">实例数量平均</option><option value="2">负载最低</option><option value="3">内存占用最低</option></Choice></Field>
      :<Field label="存储" error={errors.store}><Choice aria-label="存储" value={store} onChange={e=>setStore(e.target.value)}><option value="">自动选择</option>{stores.map(s=><option key={s.id} value={String(s.id)}>{s.name}{s.free!=null?` · 剩余 ${Math.round(Number(s.free))} GB`:''}</option>)}</Choice></Field>}
     </div>
    </Panel>

    <Panel n={2} title="镜像" error={errors.os}>
     <div className="ci-image"><ImagePicker value={os} onChange={setOs} lookup={{options:images.options as ReturnType<typeof useOptions>['options'],error:images.error}} emptyText="这个区域还没有可用镜像，请先在镜像管理中下载到节点。" hint={image?.min?`最小系统盘 ${image.min} GB`:undefined}/></div>
    </Panel>

    <Panel n={3} title="规格">
     <Field label="CPU" error={errors.cpu}>{customCpu?<div className="ci-inline"><Stepper label="CPU" unit="核" value={cpu} onChange={setCpu} min={1} max={512}/><Button size="sm" variant="ghost" onPress={()=>{setCustomCpu(false);setCpu('2');}}>选择常用档位</Button></div>
      :<div className="ci-inline"><Chips label="CPU" items={CPU} value={Number(cpu)} unit="核" onPick={v=>setCpu(String(v))}/><button type="button" className={'ci-chip'+(!CPU.includes(Number(cpu))?' is-on':'')} onClick={()=>setCustomCpu(true)}>自定义</button></div>}</Field>
     <Field label="内存" error={errors.memory}>{customMem?<div className="ci-inline"><Stepper label="内存" unit="GB" value={memGb} onChange={setMemGb} min={1} max={4096}/><Button size="sm" variant="ghost" onPress={()=>{setCustomMem(false);setMemGb('4');}}>选择常用档位</Button></div>
      :<div className="ci-inline"><Chips label="内存" items={MEM} value={Number(memGb)} unit="GB" onPick={v=>setMemGb(String(v))}/><button type="button" className={'ci-chip'+(!MEM.includes(Number(memGb))?' is-on':'')} onClick={()=>setCustomMem(true)}>自定义</button></div>}</Field>
     <div className="ci-grid">
      <Stepper label="系统盘" unit="GB" value={sysDisk} onChange={setSysDisk} min={1} max={65536} step={10} error={errors.system_disk_size} help="留空跟随系统设置"/>
      {withData?<div className="ci-inline ci-data"><Stepper label="数据盘" unit="GB" value={dataDisk} onChange={setDataDisk} min={1} max={65536} step={10} error={errors.data_disk_size}/><Button size="sm" variant="ghost" isIconOnly aria-label="移除数据盘" onPress={()=>{setWithData(false);setDataDisk('');}}><X size={15}/></Button></div>
      :<Field label="数据盘"><Button size="sm" variant="ghost" className="ci-add" onPress={()=>{setWithData(true);setDataDisk('50');}}><Plus size={15}/>添加数据盘</Button></Field>}
     </div>
    </Panel>

    <Panel n={4} title="网络">
     <Field label="网络类型"><Seg label="网络类型" value={net} options={[['normal','经典网络'],...(type==='host'?[['vpc','VPC 专有网络'] as [string,string]]:[])]} onChange={setNet}/></Field>
     {net==='vpc'&&<div className="ci-grid">
      <Field label="VPC 网络" error={errors.vpc}><Choice aria-label="VPC 网络" value={vpc} onChange={e=>setVpc(e.target.value)}><option value="">新建 VPC 网络</option>{(vpcs||[]).map(v=><option key={v.id} value={String(v.id)}>{v.name} · {v.ips}{v.username?' · '+v.username:''}</option>)}</Choice></Field>
      {!vpc&&<Text label="新 VPC 名称" value={vpcName} onChange={setVpcName} placeholder="留空自动命名" error={errors.vpc_name}/>}
      {!vpc&&<Text label="新 VPC 网段" mono value={vpcIps} onChange={setVpcIps} placeholder="10.10.0.0/24" error={errors.vpc_ips} help="192.168 / 172.16 / 10 的 /16～/28 子网"/>}
     </div>}
     <div className="ci-grid ci-grid-3">
      <Stepper label="IPv4 数量" unit="个" value={ipNum} onChange={setIpNum} min={0} max={256} error={errors.ip_num}/>
      {net==='normal'&&<Stepper label="IPv6 数量" unit="个" value={ipv6} onChange={setIpv6} min={0} max={256} error={errors.ipv6_num}/>}
      <Field label="IP 分组" error={errors.ip_group}><Choice aria-label="IP 分组" value={ipGroup} onChange={e=>setIpGroup(e.target.value)}><option value="">不指定</option>{(groups.options||[]).map(g=><option key={g.id} value={String(g.id)}>{g.name}</option>)}</Choice></Field>
     </div>
     <div className="ci-grid ci-grid-3">
      <Text label="入站带宽（Mbps）" type="number" value={inBw} onChange={setInBw} placeholder="不限" error={errors.in_bw}/>
      <Text label="出站带宽（Mbps）" type="number" value={outBw} onChange={setOutBw} placeholder="不限" error={errors.out_bw}/>
      <Text label="流量限额（GB）" type="number" value={quota} onChange={setQuota} placeholder="不限" help="0 或留空表示不限" error={errors.traffic_quota}/>
     </div>
    </Panel>

    <Panel n={5} title="登录">
     <Field label="登录方式"><Seg label="登录方式" value={login} options={[['0','密码'],['1','SSH 密钥']]} onChange={setLogin}/></Field>
     <div className="ci-grid ci-grid-3">
      {login==='0'?<div className="ci-field"><TextField value={pass} onChange={setPass} isInvalid={Boolean(errors.rootpass)}><Label>密码</Label><InputGroup><InputGroup.Input type={showPass?'text':'password'} placeholder="留空由平台随机生成" autoComplete="new-password"/><InputGroup.Suffix><Button variant="ghost" size="sm" isIconOnly aria-label="随机生成密码" onPress={()=>{setPass(randomPassword());setShowPass(true);}}><Dices size={16}/></Button><Button variant="ghost" size="sm" isIconOnly aria-label={showPass?'隐藏密码':'显示密码'} onPress={()=>setShowPass(!showPass)}>{showPass?<EyeOff size={16}/>:<Eye size={16}/>}</Button></InputGroup.Suffix></InputGroup></TextField>{errors.rootpass?<small className="field-error">{errors.rootpass}</small>:<small className="field-help">6～128 位；Windows 镜像需满足复杂度要求</small>}</div>
      :<Field label="SSH 密钥" error={errors.ssh_key}><Choice aria-label="SSH 密钥" value={sshKey} onChange={e=>setSshKey(e.target.value)}><option value="">{keys.options?'请选择 SSH 密钥':'加载中…'}</option>{(keys.options||[]).map(k=><option key={k.id} value={String(k.id)}>{k.name}</option>)}</Choice></Field>}
      <Text label="SSH / 远程端口" mono value={port} onChange={setPort} placeholder="跟随系统" help="22、100～65535，或填 auto 随机" error={errors.port}/>
     </div>
    </Panel>

    <Panel n={6} title="实例信息">
     <div className="ci-grid ci-grid-3">
      <Text label="主机名" value={hostname} onChange={setHostname} placeholder="自动生成" help={Number(num)>1?'批量创建时作为前缀，依次加 001、002…':undefined} error={errors.hostname}/>
      <Field label="所属用户" error={errors.client}><UserPicker value={client} onChange={setClient}/></Field>
      <Stepper label="创建数量" unit="台" value={num} onChange={setNum} min={1} max={100} error={errors.num}/>
     </div>
     {Number(num)>1&&login==='0'&&<Flag checked={samePass} onChange={setSamePass}>批量创建的实例使用同一个密码</Flag>}
    </Panel>
   </div>

   <aside className="ci-summary" aria-label="配置摘要">
    <h2>配置摘要</h2>
    <dl>{summary.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {error&&<ErrorBox message={error}/>}
    <div className="rd-note"><Info size={15}/><span>提交后可在实例详情或任务日志中查看创建进度。</span></div>
    <Button className="ci-submit" isPending={busy} isDisabled={busy} onPress={create}>创建{Number(num)>1?` ${num} 台`:''}实例</Button>
    <Button variant="outline" className="ci-submit" isDisabled={busy} onPress={()=>go('/clouds')}>取消</Button>
   </aside>
  </div>}
 </div>;
}
