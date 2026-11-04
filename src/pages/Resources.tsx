import {CopyIp,CloudCells,CloudState,traffic} from '../components/CloudCells';
import {CountryFlag} from '../components/CountryFlag';
import {NodeTelemetry} from '../components/NodeTelemetry';
import {Choice} from '../components/Controls';
import {useEffect,useRef,useState} from 'react';
import {Button,Checkbox,InputGroup,Table,Switch,Tooltip} from '@heroui/react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Plus,Search,Pencil,Trash2,RefreshCw,User,X,ArrowRightLeft} from 'lucide-react';
import {StatusIcon,healthStatus} from '../components/StatusIcon';
import {api,label,send,type Row,type List} from '../lib/api';
import {ResourceForm,type Descriptor} from '../components/ResourceForm';
import {ResourceDialog} from '../components/ResourceDialog';
import {Operation,type OperationSpec} from '../components/Operation';
import {Detail,TaskTable,unwrap} from '../components/Detail';
import {Empty,ErrorBox,type EmptyKind,type Notify} from '../components/Shared';
import {BatchMenu,BatchOperation,exportInstances} from '../components/BatchOperation';
import {Pager} from '../components/Pager';
import {TableSkeleton} from '../components/TableSkeleton';
import {useUrlState,pageFrom,perPageFrom} from '../lib/urlState';
import {MigrationQueue} from '../components/MigrationQueue';
/** 实例所有人：列表接口返回 user{id,username}，详情等接口是 user_id / username。 */
const ownerOf=(row:Row)=>({id:row.user?.id??row.user_id??row.uid??null,name:String(row.user?.username??row.username??'')});
import {LocationFilter} from '../components/LocationFilter';
/** Skeleton columns per list: real headers, bar widths (rem) close to the data each column holds. The
    task list refreshes itself every 10 s, so it keeps its rows instead (see the loading condition). */
const skeletonColumns:Record<string,{title:string;width:number;twoLine?:boolean}[]>={
 clouds:[{title:'',width:0},{title:'',width:0},{title:'实例',width:9,twoLine:true},{title:'主 IP',width:7},{title:'配置',width:8},{title:'镜像',width:0},{title:'CPU',width:3.5,twoLine:true},{title:'内存',width:3.5,twoLine:true},{title:'实时带宽',width:5.5,twoLine:true},{title:'带宽',width:5.5,twoLine:true},{title:'本月流量',width:6.5,twoLine:true}],
 nodes:[{title:'',width:0},{title:'节点名称',width:7},{title:'节点地址',width:7},{title:'实例',width:2},{title:'CPU',width:3.5,twoLine:true},{title:'内存',width:3.5,twoLine:true},{title:'磁盘',width:3.5,twoLine:true},{title:'带宽',width:6,twoLine:true},{title:'启用',width:2.25},{title:'维护',width:2.25},{title:'操作',width:0}],
 areas:[{title:'状态',width:0},{title:'区域',width:7},{title:'节点',width:2},{title:'实例',width:2},{title:'可用 IP',width:2.5},{title:'IP 总计',width:2.5},{title:'操作',width:0}],
 tasks:[{title:'任务 / 资源',width:6,twoLine:true},{title:'类型',width:5},{title:'状态',width:4},{title:'创建时间',width:8}]
};
/** 实例列表可排序的列；第一次点击的方向：文字升序，数值降序（先看最大的）。再点反向，第三次取消。 */
const SORT_KEYS=['mainip','cpu','os','cpu_usage','memory_usage','current_out_bw','traffic'];
const SORT_FIRST:Record<string,'asc'|'desc'>={mainip:'asc',os:'asc'};
const SORT_HINT:Record<string,string>={cpu:'按 vCPU 数排序',current_out_bw:'按实时出带宽排序',traffic:'平台不支持按流量排序，只对当前页排序'};
function SortHead({id,title,orderby,sort,onSort}:{id:string;title:string;orderby:string;sort:'asc'|'desc';onSort:(k:string)=>void}){
 const on=orderby===id;const next=!on?(SORT_FIRST[id]||'desc'):sort===(SORT_FIRST[id]||'desc')?(sort==='asc'?'desc':'asc'):null;
 const tip=(SORT_HINT[id]?SORT_HINT[id]+'；':'')+(next?'点击'+(next==='asc'?'升序':'降序')+'排列':'点击取消排序');
 // 方案 B：整格可点，常驻上下两个小三角，当前方向的三角为主色。
 return <Tooltip delay={600}><Button variant="ghost" className={'sort-head'+(on?' is-active':'')} aria-label={title+'，'+tip} onPress={()=>onSort(id)}><span>{title}</span><span className="sort-tri" aria-hidden="true"><svg width="8" height="5" viewBox="0 0 8 5" className={on&&sort==='asc'?'is-on':''}><path d="M4 0L8 5H0z" fill="currentColor"/></svg><svg width="8" height="5" viewBox="0 0 8 5" className={on&&sort==='desc'?'is-on':''}><path d="M0 0h8L4 5z" fill="currentColor"/></svg></span></Button><Tooltip.Content>{tip}</Tooltip.Content></Tooltip>;
}

