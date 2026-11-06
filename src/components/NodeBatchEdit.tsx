import {useRef,useState} from 'react';
import {Button,Input,InputGroup,TextField} from '@heroui/react';
import {CircleAlert,Eye,EyeOff} from 'lucide-react';
import {api,send,type Row} from '../lib/api';
import {Dialog,ErrorBox} from './Shared';
import {Field,Flag,Select,useOptions} from './BatchOperation';
import {BatchProgress} from './BatchProgress';
import {submitInChunks,type Progress} from '../lib/chunks';

/**
 * 节点批量修改：SSH 密码、SSH 端口、SSH 密钥（替换或删除）、DNS、节点分组。留空的项不修改。
 * 每 10 台提交一次（POST /api/nodes/batch_update，服务端逐台调用修改节点），显示每台的进度，可以中途停止。
 */
type Result={total:number;success:number;failed:number;skipped?:number;results:{id:number;ok:boolean;error?:string;skipped?:string}[]};
const KEEP='';

export function NodeBatchEdit({rows,onClose,onDone}:{rows:Row[];onClose:()=>void;onDone:(message:string)=>void}){
 const [v,setV]=useState<Record<string,string>>({ssh_pass:'',port:'',ssh_key:'',dns1:'',dns2:'',group_id:KEEP});
 const [clearKey,setClearKey]=useState(false),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<Progress|null>(null),[result,setResult]=useState<Result|null>(null);
 const stopRef=useRef(false);
 const groups=useOptions('node_groups');
 const set=(k:string)=>(x:string)=>setV(o=>({...o,[k]:x}));
 const changed=[...Object.entries(v).filter(([k,x])=>k==='group_id'?x!==KEEP:k==='ssh_key'&&clearKey?false:x.trim()!=='').map(([k])=>k),...(clearKey?['clear_ssh_key']:[])];
 const names:Record<string,string>={ssh_pass:'SSH 密码',port:'SSH 端口',ssh_key:'SSH 密钥',dns1:'首选 DNS',dns2:'备用 DNS',group_id:'节点分组',clear_ssh_key:'删除 SSH 密钥'};

 async function run(){
  setBusy(true);setError('');stopRef.current=false;
  const fields:Record<string,string|boolean>=Object.fromEntries(changed.map(k=>[k,k==='clear_ssh_key'?true:v[k]]));
  try{
   const r=await submitInChunks(rows.map(r=>Number(r.id)),part=>api<Result>('/nodes/batch_update',send('POST',{ids:part,fields})),{onProgress:setProgress,stopped:()=>stopRef.current});
   setResult({total:r.total,success:r.success,failed:r.failed,skipped:r.results.filter(x=>x.skipped).length,results:r.results});
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const finish=()=>onDone(result&&result.failed?`已修改 ${result.success} 个节点，${result.failed} 个失败`:`已修改 ${result?.success??0} 个节点`);
 const byId=new Map(rows.map(r=>[Number(r.id),r]));

 return <Dialog wide title="批量修改节点" onClose={()=>{if(busy)return;result?finish():onClose();}} footer={result
  ?<Button onPress={finish}>完成</Button>
  :progress&&busy?<Button variant="outline" isDisabled={stopRef.current} onPress={()=>{stopRef.current=true;setProgress(p=>p&&{...p});}}>{stopRef.current?'将在当前这批后停止…':'停止提交'}</Button>
  :<><Button variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button isPending={busy} isDisabled={busy||!changed.length} onPress={run}>{busy?'正在提交…':`修改 ${rows.length} 个节点`}</Button></>}>
  <div className="batch-dialog">
   {result?<div className="node-batch-result">
     <p><strong>成功 {result.success} 个</strong>{result.failed?<>，<span className="node-batch-failed">失败 {result.failed} 个</span></>:null}{result.skipped?<>（其中 {result.skipped} 个节点没有设置 SSH 密钥，已跳过删除）</>:null}。修改了：{changed.map(k=>names[k]).join('、')}。</p>
     {result.failed>0&&<ul className="node-batch-errors">{result.results.filter(r=>!r.ok).map(r=><li key={r.id}><span>{byId.get(r.id)?.name||'#'+r.id}</span><small>{r.error}</small></li>)}</ul>}
    </div>
   :progress&&busy?<BatchProgress title="正在修改节点" rows={rows.map(r=>({...r,hostname:r.name}))} progress={progress} okText="已修改"/>
   :<>
    <div className="batch-targets"><span className="batch-targets-label">已选择 {rows.length} 个节点</span><div className="batch-chips">{rows.slice(0,12).map(r=><span key={r.id} className="batch-chip" title={'#'+r.id}>{r.name||'#'+r.id}</span>)}{rows.length>12&&<span className="batch-chip more">等 {rows.length} 个</span>}</div></div>
    <div className="batch-note tone-info"><CircleAlert size={16}/><span>只修改填写了的项，留空的保持不变。新的 SSH 信息需要和节点服务器上实际的一致，否则平台会连不上节点。</span></div>
    <div className="batch-form node-batch-form">
     <Field label="SSH 密码"><TextField aria-label="SSH 密码" value={v.ssh_pass} onChange={set('ssh_pass')}><InputGroup><InputGroup.Input type={show?'text':'password'} autoComplete="new-password" placeholder="不修改"/><InputGroup.Suffix><Button variant="ghost" size="sm" isIconOnly type="button" aria-label={show?'隐藏密码':'显示密码'} aria-pressed={show} onPress={()=>setShow(x=>!x)}>{show?<EyeOff size={15}/>:<Eye size={15}/>}</Button></InputGroup.Suffix></InputGroup></TextField></Field>
     <Field label="SSH 端口"><TextField aria-label="SSH 端口" value={v.port} onChange={set('port')}><Input inputMode="numeric" placeholder="不修改"/></TextField></Field>
     <Field label="首选 DNS"><TextField aria-label="首选 DNS" value={v.dns1} onChange={set('dns1')}><Input className="mono" placeholder="不修改，如 8.8.8.8"/></TextField></Field>
     <Field label="备用 DNS"><TextField aria-label="备用 DNS" value={v.dns2} onChange={set('dns2')}><Input className="mono" placeholder="不修改，如 1.1.1.1"/></TextField></Field>
     <Select label="节点分组" value={v.group_id} onChange={set('group_id')} empty="不修改" lookup={{options:groups.options&&[{id:'0',name:'无分组'},...groups.options],error:groups.error}}/>
     <span/>
     <div className="node-batch-wide"><Field label="SSH 密钥" hint={clearKey?'将清空所选节点上保存的 SSH 密钥；节点连接方式为密钥时，请先改为密码连接并填写正确的 SSH 密码，否则平台会连不上节点。':'粘贴完整的私钥内容；平台用它连接节点（连接方式为密钥时生效）。'}><textarea className="node-batch-key mono" aria-label="SSH 密钥" value={clearKey?'':v.ssh_key} onChange={e=>set('ssh_key')(e.target.value)} placeholder={clearKey?'将删除 SSH 密钥':'不修改'} rows={4} spellCheck={false} autoComplete="off" disabled={clearKey}/></Field><div className="node-batch-clear"><Flag checked={clearKey} onChange={setClearKey}>删除 SSH 密钥</Flag></div></div>
    </div>
    {error&&<ErrorBox message={error}/>}
    {!changed.length&&<p className="batch-hint">填写至少一项要修改的内容。</p>}
   </>}
  </div>
 </Dialog>;
}
