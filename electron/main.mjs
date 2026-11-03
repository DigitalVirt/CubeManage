/**
 * CubeManage 桌面客户端（Electron）。
 * 启动时在本机 127.0.0.1 上运行现有的 Node 服务（server/index.mjs，同时提供打包好的页面 dist/ 和 /api），
 * 窗口加载这个本机地址。服务只监听本机，外部访问不到；平台地址、账号仍只在登录页填写。
 * 有新版本时弹窗提示（见 updater.mjs）；macOS 在应用菜单、Windows 在页面右上角个人菜单里可以手动“检查更新”。
 */
import {app,BrowserWindow,shell,Menu,ipcMain} from 'electron';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {checkForUpdates,scheduleUpdateChecks} from './updater.mjs';

app.setName('CubeManage');
const PREFERRED_PORT=47080; // 固定端口让浏览器存储（筛选、网站名称缓存）跨次启动保留；被占用时改用随机端口
let origin='',server=null,win=null;

function listen(port){return new Promise((resolve,reject)=>{const s=createApp().listen(port,'127.0.0.1');s.once('listening',()=>resolve(s));s.once('error',reject);});}
async function startServer(){try{server=await listen(PREFERRED_PORT);}catch{server=await listen(0);}origin=`http://127.0.0.1:${server.address().port}`;}

function createWindow(){
 win=new BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:680,show:false,backgroundColor:'#f6f6f6',title:'CubeManage',
  webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false,preload:path.join(import.meta.dirname,'preload.cjs')}});
 win.once('ready-to-show',()=>win.show());
 // 本机页面之内正常导航；其他链接（平台网页终端、外部文档等）用系统浏览器打开
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url)&&!url.startsWith(origin))shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(origin)){e.preventDefault();if(/^https?:\/\//i.test(url))shell.openExternal(url);}});
 win.on('closed',()=>{win=null;});
 win.loadURL(origin+'/');
}

// 只允许一个实例：再次打开时把已有窗口拉到前面
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  // Windows 不显示菜单栏；macOS 保留系统菜单（复制粘贴、退出等快捷键），并在应用菜单里加“检查更新…”
  if(process.platform!=='darwin')Menu.setApplicationMenu(null);
  else Menu.setApplicationMenu(Menu.buildFromTemplate([
   {role:'appMenu',submenu:[{role:'about',label:'关于 CubeManage'},{label:'检查更新…',click:()=>checkForUpdates(win,{manual:true})},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
   {role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]));
  // 页面里的“检查更新”（个人菜单）：只接受本机页面发来的请求
  ipcMain.handle('cubemanage:check-update',e=>{if(!String(e.senderFrame?.url||'').startsWith(origin))return;return checkForUpdates(win,{manual:true});});
  await startServer();createWindow();
  scheduleUpdateChecks(()=>win);
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
 });
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
 app.on('before-quit',()=>{server?.close();});
}
