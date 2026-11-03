import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

// 网站配置: tabs read and write the documented endpoints; secrets stay on the server; saves keep untouched fields.
test('网站配置：按文档读写、遮蔽密钥、保存时保留未修改的字段',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-config-'));const auditFile=path.join(dir,'audit.jsonl');const calls=[];
 const config={system_domain:'cloud.example.com',company_name:'Old',email:'a@example.com',maintenance_mode:'0',maintenance_information:'',recycle_bin:'7',recycle_bin_unit:'day',read_bytes_sec:200,disk_config_switch:1,http_port_switch:1,http_port:80,https_port_switch:1,https_port:443,admin_path:'admin',request_header_get_ip:['X-Real-IP']};
 const app=createApp({auditFile,clientFactory:c=>new CubeClient(c,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null});
  if(route==='login')return json('TOKEN');
  if(route==='config'&&options.method==='GET')return json({data:config});
  if(route==='config/notify'&&options.method==='GET')return json({data:{email_switch:'1',email_type:'smtp',email_encoding:'base64',email_smtp_host:'smtp.old',email_smtp_port:'465',email_smtp_ssl:'ssl',email_smtp_user:'u',email_smtp_pwd:'SMTP-SECRET',email_system_name:'n',email_system_email:'e',sms_appid:'',sms_key:''}});
  if(route==='config/ddns'&&options.method==='GET')return json({data:{ddns_switch:'1',ddns_supplier:'dnspod',ddns_key:'k',ddns_token:'DDNS-TOKEN',main_control:{ddns_enable:1},area:[{id:1,name:'HK',node:[{id:3,name:'n3',ddns_enable:1},{id:4,name:'n4',ddns_enable:0}]}]}});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=(route,method='GET',body)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let res=await request('/login','POST',{baseUrl:'https://cube.example/admin',username:'admin',password:'pw'});cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf;
 const put=calls=>calls.find(c=>c.method==='PUT');

 // Secrets never reach the browser.
 res=await request('/site-config/notify');let body=await res.json();
 assert.equal(body.values.email_smtp_pwd,'');assert.equal(body.secrets.email_smtp_pwd,true);assert.equal(JSON.stringify(body).includes('SMTP-SECRET'),false);

 // An empty secret keeps the current one; the changed field is sent with the rest of the section.
 calls.length=0;res=await request('/site-config/notify','PUT',{values:{email_smtp_host:'smtp.new',email_smtp_pwd:''}});assert.equal(res.status,200);
 let p=put(calls);assert.equal(p.route,'config/notify');assert.equal(p.body.get('email_smtp_host'),'smtp.new');assert.equal(p.body.get('email_smtp_pwd'),'SMTP-SECRET');assert.equal(p.body.get('email_encoding'),'base64');

 // 基本信息 and 实例与磁盘 share PUT v1/config: saving one keeps the other's values.
 calls.length=0;res=await request('/site-config/basic','PUT',{values:{company_name:'New',maintenance_mode:1}});assert.equal(res.status,200);
 p=put(calls);assert.equal(p.route,'config');assert.equal(p.body.get('company_name'),'New');assert.equal(p.body.get('maintenance_mode'),'1');assert.equal(p.body.get('read_bytes_sec'),'200');assert.equal(p.body.get('recycle_bin_unit'),'day');
 assert.equal(p.body.has('http_port'),false,'security fields go to v1/config/security, not v1/config');

 // 安全 writes to its own endpoint with all four required port fields.
 calls.length=0;res=await request('/site-config/security','PUT',{values:{https_port:8443}});assert.equal(res.status,200);
 p=put(calls);assert.equal(p.route,'config/security');assert.equal(p.body.get('https_port'),'8443');assert.equal(p.body.get('http_port'),'80');assert.equal(p.body.get('request_header_get_ip[0]'),'X-Real-IP');

 // DDNS: node scope comes from the area tree; switching every node off sends an empty value.
 res=await request('/site-config/ddns');body=await res.json();assert.deepEqual(body.values.ddns_domain_enable,[3]);assert.equal(body.values.ddns_domain_enable_main,1);assert.equal(body.values.ddns_token,'');
 calls.length=0;await request('/site-config/ddns','PUT',{values:{ddns_domain_enable:[]}});p=put(calls);assert.equal(p.body.get('ddns_domain_enable'),'');assert.equal(p.body.get('ddns_token'),'DDNS-TOKEN');

 // Rejected: unknown fields, bad options, read-only sections, unknown sections.
 calls.length=0;
 assert.equal((await request('/site-config/ip','PUT',{values:{evil:1}})).status,400);
 assert.equal((await request('/site-config/ip','PUT',{values:{ip_assign_rule:9}})).status,400);
 assert.equal((await request('/site-config/basic','PUT',{values:{http_port:1}})).status,400);
 assert.equal((await request('/site-config/evacuation','PUT',{values:{fail_times:1}})).status,405);
 assert.equal((await request('/site-config/nope')).status,404);
 assert.equal(calls.filter(c=>c.method!=='GET'&&c.route!=='login').length,0);

 // Node traffic and private IPs.
 calls.length=0;assert.equal((await request('/site-config/node_traffic','POST',{node_id:3,over_flow_suspend:3,over_flow_bw_limit:10})).status,200);
 p=calls.find(c=>c.method==='POST'&&c.route==='config/node_traffic');assert.equal(p.body.get('over_flow_bw_limit'),'10');
 assert.equal((await request('/site-config/node_traffic','POST',{node_id:3,over_flow_suspend:3})).status,400);
 calls.length=0;assert.equal((await request('/site-config/private_ip','PUT',{private_ip:{'3':'10.0.0.3'}})).status,200);assert.equal(put(calls).body.get('private_ip[3]'),'10.0.0.3');
 assert.equal((await request('/site-config/private_ip','PUT',{private_ip:{'3':'not-an-ip'}})).status,400);

});
