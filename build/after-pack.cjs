// 没有配置 Apple 开发者证书时，给 macOS 应用做 ad-hoc 签名。
// 完全不签名的应用在 Apple 芯片的 Mac 上下载后会提示“已损坏，无法打开”；
// ad-hoc 签名后，第一次打开只会提示“无法验证开发者”，可以在“隐私与安全性”里选择“仍要打开”。
// 配置了 CSC_LINK 时由 electron-builder 用正式证书签名，这里不做任何事。
const {execFileSync}=require('node:child_process');
const path=require('node:path');

exports.default=async function afterPack(context){
  if(context.electronPlatformName!=='darwin'||process.env.CSC_LINK)return;
  const app=path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing  app=${app}`);
  execFileSync('codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'});
  execFileSync('codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
};
