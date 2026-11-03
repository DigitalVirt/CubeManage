/**
 * 更新提示：从 GitHub Releases 读取最新版本，比当前版本新时弹窗提示，点“下载更新”用系统浏览器下载
 * 对应系统和芯片的安装包（mac-arm64.dmg / mac-x64.dmg / win-x64.exe）。
 * 安装包没有 Apple 开发者证书签名，macOS 上做不了后台自动安装，所以只提示、由用户下载安装。
 * 启动 8 秒后检查一次，之后每 6 小时检查一次；“跳过这个版本”记在 userData/update.json。
 * 自动检查失败时不打扰用户；手动“检查更新”会显示结果或失败原因。
 */
import {app,dialog,shell} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {newer,assetFor,notesFrom} from './update-check.mjs';

const REPO='DigitalVirt/CubeManage';
const RELEASES=`https://github.com/${REPO}/releases`;
const FIRST_CHECK=8000,EVERY=6*3600*1000;
let checking=false,timer=null;

const stateFile=()=>path.join(app.getPath('userData'),'update.json');
async function readState(){try{return JSON.parse(await fs.readFile(stateFile(),'utf8'))||{};}catch{return {};}}
async function writeState(s){try{await fs.writeFile(stateFile(),JSON.stringify(s));}catch{/* 忽略：只是记不住“跳过的版本” */}}

async function latestRelease(){
 const res=await fetch(`https://api.github.com/repos/${REPO}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'CubeManage-Desktop/'+app.getVersion()},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error(`GitHub 返回 HTTP ${res.status}`);
 return res.json();
}

/** manual：用户点了“检查更新”，没有新版本或检查失败时也要告诉他。 */
export async function checkForUpdates(win,{manual=false}={}){
 if(checking)return;checking=true;
 const parent=win&&!win.isDestroyed()?win:undefined;
 const show=opts=>parent?dialog.showMessageBox(parent,opts):dialog.showMessageBox(opts);
 try{
  const rel=await latestRelease();const latest=String(rel.tag_name||'').replace(/^v/i,''),current=app.getVersion();
  if(!latest||!newer(latest,current)){
   if(manual)await show({type:'info',title:'检查更新',message:'已经是最新版本',detail:`当前版本 ${current}。`,buttons:['好']});
   return;
  }
  const state=await readState();
  if(!manual&&state.skip===latest)return;
  const asset=assetFor(rel.assets);const page=rel.html_url||`${RELEASES}/latest`;
  const notes=notesFrom(rel.body);
  const {response}=await show({type:'info',title:'发现新版本',message:`CubeManage ${latest} 已发布`,
   detail:`当前版本 ${current}。${notes?'\n\n'+notes:''}\n\n下载后关闭 CubeManage，再安装新版本即可，登录页保存的平台地址会保留。`,
   buttons:[asset?'下载更新':'前往下载','查看更新内容','稍后提醒','跳过这个版本'],defaultId:0,cancelId:2,noLink:true});
  if(response===0)await shell.openExternal(asset?.browser_download_url||page);
  else if(response===1)await shell.openExternal(page);
  else if(response===3)await writeState({...state,skip:latest});
 }catch(e){
  if(manual)await show({type:'warning',title:'检查更新',message:'暂时无法检查更新',detail:`${e?.message||e}\n\n可以稍后再试，或直接打开 ${RELEASES} 查看最新版本。`,buttons:['好','打开下载页'],defaultId:0}).then(r=>{if(r.response===1)shell.openExternal(RELEASES);});
 }finally{checking=false;}
}

/** 启动后自动检查，并定时重复。 */
export function scheduleUpdateChecks(getWindow){
 if(!app.isPackaged)return; // 开发调试时不检查
 clearInterval(timer);
 setTimeout(()=>checkForUpdates(getWindow()),FIRST_CHECK);
 timer=setInterval(()=>checkForUpdates(getWindow()),EVERY);
}
