import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/core.ts'],bundle:true,format:'esm',write:false});
const {search}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const titles=['CentOS 中用 Yum 安装、卸载软件','Nginx 安装配置','Install GUI Environment on CentOS 6','量化交易软件','Yummy 安装指南','Yum 镜像站状态','包管理器参考'];
const rows=titles.map((title,i)=>({title,id:String(i),url:'https://example.org/'+i,host:'example.org',safe:'',folder:'工具',date:0}));
rows[6].info={evidence:'yum install 和 yum remove 的用法'};
const q='yum安装和卸载程序',extra=['CentOS','Linux','安装','软件','程序'];
assert.deepEqual(search(rows,q,extra).map(r=>r.title).sort(),[titles[0],titles[5],titles[6]].sort());
assert.deepEqual(search(rows,q,extra,'',[['yum'],['安装','卸载','install','remove']]).map(r=>r.title),[titles[0],titles[6]]);
assert.equal(search(rows.slice(1,5),q,extra).length,0);
console.log('PASS: Yum relevance, broad expansion rejection, evidence matches and empty result');
