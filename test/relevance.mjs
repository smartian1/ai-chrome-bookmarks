import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/core.ts'],bundle:true,format:'esm',write:false});
const {monthRange,search}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const titles=['CentOS 中用 Yum 安装、卸载软件','Nginx 安装配置','Install GUI Environment on CentOS 6','量化交易软件','Yummy 安装指南','Yum 镜像站状态','包管理器参考'];
const rows=titles.map((title,i)=>({title,id:String(i),url:'https://example.org/'+i,host:'example.org',safe:'',folder:'工具',date:0}));
rows[6].info={evidence:'yum install 和 yum remove 的用法'};
const q='yum安装和卸载程序',extra=['CentOS','Linux','安装','软件','程序'];
assert.deepEqual(search(rows,q,extra).map(r=>r.title).sort(),[titles[0],titles[5],titles[6]].sort());
assert.deepEqual(search(rows,q,extra,'',[['yum'],['安装','卸载','install','remove']]).map(r=>r.title),[titles[0],titles[6]]);
assert.equal(search(rows.slice(1,5),q,extra).length,0);
const now=new Date(2026,10,15);
const thisMonth=new Date(2026,10,5).getTime(), lastMonth=new Date(2026,9,10).getTime();
const dated=[
  {title:'PDF Table Extractor',id:'a',url:'https://example.org/a',host:'example.org',safe:'',folder:'Tools',date:thisMonth},
  {title:'Old Invoice Archive',id:'b',url:'https://example.org/b',host:'example.org',safe:'',folder:'Finance',date:lastMonth}
];
assert.deepEqual(monthRange('last month',now),[new Date(2026,9,1).getTime(),new Date(2026,10,1).getTime()]);
assert.deepEqual(monthRange('this month',now),[new Date(2026,10,1).getTime(),new Date(2026,11,1).getTime()]);
assert.deepEqual(search(dated,'last month').map(r=>r.id),['b']);
assert.deepEqual(search(dated,'this month').map(r=>r.id),['a']);
assert.deepEqual(search(dated,'PDF tool',['extractor'],'',[['pdf'],['table','extractor']]).map(r=>r.id),['a']);
console.log('PASS: Yum relevance, English queries, month filters, broad expansion rejection, evidence matches and empty result');
