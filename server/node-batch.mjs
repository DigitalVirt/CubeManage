import {HttpError} from './cube-client.mjs';

/**
 * 节点批量修改：平台没有批量接口，逐台调用“修改节点” PUT v1/nodes/:id，每台只提交填写了的字段（这些字段都是可选的）。
 * 浏览器每 10 台发一次请求并显示进度（见 src/components/NodeBatchEdit.tsx）。
 * 可改的字段：SSH 密码 ssh_pass、SSH 端口 port、SSH 密钥 ssh_key、DNS dns1 / dns2、节点分组 group_id。
 * 删除 SSH 密钥（clear_ssh_key: true）：逐台调用“清空节点SSH密钥” DELETE v1/nodes/:id/ssh_key，与填写新密钥互斥；
 * 同时修改了其他项时，先清空密钥，再提交修改。
 * 清空前先读取节点详情 GET v1/nodes/:id：input_ssh_key 为 false（没有保存密钥）时跳过清空，记为“未设置密钥”，
 * 因为平台对没有密钥的节点只返回未翻译的 default_error_message。
 * 密码和密钥只转发给平台，不写日志，也不出现在返回结果里。
 */
const IPV4=/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6=/^[0-9a-f:]+$/i;

/** 只保留填写了的字段，并逐项校验；全部为空或有不合法的值时报错。clear_ssh_key 为 true 时保留为删除 SSH 密钥。 */
export function nodeBatchFields(input={}){
 const out={};const str=v=>typeof v==='string'?v.trim():v==null?'':String(v).trim();
 const pass=str(input.ssh_pass);if(pass){if(pass.length>128)throw new HttpError(400,'SSH 密码最长 128 个字符');out.ssh_pass=pass;}
 const port=str(input.port);if(port){const n=Number(port);if(!Number.isInteger(n)||n<1||n>65535)throw new HttpError(400,'SSH 端口应为 1～65535 的整数');out.port=n;}
 const key=typeof input.ssh_key==='string'?input.ssh_key.trim():'';if(key){if(key.length>16384)throw new HttpError(400,'SSH 密钥过长');out.ssh_key=key;}
 for(const [k,name] of [['dns1','首选 DNS'],['dns2','备用 DNS']]){const v=str(input[k]);if(v){if(!IPV4.test(v)&&!(v.includes(':')&&IPV6.test(v)))throw new HttpError(400,name+'不是有效的 IP 地址');out[k]=v;}}
 const group=str(input.group_id);if(group!==''){const n=Number(group);if(!Number.isInteger(n)||n<0)throw new HttpError(400,'节点分组无效');out.group_id=n;}
 if(input.clear_ssh_key===true||input.clear_ssh_key==='1'||input.clear_ssh_key==='true'){if(out.ssh_key)throw new HttpError(400,'删除 SSH 密钥时不能同时填写新密钥');out.clear_ssh_key=true;}
 if(!Object.keys(out).length)throw new HttpError(400,'请至少填写一项要修改的内容');
 return out;
}

/** 平台未翻译的通用错误码，换成说明。 */
const readable=(message,what)=>/^default_error_message$/i.test(String(message||'').trim())?`平台未能${what}（平台只返回 default_error_message，没有说明原因）`:message;
/** 节点是否保存了 SSH 密钥；读不到这个字段时返回 null（按有密钥处理，照常清空）。 */
const hasKey=detail=>{const d=detail?.data??detail;const v=d?.input_ssh_key;if(v===true||v===1||v==='1'||v==='true')return true;if(v===false||v===0||v==='0'||v==='false')return false;if(typeof d?.ssh_key==='string')return d.ssh_key.trim()!=='';return null;};

export function registerNodeBatch(app,{asyncRoute,mutate}){
 app.post('/api/nodes/batch_update',asyncRoute(async(req,res)=>{
  const raw=Array.isArray(req.body?.ids)?req.body.ids:[];const ids=[...new Set(raw.map(Number))];
  if(!ids.length||ids.length>100||ids.some(id=>!Number.isInteger(id)||id<=0))throw new HttpError(400,'请选择 1～100 个有效节点');
  const fields=nodeBatchFields(req.body?.fields);const {clear_ssh_key:clear,...update}=fields;const results=[];
  for(const id of ids){
   let step='清空 SSH 密钥',skipped=false;
   try{
    if(clear){
     const detail=await req.session.client.request('GET',`nodes/${id}`);
     if(hasKey(detail)===false)skipped=true;
     else await mutate(req,'DELETE',`nodes/${id}/ssh_key`,undefined,'nodes',id,'clear_ssh_key');
    }
    step='修改节点';
    if(Object.keys(update).length)await mutate(req,'PUT',`nodes/${id}`,update,'nodes',id,'batch_update');
    results.push(skipped?{id,ok:true,skipped:'未设置 SSH 密钥，无需删除'}:{id,ok:true});
   }
   catch(e){if(e?.status===401)throw e;results.push({id,ok:false,error:readable(e.message,step)});}
  }
  const success=results.filter(r=>r.ok).length;
  res.json({total:ids.length,success,failed:ids.length-success,skipped:results.filter(r=>r.skipped).length,results,fields:Object.keys(fields)});
 }));
}
