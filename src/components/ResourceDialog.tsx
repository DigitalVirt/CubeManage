import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {Button,Input,Label,Switch,TextArea,TextField} from '@heroui/react';
import {Check,Info} from 'lucide-react';
import {api,send,ApiError,type List,type Row} from '../lib/api';
import {Dialog,ErrorBox} from './Shared';
import {Choice} from './Controls';
import {MultiPick,type Opt} from '../pages/Network';

/**
 * 新建 / 编辑区域与节点：宽弹窗，左侧为分组导航（已填完的组打勾，有错误的组标红点），右侧一次只显示一组字段。
 * 底部为“上一组 / 取消 / 下一组 / 创建”。提交到 /api/resources/:kind（字段白名单见 server/catalog.mjs）。
 */
type FieldKind='text'|'mono'|'password'|'number'|'textarea'|'select'|'switch'|'multi'|'segment';
type F={key:string;label:string;kind?:FieldKind;required?:boolean;help?:string;placeholder?:string;span?:boolean;createOnly?:boolean;options?:(o:Lookups)=>[string,string][];multi?:(o:Lookups)=>Opt[];empty?:string};
type Group={id:string;title:string;note?:string;fields:F[]};
type Lookups={areas:Row[];countries:Opt[];nodeGroups:Opt[];segments:Opt[]};

const nodeTypes:[string,string][]=[['host','KVM 加强版'],['lightHost','KVM 轻量版'],['hyperv','Hyper-V'],['adsl','拨号云']];
const secretHelp=(editing:boolean)=>editing?'留空表示保留原值':undefined;
const groupsFor=(kind:'areas'|'nodes'):Group[]=>kind==='areas'?[
 {id:'basic',title:'基本信息',fields:[{key:'name',label:'区域名称',required:true,span:true,placeholder:'香港 · 荃湾'},{key:'short_name',label:'简称',placeholder:'HK',help:'显示在节点名称旁的分组标识'},{key:'country',label:'国家 / 地区',kind:'select',empty:'不设置',options:o=>o.countries.map(c=>[String(c.id),c.name])}]},
 {id:'control',title:'被控连接',note:'平台通过被控地址管理这个区域',fields:[{key:'ip',label:'被控 IP / 域名',kind:'mono',required:true,placeholder:'192.0.2.1'},{key:'alternate_ip',label:'备用 IP',kind:'mono',placeholder:'可选'},{key:'username',label:'被控用户名'},{key:'password',label:'被控密码',kind:'password'}]},
 {id:'image',title:'镜像',fields:[{key:'image_download_domain',label:'镜像下载源',kind:'mono',span:true,placeholder:'https://mirror.example.com',help:'留空使用平台默认下载源'}]}
]:[
 {id:'basic',title:'基本信息',fields:[{key:'name',label:'节点名称',required:true,placeholder:'HK-KVM-04'},{key:'area_id',label:'所属区域',kind:'select',required:true,empty:'请选择区域',options:o=>o.areas.map(a=>[String(a.id),a.name])},{key:'type',label:'节点类型',kind:'segment',required:true,createOnly:true,span:true,help:'创建后不能修改',options:()=>nodeTypes},{key:'group_id',label:'节点分组',kind:'select',empty:'不分组',options:o=>o.nodeGroups.map(g=>[String(g.id),g.name])}]},
 {id:'auth',title:'连接认证',note:'平台通过这些信息管理节点',fields:[{key:'ip',label:'节点 IP / 域名',kind:'mono',required:true,placeholder:'192.0.2.21'},{key:'port',label:'鉴权端口',kind:'number',placeholder:'4432'},{key:'username',label:'鉴权用户名'},{key:'password',label:'鉴权密码',kind:'password'},{key:'ssh_pass',label:'SSH 密码',kind:'password',span:true,help:'用于节点初始化和 Webshell，可留空'}]},
 {id:'network',title:'网络',fields:[{key:'dns1',label:'首选 DNS',kind:'mono',placeholder:'1.1.1.1'},{key:'dns2',label:'备用 DNS',kind:'mono',placeholder:'8.8.8.8'},{key:'ip_segment_id',label:'可用 IP 段',kind:'multi',span:true,multi:o=>o.segments},{key:'nat_port_range',label:'NAT 端口范围',kind:'mono',span:true,placeholder:'10000-20000,30000-40000',help:'多个范围用英文逗号分隔'}]},
 {id:'resource',title:'资源与存储',fields:[{key:'max_memory',label:'内存限额（GB）',kind:'number',placeholder:'0',help:'0 表示不限'},{key:'max_cpu',label:'CPU 限额（核）',kind:'number',placeholder:'0',help:'0 表示不限'},{key:'choose_store_rule',label:'本地存储使用规则',kind:'select',span:true,options:()=>[['0','剩余容量最高'],['1','实例数量最少']]},{key:'create_local_store',label:'默认创建本地存储',kind:'switch',createOnly:true,span:true},{key:'auto_boot_host',label:'节点启动时自动开启实例',kind:'switch',span:true}]},
 {id:'remark',title:'备注',fields:[{key:'remark',label:'备注',kind:'textarea',span:true}]}
];
const ids=(v:unknown)=>Array.isArray(v)?v.map(x=>Number(typeof x==='object'&&x?(x as Row).id:x)).filter(n=>Number.isSafeInteger(n)&&n>0):[];
const filled=(v:unknown)=>Array.isArray(v)?v.length>0:v!==undefined&&v!==null&&String(v).trim()!=='';

