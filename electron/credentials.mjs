/**
 * 桌面客户端“记住用户名和密码”的本机存储。不依赖 Electron，加密方式由调用方传入（main.mjs 用 safeStorage：
 * macOS 钥匙串、Windows DPAPI），方便测试。
 *
 * 文件：应用数据目录下的 credentials.json，按平台地址（去掉末尾斜杠、忽略大小写）分别保存：
 *   { "https://cloud.example.com/admin": { "username": "admin", "password": "<加密后的 base64>", "savedAt": 1762300000000 } }
 * 密码只以加密后的形式写入文件；系统不支持加密时只保存用户名，不保存密码。
 */
import fs from 'node:fs/promises';

export const platformKey=url=>String(url||'').trim().replace(/\/+$/,'').toLowerCase();

export function createCredentialStore({file,crypto}){
 async function read(){try{const v=JSON.parse(await fs.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
 async function write(all){await fs.writeFile(file,JSON.stringify(all,null,1),{mode:0o600});}
 const valid=url=>/^https?:\/\/[^\s]+$/i.test(String(url||'').trim());
 return {
  /** 系统是否支持加密保存密码 */
  available:()=>Boolean(crypto.available()),
  /** 读取某个平台的用户名和密码；密码解不开（换了电脑、系统钥匙串变化）时只返回用户名 */
  async get(url){
   if(!valid(url))return null;const item=(await read())[platformKey(url)];if(!item||typeof item.username!=='string')return null;
   let password=null;if(item.password&&crypto.available()){try{password=crypto.decrypt(Buffer.from(item.password,'base64'));}catch{password=null;}}
   return {username:item.username,password,hasPassword:Boolean(password)};
  },
  /** 保存；password 为空或系统不支持加密时只保存用户名 */
  async save(url,username,password){
   if(!valid(url))throw new Error('平台地址无效');const name=String(username||'').trim();if(!name)throw new Error('用户名为空');
   const all=await read();const item={username:name,savedAt:Date.now()};
   if(password&&crypto.available())item.password=crypto.encrypt(String(password)).toString('base64');
   all[platformKey(url)]=item;await write(all);return {saved:true,hasPassword:Boolean(item.password)};
  },
  async remove(url){const all=await read();const k=platformKey(url);if(k in all){delete all[k];await write(all);}return {removed:true};}
 };
}
