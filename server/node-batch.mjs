import {HttpError} from './cube-client.mjs';

/**
 * 节点批量修改：平台没有批量接口，逐台调用“修改节点” PUT v1/nodes/:id，每台只提交填写了的字段（这些字段都是可选的）。
 * 浏览器每 10 台发一次请求并显示进度（见 src/components/NodeBatchEdit.tsx）。
 * 可改的字段：SSH 密码 ssh_pass、SSH 端口 port、SSH 密钥 ssh_key、DNS dns1 / dns2、节点分组 group_id。
 * 密码和密钥只转发给平台，不写日志，也不出现在返回结果里。
 */
const IPV4=/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6=/^[0-9a-f:]+$/i;

/** 只保留填写了的字段，并逐项校验；全部为空或有不合法的值时报错。 */
export function nodeBatchFields(input={}){
 const out={};const str=v=>typeof v==='string'?v.trim():v==null?'':String(v).trim();
 const pass=str(input.ssh_pass);if(pass){if(pass.length>128)throw new HttpError(400,'SSH 密码最长 128 个字符');out.ssh_pass=pass;}
 const port=str(input.port);if(port){const n=Number(port);if(!Number.isInteger(n)||n<1||n>65535)throw new HttpError(400,'SSH 端口应为 1～65535 的整数');out.port=n;}
 const key=typeof input.ssh_key==='string'?input.ssh_key.trim():'';if(key){if(key.length>16384)throw new HttpError(400,'SSH 密钥过长');out.ssh_key=key;}
 for(const [k,name] of [['dns1','首选 DNS'],['dns2','备用 DNS']]){const v=str(input[k]);if(v){if(!IPV4.test(v)&&!(v.includes(':')&&IPV6.test(v)))throw new HttpError(400,name+'不是有效的 IP 地址');out[k]=v;}}
 const group=str(input.group_id);if(group!==''){const n=Number(group);if(!Number.isInteger(n)||n<0)throw new HttpError(400,'节点分组无效');out.group_id=n;}
 if(!Object.keys(out).length)throw new HttpError(400,'请至少填写一项要修改的内容');
 return out;
}

export function registerNodeBatch(app,{asyncRoute,mutate}){
 app.post('/api/nodes/batch_update',asyncRoute(async(req,res)=>{
  const raw=Array.isArray(req.body?.ids)?req.body.ids:[];const ids=[...new Set(raw.map(Number))];
  if(!ids.length||ids.length>100||ids.some(id=>!Number.isInteger(id)||id<=0))throw new HttpError(400,'请选择 1～100 个有效节点');
  const fields=nodeBatchFields(req.body?.fields);const results=[];
  for(const id of ids){
   try{await mutate(req,'PUT',`nodes/${id}`,fields,'nodes',id,'batch_update');results.push({id,ok:true});}
   catch(e){if(e?.status===401)throw e;results.push({id,ok:false,error:e.message});}
  }
  const success=results.filter(r=>r.ok).length;
  res.json({total:ids.length,success,failed:ids.length-success,results,fields:Object.keys(fields)});
 }));
}
