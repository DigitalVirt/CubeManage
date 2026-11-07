import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button,Checkbox,Dropdown,Input,Label,TextField} from '@heroui/react';
import {ChevronUp,CircleAlert,CircleCheck,Clipboard,ClipboardCheck,LayoutGrid,Monitor,TriangleAlert} from 'lucide-react';
import {api,send,osIconUrl,type Row} from '../lib/api';
import {Dialog,ErrorBox} from './Shared';
import {BatchProgress} from './BatchProgress';
import {submitInChunks,type Progress} from '../lib/chunks';
import {Choice} from './Controls';

/** Batch actions in the platform's order. Each maps to a documented endpoint through POST /api/clouds/batch/:id. */
type Tone='normal'|'caution'|'danger';
export const batchActions:{id:string;title:string;tone:Tone;note:string}[]=[
 {id:'reboot',title:'重启',tone:'caution',note:'实例会重新启动，运行中的服务短暂中断。'},
 {id:'hard_reboot',title:'硬重启',tone:'danger',note:'相当于断电重启，未保存的数据可能丢失。'},
 {id:'on',title:'开机',tone:'normal',note:'启动已关机的实例。'},
 {id:'off',title:'关机',tone:'caution',note:'向系统发送关机指令，服务将停止。'},
 {id:'hardoff',title:'硬关机',tone:'danger',note:'相当于直接断电，未保存的数据可能丢失。'},
 {id:'resume',title:'解除挂起',tone:'normal',note:'恢复已挂起的实例。'},
 {id:'suspend',title:'暂停',tone:'caution',note:'暂停后实例停止服务，可随时取消暂停。'},
 {id:'unsuspend',title:'取消暂停',tone:'normal',note:'恢复已暂停的实例。'},
 {id:'password',title:'重置密码',tone:'caution',note:'平台将离线重置密码，实例可能会被重启。'},
 {id:'force_delete',title:'强制删除',tone:'danger',note:'直接删除，不进入回收站，无法恢复。'},
 {id:'delete',title:'删除',tone:'danger',note:'实例进入回收站，服务中断，保留期内可恢复。'},
 {id:'settings',title:'实例设置',tone:'normal',note:'只提交填写了的项目，留空的项目保持不变。网卡多队列需要平台 v2.5.2 及以上，逐台修改，可能需要重启实例后才生效。'},
 {id:'export',title:'导出',tone:'normal',note:''},
 {id:'migrate',title:'迁移',tone:'caution',note:'逐台向平台发起迁移（每台单独一个请求，不走批量迁移队列），每台实例的结果单独显示。'},
 {id:'reinstall',title:'重装',tone:'danger',note:'系统盘将被重新安装，系统盘上的数据会全部丢失。'},
 {id:'rules',title:'规则应用',tone:'normal',note:'为实例应用智能带宽或智能 CPU 规则。'},
 {id:'ipv6',title:'添加IPV6',tone:'normal',note:'为每台实例添加指定数量的 IPv6 地址。'},
 {id:'replace_ip',title:'替换IP',tone:'danger',note:'重新分配普通 IPv4 地址，原 IP 将被释放，依赖原 IP 的服务会中断。'},
 {id:'rebuild',title:'一键重建实例',tone:'danger',note:'按原配置重建实例，现有数据会全部丢失。'}
];

/** 应用预设 in the reinstall dialogs: hidden for now. Set to true to show it again (the field and its option list come back). */
export const SHOW_APP_PRESETS=false;

export function BatchMenu({rows,onPick}:{rows:Row[];onPick:(id:string)=>void}){
 const count=rows.length;
 return <Dropdown><Button variant="outline" size="sm" aria-label={'批量操作，已选择 '+count+' 个实例'}><LayoutGrid size={15}/>批量操作{count>0&&<span className="batch-count">{count}</span>}<ChevronUp size={14}/></Button><Dropdown.Popover placement="top start" className="batch-popover"><div className="batch-menu-heading">{count?`已选择 ${count} 个实例`:'请先勾选实例'}</div><Dropdown.Menu aria-label="批量操作" disabledKeys={count?[]:batchActions.map(a=>a.id)} onAction={key=>onPick(String(key))}>{batchActions.map(a=><Dropdown.Item key={a.id} id={a.id} textValue={a.title} variant={a.id==='delete'||a.id==='force_delete'?'danger':'default'}><Label>{a.title}</Label></Dropdown.Item>)}</Dropdown.Menu></Dropdown.Popover></Dropdown>;
}

