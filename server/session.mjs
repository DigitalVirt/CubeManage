import crypto from 'node:crypto';

/**
 * Sessions live only in the user's browser, as one sealed cookie: AES-256-GCM over
 * {platform address, user name, platform access-token, expiry, CSRF token}.
 *
 * - The platform password is used once to log in and is never stored — not on disk, not in memory, not in the cookie.
 * - The cookie is HttpOnly (page scripts cannot read it), SameSite=Strict and Secure over HTTPS, and its content is
 *   encrypted and authenticated, so neither the browser user nor anyone holding a copy can read or alter it.
 * - The key exists only in this process's memory and is never written anywhere; restarting the service ends every
 *   session (people log in again). Nothing about who is logged in is kept on the server.
 * - A session ends when the platform token does: its lifetime is the token's, and the first 401 from the platform
 *   clears the cookie.
 */
const KEY=crypto.randomBytes(32);
export const COOKIE='cubemanage';

export function seal(value){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',KEY,iv);
 const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}
export function unseal(text){
 if(typeof text!=='string'||text.length<40||text.length>6000)return null;
 try{
  const buf=Buffer.from(text,'base64url'),decipher=crypto.createDecipheriv('aes-256-gcm',KEY,buf.subarray(0,12));
  decipher.setAuthTag(buf.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)),decipher.final()]).toString('utf8'));
 }catch{return null;}
}
export function readCookie(req){
 const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
 return raw?raw.slice(COOKIE.length+1):undefined;
}
// 用户通过 HTTPS 访问（直接或经反向代理）时，Cookie 带 Secure。
const secureFlag=req=>req.secure?'; Secure':'';
export function setSessionCookie(req,res,value,maxAgeSeconds){
 res.setHeader('Set-Cookie',`${COOKIE}=${seal(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor(maxAgeSeconds))}${secureFlag(req)}`);
}
export function clearSessionCookie(req,res){
 res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag(req)}`);
}
