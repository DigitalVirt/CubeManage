import test from 'node:test';
import assert from 'node:assert/strict';
import {CubeClient} from '../server/cube-client.mjs';

const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('平台请求：超时与连接失败分开提示，写操作等待更久',async()=>{
 const seen=[];let mode='timeout';
 const client=new CubeClient({baseUrl:'https://cube.example',username:'admin',password:'pw'},{transport:async(url,options)=>{
  if(url.pathname.endsWith('/login'))return json('TOKEN');
  seen.push({method:options.method,signal:options.signal});
  if(mode==='timeout')throw new DOMException('The operation was aborted due to timeout','TimeoutError');
  throw new TypeError('fetch failed');
 }});
 await assert.rejects(client.request('DELETE','clouds/migrate',{body:{id:[1]}}),e=>e.status===504&&/操作可能仍在平台上执行/.test(e.message));
 await assert.rejects(client.request('GET','clouds/migrate'),e=>e.status===504&&/平台响应超时/.test(e.message));
 mode='down';
 await assert.rejects(client.request('GET','clouds'),e=>e.status===502&&/连接平台失败，请检查地址/.test(e.message));
 assert.ok(seen.every(s=>s.signal instanceof AbortSignal));
});
