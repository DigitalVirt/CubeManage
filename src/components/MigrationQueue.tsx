import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Button,Checkbox,Chip,Spinner,Table} from '@heroui/react';
import {ArrowLeft,Ban,RefreshCw} from 'lucide-react';
import {api,send,type Row} from '../lib/api';
import {Dialog,Empty,ErrorBox,type Notify} from './Shared';
import {TableSkeleton} from './TableSkeleton';

/**
 * 迁移队列 (a Modal opened from the instance list): instances waiting for or in migration (获取迁移实例列表
 * v1/clouds/migrate), with progress for the one migrating (获取实例冷迁移进度). Cancelling uses 批量取消迁移 through
 * POST /api/clouds/batch/cancel_migrate and is confirmed inside the same dialog. Refreshes every 5 s while
 * something is migrating, every 20 s otherwise. Every row is selected when the dialog opens (and after a cancel), so
 * “取消迁移” cancels the whole queue unless the user unticks some.
 */
type Result={total:number;success:number;failed:number;results:{id:number;ok:boolean;error?:string}[]};

export function MigrationQueue({onClose,onChanged,notify}:{onClose:()=>void;onChanged?:()=>void;notify:Notify}){
 const go=useNavigate();
 const [rows,setRows]=useState<Row[]|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const [selected,setSelected]=useState<Set<number>>(new Set()),[cancel,setCancel]=useState<Row[]|null>(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[done,setDone]=useState<Result|null>(null);
 useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>|undefined,first=true; // the first load selects every instance
  const load=async()=>{setLoading(true);
   try{const r=await api<{data:Row[];running:number}>('/clouds/migrate_queue');if(!live)return;setRows(r.data);setError('');const ids=new Set(r.data.map(x=>Number(x.id)));const all=first;first=false;setSelected(v=>all?ids:new Set([...v].filter(id=>ids.has(id))));timer=setTimeout(load,r.running?5000:20000);}
   catch(e){if(live){setError((e as Error).message);timer=setTimeout(load,20000);}}
   finally{if(live)setLoading(false);}};
  load();return()=>{live=false;clearTimeout(timer);};},[revision]);
 const list=rows||[],ids=list.map(r=>Number(r.id)),chosen=list.filter(r=>selected.has(Number(r.id)));
 const all=ids.length>0&&ids.every(id=>selected.has(id)),some=!all&&ids.some(id=>selected.has(id));
 const toggle=(id:number,on:boolean)=>setSelected(v=>{const n=new Set(v);if(on)n.add(id);else n.delete(id);return n;});
 const ask=(r:Row[])=>{setActionError('');setDone(null);setCancel(r);};
 const back=()=>{setCancel(null);setDone(null);setActionError('');};
 async function run(){
  if(!cancel)return;setBusy(true);setActionError('');
  try{const list=cancel.map(r=>Number(r.id));const r=await api<Result>('/clouds/batch/cancel_migrate',send('POST',{ids:list,count:list.length}));
   setRevision(v=>v+1);setSelected(new Set());onChanged?.();
   if(r.failed)setDone(r);else{back();notify(`已取消 ${r.success} 个实例的迁移`);}
  }catch(e){setActionError((e as Error).message);}finally{setBusy(false);}
 }
 const host=(id:number)=>cancel?.find(r=>Number(r.id)===id)?.hostname||'#'+id;
 const running=list.filter(r=>Number(r.status)===1).length;

 if(cancel)return <Dialog title={done?'取消迁移结果':'取消 '+cancel.length+' 个实例的迁移'} onClose={()=>{if(!busy)onClose();}} footer={done?<Button onPress={back}>完成</Button>:<><Button variant="outline" isDisabled={busy} onPress={back}><ArrowLeft size={15}/>返回队列</Button><Button variant="danger" isPending={busy} onPress={run}>取消迁移</Button></>}>
  {done?<><p>成功 {done.success} 个，失败 {done.failed} 个。</p><ul className="recycle-list">{done.results.filter(r=>!r.ok).map(r=><li key={r.id}><strong>{host(r.id)}</strong><span className="recycle-error">{r.error||'平台返回失败'}</span></li>)}</ul></>
  :<><p>{cancel.some(r=>Number(r.status)===1)?'正在迁移的实例取消可能需要一些时间，实例会留在原节点。':'实例会移出迁移队列，留在原节点。'}</p>
   <ul className="recycle-list">{cancel.map(r=><li key={r.id}><strong>{r.hostname||'实例 #'+r.id}</strong><span className="num">#{r.id}{r.mainip?' · '+r.mainip:''}{Number(r.status)===1?' · 正在迁移':''}</span></li>)}</ul>
   {actionError&&<ErrorBox message={actionError}/>}</>}
 </Dialog>;

 return <Dialog wide title="迁移队列" onClose={onClose} footer={<>
   <span className="migrate-summary">{rows?`正在迁移 ${running} · 等待 ${list.length-running}`:''}</span>
   <Button variant="outline" isIconOnly aria-label="刷新" isDisabled={loading} onPress={()=>setRevision(v=>v+1)}><RefreshCw size={15}/></Button>
   <Button variant="outline" className="recycle-purge" isDisabled={!chosen.length} onPress={()=>ask(chosen)}><Ban size={15}/>取消迁移{chosen.length>0&&<span className="batch-count">{chosen.length}</span>}</Button>
   <Button onPress={onClose}>关闭</Button>
  </>}>
  {error&&<ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>}
  {!rows&&!error?<TableSkeleton columns={[{title:'',width:0},{title:'实例',width:9},{title:'状态',width:5},{title:'进度',width:12},{title:'',width:0}]} rows={3} className="migrate-table"/>
   :rows&&!list.length?<Empty kind="task" size="sm" title="迁移队列是空的" text="在实例列表中批量选择“迁移”后，实例会出现在这里。"/>
   :rows&&<Table><Table.ScrollContainer><Table.Content aria-label="迁移队列" className="migrate-table"><Table.Header>
    <Table.Column><Checkbox slot={null} className="table-check" aria-label="全选" isSelected={all} isIndeterminate={some} onChange={on=>setSelected(on?new Set(ids):new Set())}><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox></Table.Column>
    <Table.Column isRowHeader>实例</Table.Column><Table.Column>状态</Table.Column><Table.Column>进度</Table.Column><Table.Column><span className="sr-only">操作</span></Table.Column>
   </Table.Header><Table.Body>{list.map(r=>{const id=Number(r.id),on=Number(r.status)===1;return <Table.Row key={id}>
    <Table.Cell><Checkbox slot={null} className="table-check" aria-label={'选择 '+(r.hostname||id)} isSelected={selected.has(id)} onChange={v=>toggle(id,v)}><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox></Table.Cell>
    <Table.Cell><div className="recycle-name"><button type="button" className="link-button" onClick={()=>{onClose();go('/clouds/'+id);}}><strong>{r.hostname||'实例 #'+id}</strong></button><small><span className="num">#{id}</span>{r.mainip?<> · <span className="mono">{r.mainip}</span></>:''}</small></div></Table.Cell>
    <Table.Cell>{on?<Chip size="sm" variant="soft" color="accent"><Spinner size="sm" color="current"/>正在迁移</Chip>:<Chip size="sm" variant="soft">等待迁移</Chip>}</Table.Cell>
    <Table.Cell>{on&&r.progress!=null?<div className="migrate-progress"><div className="migrate-line"><span className="migrate-bar" aria-hidden="true"><i style={{width:Math.max(3,Number(r.progress))+'%'}}/></span><span className="num">{r.progress}%</span></div><small>{[r.target&&'→ '+r.target,r.migrated&&r.total&&r.migrated+' / '+r.total,r.speed,r.eta&&'剩余 '+r.eta].filter(Boolean).join(' · ')||r.msg||''}</small></div>:<span className="inst-muted">{on?'正在读取进度…':'排队中'}</span>}</Table.Cell>
    <Table.Cell><Button variant="ghost" size="sm" isIconOnly className="is-danger" aria-label={'取消 '+(r.hostname||id)+' 的迁移'} onPress={()=>ask([r])}><Ban size={15}/></Button></Table.Cell>
   </Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
 </Dialog>;
}
