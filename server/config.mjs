import 'dotenv/config';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function normalizeBase(value){
 let url;try{url=new URL(String(value));}catch{throw Error('请输入有效的平台地址');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('平台地址只允许 HTTP/HTTPS，不能包含账号或查询参数');
 url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/v1$/,'')+'/';
 return url.toString().replace(/\/$/,'');
}
/**
 * Only non-secret settings come from the environment. The platform address, user name and password are never read
 * from or written to this machine: they are typed on the login page, and the session lives in the user's browser
 * (see session.mjs).
 */
export function serviceConfig(){return {bodyEncoding:process.env.CUBE_BODY_ENCODING==='json'?'json':'form'};}
