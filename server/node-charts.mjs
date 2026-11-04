import {HttpError,listResult} from './cube-client.mjs';

/**
 * 节点详情页的图表数据。全部来自平台的“图表数据”接口 v1/statistics（node_id + type）：
 *   main_info      节点 CPU 和内存
 *   main_disk      节点磁盘（dev_name = 磁盘）
 *   main_net_info  节点网卡（dev_name = 网卡）
 *   pps            包转发率
 *   node_disk_io   节点磁盘 IOPS（dev_name = 磁盘）
 * 可选的磁盘和网卡来自“节点分类数据” v1/node_statistics（dev = 磁盘，net = 网卡，disk = 磁盘 IO 的磁盘）。
 * 默认取最近 3 天；平台默认每个序列最多返回 1000 个点，3 天约 4～5 分钟一个点，放大到某一天也能看清时间段。
 * 流量排行：平台没有按节点的排行接口，取这个节点上的实例（v1/clouds?node=），按本月已用流量从高到低取前 10。
 */
const DAY=86400000;

/** 时间统一成毫秒；每个点保留时间之后的全部数值列（不同 type 的列数不同）。 */
export function nodePoints(r){
 const rows=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.list)?r.list:[];
 const toMs=v=>{if(v==null||v==='')return NaN;if(typeof v==='number'||/^\d+(\.\d+)?$/.test(String(v).trim())){const n=Number(v);return n>1e12?n:n>1e9?n*1000:n;}const t=Date.parse(String(v).trim().replace(' ','T'));return Number.isFinite(t)?t:NaN;};
 return rows.filter(p=>Array.isArray(p)&&p.length>=2)
  .map(p=>[toMs(p[0]),...p.slice(1).filter(v=>!Array.isArray(v)&&(v===null||typeof v!=='object')).map(v=>Number(v)||0)])
  .filter(p=>Number.isFinite(p[0])).sort((a,b)=>a[0]-b[0]);
}

/** node_statistics 的 dev / net / disk：字符串或 {name|dev|dev_name|...} 都认，去重。 */
export function devNames(list){
 const items=Array.isArray(list)?list:list&&typeof list==='object'?Object.values(list):[];
 return [...new Set(items.map(x=>typeof x==='string'||typeof x==='number'?String(x):x&&typeof x==='object'?String(x.dev_name??x.dev??x.name??x.ifname??x.net??''):'').map(s=>s.trim()).filter(Boolean))];
}

export function registerNodeCharts(app,{asyncRoute}){
 const nodeId=req=>{if(!/^\d+$/.test(req.params.id))throw new HttpError(400,'节点编号无效');return req.params.id;};

 app.get('/api/nodes/:id/charts',asyncRoute(async(req,res)=>{
  const id=nodeId(req),client=req.session.client;
  const days=Math.min(30,Math.max(1,parseInt(req.query.days)||3));const et=Date.now(),st=et-days*DAY;
  let devs={disk:[],net:[],io:[]},devError;
  try{const r=await client.request('GET','node_statistics',{query:{id}});const d=r?.data&&!Array.isArray(r.data)?r.data:r||{};devs={disk:devNames(d.dev),net:devNames(d.net),io:devNames(d.disk)};}
  catch(e){if(e?.status===401)throw e;devError=e.message;}
  const pick=(list,want)=>want&&list.includes(want)?want:list[0]||null;
  const disk=pick(devs.disk,String(req.query.disk||'')),net=pick(devs.net,String(req.query.net||'')),io=pick(devs.io,String(req.query.io||''))||disk;
  const stat=(type,extra={})=>client.request('GET','statistics',{query:{node_id:id,type,st,et,...extra}}).then(nodePoints);
  const jobs={cpu:stat('main_info'),disk:disk?stat('main_disk',{dev_name:disk}):Promise.resolve([]),net:net?stat('main_net_info',{dev_name:net}):stat('main_net_info'),pps:stat('pps'),io:io?stat('node_disk_io',{dev_name:io}):Promise.resolve([])};
  const keys=Object.keys(jobs),settled=await Promise.allSettled(Object.values(jobs));
  if(settled.some(s=>s.status==='rejected'&&s.reason?.status===401))throw settled.find(s=>s.reason?.status===401).reason;
  const out={start:st,end:et,days,devs,devError};
  keys.forEach((k,i)=>{const s=settled[i];out[k]={points:s.status==='fulfilled'?s.value:[],error:s.status==='rejected'?s.reason.message:undefined};});
  out.disk.dev=disk;out.net.dev=net;out.io.dev=io;
  res.json(out);
 }));

 app.get('/api/nodes/:id/traffic_rank',asyncRoute(async(req,res)=>{
  const id=nodeId(req),client=req.session.client;const rows=[];
  for(let page=1;page<=10;page++){
   const r=await client.request('GET','clouds',{query:{node:Number(id),page,per_page:100}});const list=listResult(r,page,100);
   rows.push(...list.data);if(list.data.length<100||page>=(list.meta?.total_pages||1))break;
  }
  const num=v=>{const n=Number(String(v??'').replace('%',''));return Number.isFinite(n)?n:null;};
  const ranked=rows.map(c=>({id:Number(c.id),hostname:c.hostname||'',mainip:c.mainip||'',used:num(c.traffic_used),percent:num(c.traffic_percent)}))
   .filter(c=>c.used!=null&&c.used>0).sort((a,b)=>b.used-a.used).slice(0,10);
  res.json({data:ranked,total:rows.length});
 }));
}
