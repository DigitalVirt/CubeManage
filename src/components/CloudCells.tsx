import {Button,ProgressCircle,Table,Tooltip} from '@heroui/react';
import {useState} from 'react';
import {Clipboard,ClipboardCheck,Monitor} from 'lucide-react';
import {StatusIcon,cloudStatus,suspendTypes} from './StatusIcon';
import {label,osIconUrl,type Row} from '../lib/api';
import {Usage} from './NodeTelemetry';

export function cloudStateTitle(status:unknown){return cloudStatus(status).title;}
/** Clipboard API first; a hidden textarea + execCommand where the API is blocked (http, embedded browsers). */
export async function copyText(text:string){
 try{await navigator.clipboard.writeText(text);return true;}catch{/* fall back */}
 const el=document.createElement('textarea');el.value=text;el.setAttribute('readonly','');el.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.appendChild(el);el.select();
 let ok=false;try{ok=document.execCommand('copy');}catch{ok=false;}el.remove();return ok;
}
/** Copy button after an IP: shows on row hover or keyboard focus; ticks for 1.5s once copied. */
export function CopyIp({ip,what='IP'}:{ip:string;what?:string}){
 const [done,setDone]=useState(false);
 return <Tooltip delay={300}><Button variant="ghost" size="sm" isIconOnly className={'ip-copy'+(done?' is-done':'')} aria-label={'复制'+what+' '+ip} onPress={async()=>{if(await copyText(ip)){setDone(true);setTimeout(()=>setDone(false),1500);}}}>{done?<ClipboardCheck size={14}/>:<Clipboard size={14}/>}</Button><Tooltip.Content>{done?'已复制':'复制'+what}</Tooltip.Content></Tooltip>;
}

export function CloudState({row,pending,onRefresh}:{row:Row;pending:boolean;onRefresh:()=>void}){const spec=cloudStatus(row.status);const detail=String(row.status)==='suspend'&&row.suspend_type?suspendTypes[row.suspend_type]||row.suspend_type:String(row.status)==='task'?row.task_name||row.task:'';return <Tooltip delay={0}><Button variant="ghost" size="sm" isIconOnly className="status-button" aria-label={'刷新实例 '+row.hostname+'，当前'+spec.title} isDisabled={pending} onPress={onRefresh}><span className="node-status-icon">{pending?<ProgressCircle isIndeterminate size="sm" color="accent" aria-label="正在获取实时状态" className="cloud-state-loading"><ProgressCircle.Track><ProgressCircle.TrackCircle/><ProgressCircle.FillCircle/></ProgressCircle.Track></ProgressCircle>:<StatusIcon spec={spec} size={18}/>}</span></Button><Tooltip.Content>{spec.title}{detail?'（'+detail+'）':''} · 点击刷新此实例</Tooltip.Content></Tooltip>;}

/** Operating system name as the platform reports it, whichever field carries it, without an image-file extension (Ubuntu-26.04-x64.qcow2 → Ubuntu-26.04-x64). */
export function osName(row:Row){return stripImageExt(String(row.os_name||row.operate_system||row.image_name||row.os||''));}
export function stripImageExt(name:string){return name.replace(/\.(qcow2|qcow|img|raw|iso|vhdx?|vmdk|vdi|tar\.gz|tgz|tar|gz|xz|zst)$/i,'').trim();}
export function diskTotal(row:Row){const disks:Row[]=Array.isArray(row.disk)?row.disk:[];const total=disks.reduce((sum,d)=>sum+(Number(d.size??d.capacity)||0),0);return total||(row.system_disk_size!=null?Number(row.system_disk_size):null);}

/**
 * Monthly traffic. The list API (v1/clouds) returns only `traffic_used` (GB) and `traffic_percent`;
 * the quota (`traffic_quota`, GB) comes from the detail API. Never infer "unlimited" from a missing quota.
 */
export function traffic(row:Row){const num=(v:unknown)=>v==null||v===''||!Number.isFinite(Number(String(v).replace('%','')))?null:Number(String(v).replace('%',''));const used=num(row.traffic_used);let pct=num(row.traffic_percent);let quota=num(row.traffic_quota);
 // The list API has no quota: recover it from used ÷ percent (quotas are whole GB). Unknown when nothing is used yet.
 if(!(quota&&quota>0)&&used!=null&&used>0&&pct!=null&&pct>0)quota=Math.round(used/(pct/100));
 if(pct==null&&used!=null&&quota)pct=used/quota*100;return {used,quota:quota&&quota>0?quota:null,pct};}

function Running({row,children}:{row:Row;children:React.ReactNode}){return String(row.status)==='on'?<>{children}</>:<span className="cell-empty">—</span>;}

/** The image's OS mark from the platform, its name on hover; a neutral monitor when the platform has none. */
export function OsIcon({row}:{row:Row}){const [failed,setFailed]=useState(false);const url=osIconUrl(row.svg),name=osName(row)||'未知镜像';return <Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={'镜像：'+name} className="os-icon">{url&&!failed?<img src={url} alt="" width={20} height={20} onError={()=>setFailed(true)}/>:<Monitor size={18} aria-hidden="true"/>}</Tooltip.Trigger><Tooltip.Content>{name}</Tooltip.Content></Tooltip>;}

/** place: 配置下方的位置行（国旗 · 节点 · 分组），由实例列表传入。 */
export function CloudCells({row,place}:{row:Row;place?:React.ReactNode}){
 const disk=diskTotal(row),t=traffic(row);
 return <>
  <Table.Cell><span className="cloud-ip-cell"><span className="mono cloud-ip">{label(row.mainip)}</span>{row.mainip&&<CopyIp ip={String(row.mainip)}/>}</span></Table.Cell>
  <Table.Cell><div className="spec-stack"><span className="spec-cell">{label(row.cpu)}vCPU · {label(row.memory)}GB · {disk!=null?disk+'GB':'—'}</span>{place}</div></Table.Cell>
  <Table.Cell><OsIcon row={row}/></Table.Cell>
  <Table.Cell><Running row={row}><Usage value={row.cpu_usage} label={row.hostname+' CPU 使用率'}/></Running></Table.Cell>
  <Table.Cell><Running row={row}><Usage value={row.memory_usage} label={row.hostname+' 内存使用率'}/></Running></Table.Cell>
  <Table.Cell><Running row={row}><div className="node-bandwidth"><span className="bandwidth-out" aria-label={'实时出带宽 '+label(row.current_out_bw)}>↑ {label(row.current_out_bw)}</span><span className="bandwidth-in" aria-label={'实时进带宽 '+label(row.current_in_bw)}>↓ {label(row.current_in_bw)}</span></div></Running></Table.Cell>
  <Table.Cell><div className="node-bandwidth bw-limit"><span aria-label={'出带宽 '+label(row.out_bw)+'Mbps'}>↑ {label(row.out_bw)}Mbps</span><span aria-label={'进带宽 '+label(row.in_bw)+'Mbps'}>↓ {label(row.in_bw)}Mbps</span></div></Table.Cell>
  <Table.Cell><div className={'traffic-cell'+(t.pct!=null&&t.pct>=80?' is-high':'')}><span className="traffic-line num"><span>{t.used!=null?t.used.toFixed(1)+'GB':'—'}</span><small>{t.quota!=null?t.quota+'GB':'—'}</small></span>{t.pct!=null&&<span className="usage-track wide" role="meter" aria-label={row.hostname+' 本月流量用量'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(t.pct,100)}><i style={{width:Math.min(t.pct,100)+'%'}}/></span>}</div></Table.Cell>
 </>;
}
