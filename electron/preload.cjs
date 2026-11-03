// 只向页面暴露“检查更新”一个能力，页面拿不到 Node 或 Electron 的其他接口。
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cubemanageDesktop',{
 checkUpdate:()=>ipcRenderer.invoke('cubemanage:check-update')
});
