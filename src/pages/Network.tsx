import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Button,Checkbox,Chip,Header,Input,InputGroup,Label,ListBox,Select as HSelect,Switch,Table,TextArea,TextField,Tooltip} from '@heroui/react';
import {ArrowLeft,FileUp,History,Layers,Pencil,Plus,RefreshCw,Search,SlidersHorizontal,Trash2,TriangleAlert,X} from 'lucide-react';
import {api,send,date,ApiError,type List,type Row} from '../lib/api';
import {Choice} from '../components/Controls';
import {Dialog,Empty,ErrorBox,type Notify} from '../components/Shared';
import {Pager} from '../components/Pager';
import {TableSkeleton} from '../components/TableSkeleton';
import {LocationFilter} from '../components/LocationFilter';
import {unwrap} from '../components/Detail';
import {StatusIcon,healthStatus} from '../components/StatusIcon';
import {useUrlState,pageFrom,perPageFrom} from '../lib/urlState';

/**
 * 网络管理：管理 IPv4（IP 段 / IP 地址 / IP 分组）、管理 IPv6（IPv6 段 / IPv6 地址 / IPv6 分组）、ADSL 维护。
 * 每个列表都走 /api/net/:kind（server/network.mjs），接口见 digitalvirt-v1-api.md 的 IP段管理、Ip管理、IP分组管理、
 * IPv6段管理、IPv6管理、IPv6分组管理、ADSL管理。
 */

export type Opt={id:number;name:string;group?:string};
export type Options={nodes:Opt[];areas:Row[];nodeRows:Row[];segments:Opt[];groups:Opt[];error:string;loaded:boolean;reload:()=>void};
export type FieldType='text'|'number'|'password'|'textarea'|'bool'|'select'|'multi'|'user'|'cloud';
export type FieldDef={key:string;label:string;type?:FieldType;required?:boolean;help?:string;placeholder?:string;options?:(o:Options)=>[string,string][];multi?:(o:Options)=>Opt[];span?:boolean;createOnly?:boolean;editOnly?:boolean;batch?:boolean;form?:boolean;show?:(v:Row)=>boolean;min?:number;max?:number;mono?:boolean};
export type Col={key:string;title:string;render:(r:Row,o:Options)=>ReactNode;sk?:number;rowHeader?:boolean};
export type Filter={key:string;label:string;all?:string;options:(o:Options)=>[string,string][];required?:boolean};
export type Config={
 /** base: the list / create / batch / delete endpoint, default /net/:kind; itemBase: base of single-record update / detail. */
 base?:string;itemBase?:string;createAction?:()=>void;createLabel?:string;
 kind:string;noun:string;columns:Col[];search?:string;location?:boolean;filters?:Filter[];fields?:FieldDef[];
 create?:boolean;edit?:boolean;remove?:boolean;batch?:boolean;detail?:boolean;
 /** select:false hides the checkbox column and the footer batch buttons (rows keep their own edit / delete). */
 select?:boolean;
 /** fixed: query parameters always sent with the list request (e.g. status=5 for the disk recycle bin). emptyKind: illustration for the empty list. deleteLabel: wording of the delete action. */
 fixed?:Record<string,string>;emptyKind?:'network'|'recycle'|'box';deleteLabel?:string;
 label:(r:Row)=>string;initial?:(r:Row)=>Row;createDefaults?:(filters:Record<string,string>)=>Row;
 rowActions?:(r:Row)=>ReactNode;rowActionsEnd?:(r:Row)=>ReactNode;headerActions?:ReactNode;trailingActions?:ReactNode;empty:[string,string];deleteNote?:string;
};

/* ── 小组件 ─────────────────────────────────────────────────────────────── */

export const ids=(list:unknown)=>Array.isArray(list)?list.map(x=>Number(typeof x==='object'&&x?(x as Row).id:x)).filter(n=>Number.isSafeInteger(n)&&n>0):[];
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
export const fmt=(v:unknown)=>{const n=num(v);return n===null?'—':n.toLocaleString('zh-CN');};

export function Healthy({ok,yes='正常',no='禁用'}:{ok:boolean;yes?:string;no?:string}){
 return <Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={ok?yes:no}><span className="node-status-icon"><StatusIcon spec={{...healthStatus(ok?1:0),title:ok?yes:no}}/></span></Tooltip.Trigger><Tooltip.Content>{ok?yes:no}</Tooltip.Content></Tooltip>;
}
/** Up to two names, the rest behind “+N” with all of them in a tooltip. */
export function Names({list,empty='—'}:{list:unknown;empty?:string}){
 const names=(Array.isArray(list)?list:[]).map(x=>String((x as Row)?.name??(x as Row)?.hostname??x)).filter(Boolean);
 if(!names.length)return <span className="net-muted">{empty}</span>;
 const shown=names.slice(0,2).join('、');
 if(names.length<=2)return <span>{shown}</span>;
 return <Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={'全部：'+names.join('、')}><span>{shown}<span className="net-more">+{names.length-2}</span></span></Tooltip.Trigger><Tooltip.Content><div className="node-metric-tooltip">{names.map((n,i)=><span key={i}>{n}</span>)}</div></Tooltip.Content></Tooltip>;
}
/** Used / total with a thin bar: warning at 80 %, danger at 90 %. */
function Ratio({used,total,label,extra}:{used:unknown;total:unknown;label:string;extra?:ReactNode}){
 const u=num(used)??0,t=num(total)??0;const pct=t>0?Math.min(100,u/t*100):0;const level=pct>=90?' is-critical':pct>=80?' is-high':'';
 return <div className={'usage net-ratio'+level} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><strong><span>{fmt(u)}</span><small> / {fmt(t)}</small></strong><span className="usage-track wide" aria-hidden="true"><i style={{width:pct+'%'}}/></span>{extra&&<small className="net-ratio-extra">{extra}</small>}</div>;
}
export function Two({main,sub,mono=false}:{main:ReactNode;sub?:ReactNode;mono?:boolean}){return <div className="net-two"><span className={mono?'mono':''}>{main||'—'}</span>{sub&&<small>{sub}</small>}</div>;}
export function UseState({row}:{row:Row}){
 const locked=Number(row.lock)===1,used=Boolean(row.hostname)||(Array.isArray(row.host)&&row.host.length>0);
 return locked?<Chip variant="soft" color="warning" size="sm">已锁定</Chip>:used?<Chip variant="soft" color="accent" size="sm">{Array.isArray(row.host)?'使用中':'已分配'}</Chip>:<Chip variant="soft" color="success" size="sm">空闲</Chip>;
}
export function IconAction({label,onPress,children,danger=false,disabled}:{label:string;onPress:()=>void;children:ReactNode;danger?:boolean;disabled?:boolean}){
 return <Tooltip delay={0}><Button variant="ghost" size="sm" isIconOnly aria-label={label} className={danger?'is-danger':''} isDisabled={disabled} onPress={onPress}>{children}</Button><Tooltip.Content>{label}</Tooltip.Content></Tooltip>;
}

