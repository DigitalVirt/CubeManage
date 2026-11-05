import {useEffect,useState,type ReactNode} from 'react';
import {Button,Checkbox,Dropdown,Label,Switch} from '@heroui/react';
import {MoreHorizontal} from 'lucide-react';
import {label,type Row} from '../lib/api';
import {CountryFlag} from './CountryFlag';
import {cloudStatus,healthStatus,type StatusSpec} from './StatusIcon';
import {CopyIp,diskTotal,osName,traffic} from './CloudCells';
import {useNodeTelemetry,percent,bandwidth,diskList} from './NodeTelemetry';

/**
 * 手机端（宽度 ≤ 640px）的列表卡片：实例、节点、区域、回收站、任务共用同一套结构。
 *  头部：勾选框 · 名称和副标题 · 状态标签 · “⋯”菜单
 *  身份信息：一到两行“左 · 右”
 *  指标：细线下方 3～4 格，百分比带细用量条（≥80% 橙色，≥90% 红色）
 *  底部（可选）：一行补充信息和开关
 * 点卡片空白处打开详情；勾选后底部浮出批量操作栏（MobileSelectBar）。
 */
export function useIsMobile(query='(max-width: 640px)'){
 const [mobile,setMobile]=useState(()=>typeof window!=='undefined'&&window.matchMedia(query).matches);
 useEffect(()=>{const m=window.matchMedia(query);const on=()=>setMobile(m.matches);on();m.addEventListener('change',on);return()=>m.removeEventListener('change',on);},[query]);
 return mobile;
}

export type CardAction={id:string;title:string;danger?:boolean;run:()=>void};
/** plain：进度条只用主色，不按使用率变橙 / 红（任务进度等）。 */
export type Metric={label:string;value:ReactNode;pct?:number|null;plain?:boolean};

/** 状态标签：颜色来自状态定义（运行中绿、关机灰、异常红……） */
export function StatePill({spec,title}:{spec:StatusSpec;title?:string}){
 return <span className="m-pill" style={{color:spec.color,background:`color-mix(in srgb, ${spec.color} 13%, transparent)`}}><i/>{title||spec.title}</span>;
}

function Metrics({items}:{items:Metric[]}){
 return <div className="m-met" style={{gridTemplateColumns:`repeat(${items.length},minmax(0,1fr))`}}>{items.map(m=>{const p=m.pct;const level=p==null||m.plain?'':p>=90?' is-critical':p>=80?' is-high':'';
  return <div key={m.label} className={level}><small>{m.label}</small><b className="num">{m.value}</b>{p!=null&&<span className="m-bar" aria-hidden="true"><i style={{width:Math.min(100,Math.max(0,p))+'%'}}/></span>}</div>;})}</div>;
}

/** 通用卡片 */
export function MobileCard({title,sub,state,picked,onPick,pickLabel,actions,lines,metrics,foot,onOpen,className=''}:{
 title:ReactNode;sub?:ReactNode;state?:ReactNode;picked?:boolean;onPick?:(on:boolean)=>void;pickLabel?:string;actions?:CardAction[];
 lines?:[ReactNode,ReactNode][];metrics?:Metric[];foot?:ReactNode;onOpen?:()=>void;className?:string}){
 // 点卡片空白处打开详情；按钮、链接、勾选框、开关上的点击不算
 const open=(e:React.MouseEvent)=>{if(!onOpen||(e.target as HTMLElement).closest('button,a,input,label,[role="switch"],[role="checkbox"],[role="menu"]'))return;onOpen();};
 return <article className={'m-card'+(picked?' is-picked':'')+(onOpen?' is-link':'')+(className?' '+className:'')} onClick={open}>
  <div className="m-head">
   {onPick&&<Checkbox slot={null} className="table-check m-check" aria-label={pickLabel} isSelected={Boolean(picked)} onChange={onPick}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox>}
   <div className="m-title"><div className="m-name">{title}</div>{sub&&<div className="m-sub">{sub}</div>}</div>
   {state}
   {actions&&actions.length>0&&<Dropdown><Button variant="ghost" size="sm" isIconOnly className="m-more" aria-label="更多操作"><MoreHorizontal size={18}/></Button>
    <Dropdown.Popover placement="bottom end"><Dropdown.Menu aria-label="更多操作" onAction={key=>actions.find(a=>a.id===key)?.run()}>
     {actions.map(a=><Dropdown.Item key={a.id} id={a.id} textValue={a.title} variant={a.danger?'danger':'default'}><Label>{a.title}</Label></Dropdown.Item>)}
    </Dropdown.Menu></Dropdown.Popover></Dropdown>}
  </div>
  {lines&&lines.length>0&&<div className="m-lines">{lines.map(([l,r],i)=><div key={i}><span>{l}</span><span>{r}</span></div>)}</div>}
  {metrics&&metrics.length>0&&<Metrics items={metrics}/>}
  {foot&&<div className="m-foot">{foot}</div>}
 </article>;
}

