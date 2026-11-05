import {useEffect,useState,useRef} from 'react';
import {Button,Table,Tooltip} from '@heroui/react';
import {api,type Row} from '../lib/api';
let running=0;const waiting:(()=>void)[]=[];
function queued<T>(task:()=>Promise<T>):Promise<T>{return new Promise((resolve,reject)=>{const run=()=>{running++;task().then(resolve,reject).finally(()=>{running--;waiting.shift()?.();});};if(running<4)run();else waiting.push(run);});}
export function percent(value:unknown){return value==null||value===''||!Number.isFinite(Number(String(value).replace('%','')))||Number(String(value).replace('%',''))<0?null:Number(String(value).replace('%',''));}
export function bandwidth(value:unknown){if(value==null||!Number.isFinite(Number(value))||Number(value)<0)return '—';const n=Number(value),units=['bps','Kbps','Mbps','Gbps','Tbps'];const i=n?Math.max(0,Math.min(4,Math.floor(Math.log(n)/Math.log(1000)))):0;return `${(n/1000**i).toLocaleString('zh-CN',{maximumFractionDigits:2})} ${units[i]}`;}
export function Usage({value,label}:{value:unknown;label:string}){const n=percent(value);if(n===null)return <div className="usage"><span className="usage-empty">—</span></div>;const level=n>=90?' is-critical':n>=80?' is-high':'';return <div className={'usage'+level} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(n,100)}><strong>{n.toFixed(1)}%</strong><span className="usage-track" aria-hidden="true"><i style={{width:Math.min(n,100)+'%'}}/></span></div>;}

type TelemetryProps={id:number;refreshKey?:number|string;onStatus?:(id:number,status:unknown)=>void;onSettled?:(id:number)=>void};
/** 节点监控数据（GET /api/nodes/:id/metrics），每 30 秒更新；表格行和手机卡片共用。最多同时 4 个请求。 */
export function useNodeTelemetry({id,onStatus,onSettled,refreshKey=0}:TelemetryProps){
 const handlers=useRef({onStatus,onSettled});handlers.current={onStatus,onSettled};
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true,pending=false;const load=async()=>{if(pending)return;pending=true;try{const result=await queued(async()=>active?api(`/nodes/${id}/metrics`):null);if(active&&result){const data=result.data??result;setData(data);setError('');handlers.current.onStatus?.(id,data.status);}}catch(e){if(active)setError((e as Error).message);}finally{pending=false;if(active)handlers.current.onSettled?.(id);}};load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);};},[id,retry,refreshKey]);
 return {data,error,retry:()=>setRetry(v=>v+1)};
}
/** 磁盘列表：平台可能返回数组或单个对象 */
export const diskList=(data:Row|null):Row[]=>!data?[]:Array.isArray(data.disk)?data.disk:data.disk&&typeof data.disk==='object'?[data.disk]:[];

export function NodeTelemetry(props:TelemetryProps){
 const {id}=props;const {data,error,retry}=useNodeTelemetry(props);const setRetry=(_:(v:number)=>number)=>retry();
 if(error&&!data)return <><Table.Cell><span title={error}>监控获取失败</span><Button size="sm" variant="ghost" onPress={()=>setRetry(v=>v+1)}>重试</Button></Table.Cell><Table.Cell>—</Table.Cell><Table.Cell>—</Table.Cell><Table.Cell>—</Table.Cell></>;
 if(!data)return <><Table.Cell>-</Table.Cell><Table.Cell>-</Table.Cell><Table.Cell>-</Table.Cell><Table.Cell>-</Table.Cell></>;
 const disks=diskList(data);
 return <><Table.Cell><Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={'节点 '+id+' CPU 详情'}><Usage value={data.cpu_info?.use_percent} label={'节点 '+id+' CPU 使用率'}/>{error&&<Button variant="ghost" size="sm" onPress={()=>setRetry(v=>v+1)} aria-label={'节点 '+id+' 更新失败，点击重试'}>更新失败</Button>}</Tooltip.Trigger><Tooltip.Content><div className="node-metric-tooltip"><strong>CPU</strong><span>核心数：{data.cpu_info?.cpu??'—'}</span>{data.cpu_info?.model_name&&<span>{data.cpu_info.model_name}</span>}</div></Tooltip.Content></Tooltip></Table.Cell><Table.Cell><Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={'节点 '+id+' 内存详情'}><Usage value={data.memory?.use_percent} label={'节点 '+id+' 内存使用率'}/></Tooltip.Trigger><Tooltip.Content><div className="node-metric-tooltip"><strong>内存</strong><span>已用：{data.memory?.use_memory??'—'}</span><span>总量：{data.memory?.total_memory??'—'}</span></div></Tooltip.Content></Tooltip></Table.Cell><Table.Cell>{!disks.length?'—':<div className="node-disk-list">{disks.map((disk,i)=><Tooltip key={i} delay={0}><Tooltip.Trigger tabIndex={0} aria-label={'节点 '+id+' 磁盘 '+(i+1)+' 详情'}><Usage value={disk.disk_percent} label={'节点 '+id+' 磁盘使用率'}/></Tooltip.Trigger><Tooltip.Content><div className="node-metric-tooltip"><strong>{disk.mount_point||disk.dev_name||'磁盘'}</strong><span>已用：{disk.disk_use??'—'}</span><span>总量：{disk.disk_total??'—'}</span><span>空闲：{disk.disk_free??'—'}</span></div></Tooltip.Content></Tooltip>)}</div>}</Table.Cell><Table.Cell><div className="node-bandwidth"><span className="bandwidth-out" aria-label={'上行 '+bandwidth(data.net_card?.outbw)}>↑ {bandwidth(data.net_card?.outbw)}</span><span className="bandwidth-in" aria-label={'下行 '+bandwidth(data.net_card?.inbw)}>↓ {bandwidth(data.net_card?.inbw)}</span></div></Table.Cell></>;
}