function useLookups(kind:'areas'|'nodes'):Lookups{
 const [state,setState]=useState<Lookups>({areas:[],countries:[],nodeGroups:[],segments:[]});
 useEffect(()=>{let live=true;const opt=(r:Row)=>(r.data||[]).map((x:Row)=>({id:Number(x.id),name:String(x.name)}));
  const jobs:Promise<unknown>[]=kind==='areas'?[api('/lookups/countries').then(r=>live&&setState(s=>({...s,countries:opt(r)})))]:[api<List>('/resources/areas?per_page=100').then(r=>live&&setState(s=>({...s,areas:r.data}))),api('/lookups/node_groups').then(r=>live&&setState(s=>({...s,nodeGroups:opt(r)}))),api('/lookups/ip_segments').then(r=>live&&setState(s=>({...s,segments:opt(r)})))];
  Promise.allSettled(jobs);return()=>{live=false;};},[kind]);
 return state;
}

export function ResourceDialog({kind,record,onClose,onSaved}:{kind:'areas'|'nodes';record:Row|null;onClose:()=>void;onSaved:(r:Row)=>void}){
 const editing=Boolean(record);const lookups=useLookups(kind);const noun=kind==='areas'?'区域':'节点';
 const groups=groupsFor(kind).map(g=>({...g,fields:g.fields.filter(f=>!(editing&&f.createOnly&&f.kind!=='segment'))})).filter(g=>g.fields.length);
 const [values,setValues]=useState<Row>(()=>{
  const r=record||{};const v:Row={};
  for(const g of groupsFor(kind))for(const f of g.fields){
   const raw=f.key==='area_id'?(r.area_id??r.area):f.key==='ip_segment_id'?(r.ip_segment_id??r.ip_segment):r[f.key];
   v[f.key]=f.kind==='multi'?ids(raw):f.kind==='switch'?(raw==null?(f.key==='auto_boot_host'?1:0):Number(raw)===1?1:0):f.kind==='password'?'':raw==null?(f.key==='type'?'host':f.key==='choose_store_rule'?'0':''):String(raw);
  }
  return v;
 });
 const [active,setActive]=useState(groups[0].id),[visited,setVisited]=useState<Set<string>>(()=>new Set([groups[0].id])),[busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const index=groups.findIndex(g=>g.id===active),group=groups[index];
 const go=(id:string)=>{setActive(id);setVisited(s=>new Set(s).add(id));};
 const set=(k:string,v:unknown)=>setValues(s=>({...s,[k]:v}));
 const complete=(g:Group)=>g.fields.every(f=>!f.required||filled(values[f.key]))&&(visited.has(g.id)||g.fields.some(f=>f.required));
 const hasError=(g:Group)=>g.fields.some(f=>errors[f.key]);
 async function submit(e?:FormEvent){
  e?.preventDefault();
  const missing=groups.find(g=>g.fields.some(f=>f.required&&!filled(values[f.key])));
  if(missing){const f=missing.fields.find(x=>x.required&&!filled(values[x.key]))!;setErrors({[f.key]:'请填写'+f.label});go(missing.id);return;}
  setBusy(true);setError('');setErrors({});
  try{
   const body:Row={};for(const g of groups)for(const f of g.fields){if(editing&&f.createOnly)continue;const v=values[f.key];if(f.kind==='password'&&!v)continue;body[f.key]=v;}
   onSaved(await api(`/resources/${kind}${editing?'/'+record!.id:''}`,send(editing?'PUT':'POST',body)));
  }catch(err){setError((err as Error).message);if(err instanceof ApiError&&err.fields){setErrors(err.fields);const g=groups.find(x=>x.fields.some(f=>err.fields?.[f.key]));if(g)go(g.id);}}
  finally{setBusy(false);}
 }
 const control=(f:F):ReactNode=>{
  const v=values[f.key],invalid=Boolean(errors[f.key]),label=<>{f.label}{f.required&&<span className="rd-req">*</span>}</>;
  const help=f.help??(f.kind==='password'?secretHelp(editing):undefined);
  const foot=<>{help&&<p className="field-help">{help}</p>}{errors[f.key]&&<p className="field-error">{errors[f.key]}</p>}</>;
  if(f.kind==='segment'){
   const opts=f.options?.(lookups)||[];
   if(editing)return <div className="rd-field"><span className="rd-label">{label}</span><span className="rd-static">{opts.find(([k])=>k===v)?.[1]||v||'—'}</span></div>;
   return <div className="rd-field"><span className="rd-label">{label}</span><div className="rd-seg" role="radiogroup" aria-label={f.label}>{opts.map(([k,t])=><button type="button" key={k} role="radio" aria-checked={v===k} className={v===k?'is-on':''} onClick={()=>set(f.key,k)}>{t}</button>)}</div>{foot}</div>;
  }
  if(f.kind==='select'){const opts=f.options?.(lookups)||[];return <div className="rd-field"><span className="rd-label">{label}</span><Choice aria-label={f.label} value={String(v??'')} onChange={e=>set(f.key,e.target.value)}>{f.empty!==undefined&&<option value="">{f.empty}</option>}{opts.map(([k,t])=><option key={k} value={k}>{t}</option>)}</Choice>{foot}</div>;}
  if(f.kind==='multi')return <div className="rd-field"><span className="rd-label">{label}</span><MultiPick label={f.label} options={f.multi?.(lookups)||[]} value={ids(v)} onChange={x=>set(f.key,x)} placeholder="点击选择，可多选"/>{foot}</div>;
  if(f.kind==='switch')return <div className="rd-field"><Switch isSelected={Number(v)===1} onChange={on=>set(f.key,on?1:0)}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control><Label>{f.label}</Label></Switch.Content></Switch>{foot}</div>;
  return <div className="rd-field"><TextField value={String(v??'')} onChange={x=>set(f.key,x)} isInvalid={invalid} name={f.key}><Label>{label}</Label>{f.kind==='textarea'?<TextArea rows={4} placeholder={f.placeholder}/>:<Input className={f.kind==='mono'?'mono':''} type={f.kind==='password'?'password':f.kind==='number'?'number':'text'} min={f.kind==='number'?0:undefined} placeholder={f.kind==='password'&&editing?'留空保持不变':f.placeholder} autoComplete={f.kind==='password'?'new-password':'off'}/>}</TextField>{foot}</div>;
 };
 const last=index===groups.length-1;
 return <Dialog wide title={(editing?'编辑':'新建')+noun+(editing?' · '+(record!.name||'#'+record!.id):'')} onClose={()=>{if(!busy)onClose();}} footer={<>
  {index>0&&<Button variant="ghost" className="rd-prev" isDisabled={busy} onPress={()=>go(groups[index-1].id)}>上一组</Button>}
  <Button variant="outline" className="rd-btn" isDisabled={busy} onPress={onClose}>取消</Button>
  {!last&&<Button variant="outline" className="rd-btn" isDisabled={busy} onPress={()=>go(groups[index+1].id)}>下一组</Button>}
  <Button className="rd-btn" type="submit" form="resource-dialog" isPending={busy} isDisabled={busy}>{editing?'保存':'创建'}</Button>
 </>}>
  <form id="resource-dialog" className="rd" onSubmit={submit}>
   <nav className="rd-nav" aria-label={noun+'设置分组'}>{groups.map(g=><button type="button" key={g.id} className={'rd-nav-item'+(g.id===active?' is-active':'')} aria-current={g.id===active?'step':undefined} onClick={()=>go(g.id)}><span>{g.title}</span>{hasError(g)?<i className="rd-dot" aria-label="有错误"/>:complete(g)&&g.id!==active?<Check size={14} className="rd-done" aria-label="已填写"/>:null}</button>)}</nav>
   <div className="rd-body">
    <div className="rd-head"><h3>{group.title}</h3>{group.note&&<small>{group.note}</small>}</div>
    {error&&<ErrorBox message={error}/>}
    <div className="rd-grid">{group.fields.map(f=><div key={f.key} className={f.span||f.kind==='textarea'||f.kind==='multi'?'rd-span':''}>{control(f)}</div>)}</div>
    {!editing&&<div className="rd-note"><Info size={15}/><span>带 * 的为必填项，其余可以在创建后再补充。</span></div>}
   </div>
  </form>
 </Dialog>;
}