const place=(row:Row,area?:Row|null,node?:Row|null)=><span className="m-place"><CountryFlag code={row.country_code||area?.country_code} name={row.country_name||area?.country_name||row.area_name}/>{label(row.node_name||node?.name)}{node?.group_name&&<span className="group-tag is-sm">{node.group_name}</span>}</span>;

/** 实例卡片：名称、ID、所有人；主 IP、节点；配置、镜像；CPU、内存、带宽、本月流量 */
export function CloudCard({row,area,node,owner,picked,onPick,onOpen,actions}:{row:Row;area?:Row|null;node?:Row|null;owner?:ReactNode;picked:boolean;onPick:(on:boolean)=>void;onOpen:()=>void;actions:CardAction[]}){
 const spec=cloudStatus(row.status),on=String(row.status)==='on',disk=diskTotal(row),t=traffic(row);
 return <MobileCard title={row.hostname||'#'+row.id} sub={<><span className="num">#{row.id}</span>{owner&&<> · {owner}</>}</>} state={<StatePill spec={spec}/>}
  picked={picked} onPick={onPick} pickLabel={'选择实例 '+(row.hostname||row.id)} onOpen={onOpen} actions={actions}
  lines={[[row.mainip?<span className="m-ip"><span className="mono">{row.mainip}</span><CopyIp ip={String(row.mainip)}/></span>:'—',place(row,area,node)],
   [`${label(row.cpu)} 核 · ${label(row.memory)} GB · ${disk!=null?disk+' GB':'—'}`,osName(row)||'—']]}
  metrics={[{label:'CPU',value:on&&percent(row.cpu_usage)!=null?percent(row.cpu_usage)!.toFixed(0)+'%':'—',pct:on?percent(row.cpu_usage):null},
   {label:'内存',value:on&&percent(row.memory_usage)!=null?percent(row.memory_usage)!.toFixed(0)+'%':'—',pct:on?percent(row.memory_usage):null},
   {label:'带宽 ↓/↑',value:on?<>{label(row.current_in_bw)}<small> / {label(row.current_out_bw)}</small></>:'—'},
   {label:'本月流量',value:t.used!=null?t.used.toFixed(t.used<10?2:1)+' GB':'—',pct:t.pct}]}/>;
}

/** 节点卡片：名称、分组、IP；实例数、CPU、内存、磁盘；带宽和启用 / 维护开关。监控数据与表格共用 useNodeTelemetry。 */
export function NodeCard({row,area,picked,onPick,onOpen,actions,refreshKey,status,onStatus,onSettled,onSwitch}:{row:Row;area?:Row|null;picked:boolean;onPick:(on:boolean)=>void;onOpen:()=>void;actions:CardAction[];
 refreshKey:string;status:unknown;onStatus:(id:number,v:unknown)=>void;onSettled:(id:number)=>void;onSwitch:(field:'enable'|'maintenance_mode',on:boolean)=>void}){
 const {data}=useNodeTelemetry({id:Number(row.id),refreshKey,onStatus,onSettled});
 const healthy=Number(status)===1,maint=Number(row.maintenance_mode)===1;
 const disks=diskList(data),diskMax=disks.reduce<number|null>((m,d)=>{const p=percent(d.disk_percent);return p==null?m:m==null?p:Math.max(m,p);},null);
 const pct=(v:unknown)=>{const p=percent(v);return {value:p==null?'—':p.toFixed(0)+'%',pct:p};};
 const sw=(field:'enable'|'maintenance_mode',title:string)=><span className="m-switch">{title}<Switch size="sm" aria-label={title+'节点 '+row.name} isSelected={Number(row[field])===1} isDisabled={row[field]==null} onChange={v=>onSwitch(field,v)}><Switch.Content aria-label={title+'节点 '+row.name}><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch></span>;
 return <MobileCard title={<><CountryFlag code={row.country_code||area?.country_code} name={row.country_name||area?.country_name}/>{row.name||'#'+row.id}{row.group_name&&<span className="group-tag is-sm">{row.group_name}</span>}</>}
  sub={row.ip?<span className="m-ip"><span className="mono">{row.ip}</span><CopyIp ip={String(row.ip)}/></span>:undefined}
  state={<StatePill spec={healthy&&maint?{...healthStatus(1),color:'#b45309'}:healthStatus(status)} title={!healthy?'异常':maint?'维护中':'正常'}/>}
  picked={picked} onPick={onPick} pickLabel={'选择节点 '+(row.name||row.id)} onOpen={onOpen} actions={actions}
  metrics={[{label:'实例',value:label(row.cloud_num)},{label:'CPU',...pct(data?.cpu_info?.use_percent)},{label:'内存',...pct(data?.memory?.use_percent)},{label:'磁盘',value:diskMax==null?'—':diskMax.toFixed(0)+'%',pct:diskMax}]}
  foot={<><span className="m-muted num">↓ {bandwidth(data?.net_card?.inbw)} ↑ {bandwidth(data?.net_card?.outbw)}</span><span className="m-switches">{sw('enable','启用')}{sw('maintenance_mode','维护')}</span></>}/>;
}

/** 区域卡片：名称、国家；节点、实例、可用 IP、IP 总计 */
export function AreaCard({row,onOpen,actions}:{row:Row;onOpen:()=>void;actions:CardAction[]}){
 return <MobileCard title={<><CountryFlag code={row.country_code} name={row.country_name}/>{row.name||'#'+row.id}</>} sub={<><span className="num">#{row.id}</span>{row.country_name&&<> · {row.country_name}</>}</>}
  state={<StatePill spec={healthStatus(row.status)}/>} onOpen={onOpen} actions={actions}
  metrics={[{label:'节点',value:label(row.node_num)},{label:'实例',value:label(row.cloud_num)},{label:'可用 IP',value:label(row.ip_free_num)},{label:'IP 总计',value:label(row.ip_num)}]}/>;
}

/** 勾选后浮在底部的操作栏 */
export function MobileSelectBar({count,unit,onClear,children}:{count:number;unit:string;onClear:()=>void;children:ReactNode}){
 if(!count)return null;
 return <div className="m-selbar" role="region" aria-label="批量操作"><span>已选 <b className="num">{count}</b> {unit}</span><span className="m-selbar-actions"><Button size="sm" variant="ghost" className="m-selbar-cancel" onPress={onClear}>取消</Button>{children}</span></div>;
}

/** 手机端加载中：卡片形状的骨架 */
export function MobileSkeleton({rows=5}:{rows?:number}){
 return <div className="m-list" aria-busy="true" aria-label="正在加载">{Array.from({length:rows},(_,i)=><div key={i} className="m-card m-sk"><div className="m-head"><span className="sk-bar" style={{width:'45%'}}/><span className="sk-bar" style={{width:'3.5rem',marginLeft:'auto'}}/></div><div className="m-lines"><span className="sk-bar" style={{width:'80%'}}/><span className="sk-bar" style={{width:'60%'}}/></div><div className="m-met" style={{gridTemplateColumns:'repeat(4,1fr)'}}>{[0,1,2,3].map(j=><div key={j}><span className="sk-bar" style={{width:'70%'}}/></div>)}</div></div>)}</div>;
}
