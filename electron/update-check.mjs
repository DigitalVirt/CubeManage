// 更新检查里不依赖 Electron 的部分（版本比较、选择安装包、整理更新说明），单独放这里方便测试。

/** 0.1.73 > 0.1.72；忽略前面的 v 和后面的预发布标记。 */
export function newer(a,b){
 const p=v=>String(v).replace(/^v/i,'').split(/[-+]/)[0].split('.').map(n=>Number(n)||0);
 const x=p(a),y=p(b);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;
}

/** 当前系统和芯片对应的安装包。 */
export function assetFor(assets,platform=process.platform,arch=process.arch){
 const suffix=platform==='darwin'?`-mac-${arch==='arm64'?'arm64':'x64'}.dmg`:platform==='win32'?'-win-x64.exe':null;
 return suffix?(assets||[]).find(a=>typeof a?.name==='string'&&a.name.endsWith(suffix)):undefined;
}

/** Release 正文里“本次更新”一节，去掉 Markdown 标记，适合放进系统对话框。 */
export function notesFrom(body,max=900){
 let text=String(body||'');const i=text.search(/^##\s*本次更新/m);if(i>=0)text=text.slice(i).replace(/^##[^\n]*\n/,'');
 text=text.split(/^##\s/m)[0]
  .replace(/```[\s\S]*?```/g,'')
  .replace(/^###\s*(.+)$/gm,'【$1】')
  .replace(/^\s*[-*]\s+/gm,'• ')
  .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
  .replace(/\*\*([^*]+)\*\*/g,'$1')
  .replace(/`([^`]+)`/g,'$1')
  .replace(/\n{3,}/g,'\n\n').trim();
 return text.length>max?text.slice(0,max).replace(/\n[^\n]*$/,'')+'\n…':text;
}
