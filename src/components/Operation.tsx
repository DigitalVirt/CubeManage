import {useState} from 'react';
import {Button,TextField,Label,Input,TextArea} from '@heroui/react';
import {Info,TriangleAlert} from 'lucide-react';
import {api,send,type Row} from '../lib/api';
import {Dialog,ErrorBox} from './Shared';
import {Relation} from './ResourceForm';
export type OperationSpec={kind:string;row:Row;action:string;title:string;value?:number};
/** 节点列表的“启用”“维护”开关：只确认，不需要输入。提交 PUT /api/resources/nodes/:id，只带这一个字段。 */
function NodeSwitch({spec,onClose,onDone}:{spec:OperationSpec;onClose:()=>void;onDone:(r:Row)=>void}){
 const {row,action,value}=spec;const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const on=Boolean(value),maintenance=action==='maintenance_mode';
 const title=maintenance?(on?'开启维护模式':'关闭维护模式'):(on?'启用节点':'禁用节点');
 const caution=maintenance?on:!on;
 const note=maintenance?(on?'开启后节点进入维护状态，平台的调度和运维行为可能随之变化。':'关闭后节点退出维护状态，恢复正常调度。'):(on?'启用后节点重新参与平台的资源分配。':'禁用后节点停止参与平台的资源分配，请先确认当前业务安排。');
 async function run(){setBusy(true);setError('');try{onDone(await api(`/resources/nodes/${row.id}`,send('PUT',{[action]:value})));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog title={title} onClose={()=>{if(!busy)onClose();}} footer={<><Button className="node-switch-btn" variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button className="node-switch-btn" variant={caution?'danger':'primary'} isPending={busy} onPress={run}>确认</Button></>}>
  <div className="node-switch">
   <div className={caution?'cfg-note':'node-switch-note'}>{caution?<TriangleAlert size={16}/>:<Info size={16}/>}<span>{note}</span></div>
   {error&&<ErrorBox message={error}/>}
  </div>
 </Dialog>;
}
export function Operation({spec,onClose,onDone}:{spec:OperationSpec;onClose:()=>void;onDone:(r:Row)=>void}){
 const {kind,row,action,title}=spec;const [confirm,setConfirm]=useState(''),[values,setValues]=useState<Row>({in_bw:row.in_bw??0,out_bw:row.out_bw??0,remark:row.remark||''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(spec.kind==='nodes'&&['enable','maintenance_mode'].includes(spec.action))return <NodeSwitch spec={spec} onClose={onClose} onDone={onDone}/>;
 const dangerous=['delete','reinstall','password','hardoff','hard_reboot','off','suspend'].includes(action);
 async function run(){setBusy(true);setError('');try{const nodeSetting=kind==='nodes'&&['enable','maintenance_mode'].includes(action);const settings=['remark','bw','password','reinstall'].includes(action);const path=nodeSetting?`/resources/nodes/${row.id}`:action==='delete'?`/resources/${kind}/${row.id}`:settings?`/clouds/${row.id}/settings/${action}`:`/clouds/${row.id}/actions/${action}`;onDone(await api(path,send(nodeSetting?'PUT':action==='delete'?'DELETE':settings?'PUT':'POST',nodeSetting?{[action]:spec.value}:{...values,confirm})));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog title={title+' · #'+row.id} onClose={()=>{if(!busy)onClose();}} footer={<><Button variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button variant={dangerous?'danger':'primary'} isDisabled={busy||confirm!==String(row.id)} isPending={busy} onPress={run}>确认{title}</Button></>}><div className="operation-body"><div className={'operation-warning '+(dangerous?'':'quiet')}><TriangleAlert size={20}/><div><strong>{row.hostname||row.name||'#'+row.id}</strong><p>{kind==='nodes'&&['enable','maintenance_mode'].includes(action)?(action==='enable'?(spec.value?'启用后，此节点可参与平台资源分配。':'禁用后，此节点将停止参与平台资源分配，请确认当前业务安排。'):'修改维护模式可能影响节点的调度与运维行为。'):action==='delete'?(kind==='clouds'?'实例将进入平台回收站，相关服务将中断。':'将删除该资源，请先确认下属资源已清空。'):action==='reinstall'?'系统盘将被重新安装，系统盘上的数据会丢失。数据盘保留。':action==='password'?'采用离线重置，平台可能关闭实例并注入新密码。':action==='bw'?'新的入站和出站带宽限制将提交到平台。':action==='remark'?'更新此实例的管理备注。':'此操作将提交到云平台，可能影响实例可用性。'}</p></div></div>{error&&<ErrorBox message={error}/ >}{action==='reinstall'&&<Relation field={{key:'os',label:'重新安装的镜像',type:'relation',relation:'images',required:true}} value={values.os} onChange={v=>setValues({...values,os:v})}/ >}{['reinstall','password'].includes(action)&&<TextField value={values.password||''} onChange={v=>setValues({...values,password:v})}><Label>{action==='reinstall'?'新密码（可留空由平台生成）':'新密码（8～128 位）'}</Label><Input type="password" autoComplete="new-password"/></TextField>}{action==='bw'&&<div className="form-grid">{['in_bw','out_bw'].map((k,i)=><TextField key={k} value={String(values[k])} onChange={v=>setValues({...values,[k]:v})}><Label>{i?'出站带宽（Mbps）':'入站带宽（Mbps）'}</Label><Input type="number" min={0} step={1}/></TextField>)}</div>}{action==='remark'&&<TextField value={values.remark} onChange={v=>setValues({...values,remark:v})}><Label>备注</Label><TextArea rows={3}/></TextField>}<TextField value={confirm} onChange={setConfirm}><Label>输入资源编号 {row.id} 以确认</Label><Input autoComplete="off" placeholder={String(row.id)}/></TextField></div></Dialog>;
}
