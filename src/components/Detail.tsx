import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,ChevronDown,Power,RotateCcw} from 'lucide-react';
import {Button,Dropdown,Label,Table} from '@heroui/react';
import {CountryFlag} from './CountryFlag';
import {diskTotal,osName,traffic} from './CloudCells';
import {Operation,type OperationSpec} from './Operation';
import {actionNames} from '../lib/actions';
import {api,label,date,type Row,type List} from '../lib/api';
import {Dialog,ErrorBox,Status,Empty} from './Shared';
import {FormSkeleton} from './PageSkeleton';
import {TaskStatus} from './TaskStatus';
import {useIsMobile,MobileCard} from './MobileCards';
const names:Record<string,string>={id:'资源 ID',name:'名称',hostname:'主机名',ip:'连接地址',mainip:'主 IP',area_name:'区域',country_name:'国家 / 地区',node_name:'计算节点',cpu:'CPU 核数',memory:'内存（GiB）',system_disk_size:'系统盘（GiB）',operate_system:'操作系统',os_name:'操作系统',traffic_quota:'流量限额（GB）',traffic_used:'已用流量（GB）',in_bw:'入站带宽（Mbps）',out_bw:'出站带宽（Mbps）',reset_flow_day:'每月重置日',remark:'备注',username:'用户名',port:'鉴权端口',cloud_num:'实例数',node_num:'节点数',ip_free_num:'可用 IP',ip_num:'IP 总数',country:'国家 ID',short_name:'简称',type:'资源类型',msg:'任务信息',progress:'执行进度（%）',create_time:'创建时间',start_time:'开始时间',end_time:'结束时间',hostid:'关联实例 ID'};
export function unwrap(r:Row){return r?.data&&!Array.isArray(r.data)&&r.id==null?r.data:r;}
function DetailFrame({standalone,title,onClose,children}:{standalone:boolean;title:string;onClose:()=>void;children:ReactNode}){
 if(!standalone)return <Dialog wide title={title} onClose={onClose} footer={<Button variant="outline" onPress={onClose}>关闭</Button>}>{children}</Dialog>;
 return <section className="instance-detail-page"><div className="page-heading"><div><h1>{title}</h1></div><Button variant="outline" size="sm" onPress={onClose}><ArrowLeft size={16}/>返回实例列表</Button></div>{children}</section>;
}
export function Detail({kind,row,onClose,standalone=false}:{kind:string;row:Row;onClose:()=>void;standalone?:boolean}){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[tab,setTab]=useState('info'),[extra,setExtra]=useState<Row|null>(null),[extraError,setExtraError]=useState('');
 useEffect(()=>{let active=true;api(`/resources/${kind}/${row.id}`).then(r=>{if(active)setData(unwrap(r));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[kind,row.id]);
 useEffect(()=>{if(tab==='info')return;let active=true;setExtra(null);setExtraError('');api(tab==='traffic'?`/clouds/${row.id}/traffic`:`/resources/tasks?cloud=${row.id}&per_page=20`).then(r=>{if(active)setExtra(r);}).catch(e=>{if(active)setExtraError(e.message);});return()=>{active=false;};},[tab,row.id]);
 const r=data||row;const meta=extra?.meta;const trafficBytes=extra?.info?.['30_day']?.total;
 return <DetailFrame standalone={standalone} title={(r.hostname||r.name||(standalone?'实例详情':'资源详情'))+' · #'+row.id} onClose={onClose}>{kind==='clouds'&&<div className="tabs">{[['info','基本信息'],['traffic','流量详情'],['tasks','关联任务']].map(([key,title])=><Button variant={tab===key?'secondary':'ghost'} key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{title}</Button>)}</div>}{tab==='info'?<>{error&&<ErrorBox message={error}/ >}{!data&&!error?<FormSkeleton rows={4}/>:<><div className="detail-status"><Status value={r.status} task={kind==='tasks'}/></div><dl className="detail-grid">{Object.entries(names).filter(([key])=>r[key]!=null).map(([key,title])=><div key={key}><dt>{title}</dt><dd>{key.endsWith('_time')?date(r[key]):key==='ip'&&Array.isArray(r[key])?r[key].map((item:Row)=>item.ipaddress||item.ip).filter(Boolean).join('、')||'—':label(r[key])}</dd></div>)}</dl>{r.disk?.length>0&&<><h3 className="subheading">磁盘</h3><Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="资源数据"><Table.Header><Table.Column isRowHeader>ID</Table.Column><Table.Column>类型</Table.Column><Table.Column>容量</Table.Column></Table.Header><Table.Body>{r.disk.map((d:Row)=><Table.Row key={d.id}><Table.Cell>#{d.id}</Table.Cell><Table.Cell>{label(d.type)}</Table.Cell><Table.Cell>{label(d.size??d.capacity)} GiB</Table.Cell></Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table></>}</>}</>:extraError?<ErrorBox message={extraError}/>:!extra?<FormSkeleton rows={4}/>:tab==='traffic'?<><dl className="detail-grid"><div><dt>总流量限额（GB）</dt><dd>{meta?.total===-1?'不限':label(meta?.total??meta?.traffic_quota)}</dd></div><div><dt>近 30 天使用量</dt><dd>{trafficBytes==null?'—':(Number(trafficBytes)/1073741824).toFixed(2)+' GiB'}</dd></div><div><dt>下次重置时间</dt><dd>{date(meta?.flow_reset_time)}</dd></div><div><dt>流量包总量（GB）</dt><dd>{label(meta?.traffic_package?.total_size)}</dd></div><div><dt>流量包剩余（GB）</dt><dd>{label(meta?.traffic_package?.leave_size)}</dd></div></dl><p className="field-help">近 30 天用量与计费周期可能不同；未提供的字段显示为 —。</p></>:<TaskTable rows={(extra as List).data||[]}/>}</DetailFrame>;
}
/** 任务列表：电脑上是表格，手机上（≤640px）每个任务一张卡片：编号、类型、状态、资源、创建时间，点卡片看详情。 */
export function TaskTable({rows,onSelect}:{rows:Row[];onSelect?:(r:Row)=>void}){const mobile=useIsMobile();
 if(mobile&&rows.length)return <div className="m-list">{rows.map(r=><MobileCard key={r.id} title={r.type_desc||r.description||r.type||'任务'} sub={<><span className="num">#{r.id}</span>{(r.hostname||r.hostid)&&<> · {r.hostname||'#'+r.hostid}</>}</>}
  state={<TaskStatus status={r.status} msg={r.msg}/>} onOpen={onSelect?()=>onSelect(r):undefined}
  lines={r.msg?[[<span className="m-muted">{String(r.msg)}</span>,'']]:undefined}
  metrics={[{label:'创建时间',value:date(r.create_time)},...(r.progress!=null&&r.progress!==''?[{label:'进度',value:Number(r.progress)+'%',pct:Number(r.progress)}]:[])]}/>)}</div>;
 return rows.length?<Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="资源数据"><Table.Header><Table.Column isRowHeader>任务 / 资源</Table.Column><Table.Column>类型</Table.Column><Table.Column>状态</Table.Column><Table.Column>创建时间</Table.Column></Table.Header><Table.Body>{rows.map(r=><Table.Row key={r.id}><Table.Cell>{onSelect?<Button variant="ghost" className="text-link" onClick={()=>onSelect(r)}>#{r.id}</Button>:<strong>#{r.id}</strong>}<small>{r.hostname||r.hostid||'—'}</small></Table.Cell><Table.Cell>{r.type_desc||r.description||r.type||'—'}</Table.Cell><Table.Cell><TaskStatus status={r.status} msg={r.msg}/></Table.Cell><Table.Cell>{date(r.create_time)}</Table.Cell></Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>:<Empty kind="task" size="sm" title="暂无任务" text="还没有相关的任务记录。"/>;}

export {InstanceDetail} from './InstanceDetail';