export function Resources({kind,catalog,notify}:{kind:string;catalog:Record<string,Descriptor>;notify:Notify}){
 const goTo=useNavigate();const [params,setParams]=useSearchParams();const urlSearch=params.get('search');
 useEffect(()=>{if(urlSearch!=null)setSearch(urlSearch);},[urlSearch]);
 // Instance owner filter (v1/clouds?user=), set by opening a user from the global search. The URL holds it, so it survives reloads and back/forward.
 const owner=kind==='clouds'&&/^\d+$/.test(params.get('user')||'')?params.get('user')!:'',ownerName=params.get('username')||'#'+owner;
 const ownerSeen=useRef(owner);useEffect(()=>{if(ownerSeen.current===owner)return;ownerSeen.current=owner;setPage(1);},[owner]);
 const clearOwner=()=>setParams(p=>{const next=new URLSearchParams(p);next.delete('user');next.delete('username');return next;},{replace:true});
 const [page,setPage]=useState(()=>pageFrom(params)),[perPage,setPerPage]=useState(()=>perPageFrom(params)),[search,setSearch]=useState(()=>params.get('search')||''),[term,setTerm]=useState(()=>params.get('search')||''),[status,setStatus]=useState(()=>params.get('status')||''),[area,setArea]=useState(params.get('area')||''),[node,setNode]=useState(()=>params.get('node')||''),[areas,setAreas]=useState<Row[]>([]),[nodes,setNodes]=useState<Row[]>([]),[filter]=useState(Boolean(params.get('area'))),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[result,setResult]=useState<List|null>(null),[error,setError]=useState(''),[form,setForm]=useState<{record:Row|null}|null>(null),[detail,setDetail]=useState<Row|null>(null),[operation,setOperation]=useState<OperationSpec|null>(null),[editingId,setEditingId]=useState<number|null>(null);
 // 表头排序（仅实例列表）：orderby / sort 写进网址；traffic 只对当前页排序。
 const [orderby,setOrderby]=useState(()=>kind==='clouds'&&SORT_KEYS.includes(params.get('orderby')||'')?params.get('orderby')!:''),[sort,setSort]=useState<'asc'|'desc'>(()=>params.get('sort')==='asc'?'asc':'desc');
 const sortBy=(key:string)=>{const first=SORT_FIRST[key]||'desc';if(orderby!==key){setOrderby(key);setSort(first);}else if(sort===first)setSort(first==='asc'?'desc':'asc');else{setOrderby('');setSort('desc');}// 服务端排序变了就回到第 1 页；只在当前页排流量时保持页码。
  if(key!=='traffic'||(orderby&&orderby!=='traffic'))setPage(1);};
 const [dragging,setDragging]=useState<number|null>(null),[dropTarget,setDropTarget]=useState<{id:number;position:'before'|'after'}|null>(null),[ordering,setOrdering]=useState(false);
 const [nodeRefresh,setNodeRefresh]=useState<Record<number,number>>({}),[nodeStatuses,setNodeStatuses]=useState<Record<number,unknown>>({}),[nodePending,setNodePending]=useState<Record<number,boolean>>({});
 const [selected,setSelected]=useState<Set<number>>(new Set()),[batch,setBatch]=useState<string|null>(null),[queueOpen,setQueueOpen]=useState(false);
 const [cloudMetrics,setCloudMetrics]=useState<Record<number,Row>>({}),[cloudPending,setCloudPending]=useState<Record<number,boolean>>({});
 const cloudIds=kind==='clouds'?(result?.data||[]).map(row=>Number(row.id)).join(','):'';
 useEffect(()=>{if(!cloudIds)return;let active=true,pending=false;const ids=cloudIds.split(',').map(Number);const load=async()=>{if(pending)return;pending=true;try{const value=await api('/clouds/metrics',send('POST',{id:ids}));const rows=Array.isArray(value)?value:value.data;if(active&&Array.isArray(rows))setCloudMetrics(v=>({...v,...Object.fromEntries(rows.filter(row=>ids.includes(Number(row.id))).map(row=>[row.id,row]))}));}catch(e){if(active)notify((e as Error).message,'danger');}finally{pending=false;}};load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);};},[cloudIds,revision]);
 // 表头的刷新：不重新加载列表，本页实例每 5 个一批：并发 5 个实例状态请求（v1/clouds/:id/status，平台没有批量接口），
 // 同时用一个 v1/clouds/real_data 请求拿这 5 个实例的 CPU、内存和带宽；结果逐行更新。
 const [statesBusy,setStatesBusy]=useState(false);
 async function refreshCloudStates(){
  const list=(result?.data||[]).map(r=>Number(r.id)).filter(Boolean);if(!list.length||statesBusy)return;
  setStatesBusy(true);setCloudPending(v=>({...v,...Object.fromEntries(list.map(id=>[id,true]))}));let failed=0;
  try{
   for(let i=0;i<list.length;i+=5){
    const part=list.slice(i,i+5);
    const metrics=api('/clouds/metrics',send('POST',{id:part})).then(r=>{const rows:Row[]=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:[];
     setCloudMetrics(value=>{const next={...value};for(const m of rows){const id=Number(m.id);if(part.includes(id))next[id]={...next[id],...m};}return next;});}).catch(()=>{failed++;});
    await Promise.all([metrics,...part.map(async id=>{
     try{const current=unwrap(await api('/clouds/'+id+'/state'));
      setResult(value=>value?{...value,data:value.data.map(item=>Number(item.id)===id?{...item,...current}:item)}:value);
      setCloudMetrics(value=>({...value,[id]:{...value[id],...current}}));}
     catch{failed++;}
     finally{setCloudPending(v=>({...v,[id]:false}));}
    })]);
   }
   if(failed)notify(`有 ${failed} 个请求失败，部分实例的状态或 CPU、内存、带宽没有更新，可稍后再试`,'danger');
  }finally{setStatesBusy(false);}
 }
 async function refreshCloud(row:Row){setCloudPending(v=>({...v,[row.id]:true}));try{const [record,state,metrics]=await Promise.all([api('/resources/clouds/'+row.id),api('/clouds/'+row.id+'/state'),api('/clouds/metrics',send('POST',{id:[Number(row.id)]}))]);const fresh=unwrap(record),current=unwrap(state),rows=Array.isArray(metrics)?metrics:metrics.data;setResult(value=>value?{...value,data:value.data.map(item=>item.id===row.id?{...item,...fresh,...current}:item)}:value);setCloudMetrics(value=>({...value,[row.id]:{...value[row.id],...(Array.isArray(rows)?rows.find(item=>Number(item.id)===Number(row.id)):{}),...current}}));}catch(e){notify((e as Error).message,'danger');}finally{setCloudPending(v=>({...v,[row.id]:false}));}}
 const descriptor=catalog[kind];
 async function reorder(target:Row,position:'before'|'after',source=dragging){const id=source;setDragging(null);setDropTarget(null);if(!id||id===target.id||ordering)return;setOrdering(true);try{await api('/nodes/'+id+'/drag',send('POST',{target_id:target.id,position}));refresh();notify('节点顺序已保存');}catch(e){notify((e as Error).message,'danger');}finally{setOrdering(false);}}
 useEffect(()=>{if(search===term)return;const t=setTimeout(()=>{setTerm(search);setPage(1);},300);return()=>clearTimeout(t);},[search]); // eslint-disable-line react-hooks/exhaustive-deps
 // Page, page size, search and filters live in the URL, so a reload stays on the same view.
 useUrlState({page,per_page:perPage,search:term,status,area,node,orderby,sort:orderby?sort:''},{page:1,per_page:20,search:'',status:'',area:'',node:'',orderby:'',sort:''});
 useEffect(()=>{let active=true;setLoading(true);setError('');const serverSort=kind==='clouds'&&orderby&&orderby!=='traffic';const q=new URLSearchParams({page:String(page),per_page:String(perPage),search:term,status,area,node,user:owner,...(serverSort?{orderby,sort}:{})});api<List>(`/resources/${kind}?${q}`).then(r=>{if(active){if(page>1&&r.data.length===0)setPage(Math.max(1,r.meta.total_pages));else setResult(r);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[kind,page,perPage,term,status,area,node,owner,revision,orderby==='traffic'?'':orderby,orderby==='traffic'?'':sort]);
 useEffect(()=>{setSelected(new Set());},[kind,page,perPage,term,status,area,node,owner]);
 useEffect(()=>{if(kind!=='tasks')return;const t=setInterval(()=>setRevision(v=>v+1),10000);return()=>clearInterval(t);},[kind]);
 useEffect(()=>{if(!['nodes','clouds'].includes(kind)&&!filter)return;let active=true;Promise.allSettled([api<List>('/resources/areas?per_page=100'),api<List>('/resources/nodes?per_page=100'+(area&&kind!=='clouds'?'&area='+area:''))]).then(([a,n])=>{if(active){if(a.status==='fulfilled')setAreas(a.value.data);if(n.status==='fulfilled')setNodes(n.value.data);}});return()=>{active=false;};},[kind,filter,kind==='clouds'?'':area]);
 const refresh=()=>setRevision(v=>v+1);
 async function edit(row:Row){setEditingId(row.id);try{setForm({record:unwrap(await api(`/resources/${kind}/${row.id}`))});}catch(e){notify((e as Error).message,'danger');}finally{setEditingId(null);}}
 function success(r:Row){setOperation(null);setForm(null);refresh();const task=r.result?.taskid??r.result?.task_id;notify(task?`操作已提交，任务 #${task}，可在任务中心查看执行结果`:'平台已接受操作，列表已刷新');}
 const total=result?.meta.total??0,totalPages=Math.max(1,result?.meta.total_pages||1);
 const rawRows=result?.data||[];
 const rows=kind==='clouds'&&orderby==='traffic'?[...rawRows].sort((a,b)=>{const x=traffic(a).used,y=traffic(b).used;if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return sort==='asc'?x-y:y-x;}):rawRows;
 const pageIds=rows.map(r=>Number(r.id)),selectedRows=rows.filter(r=>selected.has(Number(r.id)));
 const allSelected=pageIds.length>0&&pageIds.every(id=>selected.has(id)),someSelected=!allSelected&&pageIds.some(id=>selected.has(id));
 const toggle=(id:number,on:boolean)=>setSelected(v=>{const next=new Set(v);if(on)next.add(id);else next.delete(id);return next;});
 const areaOf=(row:Row)=>areas.find(a=>String(a.id)===String(row.area?.id??row.area_id??row.area));
 const nodeOf=(row:Row)=>nodes.find(n=>String(n.id)===String(row.node_id??row.node));
 const statusOptions=kind==='tasks'?[['0','等待执行'],['1','执行中'],['2','成功'],['3','失败'],['4','已结束'],['5','已取消']]:kind==='clouds'?[['on','运行中'],['off','已关机'],['suspend','已暂停'],['paused','已挂起'],['init','创建中'],['rescue','救援系统'],['recycle','回收站'],['unknown','未知']]:[['1','正常'],['0','异常']];
 const filtered=Boolean(term||status||area||node||owner);
 // Empty states: a search/filter miss offers to clear it; an empty list says what goes here and offers to create one.
 const noun=descriptor?.title||'任务';
 const blank:Record<string,{kind:EmptyKind;title:string;text:string}>={clouds:{kind:'instance',title:'还没有实例',text:'创建第一台云服务器后，它的状态、配置和用量会显示在这里。'},nodes:{kind:'node',title:'还没有节点',text:'添加计算节点后，可以在这里查看监控、启用和维护状态。'},areas:{kind:'area',title:'还没有区域',text:'区域用来按地理位置组织节点，先创建一个区域。'},tasks:{kind:'task',title:'暂无任务',text:'提交实例操作后，任务的执行进度会显示在这里。'}};
 const resetFilters=()=>{setArea('');setNode('');setStatus('');setSearch('');setPage(1);if(owner)clearOwner();};
 const emptyState=filtered?{kind:'search' as EmptyKind,title:'没有找到匹配的'+noun,text:term?<>没有名称或 IP 包含 <strong>“{term}”</strong> 的{noun}{status||area||node||owner?'，且已应用其他筛选条件':''}。</>:'当前筛选条件下没有'+noun+'。',actions:<Button variant="outline" size="sm" onPress={resetFilters}><X size={15}/>清除筛选</Button>}
  :{...(blank[kind]||{kind:'box' as EmptyKind,title:'暂无'+noun,text:''}),actions:<>{descriptor&&<Button size="sm" onPress={()=>kind==='clouds'?goTo('/clouds/new'):setForm({record:null})}><Plus size={15}/>新建{noun}</Button>}<Button variant="outline" size="sm" onPress={refresh}><RefreshCw size={15}/>刷新</Button></>};
 const actions=<>{kind==='clouds'?<Button variant="outline" size="sm" isIconOnly aria-label="刷新本页实例的实时状态、CPU、内存和带宽" isDisabled={loading||statesBusy} onPress={refreshCloudStates}><RefreshCw size={15} className={statesBusy?'node-refreshing':undefined}/></Button>:<Button variant="outline" size="sm" isIconOnly aria-label="刷新" isDisabled={loading} onPress={refresh}><RefreshCw size={15}/></Button>}{descriptor&&<Button size="sm" onPress={()=>kind==='clouds'?goTo('/clouds/new'):setForm({record:null})}><Plus size={16}/>新建{descriptor.title}</Button>}</>;
 return <>
 <div className="page-heading">
  <div><h1>{descriptor?.title?descriptor.title+'管理':'任务中心'}</h1></div>
 </div>
 <section className="data-panel">
  {/* 工具栏：左侧筛选 → 搜索；右侧刷新 → 主操作 → 其他按钮（DESIGN.md「列表页」）。 */}
  <div className="filter-bar">
   <div className="filters">
    {owner&&<span className="owner-filter"><User size={14}/>用户：<strong>{ownerName}</strong><button type="button" aria-label={'取消按用户 '+ownerName+' 筛选'} onClick={clearOwner}><X size={13}/></button></span>}
    {kind==='nodes'&&<Choice aria-label="按区域筛选" value={area} onChange={e=>{setArea(e.target.value);setNode('');setPage(1);}}><option value="">全部区域</option>{areas.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Choice>}
    {kind==='clouds'&&<LocationFilter areas={areas} nodes={nodes} area={area} node={node} onChange={(a,n)=>{setArea(a);setNode(n);setPage(1);}}/>}
    <Choice aria-label="按状态筛选" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">所有状态</option>{statusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Choice>
    {kind!=='tasks'&&<InputGroup className="resource-search"><InputGroup.Prefix><Search size={17}/></InputGroup.Prefix><InputGroup.Input aria-label="搜索资源" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={kind==='clouds'?'搜索主机名 / IP 地址':'搜索名称 / IP 地址'}/></InputGroup>}
    {filtered&&<Button variant="ghost" size="sm" onPress={resetFilters}>清除筛选</Button>}
   </div>
   <div className="filter-actions">{actions}
    {kind==='clouds'&&<Button size="sm" variant="outline" onPress={()=>goTo('/recycle')}><Trash2 size={16}/>回收站</Button>}
    {kind==='clouds'&&<Tooltip delay={0}><Button size="sm" variant="outline" isIconOnly aria-label="迁移队列" onPress={()=>setQueueOpen(true)}><ArrowRightLeft size={16}/></Button><Tooltip.Content>迁移队列</Tooltip.Content></Tooltip>}
   </div>
  </div>
  {error&&['nodes','clouds'].includes(kind)&&result&&<ErrorBox message={error} retry={refresh}/>}
  {error&&!(['nodes','clouds'].includes(kind)&&result)?<ErrorBox message={error} retry={refresh}/>:loading&&!(kind==='tasks'&&result)?<TableSkeleton columns={skeletonColumns[kind]||skeletonColumns.areas} rows={rows.length||Math.min(perPage,10)} className={kind==='nodes'?'nodes-table':kind==='areas'?'areas-table':kind==='clouds'?'clouds-table':''}/>:!rows.length?<Empty {...emptyState}/>:kind==='tasks'?<TaskTable rows={rows} onSelect={setDetail}/>:
  <Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label={(descriptor?.title||'资源')+'列表'} className={kind==='nodes'?'nodes-table':kind==='areas'?'areas-table':'clouds-table'}>
   <Table.Header>
    {kind==='clouds'&&<Table.Column aria-label="选择"><Checkbox slot={null} className="table-check" aria-label="选择本页全部实例" isSelected={allSelected} isIndeterminate={someSelected} onChange={on=>setSelected(on?new Set(pageIds):new Set())}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Column>}
    {kind==='nodes'?<><Table.Column aria-label="状态及刷新"><span className="status-column-heading"><Button size="sm" variant="ghost" isIconOnly aria-label="刷新所有节点信息" isDisabled={loading||ordering} onPress={refresh}><RefreshCw size={13}/></Button></span></Table.Column><Table.Column isRowHeader className="node-auto-column">节点名称</Table.Column></>:kind==='areas'?<><Table.Column aria-label="区域状态">状态</Table.Column><Table.Column isRowHeader>区域</Table.Column></>:<><Table.Column aria-label="实例状态及刷新"><span className="status-column-heading"><Button size="sm" variant="ghost" isIconOnly aria-label="刷新本页实例的实时状态、CPU、内存和带宽" isDisabled={loading||statesBusy} onPress={refreshCloudStates}><RefreshCw size={13}/></Button></span></Table.Column><Table.Column isRowHeader>实例</Table.Column></>}
    {kind==='clouds'?<><Table.Column aria-sort={orderby==='mainip'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="mainip" title="主 IP" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column><Table.Column aria-sort={orderby==='cpu'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="cpu" title="配置" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column><Table.Column aria-sort={orderby==='os'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="os" title="镜像" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column><Table.Column aria-sort={orderby==='cpu_usage'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="cpu_usage" title="CPU" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column><Table.Column aria-sort={orderby==='memory_usage'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="memory_usage" title="内存" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column><Table.Column aria-sort={orderby==='current_out_bw'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="current_out_bw" title="实时带宽" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column><Table.Column>带宽</Table.Column><Table.Column aria-sort={orderby==='traffic'?(sort==='asc'?'ascending':'descending'):undefined}><SortHead id="traffic" title="本月流量" orderby={orderby} sort={sort} onSort={sortBy}/></Table.Column></>:kind==='nodes'?<><Table.Column className="node-auto-column">节点地址</Table.Column><Table.Column>实例</Table.Column><Table.Column>CPU</Table.Column><Table.Column>内存</Table.Column><Table.Column>磁盘</Table.Column><Table.Column>带宽</Table.Column><Table.Column>启用</Table.Column><Table.Column>维护</Table.Column></>:<><Table.Column>节点</Table.Column><Table.Column>实例</Table.Column><Table.Column>可用 IP</Table.Column><Table.Column>IP 总计</Table.Column></>}
    {kind!=='clouds'&&<Table.Column>操作</Table.Column>}
   </Table.Header>
   <Table.Body>{rows.map(record=>{const row=kind==='clouds'?{...record,...cloudMetrics[record.id]}:record;const picked=selected.has(Number(row.id));const area=areaOf(row);
    return <Table.Row key={row.id} className={kind==='nodes'?'draggable-node '+(dropTarget?.id===row.id?'drop-'+dropTarget?.position:''):kind==='clouds'&&picked?'is-picked':undefined} ref={element=>{if(!element||kind!=='nodes')return;element.draggable=!ordering;element.ondragstart=event=>{if((event.target as HTMLElement).closest('button,input,[role="switch"]')){event.preventDefault();return;}if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(row.id));}setDragging(row.id);};element.ondragover=event=>{if(!dragging||ordering)return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';const rect=element.getBoundingClientRect();setDropTarget({id:row.id,position:event.clientY<rect.top+rect.height/2?'before':'after'});};element.ondrop=event=>{event.preventDefault();if(dropTarget?.id===row.id)void reorder(row,dropTarget!.position);};element.ondragend=()=>{setDragging(null);setDropTarget(null);};element.onkeydown=event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||ordering)return;const list=result?.data||[],index=list.findIndex(r=>r.id===row.id),target=list[index+(event.key==='ArrowUp'?-1:1)];if(target){event.preventDefault();void reorder(target,event.key==='ArrowUp'?'before':'after',row.id);}};}}>
     {kind==='clouds'&&<Table.Cell><Checkbox slot={null} className="table-check" aria-label={'选择实例 '+(row.hostname||row.id)} isSelected={picked} onChange={on=>toggle(Number(row.id),on)}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Cell>}
     {kind==='clouds'&&<Table.Cell><CloudState row={row} pending={Boolean(cloudPending[row.id])} onRefresh={()=>refreshCloud(row)}/></Table.Cell>}
     {kind==='areas'&&<Table.Cell><Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={Number(row.status)===1?'区域正常':'区域异常'}><span className="node-status-icon"><StatusIcon spec={healthStatus(row.status)}/></span></Tooltip.Trigger><Tooltip.Content>{Number(row.status)===1?'区域正常':'区域异常'}</Tooltip.Content></Tooltip></Table.Cell>}
     {kind==='nodes'&&<Table.Cell><Tooltip delay={0}><Button variant="ghost" size="sm" isIconOnly aria-label={'刷新节点 '+row.name+'，当前'+(Number(nodeStatuses[row.id]??row.status)===1?'正常':'异常')} isDisabled={Boolean(nodePending[row.id])} onPress={()=>{setNodePending(v=>({...v,[row.id]:true}));setNodeRefresh(v=>({...v,[row.id]:(v[row.id]||0)+1}));}}><span className="node-status-icon">{nodePending[row.id]?<RefreshCw size={17} className="node-refreshing"/>:<StatusIcon spec={healthStatus(nodeStatuses[row.id]??row.status)}/>}</span></Button><Tooltip.Content>{Number(nodeStatuses[row.id]??row.status)===1?'节点正常':'节点异常'} · 点击刷新此节点</Tooltip.Content></Tooltip></Table.Cell>}
     <Table.Cell>{kind==='nodes'?<div className="name-cell"><Tooltip delay={0}><Button variant="ghost" className="resource-name node-name-link" onPress={()=>goTo('/nodes/'+row.id)}><CountryFlag code={row.country_code||area?.country_code} name={row.country_name||area?.country_name}/><span>{row.name||'#'+row.id}</span></Button><Tooltip.Content><div className="node-metric-tooltip"><span>节点 ID：{row.id}</span><span>区域：{label(row.area_name||area?.name||row.area_id)}</span><span>分组：{label(row.group_name)}</span></div></Tooltip.Content></Tooltip>{row.group_name&&<span className="group-tag">{row.group_name}</span>}</div>
      :kind==='areas'?<Tooltip delay={0}><Button variant="ghost" className="resource-name region-name-link" onPress={()=>setDetail(row)}><CountryFlag code={row.country_code} name={row.country_name}/><span>{row.name||'#'+row.id}</span></Button><Tooltip.Content><div className="node-metric-tooltip"><span>区域 ID：{row.id}</span><span>{row.country_name||'国家或地区未知'}</span></div></Tooltip.Content></Tooltip>
      :<div className="instance-cell"><Link className="instance-link" to={'/clouds/'+row.id}>{row.hostname||'#'+row.id}</Link><div className="instance-sub"><span className="num">#{row.id}</span>{(()=>{const u=ownerOf(row);return u.name?<><span aria-hidden="true">·</span>{u.id?<Link className="instance-owner" to={`/clouds?user=${u.id}&username=${encodeURIComponent(u.name)}`} title={'只看 '+u.name+' 的实例'}>{u.name}</Link>:<span className="instance-owner">{u.name}</span>}</>:null;})()}</div></div>}
      {row.remark&&<small className="row-remark">{row.remark}</small>}</Table.Cell>
     {kind==='clouds'?<CloudCells row={row} place={<span className="spec-place"><CountryFlag code={row.country_code||area?.country_code} name={row.country_name||area?.country_name||row.area_name}/><span>{label(row.node_name||nodeOf(row)?.name)}</span>{nodeOf(row)?.group_name&&<span className="group-tag is-sm">{nodeOf(row)!.group_name}</span>}</span>}/>:kind==='nodes'?<><Table.Cell className="node-auto-column"><span className="cloud-ip-cell"><span className="mono">{label(row.ip)}</span>{row.ip&&<CopyIp ip={String(row.ip)}/>}</span></Table.Cell><Table.Cell>{label(row.cloud_num)}</Table.Cell><NodeTelemetry key={row.id} id={row.id} refreshKey={revision+'-'+(nodeRefresh[row.id]||0)} onStatus={(id,value)=>{if(value!=null)setNodeStatuses(v=>v[id]===value?v:{...v,[id]:value});}} onSettled={id=>setNodePending(v=>v[id]?{...v,[id]:false}:v)}/>{[['enable','启用'],['maintenance_mode','维护']].map(([field,title])=><Table.Cell key={field}><Switch size="sm" aria-label={title+'节点 '+row.name} isSelected={Number(row[field])===1} isDisabled={row[field]==null} onChange={value=>setOperation({kind,row,action:field,title:(value?'开启':'关闭')+title,value:value?1:0})}><Switch.Content aria-label={title+'节点 '+row.name}><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch></Table.Cell>)}</>:<><Table.Cell>{label(row.node_num)}</Table.Cell><Table.Cell>{label(row.cloud_num)}</Table.Cell><Table.Cell>{label(row.ip_free_num)}</Table.Cell><Table.Cell>{label(row.ip_num)}</Table.Cell></>}
     {kind!=='clouds'&&<Table.Cell className={kind==='nodes'?'node-auto-column':undefined}><div className="row-actions"><Button variant="ghost" size="sm" isIconOnly aria-label={'编辑 #'+row.id} isDisabled={editingId===row.id} onPress={()=>edit(row)}><Pencil size={15}/></Button>{kind==='areas'&&<Button variant="ghost" size="sm" isIconOnly aria-label={'删除区域 '+row.name} onPress={()=>setOperation({kind,row,action:'delete',title:'删除区域'})}><Trash2 size={15}/></Button>}</div></Table.Cell>}
    </Table.Row>;})}</Table.Body>
  </Table.Content></Table.ScrollContainer></Table>}
  <div className="list-footer">
   <div className="list-footer-start">{kind==='clouds'&&<><BatchMenu rows={selectedRows} onPick={id=>{if(id!=='export'){setBatch(id);return;}const n=selectedRows.length;exportInstances(selectedRows).then(()=>notify(`已导出 ${n} 个实例`)).catch(e=>notify((e as Error).message,'danger'));}}/>{selectedRows.length>0&&<Button variant="ghost" size="sm" onPress={()=>setSelected(new Set())}>取消选择</Button>}</>}</div>
   <Pager total={result?total:null} page={page} totalPages={totalPages} perPage={perPage} loading={loading} onPage={setPage} onPerPage={n=>{setPerPage(n);setPage(1);}}/>
  </div>
 </section>
 {form&&(kind==='areas'||kind==='nodes')&&<ResourceDialog kind={kind} record={form.record} onClose={()=>setForm(null)} onSaved={success}/>}{form&&kind!=='areas'&&kind!=='nodes'&&<ResourceForm kind={kind} descriptor={descriptor} record={form.record} onClose={()=>setForm(null)} onSaved={success}/>}
 {detail&&<Detail kind={kind} row={detail} onClose={()=>setDetail(null)}/>}
 {operation&&<Operation spec={operation} onClose={()=>setOperation(null)} onDone={success}/>}
 {queueOpen&&<MigrationQueue onClose={()=>setQueueOpen(false)} onChanged={refresh} notify={notify}/>}
 {batch&&<BatchOperation actionId={batch} rows={selectedRows} onClose={()=>setBatch(null)} onDone={message=>{setBatch(null);setSelected(new Set());refresh();notify(message);}}/>}
 </>;
}

