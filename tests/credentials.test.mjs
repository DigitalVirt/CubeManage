import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCredentialStore,platformKey} from '../electron/credentials.mjs';

// 模拟系统加密：真实环境是 Electron safeStorage（macOS 钥匙串 / Windows DPAPI）
const fakeCrypto=(on=true)=>({available:()=>on,encrypt:t=>Buffer.from('ENC:'+[...t].reverse().join('')),decrypt:b=>{const s=b.toString();if(!s.startsWith('ENC:'))throw new Error('bad');return [...s.slice(4)].reverse().join('');}});

test('桌面客户端记住账号：按平台地址保存，密码只以加密形式落盘',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cm-cred-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'credentials.json');const store=createCredentialStore({file,crypto:fakeCrypto()});
 assert.equal(platformKey('HTTPS://Cloud.Example.com/admin/'),'https://cloud.example.com/admin');
 assert.equal(await store.get('https://cloud.example.com/admin'),null);

 assert.deepEqual(await store.save('https://cloud.example.com/admin/','admin','P@ssw0rd!'),{saved:true,hasPassword:true});
 const raw=await fs.readFile(file,'utf8');assert.ok(!raw.includes('P@ssw0rd!'),'文件里没有明文密码');
 assert.deepEqual(await store.get('https://CLOUD.example.com/admin'),{username:'admin',password:'P@ssw0rd!',hasPassword:true},'地址末尾斜杠和大小写不影响');
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600,'只有当前用户可读写');

 await store.save('https://other.example.com','ops','x');
 await store.remove('https://cloud.example.com/admin');
 assert.equal(await store.get('https://cloud.example.com/admin'),null);
 assert.equal((await store.get('https://other.example.com')).username,'ops','删除一个平台不影响其他平台');

 await assert.rejects(store.save('not-a-url','a','b'),/平台地址无效/);
 await assert.rejects(store.save('https://x.example.com','','b'),/用户名为空/);
});

test('桌面客户端记住账号：系统不支持加密时只保存用户名；密码解不开时只返回用户名',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cm-cred-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'credentials.json');
 const plain=createCredentialStore({file,crypto:fakeCrypto(false)});
 assert.deepEqual(await plain.save('https://a.example.com','admin','secret'),{saved:true,hasPassword:false});
 assert.ok(!(await fs.readFile(file,'utf8')).includes('secret'));
 assert.deepEqual(await plain.get('https://a.example.com'),{username:'admin',password:null,hasPassword:false});

 await fs.writeFile(file,JSON.stringify({'https://b.example.com':{username:'root',password:Buffer.from('garbage').toString('base64')}}));
 const store=createCredentialStore({file,crypto:fakeCrypto()});
 assert.deepEqual(await store.get('https://b.example.com'),{username:'root',password:null,hasPassword:false});
});
