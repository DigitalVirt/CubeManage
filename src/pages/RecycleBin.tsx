import {useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {Button,Checkbox,InputGroup,Table} from '@heroui/react';
import {ArrowLeft,RefreshCw,RotateCcw,Search,Trash2,TriangleAlert,X} from 'lucide-react';
import {api,send,type List,type Row} from '../lib/api';
import {Dialog,Empty,ErrorBox,type Notify} from '../components/Shared';
import {Pager} from '../components/Pager';
import {TableSkeleton} from '../components/TableSkeleton';
import {useIsMobile,MobileCard,MobileSelectBar,MobileSkeleton} from '../components/MobileCards';
import {useUrlState,pageFrom,perPageFrom} from '../lib/urlState';

/**
 * 实例回收站: instances in status "recycle" (v1/clouds?status[]=recycle), restored with 从回收站恢复实例
 * (DELETE v1/recycle_bin) or removed for good with 回收站彻底删除实例 (DELETE v1/clouds/recycle_bin),
 * both through POST /api/clouds/batch/{restore,purge}.
 */
type Action={op:'restore'|'purge';rows:Row[]};
type Result={total:number;success:number;failed:number;results:{id:number;ok:boolean;error?:string}[]};

const when=(v:unknown)=>{if(!v)return '—';const s=String(v);return /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(s)?s.replace('T',' ').slice(0,16):s;};
/** Time left until the platform deletes it: "6 天后", "5 小时后", "即将删除". */
function remaining(v:unknown){
 if(!v)return '';const t=new Date(String(v).replace(' ','T')).getTime();if(!Number.isFinite(t))return '';
 const h=(t-Date.now())/3600000;if(h<=1)return '即将删除';if(h<48)return Math.floor(h)+' 小时后';return Math.floor(h/24)+' 天后';
}

export function RecycleBin({notify}:{notify:Notify}){
 const go=useNavigate();
 const [params]=useSearchParams();
 const [page,setPage]=useState(()=>pageFrom(params)),[perPage,setPerPage]=useState(()=>perPageFrom(params)),[search,setSearch]=useState(()=>params.get('search')||''),[term,setTerm]=useState(()=>params.get('search')||''),[revision,setRevision]=useState(0);
 const [result,setResult]=useState<List|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<Set<number>>(new Set());
 const mobile=useIsMobile();
 const [action,setAction]=useState<Action|null>(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[done,setDone]=useState<Result|null>(null);
 useEffect(()=>{if(search===term)return;const t=setTimeout(()=>{setTerm(search);setPage(1);},300);return()=>clearTimeout(t);},[search]); // eslint-disable-line react-hooks/exhaustive-deps
 useUrlState({page,per_page:perPage,search:term},{page:1,per_page:20,search:''});
 useEffect(()=>{let live=true;setLoading(true);setError('');const q=new URLSearchParams({page:String(page),per_page:String(perPage),search:term,status:'recycle'});api<List>('/resources/clouds?'+q).then(r=>{if(live){if(page>1&&!r.data.length)setPage(Math.max(1,r.meta.total_pages));else setResult(r);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[page,perPage,term,revision]);
 useEffect(()=>{setSelected(new Set());},[page,perPage,term,revision]);
 // The list endpoint filters by status, but only rows that really are in the recycle bin are actionable here.
 const rows=(result?.data||[]).filter(r=>String(r.status)==='recycle'||r.recycle_time);
 const ids=rows.map(r=>Number(r.id)),chosen=rows.filter(r=>selected.has(Number(r.id)));
 const all=ids.length>0&&ids.every(id=>selected.has(id)),some=!all&&ids.some(id=>selected.has(id));
 const toggle=(id:number,on:boolean)=>setSelected(v=>{const n=new Set(v);if(on)n.add(id);else n.delete(id);return n;});
 const open=(op:Action['op'],list:Row[])=>{setActionError('');setDone(null);setAction({op,rows:list});};
 async function run(){
  if(!action)return;setBusy(true);setActionError('');
  try{const list=action.rows.map(r=>Number(r.id));const r=await api<Result>('/clouds/batch/'+action.op,send('POST',{ids:list,count:list.length}));
   setRevision(v=>v+1);
   if(r.failed){setDone(r);}else{setAction(null);notify(action.op==='restore'?`已恢复 ${r.success} 个实例`:`已彻底删除 ${r.success} 个实例`);}
  }catch(e){setActionError((e as Error).message);}finally{setBusy(false);}
 }
 const title=(op:Action['op'])=>op==='restore'?'恢复':'彻底删除';
 const host=(id:number)=>action?.rows.find(r=>Number(r.id)===id)?.hostname||'#'+id;
 return <>
  <div className="page-heading"><div><h1>回收站</h1></div></div>
  <section className="data-panel">
   {/* 工具栏：左侧搜索；右侧刷新 → 返回（DESIGN.md「列表页」）。 */}
   <div className="filter-bar"><div className="filters">
    <InputGroup className="resource-search"><InputGroup.Prefix><Search size={17}/></InputGroup.Prefix><InputGroup.Input aria-label="搜索回收站" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索主机名 / IP 地址"/></InputGroup>
   </div><div className="filter-actions">
    <Button variant="outline" size="sm" isIconOnly aria-label="刷新" isDisabled={loading} onPress={()=>setRevision(v=>v+1)}><RefreshCw size={15}/></Button>
    <Button variant="outline" size="sm" onPress={()=>go('/clouds')}><ArrowLeft size={16}/>返回实例管理</Button>
   </div></div>
   {error&&<ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>}
   {loading&&!result?mobile?<MobileSkeleton rows={5}/>:<TableSkeleton columns={[{title:'',width:0},{title:'实例',width:10},{title:'主 IP',width:7},{title:'配置',width:6},{title:'放入回收站',width:8},{title:'到期删除',width:8},{title:'操作',width:0}]} rows={5} className="recycle-table"/>
    :!rows.length?<Empty kind={term?'search':'recycle'} title={term?'没有找到匹配的实例':'回收站是空的'} text={term?<>回收站中没有主机名或 IP 包含 <strong>“{term}”</strong> 的实例。</>:'删除的实例会先进入这里，到期后由平台自动彻底删除。'} actions={term?<Button variant="outline" size="sm" onPress={()=>setSearch('')}><X size={15}/>清除搜索</Button>:<Button variant="outline" size="sm" onPress={()=>go('/clouds')}><ArrowLeft size={15}/>返回实例管理</Button>}/>
    :mobile?<div className="m-list">{rows.map(r=>{const id=Number(r.id),left=remaining(r.delete_time);return <MobileCard key={id}
      title={r.hostname||'实例 #'+id} sub={<><span className="num">#{id}</span>{r.node_name?' · '+r.node_name:''}{r.user?.username?' · '+r.user.username:''}</>}
      state={left?<span className={'m-pill'+(left==='即将删除'||left.endsWith('小时后')?' is-danger':' is-muted')}><i/>{left}</span>:undefined}
      picked={selected.has(id)} onPick={on=>toggle(id,on)} pickLabel={'选择 '+(r.hostname||id)}
      actions={[{id:'restore',title:'恢复',run:()=>open('restore',[r])},{id:'purge',title:'彻底删除',danger:true,run:()=>open('purge',[r])}]}
      lines={[[<span className="mono">{r.mainip||'—'}</span>,r.cpu!=null?`${r.cpu} 核 · ${r.memory} GB`:'—']]}
      metrics={[{label:'放入回收站',value:when(r.recycle_time)},{label:'到期删除',value:when(r.delete_time)}]}/>;})}</div>
    :<Table><Table.ScrollContainer><Table.Content aria-label="回收站实例" className="recycle-table"><Table.Header>
     <Table.Column><Checkbox slot={null} className="table-check" aria-label="全选本页" isSelected={all} isIndeterminate={some} onChange={on=>setSelected(on?new Set(ids):new Set())}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Column>
     <Table.Column isRowHeader>实例</Table.Column><Table.Column>主 IP</Table.Column><Table.Column>配置</Table.Column><Table.Column>放入回收站</Table.Column><Table.Column>到期删除</Table.Column><Table.Column>操作</Table.Column>
    </Table.Header><Table.Body>{rows.map(r=>{const id=Number(r.id),left=remaining(r.delete_time);return <Table.Row key={id}>
     <Table.Cell><Checkbox slot={null} className="table-check" aria-label={'选择 '+(r.hostname||id)} isSelected={selected.has(id)} onChange={on=>toggle(id,on)}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Cell>
     <Table.Cell><div className="recycle-name"><strong>{r.hostname||'实例 #'+id}</strong><small><span className="num">#{id}</span>{r.node_name?' · '+r.node_name:''}{r.user?.username?' · '+r.user.username:''}</small></div></Table.Cell>
     <Table.Cell><span className="mono">{r.mainip||'—'}</span></Table.Cell>
     <Table.Cell className="nowrap">{r.cpu!=null?`${r.cpu} vCPU · ${r.memory} GB`:'—'}</Table.Cell>
     <Table.Cell className="nowrap num">{when(r.recycle_time)}</Table.Cell>
     <Table.Cell><div className="recycle-expire"><span className="num">{when(r.delete_time)}</span>{left&&<small className={left==='即将删除'||left.endsWith('小时后')?'is-soon':''}>{left}</small>}</div></Table.Cell>
     <Table.Cell><div className="row-actions"><Button variant="ghost" size="sm" onPress={()=>open('restore',[r])}><RotateCcw size={15}/>恢复</Button><Button variant="ghost" size="sm" isIconOnly className="is-danger" aria-label={'彻底删除 '+(r.hostname||id)} onPress={()=>open('purge',[r])}><Trash2 size={15}/></Button></div></Table.Cell>
    </Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
   {mobile&&<MobileSelectBar count={chosen.length} unit="个" onClear={()=>setSelected(new Set())}><Button size="sm" variant="outline" className="m-selbar-light" onPress={()=>open('restore',chosen)}><RotateCcw size={14}/>恢复</Button><Button size="sm" variant="danger" onPress={()=>open('purge',chosen)}><Trash2 size={14}/>彻底删除</Button></MobileSelectBar>}
   <div className="list-footer">
    <div className="list-footer-start">
     <Button variant="outline" size="sm" isDisabled={!chosen.length} onPress={()=>open('restore',chosen)}><RotateCcw size={15}/>恢复{chosen.length>0&&<span className="batch-count">{chosen.length}</span>}</Button>
     <Button variant="outline" size="sm" className="recycle-purge" isDisabled={!chosen.length} onPress={()=>open('purge',chosen)}><Trash2 size={15}/>彻底删除{chosen.length>0&&<span className="batch-count">{chosen.length}</span>}</Button>
    </div>
    <Pager total={result?result.meta.total:null} page={page} totalPages={Math.max(1,result?.meta.total_pages||1)} perPage={perPage} loading={loading} onPage={setPage} onPerPage={n=>{setPerPage(n);setPage(1);}}/>
   </div>
  </section>
  {action&&<Dialog title={(done?title(action.op)+'结果':title(action.op)+' '+action.rows.length+' 个实例')} onClose={()=>{if(!busy){setAction(null);setDone(null);}}} footer={done?<Button onPress={()=>{setAction(null);setDone(null);}}>完成</Button>:<><Button variant="outline" isDisabled={busy} onPress={()=>setAction(null)}>取消</Button><Button variant={action.op==='purge'?'danger':'primary'} isPending={busy} onPress={run}>{action.op==='purge'?'彻底删除':'恢复'}</Button></>}>
   {done?<><p>成功 {done.success} 个，失败 {done.failed} 个。</p><ul className="recycle-list">{done.results.filter(r=>!r.ok).map(r=><li key={r.id}><strong>{host(r.id)}</strong><span className="recycle-error">{r.error||'平台返回失败'}</span></li>)}</ul></>
   :<>{action.op==='purge'?<div className="cfg-note is-danger"><TriangleAlert size={16}/>彻底删除后实例和磁盘数据无法恢复。</div>:<p>实例将从回收站恢复到实例列表。</p>}
    <ul className="recycle-list">{action.rows.map(r=><li key={r.id}><strong>{r.hostname||'实例 #'+r.id}</strong><span className="num">#{r.id}{r.mainip?' · '+r.mainip:''}</span></li>)}</ul>
    {actionError&&<ErrorBox message={actionError}/>}</>}
  </Dialog>}
 </>;
}
