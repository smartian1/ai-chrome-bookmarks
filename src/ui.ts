import {config,indexBytes} from './db';
import {included,search,type Folder,type Rules,type Row} from './core';
import {endpoint} from './model';
function el<T extends HTMLElement=HTMLElement>(id:string){return document.getElementById(id) as T;}
const input=(id:string)=>el<HTMLInputElement>(id);
function label(tag:string,text:string,cls=''){
  const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;
}
async function send<T=unknown>(type:string,params:Record<string,unknown>={}):Promise<T>{
  const reply=await chrome.runtime.sendMessage({type,...params});
  if(reply?.error)throw Error(reply.error);
  return reply.value;
}
function message(e:unknown){return e instanceof Error?e.message:String(e);}
function action(id:string,work:()=>Promise<void>){
  el(id).onclick=()=>void work().catch(e=>{el('notice').textContent=message(e);});
}
async function searchPage(){
  const box=input('query'), status=el('status'), list=el('results');
  el('settings').onclick=()=>void chrome.runtime.openOptionsPage();
  let data:Row[]=[],modelCount=0,reloadVersion=0;
  let smartResult:{terms:string[];folder:string;concepts:string[][]}|undefined;
  async function reload(){
    const version=++reloadVersion,rows=await send<Row[]>('rows');
    if(version!==reloadVersion)return;
    data=rows;modelCount=new Set(rows.filter(row=>row.info?.status==='done').map(row=>row.key)).size;
    if(!list.querySelector('textarea'))render(smartResult?.terms,smartResult?.folder,smartResult?.concepts);
  }
  let results:Row[]=[],selected=-1,sequence=0;
  async function open(row:Row){
    if(!/^(https?|ftp|file):/i.test(row.url)){status.textContent='此链接类型请在 Chrome 书签管理器中打开';return;}
    await chrome.tabs.create({url:row.url});
  }
  function render(terms:string[]=[],folder='',concepts:string[][]=[]){
    selected=-1;list.replaceChildren();results=search(data,box.value,terms,folder,concepts);
    const resultLabel=results.length?`显示 ${results.length} 条`:(data.length?'没有匹配的书签':'当前 Chrome 配置还没有书签');
    status.textContent=`${resultLabel} · 本地索引 ${data.length} 条 · 大模型索引 ${modelCount} 条`;
    if(smartResult)status.textContent+=' · AI对话搜索';
    for(const row of results){
      const card=label('article','','card'), head=label('div','','cardhead');
      const link=label('button',row.title||row.host||'未命名书签','open'),edit=label('button','备注','edit');
      link.onclick=()=>void open(row).catch(e=>status.textContent=message(e));
      edit.onclick=()=>{
        const area=document.createElement('textarea'),save=label('button','保存备注');
        area.value=row.note??'';area.maxLength=1000;area.ariaLabel='我的用途备注';
        save.onclick=async()=>{await send('note',{id:row.id,text:area.value});area.remove();await reload();};
        card.append(area,save);edit.hidden=true;area.focus();
      };
      head.append(link,edit);card.append(head,label('div',[row.host,row.folder].filter(Boolean).join(' · '),'small'));
      if(row.note)card.append(label('div','我的备注 · '+row.note));
      if(row.info?.summary)card.append(label('div',row.info.source+' · '+row.info.summary));
      if(row.info?.evidence)card.append(label('div','摘录 · '+row.info.evidence.slice(0,110),'small'));
      list.append(card);
    }
  }
  async function smart(){
    const query=box.value.trim();if(!query)return;
    const ticket=++sequence;status.textContent='正在理解查询…';
    try{
      const {terms,folder,concepts}=await send<{terms:string[];folder:string;concepts:string[][]}>('query',{query});
      if(ticket!==sequence)return;
      const known=folder && data.some(r=>r.folder.toLowerCase().split(' / ').includes(folder.toLowerCase()));
      smartResult={terms,folder:known?folder:'',concepts};render(terms,smartResult.folder,concepts);
    }catch(e){if(ticket===sequence){smartResult=undefined;render();status.textContent+=' · AI对话搜索不可用，已显示本地结果 · '+message(e);}}
  }
  box.oninput=()=>{sequence++;smartResult=undefined;render();};
  el('search').onsubmit=e=>{e.preventDefault();void smart();};
  box.onkeydown=e=>{
    if(e.isComposing)return;
    if(['ArrowDown','ArrowUp'].includes(e.key)&&results.length){
      e.preventDefault();selected=Math.min(results.length-1,Math.max(0,selected+(e.key==='ArrowDown'?1:-1)));
      Array.from(list.children).forEach((node,i)=>node.classList.toggle('selected',i===selected));list.children[selected].scrollIntoView({block:'nearest'});
    }else if(e.key==='Enter'&&!e.ctrlKey&&selected>=0){e.preventDefault();void open(results[selected]);}
    else if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();void smart();}
  };
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.indexRevision)void reload().catch(e=>status.textContent=message(e));});
  await reload();box.focus();
}
async function settingsPage(){
  let data:Row[]=[];
  let folders:Folder[]=[],rules:Rules={},working:(Pick<Row,'id'|'title'|'url'|'ancestors'>&{count:number})|null=null;
  const closed=new Set<string>();
  const discovered=new Set<string>();
  let running=false,busy=false;
  function toggleState(){
    const button=el<HTMLButtonElement>('start');
    button.textContent=running?'暂停建库':'开始建库';
    button.disabled=busy||(!running&&!data.some(row=>row.safe&&included(row.ancestors??[],rules)));
  }
  function showFolders(){
    const query=input('folderQuery').value.trim().toLowerCase();
    const visible=new Set(folders.filter(f=>f.path.toLowerCase().includes(query)).flatMap(f=>f.ancestors));
    const parents=new Set(folders.map(f=>f.ancestors.at(-2)));
    const counts=new Map(folders.map(f=>[f.id,{eligible:0,done:0,records:0}]));
    for(const row of data)for(const id of row.ancestors??[]){
      const c=counts.get(id);if(!c)continue;
      if(row.info)c.records++;
      if(row.safe){c.eligible++;if(row.info?.status==='done')c.done++;}
    }
    const elements:HTMLElement[]=[];
    const mixed=new Set<string>();
    for(const folder of folders){
      if(included(folder.ancestors,rules)!==included(folder.ancestors.slice(0,-1),rules))
        for(const parent of folder.ancestors.slice(0,-1))mixed.add(parent);
    }
    for(const folder of folders){
      if(!visible.has(folder.id)||(!query&&folder.ancestors.slice(0,-1).some(id=>closed.has(id))))continue;
      const row=label('div','','folder-row');row.dataset.folder=folder.id;
      row.style.paddingInlineStart=`${(folder.ancestors.length-1)*14}px`;
      const branch=document.createElement('button');
      branch.className=parents.has(folder.id)?'branch':'branch leaf';
      branch.textContent=closed.has(folder.id)&&!query?'▸':'▾';
      branch.ariaLabel=`展开或折叠 ${folder.title}`;branch.disabled=Boolean(query)||!parents.has(folder.id);
      branch.setAttribute('aria-expanded',String(Boolean(query)||!closed.has(folder.id)));
      branch.onclick=()=>{if(closed.has(folder.id))closed.delete(folder.id);else closed.add(folder.id);showFolders();};
      const title=document.createElement('label'),check=document.createElement('input');
      check.type='checkbox';check.checked=included(folder.ancestors,rules);check.indeterminate=mixed.has(folder.id);
      check.onchange=async()=>{try{await send('scope',{id:folder.id,enabled:check.checked});await refresh();}catch(e){notice(message(e));showFolders();}};
      title.append(check,document.createTextNode(folder.title));title.title=folder.path;
      const c=counts.get(folder.id)!;
      const state=working?.ancestors.includes(folder.id)?'索引中':c.done===0?'未索引':c.done===c.eligible?'已建索引':'部分已建';
      const explicit=folder.ancestors.some(id=>Object.hasOwn(rules,id));
      const status=label('span',`${check.checked||check.indeterminate?'':explicit?'已排除 · ':'未选手动建库 · '}${state} ${c.done}/${c.eligible}`,'small');
      const remove=document.createElement('button');remove.textContent='清理';remove.ariaLabel=`清理 ${folder.title} 的 LLM 索引`;remove.disabled=!c.records&&!working?.ancestors.includes(folder.id);
      remove.onclick=()=>void clearIndexes(folder).catch(e=>notice(message(e)));
      row.append(branch,title,status,remove);elements.push(row);
    }
    el('folderTree').replaceChildren(...(elements.length?elements:[label('p','没有匹配的目录')]));
  }
  async function clearIndexes(folder?:Folder){
    if(!window.confirm(`清理${folder?`「${folder.path||folder.title}」及子目录`:'全部目录'}的 LLM 索引？建库会暂停，书签和备注会保留。`))return;
    await send(folder?'clearFolder':'clearAll',{id:folder?.id});await refresh();notice('LLM 索引已清理，建库已暂停');
  }
  el('clearAll').onclick=()=>void clearIndexes().catch(e=>notice(message(e)));
  input('folderQuery').oninput=showFolders;
  async function progress(){
    const item=await send<typeof working>('progress'),previous=working?.id;
    working=item;
    const idleText=running?'建库进行中，正在等待下一批':'当前没有正在处理的页面';
    el('current').textContent=item?`正在索引 ${item.count} 个页面：${item.title}${item.url?' · '+item.url:''}`:idleText;
    if(previous!==item?.id)showFolders();
  }
  let indexPage=0,canStart=false;
  function showIndexes(){
    const query=input('indexQuery').value.trim().toLowerCase();
    const unique=new Map<string,Row>();
    for(const row of data){
      const info=row.info;
      if(info?.status==='done' && [row.title,row.safe,info.summary,...info.tags].some(value=>value.toLowerCase().includes(query)))unique.set(row.key,row);
    }
    const items=[...unique.values()].sort((a,b)=>b.info!.at-a.info!.at);
    const pageSize=20, pages=Math.ceil(items.length/pageSize);
    indexPage=Math.min(indexPage,Math.max(0,pages-1));
    el('indexCount').textContent=pages?`${items.length} 条索引 · 第 ${indexPage+1} / ${pages} 页`:query?'未找到匹配的索引':'模型完成第一条用途说明后，会显示在这里。';
    el<HTMLButtonElement>('previous').disabled=indexPage===0;
    el<HTMLButtonElement>('next').disabled=indexPage+1>=pages;
    el('indexes').replaceChildren(...items.slice(indexPage*pageSize,(indexPage+1)*pageSize).map(row=>{
      const info=row.info!,card=label('article','','card');
      card.append(label('strong',row.title||row.host),label('div',row.safe,'small'),label('p',info.summary));
      if(info.tags.length)card.append(label('div','关键词 · '+info.tags.join('、')));
      if(info.evidence)card.append(label('blockquote',info.evidence));
      card.append(label('div',[info.source,new Date(info.at).toLocaleString()].join(' · '),'small'));return card;
    }));
  }
  input('indexQuery').oninput=()=>{indexPage=0;showIndexes();};
  el('previous').onclick=()=>{indexPage--;showIndexes();};el('next').onclick=()=>{indexPage++;showIndexes();};
  const notice=(text:string)=>{el('notice').textContent=text;};
  async function refresh(initial=false){
    const [items,c,tree,bytes]=await Promise.all([send<Row[]>('rows'),config(),send<Folder[]>('folders'),indexBytes()]);data=items;folders=tree;rules=c.rules;
    if(initial){
      for(const key of ['base','model','token'] as const)input(key).value=String(c[key]);
    }
    for(const folder of tree)if(!discovered.has(folder.id)){
      // The synthetic "all folders" root sits above Chrome's two visible levels.
      if(folder.ancestors.length>=3)closed.add(folder.id);
      discovered.add(folder.id);
    }
    running=c.running;toggleState();
    canStart=Boolean(c.base&&c.model);
    const scope=data.filter(r=>included(r.ancestors??[],rules)), done=scope.filter(r=>r.info?.status==='done').length;
    el('selectedCount').textContent=`已选中 ${scope.length} 个书签`;
    const errors=scope.filter(r=>r.info?.status==='error'),held=scope.filter(r=>!r.safe||r.info?.status==='skipped');
    el('stats').replaceChildren(label('strong',`当前选中 ${scope.length} 条书签（本地共 ${data.length} 条）`),document.createElement('br'),
      label('span',`已生成摘要 ${done} · 待处理 ${scope.length-done-held.length-errors.length} · 已跳过 ${held.length} · 失败 ${errors.length}`));
    el('recent').replaceChildren(label('strong',`${c.running?'手动建库已启用':'手动建库未运行'} · 历史建库尝试 ${c.used} 次`),document.createElement('br'),
      label('span','每次模型建库请求可处理 1 至 4 个页面，整批计 1 次，含失败和重试。复用已有摘要或直接跳过书签不会增加次数。','small'));
    const size=bytes>=1048576?`${(bytes/1048576).toFixed(2)} MiB`:bytes>=1024?`${(bytes/1024).toFixed(1)} KiB`:`${bytes} B`;
    el('size').textContent=`LLM 索引数据量约 ${size}（索引记录及书签关联的序列化大小）`;
    showFolders();
    const sample=scope.find(r=>r.safe&&!r.info)??scope.find(r=>r.safe);
    el('preview').textContent=sample?JSON.stringify({title:sample.title.slice(0,240),url:sample.safe.slice(0,700),excerpt:''},null,2):'暂无适合的书签';
    showIndexes();
  }
  el('config').onsubmit=e=>{
    e.preventDefault();
    const save=async()=>{
      const base=input('base').value.trim(),model=input('model').value.trim();
      if(!model)throw Error('请填写模型名称');
      const host=new URL(endpoint(base)).origin+'/*';
      if(!await chrome.permissions.request({origins:[host]}))throw Error('模型网关未获授权');
      await chrome.storage.local.set({base,model,token:input('token').value});notice('设置已保存');await refresh();
    };
    void save().catch(err=>notice(message(err)));
  };
  type SyncReport={added:number;updated:number;removed:number;total:number;at:number};
  const syncTime=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  let latestCheck=0;
  function showSync(result:SyncReport,reason:string){
    if(result.at<latestCheck)return;
    latestCheck=result.at;
    const detail=result.added||result.updated||result.removed?'已同步变动':'已是最新';
    el('syncResult').textContent=`本地可搜索 ${result.total} 条 · ${syncTime.format(result.at)} ${reason}，${detail}`;
  }
  async function syncBookmarks(reason:string){
    showSync(await send<SyncReport>('sync'),reason);
  }
  async function showUpdate(){
    const {bookmarkUpdate:update}=await chrome.storage.session.get<{bookmarkUpdate?:SyncReport&{title:string}}>('bookmarkUpdate');
    if(update){
      showSync(update,'书签变动');
      el('lastChange').textContent=`最近一次有变动 · ${syncTime.format(update.at)} · 新增 ${update.added} · 更新 ${update.updated} · 移除 ${update.removed}${update.title?' · '+update.title:''}`;
    }
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.bookmarkUpdate)void showUpdate();});
  await showUpdate();
  action('sync',async()=>{await syncBookmarks('手动核对');await refresh();});
  action('test',async()=>{notice('正在测试…');await send('test');notice('模型连接成功');});
  action('start',async()=>{
    busy=true;toggleState();
    try{
      if(running){await send('pause');notice('已暂停，当前请求完成后停止');}
      else{
        const granted=canStart && await chrome.permissions.request({origins:['http://*/*','https://*/*']});
        await send('start');notice(granted?'已开始处理所选书签':'已开始处理，仅已授权站点可附带网页摘录');
      }
      await refresh();
    }finally{busy=false;toggleState();}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.running){running=Boolean(changes.running.newValue);toggleState();}});
  await syncBookmarks('打开管理页核对');await refresh(true);await progress();
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='session'&&changes.indexRevision&&!document.hidden)void refresh().catch(e=>notice(message(e)));
  });
  setInterval(()=>{if(!document.hidden)void progress().catch(e=>notice(message(e)));},600);
  setInterval(()=>{if(!document.hidden && document.activeElement?.tagName!=='SELECT')void refresh();},5000);
}
(document.body.classList.contains('popup')?searchPage():settingsPage()).catch(e=>{(document.querySelector('#status,#notice') as HTMLElement).textContent=message(e);});
