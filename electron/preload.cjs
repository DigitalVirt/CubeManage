// 只向页面暴露两类能力：检查更新、记住登录账号（读取 / 保存 / 删除某个平台地址的用户名和密码）。
// 页面拿不到 Node 或 Electron 的其他接口，也碰不到保存密码的文件。
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cubemanageDesktop',{
 checkUpdate:()=>ipcRenderer.invoke('cubemanage:check-update'),
 credentials:{
  available:()=>ipcRenderer.invoke('cubemanage:cred-available'),
  get:url=>ipcRenderer.invoke('cubemanage:cred-get',String(url||'')),
  save:(url,username,password)=>ipcRenderer.invoke('cubemanage:cred-save',String(url||''),String(username||''),password==null?null:String(password)),
  remove:url=>ipcRenderer.invoke('cubemanage:cred-remove',String(url||''))
 }
});
