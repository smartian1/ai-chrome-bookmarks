import {config,indexBytes} from './db';
import {included,search,type Folder,type Rules,type Row} from './core';
import {applyDocumentI18n,formatSource,listSeparator,t,uiLocale} from './i18n';
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
    if(!/^(https?|ftp|file):/i.test(row.url)){status.textContent=t('errOpenUnsupportedUrl');return;}
    await chrome.tabs.create({url:row.url});
  }
  function render(terms:string[]=[],folder='',concepts:string[][]=[]){
    selected=-1;list.replaceChildren();results=search(data,box.value,terms,folder,concepts);
    const resultLabel=results.length?t('statusShowingCount',[results.length]):(data.length?t('statusNoMatches'):t('statusNoBookmarks'));
    status.textContent=t('statusSummaryBar',[resultLabel,data.length,modelCount]);
    if(smartResult)status.textContent+=t('statusAiModeSuffix');
    for(const row of results){
      const card=label('article','','card'), head=label('div','','cardhead');
      const link=label('button',row.title||row.host||t('untitledBookmark'),'open'),edit=label('button',t('noteBtn'),'edit');
      link.onclick=()=>void open(row).catch(e=>status.textContent=message(e));
      edit.onclick=()=>{
        const area=document.createElement('textarea'),save=label('button',t('saveNoteBtn'));
        area.value=row.note??'';area.maxLength=1000;area.ariaLabel=t('noteAreaAria');
        save.onclick=async()=>{await send('note',{id:row.id,text:area.value});area.remove();await reload();};
        card.append(area,save);edit.hidden=true;area.focus();
      };
      head.append(link,edit);card.append(head,label('div',[row.host,row.folder].filter(Boolean).join(' · '),'small'));
      if(row.note)card.append(label('div',t('myNotePrefix',[row.note])));
      if(row.info?.summary)card.append(label('div',formatSource(row.info.source)+' · '+row.info.summary));
      if(row.info?.evidence)card.append(label('div',t('excerptPrefix',[row.info.evidence.slice(0,110)]),'small'));
      list.append(card);
    }
  }
  async function smart(){
    const query=box.value.trim();if(!query)return;
    const ticket=++sequence;status.textContent=t('statusUnderstanding');
    try{
      const {terms,folder,concepts}=await send<{terms:string[];folder:string;concepts:string[][]}>('query',{query});
      if(ticket!==sequence)return;
      const known=folder && data.some(r=>r.folder.toLowerCase().split(' / ').includes(folder.toLowerCase()));
      smartResult={terms,folder:known?folder:'',concepts};render(terms,smartResult.folder,concepts);
    }catch(e){if(ticket===sequence){smartResult=undefined;render();status.textContent+=t('statusAiUnavailable',[message(e)]);}}
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
    button.textContent=running?t('pauseIndexBtn'):t('startIndexBtn');
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
      branch.ariaLabel=t('toggleFolderAria',[folder.title]);branch.disabled=Boolean(query)||!parents.has(folder.id);
      branch.setAttribute('aria-expanded',String(Boolean(query)||!closed.has(folder.id)));
      branch.onclick=()=>{if(closed.has(folder.id))closed.delete(folder.id);else closed.add(folder.id);showFolders();};
      const title=document.createElement('label'),check=document.createElement('input');
      check.type='checkbox';check.checked=included(folder.ancestors,rules);check.indeterminate=mixed.has(folder.id);
      check.onchange=async()=>{try{await send('scope',{id:folder.id,enabled:check.checked});await refresh();}catch(e){notice(message(e));showFolders();}};
      title.append(check,document.createTextNode(folder.title));title.title=folder.path;
      const c=counts.get(folder.id)!;
      const state=working?.ancestors.includes(folder.id)?t('folderStateIndexing'):c.done===0?t('folderStateNone'):c.done===c.eligible?t('folderStateDone'):t('folderStatePartial');
      const explicit=folder.ancestors.some(id=>Object.hasOwn(rules,id));
      const prefix=check.checked||check.indeterminate?'':explicit?t('folderExcludedPrefix'):t('folderUnselectedPrefix');
      const status=label('span',`${prefix}${state} ${c.done}/${c.eligible}`,'small');
      const remove=document.createElement('button');remove.textContent=t('clearFolderBtn');remove.ariaLabel=t('clearFolderAria',[folder.title]);remove.disabled=!c.records&&!working?.ancestors.includes(folder.id);
      remove.onclick=()=>void clearIndexes(folder).catch(e=>notice(message(e)));
      row.append(branch,title,status,remove);elements.push(row);
    }
    el('folderTree').replaceChildren(...(elements.length?elements:[label('p',t('noMatchingFolders'))]));
  }
  async function clearIndexes(folder?:Folder){
    const promptText=folder?t('confirmClearFolder',[folder.path||folder.title]):t('confirmClearAll');
    if(!window.confirm(promptText))return;
    await send(folder?'clearFolder':'clearAll',{id:folder?.id});await refresh();notice(t('noticeCleared'));
  }
  el('clearAll').onclick=()=>void clearIndexes().catch(e=>notice(message(e)));
  input('folderQuery').oninput=showFolders;
  async function progress(){
    const item=await send<typeof working>('progress'),previous=working?.id;
    working=item;
    const idleText=running?t('currentWaiting'):t('currentIdle');
    el('current').textContent=item?t('currentProcessing',[item.count,`${item.title}${item.url?' · '+item.url:''}`]):idleText;
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
    el('indexCount').textContent=pages?t('indexPageInfo',[items.length,indexPage+1,pages]):query?t('indexNoMatch'):t('indexEmpty');
    el<HTMLButtonElement>('previous').disabled=indexPage===0;
    el<HTMLButtonElement>('next').disabled=indexPage+1>=pages;
    el('indexes').replaceChildren(...items.slice(indexPage*pageSize,(indexPage+1)*pageSize).map(row=>{
      const info=row.info!,card=label('article','','card');
      card.append(label('strong',row.title||row.host),label('div',row.safe,'small'),label('p',info.summary));
      if(info.tags.length)card.append(label('div',t('keywordsPrefix',[info.tags.join(listSeparator())])));
      if(info.evidence)card.append(label('blockquote',info.evidence));
      card.append(label('div',[formatSource(info.source),new Date(info.at).toLocaleString(uiLocale())].join(' · '),'small'));return card;
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
    el('selectedCount').textContent=t('selectedCount',[scope.length]);
    const errors=scope.filter(r=>r.info?.status==='error'),held=scope.filter(r=>!r.safe||r.info?.status==='skipped');
    el('stats').replaceChildren(label('strong',t('statsHeadline',[scope.length,data.length])),document.createElement('br'),
      label('span',t('statsDetail',[done,scope.length-done-held.length-errors.length,held.length,errors.length])));
    el('recent').replaceChildren(label('strong',t('recentHeadline',[c.running?t('recentRunning'):t('recentIdle'),c.used])),document.createElement('br'),
      label('span',t('recentNote'),'small'));
    const size=bytes>=1048576?`${(bytes/1048576).toFixed(2)} MiB`:bytes>=1024?`${(bytes/1024).toFixed(1)} KiB`:`${bytes} B`;
    el('size').textContent=t('sizeEstimate',[size]);
    showFolders();
    const sample=scope.find(r=>r.safe&&!r.info)??scope.find(r=>r.safe);
    el('preview').textContent=sample?JSON.stringify({title:sample.title.slice(0,240),url:sample.safe.slice(0,700),excerpt:''},null,2):t('previewEmpty');
    showIndexes();
  }
  el('config').onsubmit=e=>{
    e.preventDefault();
    const save=async()=>{
      const base=input('base').value.trim(),model=input('model').value.trim();
      if(!model)throw Error(t('errModelNameRequired'));
      const host=new URL(endpoint(base)).origin+'/*';
      if(!await chrome.permissions.request({origins:[host]}))throw Error(t('errGatewayDenied'));
      await chrome.storage.local.set({base,model,token:input('token').value});notice(t('noticeSettingsSaved'));await refresh();
    };
    void save().catch(err=>notice(message(err)));
  };
  type SyncReport={added:number;updated:number;removed:number;total:number;at:number};
  const syncTime=new Intl.DateTimeFormat(uiLocale(),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  let latestCheck=0;
  function showSync(result:SyncReport,reason:string){
    if(result.at<latestCheck)return;
    latestCheck=result.at;
    const detail=result.added||result.updated||result.removed?t('syncDetailUpdated'):t('syncDetailUpToDate');
    el('syncResult').textContent=t('syncResultLine',[result.total,syncTime.format(result.at),reason,detail]);
  }
  async function syncBookmarks(reason:string){
    showSync(await send<SyncReport>('sync'),reason);
  }
  async function showUpdate(){
    const {bookmarkUpdate:update}=await chrome.storage.session.get<{bookmarkUpdate?:SyncReport&{title:string}}>('bookmarkUpdate');
    if(update){
      showSync(update,t('syncReasonBookmarkChange'));
      el('lastChange').textContent=t('lastChangeLine',[syncTime.format(update.at),update.added,update.updated,update.removed])+(update.title?' · '+update.title:'');
    }
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.bookmarkUpdate)void showUpdate();});
  await showUpdate();
  action('sync',async()=>{await syncBookmarks(t('syncReasonManual'));await refresh();});
  action('test',async()=>{notice(t('noticeTesting'));await send('test');notice(t('noticeTestOk'));});
  action('start',async()=>{
    busy=true;toggleState();
    try{
      if(running){await send('pause');notice(t('noticePaused'));}
      else{
        const granted=canStart && await chrome.permissions.request({origins:['http://*/*','https://*/*']});
        await send('start');notice(granted?t('noticeStarted'):t('noticeStartedLimited'));
      }
      await refresh();
    }finally{busy=false;toggleState();}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.running){running=Boolean(changes.running.newValue);toggleState();}});
  await syncBookmarks(t('syncReasonOpen'));await refresh(true);await progress();
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='session'&&changes.indexRevision&&!document.hidden)void refresh().catch(e=>notice(message(e)));
  });
  setInterval(()=>{if(!document.hidden)void progress().catch(e=>notice(message(e)));},600);
  setInterval(()=>{if(!document.hidden && document.activeElement?.tagName!=='SELECT')void refresh();},5000);
}
applyDocumentI18n();
(document.body.classList.contains('popup')?searchPage():settingsPage()).catch(e=>{(document.querySelector('#status,#notice') as HTMLElement).textContent=message(e);});
