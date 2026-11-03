import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=v=>new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});
// 不需要配置 APP_ORIGIN：直接访问、经反向代理访问都能用；跨站来源被拒；经 HTTPS 代理时会话 Cookie 带 Secure。
test('反向代理后面无需配置：来源校验认代理传来的主机名，HTTPS 代理下 Cookie 带 Secure',async t=>{
 const app=createApp({clientFactory:c=>new CubeClient(c,{transport:async url=>url.pathname.endsWith('/login')?json('TOKEN'):json({data:[],meta:{total:0}})})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const login=(headers={})=>fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});
 // 直接访问：Origin 与 Host 一致
 let res=await login({Origin:base});assert.equal(res.status,200);assert.ok(!/;\s*Secure/i.test(res.headers.get('set-cookie')),'HTTP 直接访问时不带 Secure');
 // 跨站来源被拒
 res=await login({Origin:'https://evil.example'});assert.equal(res.status,403);
 // 经本机 HTTPS 反向代理：Host 被改写成上游地址，代理传来原始主机名和协议
 res=await login({Origin:'https://cube.example.com','X-Forwarded-Host':'cube.example.com','X-Forwarded-Proto':'https'});assert.equal(res.status,200);
 assert.match(res.headers.get('set-cookie'),/;\s*Secure/i,'HTTPS 代理下带 Secure');
 // 代理传来的主机名与来源不符仍被拒
 res=await login({Origin:'https://evil.example','X-Forwarded-Host':'cube.example.com','X-Forwarded-Proto':'https'});assert.equal(res.status,403);
});