/** HeroUI multi-select with tags in the field (same look as the IP picker in 实例详情). */
export function MultiPick({label,options,value,onChange,placeholder}:{label:string;options:Opt[];value:number[];onChange:(v:number[])=>void;placeholder:string}){
 const byId=new Map(options.map(o=>[o.id,o]));const groups=[...new Set(options.map(o=>o.group||''))];
 const item=(o:Opt)=><ListBox.Item key={o.id} id={String(o.id)} textValue={o.name} className="ip-select-item">{({isSelected}:{isSelected:boolean})=><><Checkbox slot={null} isSelected={isSelected} isReadOnly excludeFromTabOrder aria-hidden="true" aria-label={o.name} className="ip-select-check"><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox><span>{o.name}</span></>}</ListBox.Item>;
 return <HSelect aria-label={label} selectionMode="multiple" value={value.map(String)} onChange={keys=>onChange([...(keys as Iterable<string|number>)].map(Number))} className="ip-select">
  <HSelect.Trigger className="ip-select-trigger"><HSelect.Value>{({isPlaceholder}:{isPlaceholder:boolean})=>isPlaceholder||!value.length?<span className="ip-select-ph">{placeholder}</span>
   :<span className="ip-tags">{value.map(id=>{const name=byId.get(id)?.name??'#'+id;return <span key={id} className="ip-tag"><span>{name}</span><span role="button" tabIndex={-1} aria-label={'移除 '+name} className="ip-tag-x" onPointerDownCapture={e=>{e.stopPropagation();e.preventDefault();}} onMouseDownCapture={e=>{e.stopPropagation();e.preventDefault();}} onPointerUpCapture={e=>e.stopPropagation()} onClickCapture={e=>{e.stopPropagation();e.preventDefault();onChange(value.filter(n=>n!==id));}}><X size={11}/></span></span>;})}</span>}</HSelect.Value><HSelect.Indicator/></HSelect.Trigger>
  <HSelect.Popover className="ip-select-popover"><ListBox selectionMode="multiple" aria-label={label}>{groups.length>1||groups[0]?groups.map(g=><ListBox.Section key={g||'_'} aria-label={g||'其他'}><Header className="ip-select-group">{g||'其他'}</Header>{options.filter(o=>(o.group||'')===g).map(item)}</ListBox.Section>):options.map(item)}</ListBox></HSelect.Popover>
 </HSelect>;
}

/* ── 选项（节点、区域、IP 段、分组） ───────────────────────────────────────── */

export function useOptions(family:'4'|'6'|null):Options{
 const [state,setState]=useState<Omit<Options,'reload'>>({nodes:[],areas:[],nodeRows:[],segments:[],groups:[],error:'',loaded:false}),[rev,setRev]=useState(0);
 useEffect(()=>{let live=true;
  Promise.allSettled([api<List>('/resources/areas?per_page=100'),api<List>('/resources/nodes?per_page=100'),family?api<Row>('/net/options?family='+family):Promise.resolve({segments:[],groups:[],errors:[]})]).then(([a,n,o])=>{if(!live)return;
   const areas=a.status==='fulfilled'?a.value.data:[],nodeRows=n.status==='fulfilled'?n.value.data:[];
   const areaName=(id:unknown)=>areas.find(x=>String(x.id)===String(id))?.name||'';
   const opt=o.status==='fulfilled'?o.value:{segments:[],groups:[],errors:[]};
   const errors=[a,n,o].filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.message).concat(opt.errors||[]);
   setState({areas,nodeRows,nodes:nodeRows.map(r=>({id:Number(r.id),name:String(r.name),group:r.area_name||areaName(r.area_id??r.area)})),segments:opt.segments||[],groups:opt.groups||[],error:errors[0]||'',loaded:true});
  });return()=>{live=false;};},[family,rev]);
 return {...state,reload:()=>setRev(v=>v+1)};
}

/* ── 表单：新建 / 编辑 / 批量修改 ─────────────────────────────────────────── */

/** 搜索并选择一个平台用户（v1/user）或实例（v1/clouds）。value 为编号字符串。 */
export function LookupPicker({kind,value,onChange,label,allowEmpty}:{kind:'user'|'cloud';value:string;onChange:(v:string)=>void;label:string;allowEmpty?:string}){
 const [search,setSearch]=useState(''),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(false),[known,setKnown]=useState<Record<string,string>>({});
 useEffect(()=>{let live=true;setLoading(true);const t=setTimeout(()=>{const url=kind==='user'?'/manage/users?per_page=50&search='+encodeURIComponent(search):'/biz/clouds?search='+encodeURIComponent(search);
  api<Row>(url).then(r=>{if(!live)return;const list:Row[]=r.data||[];setRows(list);setKnown(k=>({...k,...Object.fromEntries(list.map(x=>[String(x.id),kind==='user'?x.username:`${x.hostname||'#'+x.id}${x.mainip?' · '+x.mainip:''}`]))}));}).catch(()=>{if(live)setRows([]);}).finally(()=>{if(live)setLoading(false);});},250);return()=>{live=false;clearTimeout(t);};},[search,kind]);
 const text=(x:Row)=>kind==='user'?`${x.username}${x.real_name?' · '+x.real_name:''}`:`${x.hostname||'#'+x.id}${x.mainip?' · '+x.mainip:''}${x.username?' · '+x.username:''}`;
 return <div className="lookup-picker">
  <InputGroup className="lookup-search"><InputGroup.Prefix><Search size={15}/></InputGroup.Prefix><InputGroup.Input aria-label={'搜索'+label} placeholder={kind==='user'?'搜索用户名':'搜索主机名 / IP'} value={search} onChange={e=>setSearch(e.target.value)}/></InputGroup>
  <Choice aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>
   <option value="">{loading?'加载中…':allowEmpty??'请选择'+label}</option>
   {value&&!rows.some(r=>String(r.id)===value)&&<option value={value}>{known[value]||label+' #'+value}</option>}
   {rows.map(r=><option key={r.id} value={String(r.id)}>{text(r)}</option>)}
  </Choice>
 </div>;
}

