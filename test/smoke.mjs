import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const requests=[];
const systems=[];
async function waitForRows(page,predicate){
  const end=Date.now()+15000;
  let rows=[];
  while(Date.now()<end){
    rows=await page.evaluate(async()=>(await chrome.runtime.sendMessage({type:'rows'})).value);
    if(predicate(rows))return;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.fail('Unexpected fixture state: '+JSON.stringify(rows.map(r=>[r.title,r.info?.source,r.info?.note])));
}
const server=createServer(async(req,res)=>{
  if(req.method==='GET'){
    if(req.url==='/tool'){res.writeHead(503).end();return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<title>Local fixture</title><h1>Compare documents</h1><script>IGNORE_THIS_SCRIPT</script>');return;
  }
  let raw='';for await(const chunk of req)raw+=chunk;
  const messages=JSON.parse(raw).messages;
  const sys=messages[0]?.content??'';
  const data=JSON.parse(messages.at(-1).content);
  requests.push(data);
  systems.push(sys);
  if(data.items?.every(item=>item.title.startsWith('Reference '))){
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:'invalid JSON'}}]}));return;
  }
  if(data.title==='Project orchard'&&requests.filter(r=>r.title===data.title).length===1){
    res.writeHead(503).end();return;
  }
  if(data.title==='Fixture site')await new Promise(resolve=>setTimeout(resolve,1800));
  const english=sys.includes('one-line English description');
  const answer=data.items?{items:data.items.slice(1).reverse().map(item=>({id:item.id,summary:item.title,tags:[]}))}
    :data.query?{terms:['tabular'],folder:''}
    :data.test?{ok:true}
    :english?{summary:'Extract tables from PDF documents',tags:['tabular','PDF extraction']}
    :{summary:'提取 PDF 中的表格',tags:['tabular','PDF extraction']};
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const dist=await mkdtemp(resolve(tmpdir(),'bookmark-ext-test-'));
await cp(resolve('dist'),dist,{recursive:true});
await build({entryPoints:['src/db.ts'],bundle:true,format:'esm',outfile:resolve(dist,'migration-check.js')});
const manifestPath=resolve(dist,'manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
// Headless Chromium has no interactive permission prompt.
manifest.host_permissions=manifest.optional_host_permissions;
delete manifest.optional_host_permissions;
await writeFile(manifestPath,JSON.stringify(manifest));
let ctx;
try{
  // Pass 1: Simplified Chinese Chrome environment
  ctx=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:['--lang=zh-CN',`--disable-extensions-except=${dist}`,`--load-extension=${dist}`,'--no-proxy-server',`--host-resolver-rules=MAP fixture.example.org 127.0.0.1:${server.address().port}, MAP example.org 127.0.0.1:${server.address().port}`]});
  const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');
  const extension='chrome-extension://'+new URL(worker.url()).hostname;
  const settings=await ctx.newPage();await settings.goto(extension+'/settings.html');
  const errors=[];settings.on('pageerror',err=>errors.push(err.message));
  await worker.evaluate(()=>chrome.storage.local.set({running:true}));
  await settings.locator('#current').filter({hasText:'建库进行中，正在等待下一批'}).waitFor();
  await settings.getByRole('button',{name:'暂停建库'}).click();
  await settings.locator('#current').filter({hasText:'当前没有正在处理的页面'}).waitFor();
  const ids=await worker.evaluate(async()=>{
    const folder=await chrome.bookmarks.create({title:'Research'});
    const pdf=await chrome.bookmarks.create({parentId:folder.id,title:'Project orchard',url:'http://example.org/tool?utm_source=private-test'});
    await chrome.bookmarks.create({parentId:folder.id,title:'Local dashboard',url:'http://127.0.0.1/private'});
    await chrome.bookmarks.create({parentId:folder.id,title:'Secret link',url:'https://example.org/auth?token=private-test'});
    return {pdf:pdf.id,folder:folder.id};
  });
  await settings.getByRole('button',{name:'同步书签'}).click();
  await settings.locator('#selectedCount').filter({hasText:'已选中 0 个书签'}).waitFor();
  await settings.locator('[data-folder="0"] input').check();
  await settings.locator('#selectedCount').filter({hasText:'已选中 3 个书签'}).waitFor();
  await settings.locator('#syncResult').filter({hasText:'本地可搜索 3 条'}).waitFor();
  await settings.waitForFunction(()=>document.querySelector('#stats').textContent.includes('当前选中 3 条书签'));
  await settings.locator('#base').fill(base+'/v1');await settings.locator('#model').fill('fixture');
  await settings.getByRole('button',{name:'保存设置'}).click();
  await settings.getByText('设置已保存',{exact:true}).waitFor();
  await settings.locator('#test').click();await settings.getByText('模型连接成功').waitFor();
  await settings.locator('#start').click();
  await waitForRows(settings,rows=>rows.some(r=>r.info?.status==='error'));
  await settings.getByRole('button',{name:'开始建库'}).click();
  await settings.waitForFunction(()=>document.querySelector('#stats').textContent.includes('已生成摘要 1'));
  assert.ok(requests.some(payload=>payload.url==='http://example.org/tool'));
  assert.ok(systems.some(s=>s.includes('一行中文说明')));
  assert.ok(!JSON.stringify(requests).includes('private-test'));
  await waitForRows(settings,rows=>rows.some(r=>r.title==='Project orchard'&&r.info?.status==='done'&&r.info.source==='模型推断'&&r.info.note));
  await settings.waitForFunction(async()=>!(await chrome.storage.local.get('running')).running);
  const beforeRestart=requests.length;
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'start'}));
  await settings.waitForFunction(async()=>!(await chrome.storage.local.get('running')).running);
  assert.equal(requests.length,beforeRestart,'Restart must reuse successful metadata-only summaries');
  await worker.evaluate(async folder=>chrome.bookmarks.create({parentId:folder,title:'Fixture site',url:'http://fixture.example.org/'}),ids.folder);
  await settings.locator('#syncResult').filter({hasText:'本地可搜索 4 条'}).waitFor();
  await settings.locator('#lastChange').filter({hasText:'Fixture site'}).waitFor();
  await settings.locator('#sync').click();
  await settings.locator('#syncResult').filter({hasText:'手动核对，已是最新'}).waitFor();
  assert.match(await settings.locator('#lastChange').textContent(),/新增 1.*Fixture site/);
  await settings.locator('#start').click();
  await settings.locator('#current').filter({hasText:'Fixture site'}).waitFor();
  await settings.getByRole('button',{name:'暂停建库'}).click();
  await waitForRows(settings,rows=>rows.some(r=>r.title==='Fixture site'&&r.info?.source==='网页摘录'));
  assert.ok(requests.some(r=>r.excerpt?.includes('Compare documents')),JSON.stringify(requests.map(r=>r.excerpt)));
  assert.ok(!JSON.stringify(requests).includes('IGNORE_THIS_SCRIPT'));
  const search=await ctx.newPage();await search.goto(extension+'/search.html');
  assert.equal(await search.locator('h1').textContent(),'AI书签寻迹');
  const box=search.locator('#query');await box.fill('水果研究设备');await box.press('Enter');
  await search.locator('#status').filter({hasText:'AI对话搜索'}).waitFor();
  assert.equal(await search.getByRole('button',{name:'AI对话搜索',exact:true}).getAttribute('title'),'使用大模型对话搜索');
  assert.match(await search.locator('#status').textContent(),/大模型索引 2 条/);
  await search.getByRole('button',{name:'Project orchard'}).waitFor();
  await search.locator('article').filter({hasText:'Project orchard'}).getByText('备注',{exact:true}).click();await search.locator('textarea').fill('我的实验');
  await search.getByText('保存备注').click();await box.fill('我的实验');await search.getByText('我的备注 · 我的实验').waitFor();
  await settings.locator('#sync').click();
  await settings.locator('#indexes article').filter({hasText:'Fixture site'}).getByText('Compare documents',{exact:false}).waitFor();
  await settings.locator('#indexQuery').fill('orchard');
  assert.equal(await settings.locator('#indexes article').count(),1);
  await settings.locator('#indexes').getByText('关键词 · tabular、PDF extraction').waitFor();
  const copy=await worker.evaluate(async()=>{
    const folder=await chrome.bookmarks.create({title:'Shared copy'});
    await chrome.bookmarks.create({parentId:folder.id,title:'Fixture site',url:'http://fixture.example.org/'});
    return folder.id;
  });
  const count=requests.filter(r=>r.url).length;
  await settings.locator('#sync').click();
  await settings.locator('#start').click();
  await waitForRows(settings,rows=>rows.filter(r=>r.info?.status==='done').length===3);
  assert.equal(requests.filter(r=>r.url).length,count);
  await settings.locator('#folderQuery').fill('Research');
  const research=settings.locator(`[data-folder="${ids.folder}"]`);
  await research.getByRole('checkbox').uncheck();
  await research.getByText(/已排除/).waitFor();
  settings.once('dialog',dialog=>dialog.accept());await research.getByRole('button',{name:/清理 Research/}).click();
  await waitForRows(settings,rows=>rows.filter(r=>r.info).length===1&&rows.some(r=>r.note==='我的实验'));
  await settings.locator('#start').click();
  await settings.locator('#sync').click();
  assert.equal(requests.filter(r=>r.url).length,count);
  settings.once('dialog',dialog=>dialog.accept());await settings.locator('#clearAll').click();
  await waitForRows(settings,rows=>rows.length===5&&rows.every(r=>!r.info));
  await settings.locator('#size').filter({hasText:'0 B'}).waitFor();
  await worker.evaluate(async id=>chrome.bookmarks.removeTree(id),copy);
  await worker.evaluate(async({pdf,folder})=>{
    await chrome.bookmarks.update(folder,{title:'Archive'});
    await chrome.bookmarks.update(pdf,{title:'Renamed tool'});
  },ids);
  await waitForRows(settings,rows=>rows.some(r=>r.title==='Renamed tool'&&r.folder.includes('Archive')));
  await worker.evaluate(async id=>{await chrome.bookmarks.removeTree(id);},ids.folder);
  await waitForRows(settings,rows=>!rows.length);
  const beforeBatch=requests.length;
  const usedBefore=await worker.evaluate(async()=>(await chrome.storage.local.get('used')).used);
  const batchFolder=await worker.evaluate(async()=>{
    await chrome.storage.local.set({model:''});
    const folder=await chrome.bookmarks.create({title:'Batch folder'});
    for(let i=0;i<4;i++)await chrome.bookmarks.create({parentId:folder.id,title:`Batch ${i}`,url:`http://fixture.example.org/batch-${i}`});
    return folder.id;
  });
  await waitForRows(settings,rows=>rows.length===4);
  await settings.evaluate(async id=>{
    await chrome.runtime.sendMessage({type:'sync'});
    window.batchCommits=0;
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.indexRevision)window.batchCommits++;});
    await chrome.runtime.sendMessage({type:'scope',id,enabled:true});
    await chrome.storage.local.set({model:'fixture'});
    await chrome.runtime.sendMessage({type:'start'});
  },batchFolder);
  await waitForRows(settings,rows=>rows.filter(r=>r.info?.summary===r.title).length===3&&rows.some(r=>r.info?.status==='error'));
  await settings.locator('#stats').filter({hasText:/已生成摘要 3 · 待处理 0 · 已跳过 0 · 失败 1/}).waitFor();
  assert.equal(await settings.evaluate(()=>window.batchCommits),1);
  assert.equal(requests.length-beforeBatch,1);
  const batchPayload=requests.at(-1);
  assert.equal(batchPayload.items.length,4);
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'start'}));
  await waitForRows(settings,rows=>rows.every(r=>r.info?.status==='done'));
  assert.equal(requests.length-beforeBatch,2);
  assert.equal(requests.at(-1).url,batchPayload.items[0].url);
  assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('used')).used),usedBefore+2);
  console.log('PASS: four pages in one request, out-of-order results, isolated missing entry and single-page retry');
  assert.deepEqual(errors,[]);console.log('PASS: zh-CN import, privacy, authorized page excerpt, enrichment, semantic query, note, rename, folder propagation and deletion');
  await ctx.close();ctx=undefined;

  // Pass 2: English Chrome environment (local search + AI indexing + AI search + English prompt)
  const enSystemsBefore=systems.length;
  ctx=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:['--lang=en-US',`--disable-extensions-except=${dist}`,`--load-extension=${dist}`,'--no-proxy-server',`--host-resolver-rules=MAP fixture.example.org 127.0.0.1:${server.address().port}, MAP example.org 127.0.0.1:${server.address().port}`]});
  const enWorker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');
  const enExt='chrome-extension://'+new URL(enWorker.url()).hostname;
  const enSettings=await ctx.newPage();await enSettings.goto(enExt+'/settings.html');
  const enErrors=[];enSettings.on('pageerror',err=>enErrors.push(err.message));
  assert.equal(await enSettings.title(),'AI Bookmark Trails · Manage Index');
  await enWorker.evaluate(async()=>{
    const folder=await chrome.bookmarks.create({title:'Work Tools'});
    await chrome.bookmarks.create({parentId:folder.id,title:'Table Utility',url:'http://fixture.example.org/pdf-tables'});
  });
  await enSettings.getByRole('button',{name:'Sync Bookmarks'}).click();
  await enSettings.locator('[data-folder="0"] input').check();
  await enSettings.locator('#selectedCount').filter({hasText:'1 bookmarks selected'}).waitFor();
  await enSettings.locator('#base').fill(base+'/v1');await enSettings.locator('#model').fill('fixture');
  await enSettings.getByRole('button',{name:'Save Settings'}).click();
  await enSettings.getByText('Settings saved',{exact:true}).waitFor();
  await enSettings.getByRole('button',{name:'Test Saved Config'}).click();
  await enSettings.getByText('Model connection succeeded').waitFor();
  await enSettings.getByRole('button',{name:'Start Indexing'}).click();
  await waitForRows(enSettings,rows=>rows.some(r=>r.title==='Table Utility'&&r.info?.status==='done'&&r.info.source==='Page excerpt'&&r.info.summary==='Extract tables from PDF documents'));
  assert.ok(systems.slice(enSystemsBefore).some(s=>s.includes('one-line English description')));
  await enSettings.locator('#indexes').getByText('Keywords · tabular, PDF extraction').waitFor();
  const enSearch=await ctx.newPage();await enSearch.goto(enExt+'/search.html');
  assert.equal(await enSearch.locator('h1').textContent(),'AI Bookmark Trails');
  const enBox=enSearch.locator('#query');
  await enBox.fill('Table Utility');
  await enSearch.getByRole('button',{name:'Table Utility'}).waitFor();
  await enBox.fill('tool for extracting tables from reports');await enBox.press('Enter');
  await enSearch.locator('#status').filter({hasText:'AI Search'}).waitFor();
  await enSearch.getByRole('button',{name:'Table Utility'}).waitFor();
  await enSearch.getByText('Page excerpt · Extract tables from PDF documents').waitFor();
  assert.deepEqual(enErrors,[]);
  console.log('PASS: en-US UI, English summary prompt, local search and AI search');
  await ctx.close();ctx=undefined;

  // Pass 3: Large profile scale & v1 DB migration
  const profile=await mkdtemp(resolve(tmpdir(),'bookmark-scale-test-'));
  try{
    const root=(id,name,children=[])=>({id:String(id),name,type:'folder',children,date_added:'0',date_modified:'0'});
    const marks=Array.from({length:2881},(_,index)=>({id:String(index+4),name:`Reference ${index}`,url:`https://example.org/reference/${index}`,type:'url',date_added:'0'}));
    await mkdir(resolve(profile,'Default'));
    await writeFile(resolve(profile,'Default','Bookmarks'),JSON.stringify({version:1,roots:{bookmark_bar:root(1,'Bookmarks bar',[root(4000,'Historical batch',marks.slice(0,5)),...marks.slice(5)]),other:root(2,'Other bookmarks'),synced:root(3,'Mobile bookmarks')}}));
    ctx=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--lang=zh-CN',`--disable-extensions-except=${dist}`,`--load-extension=${dist}`]});
    const browserWorker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');
    const large=await ctx.newPage();await large.goto(new URL('search.html',browserWorker.url()).href);
    await large.locator('#status').filter({hasText:'2881'}).waitFor();
    await large.locator('#query').fill('Reference 2880');
    assert.equal(await large.locator('#results .open').first().textContent(),'Reference 2880');
    const prior=requests.filter(r=>r.url).length;
    await browserWorker.evaluate(async(base)=>{await chrome.storage.local.set({base:base+'/v1',model:'fixture'});},base);
    await large.evaluate(()=>chrome.runtime.sendMessage({type:'sync'}));
    const fresh=await browserWorker.evaluate(async()=>chrome.bookmarks.create({title:'Automatic item',url:'http://fixture.example.org/auto-one'}));
    await large.locator('#query').fill('Automatic item');
    await large.getByRole('button',{name:'Automatic item',exact:true}).waitFor();
    await waitForRows(large,rows=>rows.some(r=>r.id===fresh.id&&r.info?.status==='done'));
    await large.locator('#status').filter({hasText:'大模型索引 1 条'}).waitFor();
    await browserWorker.evaluate(id=>chrome.bookmarks.update(id,{title:'Changed automatic item',url:'http://fixture.example.org/auto-two'}),fresh.id);
    await waitForRows(large,rows=>rows.some(r=>r.id===fresh.id&&r.url.endsWith('auto-two')&&r.info?.status==='done'));
    await browserWorker.evaluate(id=>chrome.bookmarks.remove(id),fresh.id);
    await waitForRows(large,rows=>rows.length===2881&&rows.every(r=>!r.info));
    await large.locator('#status').filter({hasText:'大模型索引 0 条'}).waitFor();
    assert.equal(requests.filter(r=>r.url).length-prior,2);
    console.log('PASS: automatic create and edit while manual indexing is idle, deletion cleanup, no historical model calls');
    await large.evaluate(async()=>{
      await chrome.runtime.sendMessage({type:'scope',id:'4000',enabled:true});
      await chrome.runtime.sendMessage({type:'start'});
    });
    await waitForRows(large,rows=>rows.filter(r=>r.info?.note==='模型未返回有效 JSON').length===4&&rows.some(r=>r.info?.status==='done'));
    await large.waitForFunction(async()=>!(await chrome.storage.local.get('running')).running);
    console.log('PASS: invalid JSON for four historical bookmarks does not stop the remaining manual queue');
    const migrated=await large.evaluate(async()=>{
      // Exercise the production migration against a separate real v1 IndexedDB.
      const openDatabase=indexedDB.open.bind(indexedDB);
      indexedDB.open=(name,version)=>openDatabase(name==='bookmark-trails'?'legacy-fixture':name,version);
      const mark=(await chrome.bookmarks.search({title:'Reference 2880'}))[0];
      const key=JSON.stringify([mark.url,mark.title]);
      await new Promise((resolve,reject)=>{
        const open=indexedDB.open('bookmark-trails',1);
        open.onupgradeneeded=()=>{
          open.result.createObjectStore('marks',{keyPath:'id'}).put({id:mark.id,key});
          open.result.createObjectStore('info',{keyPath:'key'}).put({key,summary:'Migrated summary',tags:[],source:'模型推断',evidence:'',at:1,status:'done'});
          open.result.createObjectStore('notes',{keyPath:'id'});
        };
        open.onsuccess=()=>{open.result.close();resolve();};open.onerror=()=>reject(open.error);
      });
      const db=await import(chrome.runtime.getURL('migration-check.js'));
      return (await db.rows())[0]?.info?.summary;
    });
    assert.equal(migrated,'Migrated summary');
    console.log('PASS: 2,881 synthetic bookmarks indexed; exact title ranked first');
  }finally{await ctx?.close();ctx=undefined;await rm(profile,{recursive:true,force:true});}
}finally{await ctx?.close();server.close();await rm(dist,{recursive:true,force:true});}
