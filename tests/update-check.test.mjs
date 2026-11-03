import test from 'node:test';
import assert from 'node:assert/strict';
import {newer,assetFor,notesFrom} from '../electron/update-check.mjs';

test('客户端更新提示：版本比较、按系统选择安装包、整理更新说明',()=>{
 assert.equal(newer('0.1.73','0.1.72'),true);
 assert.equal(newer('v0.2.0','0.1.99'),true);
 assert.equal(newer('0.1.10','0.1.9'),true);
 assert.equal(newer('0.1.72','0.1.72'),false);
 assert.equal(newer('0.1.71','0.1.72'),false);

 const assets=['CubeManage-0.1.73-mac-arm64.dmg','CubeManage-0.1.73-mac-x64.dmg','CubeManage-0.1.73-win-x64.exe','CubeManage-0.1.73-mac-arm64.dmg.blockmap'].map(name=>({name,browser_download_url:'https://example/'+name}));
 assert.equal(assetFor(assets,'darwin','arm64').name,'CubeManage-0.1.73-mac-arm64.dmg');
 assert.equal(assetFor(assets,'darwin','x64').name,'CubeManage-0.1.73-mac-x64.dmg');
 assert.equal(assetFor(assets,'win32','x64').name,'CubeManage-0.1.73-win-x64.exe');
 assert.equal(assetFor(assets,'linux','x64'),undefined);

 const body='介绍\n\n## 下载\n\n| a | b |\n\n## 本次更新\n\n### 登录\n- 记住**平台地址**，见 [README](https://x)\n- 运行 `xattr`\n\n```bash\nrm -rf /\n```\n\n## 其他\n不显示';
 const notes=notesFrom(body);
 assert.equal(notes,'【登录】\n• 记住平台地址，见 README\n• 运行 xattr');
 assert.ok(notesFrom('## 本次更新\n'+'- 很长的一行\n'.repeat(200),100).endsWith('…'));
});