type FormMode={mode:'create'|'edit'|'batch';record?:Row;rows?:Row[]};
function NetForm({config,options,target,onClose,onSaved}:{config:Config;options:Options;target:FormMode;onClose:()=>void;onSaved:(message:string)=>void}){
 const {mode,record,rows=[]}=target;const editing=mode==='edit',batch=mode==='batch';
 const fields=(config.fields||[]).filter(f=>batch?f.batch:f.form!==false&&!(editing&&f.createOnly||!editing&&f.editOnly));
 const [values,setValues]=useState<Row>(()=>{
  const base:Row=editing?(config.initial?config.initial(record!):{...record}):batch?{}:{...(config.createDefaults?.({})||{})};
  const out:Row={};for(const f of fields)out[f.key]=base[f.key]??(f.type==='multi'?[]:f.type==='bool'&&!batch?0:'');return out;
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const [gateway,setGateway]=useState<{hosts:Row[];choice:string}|null>(null);
 const set=(k:string,v:unknown)=>setValues(s=>({...s,[k]:v}));
 const visible=fields.filter(f=>!f.show||f.show(values));
 async function submit(e?:FormEvent){
  e?.preventDefault();setBusy(true);setError('');setErrors({});
  try{
   const body:Row={};for(const f of visible){const v=values[f.key];if(batch&&(v===''||v==null||(Array.isArray(v)&&!v.length)))continue;body[f.key]=v;}
   // 修改IP段：变更网关前先列出需要重启的实例，再由管理员选择手动或自动重启（confirm_change_gateway）。
   if(config.kind==='ip-segments'&&editing&&values.gateway&&values.gateway!==record?.gateway){
    if(!gateway){const r=await api<{data:Row[]}>(`/net/ip-segments/${record!.id}/reboot-hosts`);setGateway({hosts:r.data||[],choice:'1'});setBusy(false);return;}
    body.confirm_change_gateway=Number(gateway.choice);
   }
   if(batch){if(!Object.keys(body).length)throw new Error('请至少填写一项要修改的内容');await api(config.base||'/net/'+config.kind,send('PUT',{...body,ids:rows.map(r=>Number(r.id)),count:rows.length}));onSaved(`已修改 ${rows.length} 个${config.noun}`);}
   else if(editing){await api(`${config.itemBase||config.base||'/net/'+config.kind}/${record!.id}`,send('PUT',body));onSaved(config.noun+'已保存');}
   else{const r=await api<Row>(config.base||'/net/'+config.kind,send('POST',body));const n=Number(r?.result?.num??r?.result?.data?.num);onSaved(Number.isFinite(n)&&n>0?`已添加 ${n} 个${config.noun}`:config.noun+'已创建');}
  }catch(err){setError((err as Error).message);if(err instanceof ApiError)setErrors(err.fields||{});setGateway(null);}finally{setBusy(false);}
 }
 const title=batch?`批量修改 ${rows.length} 个${config.noun}`:(editing?'编辑':'新建')+config.noun+(editing?' · '+config.label(record!):'');
 const control=(f:FieldDef)=>{
  const v=values[f.key];
  if(f.type==='user'||f.type==='cloud')return <div className="net-field"><span className="net-label">{f.label}{f.required?' *':''}</span><LookupPicker kind={f.type} label={f.label} value={String(v??'')} onChange={x=>set(f.key,x)} allowEmpty={batch?'不修改':undefined}/></div>;
  if(f.type==='multi')return <div className="net-field"><span className="net-label">{f.label}{f.required?' *':''}</span><MultiPick label={f.label} options={f.multi?.(options)||[]} value={ids(v)} onChange={x=>set(f.key,x)} placeholder={batch?'不修改':'点击选择，可多选'}/></div>;
  if(f.type==='select'||f.type==='bool'&&batch){const opts=f.type==='bool'?[['1','是'],['0','否']] as [string,string][]:f.options?.(options)||[];return <label className="native-field">{f.label}{f.required?' *':''}<Choice aria-label={f.label} value={String(v??'')} onChange={e=>set(f.key,e.target.value)}>{(batch||!f.required)&&<option value="">{batch?'不修改':'不选择'}</option>}{opts.map(([k,t])=><option key={k} value={k}>{t}</option>)}</Choice></label>;}
  if(f.type==='bool')return <Switch isSelected={Number(v)===1} onChange={on=>set(f.key,on?1:0)}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control><Label>{f.label}</Label></Switch.Content></Switch>;
  return <TextField name={f.key} value={String(v??'')} onChange={x=>set(f.key,x)} isRequired={f.required&&!batch} isInvalid={Boolean(errors[f.key])}><Label>{f.label}</Label>{f.type==='textarea'?<TextArea rows={f.key==='lines'?8:3} placeholder={f.placeholder}/>:<Input className={f.mono?'mono':''} type={f.type==='number'?'number':f.type==='password'?'password':'text'} min={f.min} max={f.max} placeholder={batch?'留空不修改':f.placeholder} autoComplete={f.type==='password'?'new-password':'off'}/>}</TextField>;
 };
 return <Dialog wide title={title} onClose={()=>{if(!busy)onClose();}} footer={<><Button variant="outline" isDisabled={busy} onPress={gateway?()=>setGateway(null):onClose}>{gateway?'返回修改':'取消'}</Button><Button type="submit" form="net-form" isPending={busy} isDisabled={busy}>{gateway?'确认变更网关':batch?'修改 '+rows.length+' 项':editing?'保存修改':'创建'}</Button></>}>
  <form id="net-form" onSubmit={submit}>
   {error&&<ErrorBox message={error}/>}
   {gateway?<div className="net-gateway">
    <div className="cfg-note"><TriangleAlert size={16}/><span>网关从 <strong className="mono">{record?.gateway}</strong> 改为 <strong className="mono">{values.gateway}</strong>。{gateway.hosts.length?`下列 ${gateway.hosts.length} 个实例需要重启后才能使用新网关。`:'平台未返回需要重启的实例。'}</span></div>
    {gateway.hosts.length>0&&<ul className="recycle-list">{gateway.hosts.map(h=><li key={h.id}><strong>{h.hostname||'实例 #'+h.id}</strong><span className="num">#{h.id}</span></li>)}</ul>}
    <label className="native-field">重启方式<Choice aria-label="重启方式" value={gateway.choice} onChange={e=>setGateway(g=>g&&{...g,choice:e.target.value})}><option value="1">变更网关，稍后手动重启实例</option><option value="2">变更网关，并由平台自动重启实例</option></Choice></label>
   </div>:<>
    {batch&&<div className="form-note">只提交填写或选择了的项目，留空的保持原值。</div>}
    {batch&&<ul className="recycle-list net-targets">{rows.slice(0,8).map(r=><li key={r.id}><strong className="mono">{config.label(r)}</strong><span className="num">#{r.id}</span></li>)}{rows.length>8&&<li><span className="net-muted">另有 {rows.length-8} 项</span></li>}</ul>}
    <div className="form-grid">{visible.map(f=><div key={f.key} className={f.span||f.type==='textarea'||f.type==='multi'?'span-two':''}>{control(f)}{f.help&&<p className="field-help">{f.help}</p>}{errors[f.key]&&<p className="field-error">{errors[f.key]}</p>}</div>)}</div>
   </>}
  </form>
 </Dialog>;
}

/* ── 删除 ───────────────────────────────────────────────────────────────── */

function DeleteDialog({config,rows,onClose,onDone}:{config:Config;rows:Row[];onClose:()=>void;onDone:(message:string,failed:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Row|null>(null);
 async function run(){setBusy(true);setError('');try{const r=await api<Row>(config.itemBase?config.itemBase:config.base||'/net/'+config.kind,send('DELETE',{ids:rows.map(x=>Number(x.id)),count:rows.length}));
  if(r.failed){setResult(r);onDone(`${r.success} 个${config.noun}已${config.deleteLabel||'删除'}，${r.failed} 个失败`,true);}else{onDone(`已${config.deleteLabel||'删除'} ${r.success} 个${config.noun}`,false);onClose();}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const name=(id:number)=>{const r=rows.find(x=>Number(x.id)===id);return r?config.label(r):'#'+id;};
 const verb=config.deleteLabel||'删除';
 return <Dialog title={result?verb+'结果':`${verb} ${rows.length} 个${config.noun}`} onClose={()=>{if(!busy)onClose();}} footer={result?<Button onPress={onClose}>完成</Button>:<><Button variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button variant="danger" isPending={busy} onPress={run}>{verb}</Button></>}>
  {result?<><p>成功 {result.success} 个，失败 {result.failed} 个。</p>{result.message&&<p className="net-muted">{result.message}</p>}{Array.isArray(result.results)&&<ul className="recycle-list">{result.results.filter((r:Row)=>!r.ok).map((r:Row)=><li key={r.id}><strong>{name(r.id)}</strong><span className="recycle-error">{r.error||'平台返回失败'}</span></li>)}</ul>}</>
  :<><div className="cfg-note is-danger"><TriangleAlert size={16}/>{config.deleteNote||'删除后无法恢复，平台会拒绝删除仍在使用中的记录。'}</div>
   <ul className="recycle-list">{rows.slice(0,12).map(r=><li key={r.id}><strong className="mono">{config.label(r)}</strong><span className="num">#{r.id}</span></li>)}{rows.length>12&&<li><span className="net-muted">另有 {rows.length-12} 项</span></li>}</ul>
   {error&&<ErrorBox message={error}/>}</>}
 </Dialog>;
}

/* ── 通用列表 ───────────────────────────────────────────────────────────── */

export function NetList({title,config,options,notify}:{title:string;config:Config;options:Options;notify:Notify}){
 const [params]=useSearchParams();
 const filterKeys=[...(config.location?['area','node']:[]),...(config.filters||[]).map(f=>f.key)];
 const [page,setPage]=useState(()=>pageFrom(params)),[perPage,setPerPage]=useState(()=>perPageFrom(params)),[search,setSearch]=useState(()=>params.get('search')||''),[term,setTerm]=useState(()=>params.get('search')||'');
 const [filters,setFilters]=useState<Record<string,string>>(()=>Object.fromEntries(filterKeys.map(k=>[k,params.get(k)||''])));
 const [result,setResult]=useState<List|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[selected,setSelected]=useState<Set<number>>(new Set());
 const [form,setForm]=useState<FormMode|null>(null),[deleting,setDeleting]=useState<Row[]|null>(null),[opening,setOpening]=useState(false);
 // A required filter (the IP segment of the IP list) falls back to the first option.
 const effective:Record<string,string>={...filters};for(const f of config.filters||[])if(f.required&&!effective[f.key])effective[f.key]=f.options(options)[0]?.[0]||'';
 const missing=(config.filters||[]).some(f=>f.required&&!effective[f.key]);
 const waiting=missing&&options.loaded,pending=missing&&!options.loaded;
 useEffect(()=>{if(search===term)return;const t=setTimeout(()=>{setTerm(search);setPage(1);},300);return()=>clearTimeout(t);},[search]); // eslint-disable-line react-hooks/exhaustive-deps
 useUrlState({page,per_page:perPage,search:term,...filters},{page:1,per_page:20,search:'',...Object.fromEntries(filterKeys.map(k=>[k,'']))});
 const query=JSON.stringify(effective);
 useEffect(()=>{if(pending){setLoading(true);return;}if(waiting){setLoading(false);setResult(null);return;}let live=true;setLoading(true);setError('');
  const q=new URLSearchParams({page:String(page),per_page:String(perPage),search:term,...effective,...(config.fixed||{})});
  api<List>(`${config.base||'/net/'+config.kind}?${q}`).then(r=>{if(live){if(page>1&&!r.data.length&&r.meta.total>0)setPage(Math.max(1,r.meta.total_pages));else setResult(r);}}).catch(e=>{if(live){setError(e.message);setResult(null);}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};},[config.kind,page,perPage,term,query,revision,waiting,pending]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{setSelected(new Set());},[page,perPage,term,query,revision]);
 const setFilter=(patch:Record<string,string>)=>{setFilters(f=>({...f,...patch}));setPage(1);};
 const refresh=()=>{setRevision(v=>v+1);options.reload();};
 const rows=result?.data||[];const selectable=config.select!==false&&Boolean(config.remove||config.batch);
 const rowIds=rows.map(r=>Number(r.id)),chosen=rows.filter(r=>selected.has(Number(r.id)));
 const all=rowIds.length>0&&rowIds.every(id=>selected.has(id)),some=!all&&rowIds.some(id=>selected.has(id));
 const toggle=(id:number,on:boolean)=>setSelected(v=>{const n=new Set(v);if(on)n.add(id);else n.delete(id);return n;});
 async function edit(row:Row){if(!config.detail)return setForm({mode:'edit',record:row});setOpening(true);try{setForm({mode:'edit',record:{...row,...unwrap(await api(`${config.itemBase||config.base||'/net/'+config.kind}/${row.id}`))}});}catch(e){notify((e as Error).message,'danger');}finally{setOpening(false);}}
 const hasActions=Boolean(config.edit||config.remove||config.rowActions||config.rowActionsEnd);
 const filtered=filterKeys.some(k=>filters[k]&&!(config.filters||[]).find(f=>f.key===k)?.required);
 const columns=[...(selectable?[{title:'',width:0}]:[]),...config.columns.map(c=>({title:c.title,width:c.sk??7,twoLine:true})),...(hasActions?[{title:'操作',width:0}]:[])];
 const emptyState=waiting?{kind:'network' as const,title:'还没有 IP 段',text:'先在“IP 段”中添加 IP 段，再为它添加 IP 地址。',actions:undefined}
  :term?{kind:'search' as const,title:'没有找到匹配的记录',text:<>没有包含 <strong>“{term}”</strong> 的{config.noun}。</>,actions:<Button variant="outline" size="sm" onPress={()=>{setSearch('');setTerm('');}}><X size={15}/>清除搜索</Button>}
  :filtered?{kind:'search' as const,title:'没有符合筛选条件的记录',text:'当前筛选条件下没有'+config.noun+'。',actions:<Button variant="outline" size="sm" onPress={()=>setFilter(Object.fromEntries(filterKeys.filter(k=>!(config.filters||[]).find(f=>f.key===k)?.required).map(k=>[k,''])))}><X size={15}/>清除筛选</Button>}
  :{kind:(config.emptyKind||'network') as 'network',title:config.empty[0],text:config.empty[1],actions:config.create?<><Button size="sm" onPress={()=>config.createAction?config.createAction():setForm({mode:'create'})}><Plus size={15}/>新建{config.noun}</Button><Button variant="outline" size="sm" onPress={refresh}><RefreshCw size={15}/>刷新</Button></>:undefined};
 return <>
  <div className="page-heading"><div><h1>{title}</h1></div></div>
  <section className="data-panel">
   {/* 工具栏：左侧筛选 → 搜索；右侧刷新 → 主操作 → 其他按钮（DESIGN.md「列表页」）。 */}
   <div className="filter-bar"><div className="filters">
    {config.location&&<LocationFilter areas={options.areas} nodes={options.nodeRows} area={filters.area||''} node={filters.node||''} onChange={(area,node)=>setFilter({area,node})}/>}
    {(config.filters||[]).map(f=><Choice key={f.key} aria-label={f.label} value={effective[f.key]||''} onChange={e=>setFilter({[f.key]:e.target.value})}>{!f.required&&<option value="">{f.all||'全部'+f.label}</option>}{f.options(options).map(([v,t])=><option key={v} value={v}>{t}</option>)}</Choice>)}
    {config.search&&<InputGroup className="resource-search"><InputGroup.Prefix><Search size={17}/></InputGroup.Prefix><InputGroup.Input aria-label="搜索" type="search" placeholder={config.search} value={search} onChange={e=>setSearch(e.target.value)}/></InputGroup>}
    {filtered&&<Button variant="ghost" size="sm" onPress={()=>setFilter(Object.fromEntries(filterKeys.filter(k=>!(config.filters||[]).find(f=>f.key===k)?.required).map(k=>[k,''])))}><X size={15}/>清除筛选</Button>}
   </div><div className="filter-actions">
    <Button variant="outline" size="sm" isIconOnly aria-label="刷新" isDisabled={loading} onPress={refresh}><RefreshCw size={15}/></Button>
    {config.create&&<Button size="sm" isDisabled={waiting&&config.kind==='ips'} onPress={()=>config.createAction?config.createAction():setForm({mode:'create'})}><Plus size={16}/>{config.createLabel||(config.kind==='ips'?'添加 IP':'新建'+config.noun)}</Button>}
    {config.headerActions}
    {config.trailingActions}
   </div></div>
   {(error||options.error)&&<ErrorBox message={error||options.error} retry={refresh}/>}
   {loading&&!result?<TableSkeleton columns={columns} rows={Math.min(perPage,8)} className={'net-table net-'+config.kind}/>
    :!rows.length?<Empty {...emptyState}/>
    :<Table><Table.ScrollContainer><Table.Content aria-label={title} className={'net-table net-'+config.kind}><Table.Header>
     {selectable&&<Table.Column><Checkbox slot={null} className="table-check" aria-label="全选本页" isSelected={all} isIndeterminate={some} onChange={on=>setSelected(on?new Set(rowIds):new Set())}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Column>}
     {config.columns.map(c=><Table.Column key={c.key} isRowHeader={Boolean(c.rowHeader)}>{c.title}</Table.Column>)}
     {hasActions&&<Table.Column>操作</Table.Column>}
    </Table.Header><Table.Body>{rows.map((r,i)=><Table.Row key={r.id??i}>
     {selectable&&<Table.Cell><Checkbox slot={null} className="table-check" aria-label={'选择 '+config.label(r)} isSelected={selected.has(Number(r.id))} onChange={on=>toggle(Number(r.id),on)}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Cell>}
     {config.columns.map(c=><Table.Cell key={c.key}><div className={'net-cell net-cell-'+c.key}>{c.render(r,options)}</div></Table.Cell>)}
     {hasActions&&<Table.Cell><div className="row-actions">{config.rowActions?.(r)}{config.edit&&<IconAction label={'编辑 '+config.label(r)} disabled={opening} onPress={()=>edit(r)}><Pencil size={15}/></IconAction>}{config.remove&&<IconAction danger label={(config.deleteLabel||'删除')+' '+config.label(r)} onPress={()=>setDeleting([r])}><Trash2 size={15}/></IconAction>}{config.rowActionsEnd?.(r)}</div></Table.Cell>}
    </Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
   <div className="list-footer">
    <div className="list-footer-start">
     {config.batch&&<Button variant="outline" size="sm" isDisabled={!chosen.length} onPress={()=>setForm({mode:'batch',rows:chosen})}><SlidersHorizontal size={15}/>批量修改{chosen.length>0&&<span className="batch-count">{chosen.length}</span>}</Button>}
     {config.remove&&selectable&&<Button variant="outline" size="sm" className="recycle-purge" isDisabled={!chosen.length} onPress={()=>setDeleting(chosen)}><Trash2 size={15}/>删除{chosen.length>0&&<span className="batch-count">{chosen.length}</span>}</Button>}
    </div>
    <Pager total={waiting?0:result?result.meta.total:null} page={page} totalPages={Math.max(1,result?.meta.total_pages||1)} perPage={perPage} loading={loading} onPage={setPage} onPerPage={n=>{setPerPage(n);setPage(1);}}/>
   </div>
  </section>
  {form&&<NetForm config={{...config,createDefaults:()=>config.createDefaults?.(effective)||{}}} options={options} target={form} onClose={()=>setForm(null)} onSaved={m=>{setForm(null);refresh();notify(m);}}/>}
  {deleting&&<DeleteDialog config={config} rows={deleting} onClose={()=>setDeleting(null)} onDone={(m,failed)=>{refresh();notify(m,failed?'warning':'success');}}/>}
 </>;
}

/* ── 页面 ───────────────────────────────────────────────────────────────── */

/** 子视图记在网址的 ?view= 中（IP 地址、分组），进入时新增一条历史，浏览器后退回到 IP 段列表。 */
export function useView(views:readonly string[]){
 const [params,setParams]=useSearchParams();const view=views.includes(params.get('view')||'')?params.get('view')!:views[0];
 const open=(v:string,extra:Record<string,string>={})=>setParams(new URLSearchParams(v===views[0]?{}:{view:v,...extra}));
 return [view,open] as const;
}
export const back=(label:string,onPress:()=>void)=><Button variant="outline" size="sm" onPress={onPress}><ArrowLeft size={16}/>{label}</Button>;
export const count=(v:unknown)=><span className="num">{fmt(v)}</span>;
export const nodeField=(key:string):FieldDef=>({key,label:'可用节点',type:'multi',multi:o=>o.nodes,batch:true,help:'实例只能从所在节点可用的段中分配地址。'});
const groupField=(key:string,label:string):FieldDef=>({key,label,type:'select',options:o=>o.groups.map(g=>[String(g.id),g.name]),batch:true});
const groupConfig=(kind:'ip-groups'|'ipv6-groups',noun:string,segNoun:string):Config=>({
 kind,noun,search:'搜索分组名称',location:true,create:true,edit:true,remove:true,detail:true,label:r=>r.name||'#'+r.id,
 empty:['还没有'+noun,'新建分组后，可以把'+segNoun+'归入分组。'],deleteNote:'只能删除不含'+segNoun+'的分组，平台会拒绝删除仍有'+segNoun+'的分组。',
 initial:r=>({...r,ip_segment:ids(r.ip_segment)}),
 fields:[{key:'name',label:'名称',required:true},{key:'description',label:'描述',type:'textarea'},{key:'ip_segment',label:segNoun,type:'multi',multi:o=>o.segments,help:'选中的'+segNoun+'会归入此分组。'}],
 columns:[
  {key:'name',title:'名称',rowHeader:true,sk:9,render:r=><Two main={<strong>{r.name}</strong>} sub={r.description||undefined}/>},
  {key:'ip_segment',title:segNoun,sk:10,render:r=><Names list={r.ip_segment} empty={'未包含'+segNoun}/>},
  {key:'usage',title:'使用',sk:7,render:r=><Ratio used={r.used} total={r.total} label={r.name+' 地址使用'} extra={<>空闲 {fmt(r.free)}{kind==='ip-groups'?<> · 锁定 {fmt(r.lock)}</>:null}</>}/>},
  {key:'create_time',title:'创建时间',sk:8,render:r=><span className="num nowrap">{date(r.create_time)}</span>}
 ]});

export function IPv4Page({notify}:{notify:Notify}){
 const [view,open]=useView(['segments','ips','groups']);const options=useOptions('4');
 const segments:Config={kind:'ip-segments',noun:'IP 段',search:'搜索 IP 段名称',location:true,create:true,edit:true,remove:true,batch:true,detail:true,label:r=>r.ip_name||r.ip_sengmen||'#'+r.id,
  filters:[{key:'status',label:'状态',all:'所有状态',options:()=>[['1','正常'],['0','禁用']]},{key:'group',label:'分组',all:'全部分组',options:o=>o.groups.map(g=>[String(g.id),g.name])}],
  empty:['还没有 IP 段','添加 IP 段并为它添加 IP 地址后，实例可以从中分配 IPv4。'],deleteNote:'删除 IP 段会同时删除段内未使用的 IP，仍有已分配 IP 的段会被平台拒绝。',
  createDefaults:()=>({status:1}),
  initial:r=>({...r,node_ids:ids(r.node_ids??r.node),group_id:r.group_id!=null?String(r.group_id):'',status:Number(r.status)===1?1:0,onlink:Number(r.onlink)===1?1:0}),
  fields:[{key:'ip_name',label:'名称',required:true},groupField('group_id','IP 分组'),{key:'gateway',label:'网关',required:true,mono:true,placeholder:'203.0.113.1',help:'修改网关时会列出需要重启的实例，再确认重启方式。'},{key:'subnet_mask',label:'子网掩码',required:true,mono:true,placeholder:'255.255.255.0'},{key:'dns1',label:'DNS 1',mono:true,placeholder:'1.1.1.1'},{key:'dns2',label:'DNS 2',mono:true,placeholder:'8.8.8.8'},nodeField('node_ids'),{key:'status',label:'启用',type:'bool'},{key:'onlink',label:'onlink',type:'bool',batch:true,help:'网关不在本网段时开启。'}],
  trailingActions:<Button variant="outline" size="sm" onPress={()=>open('groups')}><Layers size={15}/>分组</Button>,
  columns:[
   {key:'ip_name',title:'名称',rowHeader:true,sk:8,render:r=><span className="net-name">{Number(r.status)!==1&&<Healthy ok={false}/>}<Link className="owner-count-link" to={'/ipv4?view=ips&segment='+r.id} aria-label={'查看 '+(r.ip_name||'#'+r.id)+' 的 IP 地址'}>{r.ip_name||'#'+r.id}</Link></span>},
   {key:'node',title:'节点',sk:8,render:r=><Names list={r.node} empty=""/>},
   {key:'lock',title:'锁定',sk:2,render:r=>count(r.count?.lock)},
   {key:'used',title:'已用',sk:2,render:r=>count(r.count?.used)},
   {key:'free',title:'空闲',sk:2,render:r=>count(r.count?.free)},
   {key:'total',title:'总数',sk:2,render:r=>count(r.count?.total)},
   {key:'group',title:'分组',sk:6,render:r=>r.group_name||''}
  ]};
 const ips:Config={kind:'ips',noun:'IP',search:'搜索 IP 或备注',trailingActions:back('返回 IP 段',()=>open('segments')),create:true,edit:true,remove:true,batch:true,detail:true,label:r=>r.ip||'#'+r.id,
  filters:[{key:'segment',label:'IP 段',required:true,options:o=>o.segments.map(s=>[String(s.id),s.name])},{key:'lock',label:'锁定',all:'全部锁定状态',options:()=>[['0','未锁定'],['1','已锁定']]},{key:'type',label:'分配对象',all:'全部分配对象',options:()=>[['cloud','实例'],['load_balance','负载均衡']]}],
  empty:['这个 IP 段还没有 IP','按起止地址添加一批 IP 后，就可以分配给实例。'],deleteNote:'只能删除未分配的 IP，已分配给实例的 IP 会被平台拒绝删除。',
  createDefaults:f=>({ip_segment_id:f.segment||''}),
  initial:r=>({...r,lock:Number(r.lock)===1?1:0,vlanid:r.vlanid??'',mac:r.mac||''}),
  fields:[{key:'ip_segment_id',label:'IP 段',type:'select',required:true,createOnly:true,options:o=>o.segments.map(s=>[String(s.id),s.name])},{key:'vlanid',label:'VLAN',type:'number',min:0,max:4095,batch:true,placeholder:'0'},{key:'first_ip',label:'起始 IP',required:true,createOnly:true,mono:true,placeholder:'203.0.113.10'},{key:'end_ip',label:'结束 IP',required:true,createOnly:true,mono:true,placeholder:'203.0.113.20',help:'起止相同即添加单个 IP。'},{key:'mac',label:'预设 MAC 地址',mono:true,batch:true,placeholder:'52:54:00:12:34:56'},{key:'lock',label:'锁定（不再自动分配）',type:'bool',editOnly:true,batch:true},{key:'remark',label:'备注',type:'textarea',batch:true}],
  columns:[
   {key:'ip',title:'IP 地址',rowHeader:true,sk:8,render:r=><Two mono main={<strong>{r.ip}</strong>} sub={Number(r.vlanid)>0?'VLAN '+r.vlanid:undefined}/>},
   {key:'state',title:'状态',sk:4,render:r=><UseState row={r}/>},
   {key:'host',title:'分配给',sk:9,render:r=>r.hostname?<Two main={r.type==='load_balance'?r.hostname:<Link className="owner-count-link" to={'/clouds?search='+encodeURIComponent(r.hostname)}>{r.hostname}</Link>} sub={<>{r.type==='load_balance'?'负载均衡':'实例'}{r.username?' · '+r.username:''}</>}/>:<span className="net-muted">—</span>},
   {key:'node',title:'节点',sk:7,render:r=><Two main={r.node_name} sub={r.area_name||undefined}/>},
   {key:'mac',title:'MAC',sk:8,render:r=><span className="mono">{r.mac||r.ip_mac||'—'}</span>},
   {key:'allocation_time',title:'分配时间',sk:8,render:r=><span className="num nowrap">{date(r.allocation_time)}</span>},
   {key:'remark',title:'备注',sk:6,render:r=>r.remark||<span className="net-muted">—</span>}
  ]};
 const config=view==='ips'?ips:view==='groups'?{...groupConfig('ip-groups','IP 分组','IP 段'),trailingActions:back('返回 IP 段',()=>open('segments'))}:segments;
 return <NetList key={view} title={view==='ips'?'IP 地址':view==='groups'?'IP 分组':'IPv4 管理'} config={config} options={options} notify={notify}/>;
}

export function IPv6Page({notify}:{notify:Notify}){
 const [view,open]=useView(['segments','addresses','groups']);const options=useOptions('6');
 const segments:Config={kind:'ipv6-segments',noun:'IPv6 段',search:'搜索名称或地址',location:true,create:true,edit:true,remove:true,label:r=>r.name||r.ipv6||'#'+r.id,
  filters:[{key:'group',label:'分组',all:'全部分组',options:o=>o.groups.map(g=>[String(g.id),g.name])}],
  empty:['还没有 IPv6 段','添加 IPv6 段后，实例可以从中分配 IPv6 地址。'],deleteNote:'只能删除没有已分配地址的 IPv6 段。',
  createDefaults:()=>({mode:'block'}),
  initial:r=>({...r,group_id:r.group_id!=null?String(r.group_id):'',node_id:ids(r.node_id??r.node)}),
  fields:[{key:'name',label:'名称',required:true},groupField('group_id','IPv6 分组'),
   {key:'mode',label:'添加方式',type:'select',required:true,createOnly:true,options:()=>[['block','按地址块'],['range','按起止地址']]},
   {key:'prefix',label:'前缀长度',type:'number',required:true,createOnly:true,min:1,max:128,placeholder:'64'},
   {key:'ipv6',label:'IPv6 地址块',createOnly:true,mono:true,placeholder:'2001:db8:10::',show:v=>v.mode!=='range'},
   {key:'start_ipv6',label:'起始 IPv6',createOnly:true,mono:true,placeholder:'2001:db8:10::100',show:v=>v.mode==='range'},
   {key:'end_ipv6',label:'结束 IPv6',createOnly:true,mono:true,placeholder:'2001:db8:10::1ff',show:v=>v.mode==='range'},
   {key:'gateway',label:'网关',required:true,mono:true,placeholder:'2001:db8:10::1'},{key:'dns1',label:'DNS 1',required:true,mono:true,placeholder:'2606:4700:4700::1111'},{key:'dns2',label:'DNS 2',required:true,mono:true,placeholder:'2001:4860:4860::8888'},nodeField('node_id')],
  trailingActions:<Button variant="outline" size="sm" onPress={()=>open('groups')}><Layers size={15}/>分组</Button>,
  columns:[
   {key:'name',title:'名称',rowHeader:true,sk:8,render:r=><Link className="owner-count-link" to={'/ipv6?view=addresses&segment='+r.id} aria-label={'查看 '+(r.name||'#'+r.id)+' 的 IPv6 地址'}>{r.name||'#'+r.id}</Link>},
   {key:'node',title:'节点',sk:8,render:r=><Names list={r.node} empty=""/>},
   {key:'used',title:'已用',sk:2,render:r=>count(r.used)},
   {key:'free',title:'空闲',sk:2,render:r=>count(r.free)},
   {key:'total',title:'总数',sk:2,render:r=>count(r.total)},
   {key:'group',title:'分组',sk:6,render:r=>r.group_name||''}
  ]};
 const addresses:Config={kind:'ipv6',noun:'IPv6 地址',search:'搜索地址或主机名',trailingActions:back('返回 IPv6 段',()=>open('segments')),label:r=>r.ipv6||'#'+r.id,
  filters:[{key:'segment',label:'IPv6 段',all:'全部 IPv6 段',options:o=>o.segments.map(s=>[String(s.id),s.name])}],
  empty:['还没有已分配的 IPv6','实例添加 IPv6 后，地址会出现在这里。'],
  columns:[
   {key:'ipv6',title:'IPv6 地址',rowHeader:true,sk:12,render:r=><span className="mono"><strong>{r.ipv6}</strong></span>},
   {key:'host',title:'实例',sk:9,render:r=>r.hostid?<Two main={<Link className="owner-count-link" to={'/clouds/'+r.hostid}>{r.hostname||'#'+r.hostid}</Link>} sub={r.username||undefined}/>:<span className="net-muted">—</span>},
   {key:'node',title:'节点',sk:7,render:r=><Two main={r.node_name} sub={r.area_name||undefined}/>},
   {key:'mac',title:'MAC',sk:8,render:r=><span className="mono">{r.mac||'—'}</span>},
   {key:'allocation_time',title:'分配时间',sk:8,render:r=><span className="num nowrap">{date(r.allocation_time)}</span>}
  ]};
 const config=view==='addresses'?addresses:view==='groups'?{...groupConfig('ipv6-groups','IPv6 分组','IPv6 段'),trailingActions:back('返回 IPv6 段',()=>open('segments'))}:segments;
 return <NetList key={view} title={view==='addresses'?'IPv6 地址':view==='groups'?'IPv6 分组':'IPv6 管理'} config={config} options={options} notify={notify}/>;
}

/** 批量添加ADSL账号：每行“VLAN,账号,密码,节点ID,节点ID…”。 */
function AdslImport({onClose,onDone}:{onClose:()=>void;onDone:(m:string)=>void}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 async function run(){setBusy(true);setError('');try{const r=await api<Row>('/net/adsl/import',send('POST',{lines}));onDone(r.num!=null?`已添加 ${r.num} 个账号${r.num<r.total?`，${r.total-r.num} 行未添加（账号可能已存在）`:''}`:'账号已提交');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog wide title="批量导入 ADSL 账号" onClose={()=>{if(!busy)onClose();}} footer={<><Button variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button isPending={busy} isDisabled={busy||!lines.length} onPress={run}>导入 {lines.length||''} 行</Button></>}>
  <p className="net-muted">每行一个账号，用逗号分隔：<span className="mono">VLAN,账号,密码,节点ID,节点ID…</span>，节点 ID 可省略。</p>
  <TextField value={text} onChange={setText}><Label>账号列表</Label><TextArea rows={10} className="mono" placeholder={'100,hk-dial-0001@isp,password1,1,2\n100,hk-dial-0002@isp,password2,1,2'}/></TextField>
  {error&&<ErrorBox message={error}/>}
 </Dialog>;
}
export function AdslPage({notify}:{notify:Notify}){
 const go=useNavigate();const options=useOptions(null);const [importing,setImporting]=useState(false),[key,setKey]=useState(0);
 const config:Config={kind:'adsl',noun:'ADSL 账号',search:'搜索账号',location:true,create:true,edit:true,remove:true,batch:true,label:r=>r.username||'#'+r.id,
  filters:[{key:'used',label:'使用状态',all:'全部使用状态',options:()=>[['0','空闲'],['1','已使用']]},{key:'lock',label:'锁定',all:'全部锁定状态',options:()=>[['0','未锁定'],['1','已锁定']]}],
  empty:['还没有 ADSL 账号','添加或批量导入拨号账号后，拨号云实例可以使用它们上网。'],deleteNote:'正在被实例使用的账号会被平台拒绝删除。',
  initial:r=>({...r,node:ids(r.node),lock:Number(r.lock)===1?1:0,password:''}),
  fields:[{key:'username',label:'账号',required:true,mono:true},{key:'password',label:'密码',type:'password',required:true,batch:true,help:'编辑时留空表示保留原密码；密码不会显示在页面上。'},{key:'vlan',label:'VLAN',type:'number',required:true,min:0,max:4096,batch:true,placeholder:'0～4096'},{key:'times',label:'可使用次数',type:'number',min:1,max:9999,batch:true,placeholder:'1'},{key:'node',label:'可用节点',type:'multi',multi:o=>o.nodes,batch:true},{key:'lock',label:'锁定（不再分配）',type:'bool',batch:true}],
  headerActions:<><Tooltip delay={0}><Button variant="outline" size="sm" isIconOnly aria-label="ADSL 日志" onPress={()=>go('/adsl-logs')}><History size={15}/></Button><Tooltip.Content>ADSL 日志</Tooltip.Content></Tooltip><Button variant="outline" size="sm" onPress={()=>setImporting(true)}><FileUp size={15}/>批量导入</Button></>,
  columns:[
   {key:'username',title:'账号',rowHeader:true,sk:11,render:r=><span className="mono"><strong>{r.username}</strong></span>},
   {key:'vlan',title:'VLAN',sk:3,render:r=><span className="num">{r.vlan??'—'}</span>},
   {key:'state',title:'状态',sk:4,render:r=><UseState row={r}/>},
   {key:'host',title:'使用实例',sk:8,render:r=>Array.isArray(r.host)&&r.host.length?<div className="net-links">{r.host.map((h:Row)=><Link key={h.id} className="owner-count-link" to={'/clouds/'+h.id}>{h.hostname||'#'+h.id}</Link>)}</div>:<span className="net-muted">—</span>},
   {key:'node',title:'可用节点',sk:8,render:r=><Names list={r.node} empty=""/>},
   {key:'times',title:'可使用次数',sk:3,render:r=><span className="num">{r.times??'—'}</span>}
  ]};
 return <><NetList key={key} title="ADSL 维护" config={config} options={options} notify={notify}/>{importing&&<AdslImport onClose={()=>setImporting(false)} onDone={m=>{setImporting(false);setKey(k=>k+1);notify(m);}}/>}</>;
}
