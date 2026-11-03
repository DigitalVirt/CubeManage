import {CountryFlag} from '../components/CountryFlag';
import {useEffect,useState} from 'react';
import {Button,Chip,Table,Tooltip} from '@heroui/react';
import {Link} from 'react-router-dom';
import {CopyIp} from '../components/CloudCells';
import {RefreshCw,Server,Clock3,ChartColumn,ArrowRight,Cpu,Globe2} from 'lucide-react';
import {api,label,type Row,type List} from '../lib/api';
import {ErrorBox,Empty} from '../components/Shared';
import {OverviewSkeleton} from '../components/PageSkeleton';
import {TableSkeleton} from '../components/TableSkeleton';
import {SevenDayBars} from '../components/SevenDayBars';
import {RegionMap} from '../components/RegionMap';
const size=(value:unknown)=>{if(value==null||!Number.isFinite(Number(value)))return '—';const n=Math.max(0,Number(value)),units=['B','KiB','MiB','GiB','TiB'];const i=n?Math.min(4,Math.floor(Math.log(n)/Math.log(1024))):0;return `${(n/1024**i).toLocaleString('zh-CN',{maximumFractionDigits:2})} ${units[i]}`;};
export function Overview({navigate}:{navigate:(p:string)=>void}){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0),[updated,setUpdated]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');api('/overview').then(result=>{if(active){setData(result.data??result);setUpdated(new Date().toLocaleTimeString('zh-CN'));}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[version]);
 const areas:Row[]=data?.resources?.areas?.data||[];
 // 最新创建的实例：v1/clouds 默认按编号倒序，取前 8 台。
 const [recent,setRecent]=useState<Row[]|null>(null),[recentError,setRecentError]=useState('');
 useEffect(()=>{let active=true;setRecentError('');api<List>('/resources/clouds?page=1&per_page=8').then(r=>{if(active)setRecent(r.data.filter(c=>c.status!=='recycle'));}).catch(e=>{if(active){setRecent([]);setRecentError((e as Error).message);}});return()=>{active=false;};},[version]);
 const hosts:Row[]=Array.isArray(data?.host_img_cache)?data.host_img_cache:[];
 return <><div className="page-heading"><div><h1>控制台</h1></div>{updated&&<div className="updated-note"><Clock3 size={13}/>最后更新 {updated}<Tooltip delay={0}><Button variant="ghost" size="sm" isIconOnly className="updated-refresh" aria-label="刷新首页数据" isDisabled={loading} onPress={()=>setVersion(v=>v+1)}><RefreshCw size={13} className={loading?'node-refreshing':''}/></Button><Tooltip.Content>刷新首页数据</Tooltip.Content></Tooltip></div>}</div>{error&&<ErrorBox message={error} retry={()=>setVersion(v=>v+1)}/>}{loading&&!data?<OverviewSkeleton heading={false}/>:data&&<>
 {data.homeError&&<ErrorBox message={data.homeError}/>}
 <div className="home-primary-grid">
 <section className="data-panel recent-tasks"><header className="panel-heading"><div><div className="panel-title"><ChartColumn size={18}/><h2>最近七天操作</h2></div></div><Chip size="sm">最近 7 天</Chip></header><SevenDayBars data={data.day7}/></section>
 <section className="data-panel region-overview"><header className="panel-heading"><div><div className="panel-title"><Globe2 size={18}/><h2>区域分布</h2></div></div>{areas.length>0&&<Chip size="sm">{areas.length} 个区域 · {areas.reduce((n,a)=>n+(Number(a.cloud_num)||0),0)} 台实例</Chip>}</header><RegionMap areas={areas} onOpen={id=>navigate(id==null?'areas':'nodes?area='+id)}/></section>
 </div><div className="home-ranking">
 <section className="data-panel"><header className="panel-heading"><div><div className="panel-title"><Cpu size={18}/><h2>实例用量排行</h2></div></div></header>{!hosts.length?<Empty kind="chart" size="sm" title="暂无用量数据" text="实例运行后，这里会显示 CPU、内存与网络用量排行。"/>:<Table><Table.ScrollContainer><Table.Content aria-label="实例用量排行" className="home-table"><Table.Header><Table.Column isRowHeader>实例</Table.Column><Table.Column>CPU</Table.Column><Table.Column>内存</Table.Column><Table.Column>网络用量</Table.Column></Table.Header><Table.Body>{hosts.slice(0,8).map((h,i)=><Table.Row key={h.host_id??i}><Table.Cell><Link className="home-host" to={'/clouds/'+h.host_id}>{h.hostname??'#'+h.host_id}</Link></Table.Cell><Table.Cell className="num">{h.cpu==null?'—':h.cpu+'%'}</Table.Cell><Table.Cell className="num">{size(h.ram==null?null:Number(h.ram)*1024*1024)}</Table.Cell><Table.Cell className="num">{size(h.bw)}</Table.Cell></Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>}</section>
 <section className="data-panel"><header className="panel-heading"><div><div className="panel-title"><Server size={18}/><h2>最新创建的实例</h2></div></div></header>{recentError?<ErrorBox message={recentError}/>:!recent?<TableSkeleton className="home-table" columns={[{title:'实例',width:7},{title:'区域',width:4},{title:'IP',width:7},{title:'配置',width:6}]} rows={8}/>:!recent.length?<Empty kind="instance" size="sm" title="还没有实例" text="创建实例后，最新的几台会显示在这里。"/>:<Table><Table.ScrollContainer><Table.Content aria-label="最新创建的实例" className="home-table"><Table.Header><Table.Column isRowHeader>实例</Table.Column><Table.Column>区域</Table.Column><Table.Column>IP</Table.Column><Table.Column>配置</Table.Column></Table.Header><Table.Body>{recent.map(c=>{const area=areas.find(a=>String(a.id)===String(c.area?.id??c.area_id??c.area));return <Table.Row key={c.id}><Table.Cell><Link className="home-host" to={'/clouds/'+c.id}>{c.hostname||'#'+c.id}</Link></Table.Cell><Table.Cell><span className="home-area">{c.area_name||area?.name||'—'}</span></Table.Cell><Table.Cell>{c.mainip?<span className="cloud-ip-cell"><span className="mono">{c.mainip}</span><CopyIp ip={String(c.mainip)}/></span>:'—'}</Table.Cell><Table.Cell className="num">{label(c.cpu)}vCPU · {label(c.memory)}GB</Table.Cell></Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>}</section>
 </div></>}</>;
}