/** Downloads the selected instances as the platform's CSV. */
export async function exportInstances(rows:Row[]){
 const res=await fetch('/api/clouds/export?ids='+rows.map(r=>r.id).join(','),{credentials:'same-origin'});
 if(!res.ok){let message='导出失败';try{message=(await res.json()).error||message;}catch{}throw new Error(message);}
 const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(res.headers.get('content-disposition')?.match(/filename="?([^";]+)/)?.[1])||'instances.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

type Option={id:number|string;name:string;group?:string;svg?:number|string};
/** Options for a select. Images come from the instances' nodes (only images available there), else enabled images. */
export function useOptions(name:string|null,nodes:number[]=[]){
 const [options,setOptions]=useState<Option[]|null>(null),[error,setError]=useState('');
 const nodeKey=[...new Set(nodes.filter(n=>Number.isSafeInteger(n)&&n>0))].sort((a,b)=>a-b).join(',');
 useEffect(()=>{if(!name)return;let active=true;setOptions(null);setError('');api(name==='images'?(nodeKey?'/images/available?nodes='+nodeKey:'/resources/images?per_page=100&status=1'):'/lookups/'+name).then(r=>{if(active)setOptions((r.data||[]).map((x:Row)=>({id:x.id,name:x.name||x.filename||'#'+x.id,group:typeof x.group==='object'&&x.group?x.group.name:x.group,svg:x.group_svg??(typeof x.group==='object'&&x.group?x.group.svg:undefined)})));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[name,nodeKey]);
 return {options,error};
}
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <div className="batch-field"><span className="batch-field-label">{label}</span>{children}{hint&&<small>{hint}</small>}</div>;}
export function Select({label,hint,value,onChange,empty,lookup}:{label:string;hint?:string;value:string;onChange:(v:string)=>void;empty?:string;lookup:ReturnType<typeof useOptions>}){
 return <Field label={label} hint={lookup.error?'选项加载失败：'+lookup.error:hint}><Choice aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{empty!==undefined&&<option value="">{empty}</option>}{(lookup.options||[]).map(o=><option key={o.id} value={String(o.id)}>{o.group?o.group+' · '+o.name:o.name}</option>)}</Choice></Field>;
}
/** Reinstall image in two steps: the OS family as icon tiles, then its versions. Families come from the image groups. */
export function ImagePicker({value,onChange,lookup,emptyText,hint}:{value:string;onChange:(v:string)=>void;lookup:ReturnType<typeof useOptions>;emptyText:string;hint?:string}){
 const options=lookup.options||[];
 // Platform order, except Windows second to last and 其他 last.
 const rank=(n:string)=>n==='其他'?2:/windows/i.test(n)?1:0;
 const families=[...new Map(options.map(o=>[o.group||'其他',{name:o.group||'其他',svg:o.svg}])).values()].map((f,i)=>({...f,i})).sort((a,b)=>rank(a.name)-rank(b.name)||a.i-b.i);
 const current=options.find(o=>String(o.id)===value);
 const [family,setFamily]=useState('');
 const active=current?(current.group||'其他'):family;
 const versions=options.filter(o=>(o.group||'其他')===active);
 useEffect(()=>{if(!family&&!value&&families.length===1)setFamily(families[0].name);},[families.length]); // eslint-disable-line react-hooks/exhaustive-deps
 if(lookup.error)return <Field label="系统分类" hint={'镜像加载失败：'+lookup.error}><span/></Field>;
 if(!lookup.options)return <Field label="系统分类"><span className="batch-hint">正在加载镜像…</span></Field>;
 if(!options.length)return <Field label="系统分类" hint={hint}><span className="batch-hint">{emptyText}</span></Field>;
 return <>
  <Field label="系统分类" hint={hint}><div className="os-families" role="radiogroup" aria-label="系统分类">{families.map(f=>{const url=osIconUrl(f.svg);const on=f.name===active;return <button type="button" key={f.name} role="radio" aria-checked={on} className={'os-family'+(on?' is-active':'')} onClick={()=>{if(f.name!==active){setFamily(f.name);onChange('');}}}>{url?<img src={url} alt="" width={22} height={22}/>:<Monitor size={20}/>}<span>{f.name}</span></button>;})}</div></Field>
  <Field label="系统版本"><Choice aria-label="系统版本" value={active?value:''} onChange={e=>onChange(e.target.value)}><option value="">{active?'请选择 '+active+' 版本':'请先选择系统分类'}</option>{versions.map(o=><option key={o.id} value={String(o.id)}>{o.name}</option>)}</Choice></Field>
 </>;
}
export function NumberField({label,value,onChange,placeholder,unit}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;unit?:string}){
 return <TextField value={value} onChange={onChange} className="batch-field"><Label>{label}{unit&&<span className="batch-unit">（{unit}）</span>}</Label><Input type="number" min={0} step={1} inputMode="numeric" placeholder={placeholder}/></TextField>;
}
export function Flag({checked,onChange,children}:{checked:boolean;onChange:(v:boolean)=>void;children:ReactNode}){
 return <Checkbox isSelected={checked} onChange={onChange}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control><Label>{children}</Label></Checkbox.Content></Checkbox>;
}
const randomPassword=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';const a=new Uint32Array(14);crypto.getRandomValues(a);return Array.from(a,n=>chars[n%chars.length]).join('')+'#7';};

type Result={total:number;success:number;failed:number;results:{id:number;ok:boolean;error?:string}[];passwords?:{id:number;password:string}[];ipv6?:{id:number;ipv6:string[]}[];submitted?:number};

export function BatchOperation({actionId,rows,onClose,onDone}:{actionId:string;rows:Row[];onClose:()=>void;onDone:(summary:string)=>void}){
 const spec=batchActions.find(a=>a.id===actionId)!;
 const [v,setV]=useState<Record<string,string>>({}),[flags,setFlags]=useState<Record<string,boolean>>({same:true}),[busy,setBusy]=useState(false),[progress,setProgress]=useState<Progress|null>(null),stopRef=useRef(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[copied,setCopied]=useState(false);
 const set=(k:string)=>(value:string)=>setV(x=>({...x,[k]:value}));const flag=(k:string)=>(value:boolean)=>setFlags(x=>({...x,[k]:value}));
 const lookup=(name:string,when:boolean)=>useOptions(when?name:null);
 const images=useOptions(actionId==='reinstall'?'images':null,rows.map(r=>Number(r.node_id??r.node))),keys=lookup('ssh_keys',actionId==='reinstall'),presets=lookup('app_presets',SHOW_APP_PRESETS&&actionId==='reinstall'),nodes=lookup('migrate_nodes',actionId==='migrate'),groups=lookup('ip_groups',actionId==='replace_ip'),bw=lookup('bw_rules',actionId==='rules'),cpu=lookup('cpu_rules',actionId==='rules');
 const byId=new Map(rows.map(r=>[Number(r.id),r]));const host=(id:number)=>byId.get(id)?.hostname||'#'+id;

 // What the confirm button needs before it can run; the reason shows as the button's hint.
 const missing=actionId==='password'&&flags.same&&(v.password||'').length<6?'请填写至少 6 位的新密码'
  :actionId==='reinstall'&&!v.os?'请选择系统镜像'
  :actionId==='reinstall'&&v.login==='key'&&!v.ssh_key?'请选择 SSH 密钥'
  :actionId==='reinstall'&&v.login!=='key'&&(v.password||'').length<6?'请填写至少 6 位的新密码'
  :actionId==='migrate'&&!v.node?'请选择目标节点'
  :actionId==='rules'&&!v.advanced_bw&&!v.advanced_cpu?'请至少选择一条规则'
  :actionId==='ipv6'&&!(Number(v.num)>=1&&Number(v.num)<=1000)?'数量应为 1～1000'
  :actionId==='replace_ip'&&!(Number(v.num)>=1)?'请填写每台的 IPv4 数量'
  :actionId==='settings'&&!['in_bw','out_bw','cpu_limit','read_bytes_sec','write_bytes_sec','read_iops_sec','write_iops_sec','queues'].some(k=>v[k]!==undefined&&v[k]!=='')?'请至少填写一项设置':'';

 function payload(){
  const num=(k:string)=>v[k]===undefined||v[k]===''?undefined:Number(v[k]);
  switch(actionId){
   case 'password':return {password:flags.same?v.password:randomPassword(),same:flags.same};
   case 'reinstall':return {os:num('os'),password_type:v.login==='key'?1:0,password:v.login==='key'?undefined:v.password,ssh_key:num('ssh_key'),format_data_disk:Boolean(flags.format),app_preset_id:num('app_preset_id')};
   case 'migrate':{const mode=v.mode??'0';return {node:num('node'),assign_ip:Boolean(flags.assign_ip),...(mode?{mode}:{})};}
   case 'rules':return {advanced_bw:num('advanced_bw'),advanced_cpu:num('advanced_cpu')};
   case 'ipv6':return {num:num('num')};
   case 'replace_ip':return {num:num('num'),ip_group:num('ip_group')};
   case 'settings':return Object.fromEntries(['in_bw','out_bw','cpu_limit','read_bytes_sec','write_bytes_sec','read_iops_sec','write_iops_sec','queues'].map(k=>[k,num(k)]).filter(([,x])=>x!==undefined));
   default:return {};
  }
 }
 async function run(){
  setBusy(true);setError('');
  if(actionId==='migrate'){await runOneByOne();return;}
  // 每 10 个实例一个请求，逐批显示进度，可以在两批之间停止；各批返回的密码、IPv6、提交数合并显示。
  stopRef.current=false;const body=payload();
  try{
   const r=await submitInChunks(rows.map(r=>Number(r.id)),part=>api<Result>('/clouds/batch/'+actionId,send('POST',{ids:part,count:part.length,...body})),{onProgress:setProgress,stopped:()=>stopRef.current});
   const failedIds=new Set(r.results.filter(x=>!x.ok).map(x=>x.id));const all=r.responses;
   const submitted=all.some(x=>x.submitted!=null)?all.reduce((n,x)=>n+Number(x.submitted||0),0):undefined;
   setResult({total:r.total,success:r.success,failed:r.failed,results:r.results,
    ...(all.some(x=>x.passwords)?{passwords:all.flatMap(x=>x.passwords||[]).filter(p=>!failedIds.has(p.id))}:{}),
    ...(all.some(x=>x.ipv6)?{ipv6:all.flatMap(x=>x.ipv6||[])}:{}),
    ...(submitted!==undefined?{submitted}:{})});
  }
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 // 迁移: one request per instance from here, so the dialog shows each instance as it is submitted (and can stop
 // after the current one). IPs handed out to earlier instances are passed back so the next one gets different ones.
 async function runOneByOne(){
  const ids=rows.map(r=>Number(r.id)),used:number[]=[],results:Result['results']=[];stopRef.current=false;
  const items:Progress['items']=Object.fromEntries(ids.map(id=>[id,{state:'wait'}]));
  setProgress({done:0,total:ids.length,items:{...items}});
  for(const id of ids){
   if(stopRef.current){items[id]={state:'skip'};results.push({id,ok:false,error:'已停止，未提交'});continue;}
   items[id]={state:'run'};setProgress(p=>({...p!,items:{...items}}));
   try{const r=await api<Result>('/clouds/batch/migrate',send('POST',{ids:[id],count:1,...payload(),exclude_ip:used}));const one=r.results[0]||{id,ok:false,error:'平台没有返回结果'};
    if(Array.isArray((one as Row).ip))used.push(...(one as Row).ip);results.push(one);items[id]=one.ok?{state:'ok'}:{state:'fail',error:one.error};}
   catch(e){results.push({id,ok:false,error:(e as Error).message});items[id]={state:'fail',error:(e as Error).message};}
   setProgress(p=>({...p!,done:p!.done+1,items:{...items}}));
  }
  const success=results.filter(r=>r.ok).length;
  setResult({total:results.length,success,failed:results.length-success,results});setBusy(false);
 }
 const summary=result?(result.failed?`批量「${spec.title}」：${result.success} 个成功，${result.failed} 个失败`:`已为 ${result.success} 个实例提交「${spec.title}」，可在任务日志中查看执行进度`):'';
 const finish=()=>onDone(summary);
 async function copyPasswords(){if(!result?.passwords)return;try{await navigator.clipboard.writeText(result.passwords.map(p=>`${host(p.id)}\t${p.password}`).join('\n'));setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setError('无法访问剪贴板，请手动复制');}}

 const form=actionId==='password'?<>
   <Flag checked={Boolean(flags.same)} onChange={flag('same')}>所有实例使用同一个新密码</Flag>
   {flags.same?<TextField value={v.password||''} onChange={set('password')} className="batch-field"><Label>新密码</Label><Input type="password" autoComplete="new-password" placeholder="至少 6 位"/></TextField>:<p className="batch-hint">平台为每台实例生成随机密码，完成后在此显示一次，请及时保存。</p>}
  </>
  :actionId==='reinstall'?<>
   <ImagePicker value={v.os||''} onChange={set('os')} lookup={images} emptyText="所选实例的节点没有共同可用的镜像" hint="仅列出所选实例所在节点上都可用的镜像。"/>
   <div className="batch-grid batch-row">
    <Field label="登录方式"><Choice aria-label="登录方式" value={v.login||'password'} onChange={e=>set('login')(e.target.value)}><option value="password">密码</option><option value="key">SSH 密钥</option></Choice></Field>
    {v.login==='key'?<Select label="SSH 密钥" value={v.ssh_key||''} onChange={set('ssh_key')} empty="请选择密钥" hint="Windows 镜像和 Hyper-V 节点不支持密钥登录。" lookup={keys}/>
     :<TextField value={v.password||''} onChange={set('password')} className="batch-field"><Label>新密码</Label><Input type="password" autoComplete="new-password" placeholder="至少 6 位，所有实例相同"/></TextField>}
   </div>
   {SHOW_APP_PRESETS&&<Select label="应用预设" value={v.app_preset_id||''} onChange={set('app_preset_id')} empty="不安装" lookup={presets}/>}
   <Flag checked={Boolean(flags.format)} onChange={flag('format')}>同时格式化数据盘</Flag>
  </>
  :actionId==='migrate'?<>
   <Select label="目标节点" value={v.node||''} onChange={set('node')} empty="请选择目标节点" hint="已在目标节点上的实例会在结果里显示为失败，不影响其他实例。" lookup={nodes}/>
   <Field label="迁移方式" hint="默认冷迁移；选“自动”时由平台优先尝试热迁移。"><Choice aria-label="迁移方式" value={v.mode??'0'} onChange={e=>set('mode')(e.target.value)}><option value="">自动（热迁移优先）</option><option value="1">热迁移</option><option value="0">冷迁移</option></Choice></Field>
   <div className="batch-field"><Flag checked={Boolean(flags.assign_ip)} onChange={flag('assign_ip')}>重新分配 IP</Flag><small>从目标节点的空闲 IP 中为每台分配与现有数量相同的新 IP，原 IP 释放。</small></div>
  </>
  :actionId==='rules'?<>
   <Select label="智能带宽规则" value={v.advanced_bw||''} onChange={set('advanced_bw')} empty="不修改" lookup={bw}/>
   <Select label="智能 CPU 规则" value={v.advanced_cpu||''} onChange={set('advanced_cpu')} empty="不修改" lookup={cpu}/>
  </>
  :actionId==='ipv6'?<NumberField label="每台添加数量" value={v.num??'1'} onChange={set('num')} placeholder="1～1000"/>
  :actionId==='replace_ip'?<>
   <NumberField label="每台分配的 IPv4 数量" value={v.num??'1'} onChange={set('num')}/>
   <Select label="IP 分组" value={v.ip_group||''} onChange={set('ip_group')} empty="自动分配" lookup={groups}/>
  </>
  :actionId==='settings'?<div className="batch-grid">
   <NumberField label="进带宽" unit="Mbps" value={v.in_bw||''} onChange={set('in_bw')} placeholder="不修改"/>
   <NumberField label="出带宽" unit="Mbps" value={v.out_bw||''} onChange={set('out_bw')} placeholder="不修改"/>
   <NumberField label="CPU 限制" value={v.cpu_limit||''} onChange={set('cpu_limit')} placeholder="不修改"/>
   <NumberField label="网卡多队列" unit="1～64" value={v.queues||''} onChange={set('queues')} placeholder="不修改"/>
   <NumberField label="磁盘读取" unit="MB/s" value={v.read_bytes_sec||''} onChange={set('read_bytes_sec')} placeholder="不修改"/>
   <NumberField label="磁盘写入" unit="MB/s" value={v.write_bytes_sec||''} onChange={set('write_bytes_sec')} placeholder="不修改"/>
   <NumberField label="读取 IOPS" value={v.read_iops_sec||''} onChange={set('read_iops_sec')} placeholder="不修改"/>
   <NumberField label="写入 IOPS" value={v.write_iops_sec||''} onChange={set('write_iops_sec')} placeholder="不修改"/>
  </div>:null;

 // Fill the numeric defaults once so the payload carries what the field shows.
 useEffect(()=>{if(actionId==='ipv6'||actionId==='replace_ip')setV(x=>({num:'1',...x}));},[actionId]);

 return <Dialog wide={['reinstall','settings','migrate','rules','replace_ip'].includes(actionId)} title={'批量'+spec.title} onClose={()=>{if(busy)return;result?finish():onClose();}} footer={result
   ?<Button onPress={finish}>完成</Button>
   :progress&&busy?<Button variant="outline" isDisabled={stopRef.current} onPress={()=>{stopRef.current=true;setProgress(p=>p&&{...p});}}>{stopRef.current?(actionId==='migrate'?'将在当前实例后停止…':'将在当前这批后停止…'):'停止提交'}</Button>
   :<><Button variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button variant={spec.tone==='danger'?'danger':'primary'} isPending={busy} isDisabled={busy||Boolean(missing)} onPress={run}>{busy?'正在提交…':spec.title+' '+rows.length+' 个实例'}</Button></>}>
  <div className="batch-dialog">
   {!result&&progress&&busy&&<BatchProgress title={actionId==='migrate'?'正在逐台提交迁移':'正在提交'+spec.title} rows={rows} progress={progress}/>}
   {!result&&!(progress&&busy)&&<>
    {spec.note&&<div className={'batch-note tone-'+spec.tone}>{spec.tone==='danger'?<TriangleAlert size={16}/>:<CircleAlert size={16}/>}<span>{spec.note}</span></div>}
    {form&&<div className="batch-form">{form}</div>}
    {error&&<ErrorBox message={error}/>}
    {missing&&!busy&&<p className="batch-hint">{missing}</p>}
   </>}
   {result&&<>
    <div className={'batch-summary'+(result.failed?' has-failed':'')}>{result.failed?<CircleAlert size={18}/>:<CircleCheck size={18}/>}<div><strong>{result.failed?`${result.success} 个成功，${result.failed} 个失败`:`${result.success} 个实例已提交`}</strong><span>{result.failed?'失败的实例保持不变，可修正后重试。':'平台会在后台执行，可在任务日志中查看进度。'}</span></div></div>
    {result.results.some(r=>!r.ok)&&<ul className="batch-results">{result.results.filter(r=>!r.ok).map(r=><li key={r.id}><span>{host(r.id)}</span><em>{r.error}</em></li>)}</ul>}
    {result.passwords&&result.passwords.length>0&&<div className="batch-secret"><div className="batch-secret-head"><strong>新密码（只显示这一次）</strong><Button variant="ghost" size="sm" onPress={copyPasswords}>{copied?<ClipboardCheck size={14}/>:<Clipboard size={14}/>}{copied?'已复制':'全部复制'}</Button></div><ul>{result.passwords.map(p=><li key={p.id}><span>{host(p.id)}</span><code>{p.password}</code></li>)}</ul></div>}
    {result.ipv6&&result.ipv6.length>0&&<div className="batch-secret"><div className="batch-secret-head"><strong>新增的 IPv6 地址</strong></div><ul>{result.ipv6.map(x=><li key={x.id}><span>{host(x.id)}</span><code>{x.ipv6.join('  ')}</code></li>)}</ul></div>}
    {error&&<ErrorBox message={error}/>}
   </>}
  </div>
 </Dialog>;
}
