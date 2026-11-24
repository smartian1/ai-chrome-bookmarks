import {flatten,foldersOf,included,retryable,type Folder,type Rules,type Info,type Row} from './core';
import {all,change,config,rows,type AutoJob} from './db';
import {isZh,listSeparator,t} from './i18n';
import {ask,describeBatch} from './model';
let syncTail=Promise.resolve(), revision=0;
let folders:Folder[]=[], generation=0;
let syncReport={added:0,updated:0,removed:0,total:0,at:0};
let current:{id:string;title:string;url:string;ancestors:string[];count:number}|null=null;
async function locked<T>(work:()=>Promise<T>):Promise<T>{return await navigator.locks.request('bookmark-index-writes',work);}
function sync() {
  const version=++revision;
  syncTail=syncTail.catch(()=>{}).then(()=>locked(async()=>{
    if(version!==revision)return;
    const tree=await chrome.bookmarks.getTree(), marks=flatten(tree);
    folders=foldersOf(tree,[],'',t('allFolders'));
    const ids=new Set(marks.map(m=>m.id));
    const [old,info,notes]=await Promise.all([all('marks'),all('info'),all('notes')]);
    const previous=new Map(old.map(m=>[m.id,m]));
    const links=await all('links'), liveKeys=new Map(marks.map(m=>[m.id,m.key]));
    const attachedKeys=new Set(links.filter(link=>liveKeys.get(link.id)===link.key).map(link=>link.key));
    const legacy=await chrome.storage.local.get(['selectionVersion','rules','folders']);
    if(!legacy.selectionVersion){
      const configured=(legacy.rules??{}) as Rules;
      const ready=new Set(info.filter(i=>i.status==='done').map(i=>i.key));
      const indexed=new Set(links.filter(l=>liveKeys.get(l.id)===l.key&&ready.has(l.key)).map(l=>l.id));
      const own=new Set(marks.filter(m=>indexed.has(m.id)).map(m=>m.ancestors.at(-1)));
      const rules:Rules={};
      for(const f of folders){
        const explicit=f.ancestors.some(id=>Object.hasOwn(configured,id));
        const selected=explicit?included(f.ancestors,configured):Array.isArray(legacy.folders)&&legacy.folders.length?
          legacy.folders.some((p:string)=>f.path===p||f.path.startsWith(p+' / ')):own.has(f.id);
        if(selected!==included(f.ancestors.slice(0,-1),rules))rules[f.id]=selected;
      }
      await chrome.storage.local.set({selectionVersion:1,rules});
      if(legacy.folders!==undefined)await chrome.storage.local.remove('folders');
    }
    const report={added:0,updated:0,removed:0,total:marks.length,at:Date.now()};
    const jobs=await all('changes');
    await change(['marks','info','notes','links','changes'],tx=>{
      const store=tx.objectStore('marks');
      for(const m of marks) if(JSON.stringify(m)!==JSON.stringify(previous.get(m.id))){store.put(m);if(previous.has(m.id))report.updated++;else report.added++;}
      for(const m of old) if(!ids.has(m.id)){store.delete(m.id);report.removed++;}
      for(const n of notes) if(!ids.has(n.id)) tx.objectStore('notes').delete(n.id);
      for(const i of info) if(!attachedKeys.has(i.key)) tx.objectStore('info').delete(i.key);
      for(const link of links)if(liveKeys.get(link.id)!==link.key)tx.objectStore('links').delete(link.id);
      for(const job of jobs)if(!ids.has(job.id))tx.objectStore('changes').delete(job.id);
    });
    syncReport=report;
    if(report.added||report.updated||report.removed){
      const latest=marks.find(m=>!previous.has(m.id))??marks.find(m=>JSON.stringify(m)!==JSON.stringify(previous.get(m.id)))??old.find(m=>!ids.has(m.id));
      await chrome.storage.session.set({bookmarkUpdate:{...report,title:latest?.title??''},indexRevision:crypto.randomUUID()});
    }
  }));
  return syncTail;
}
async function initialize(){
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await sync();
  await chrome.alarms.create('index',{periodInMinutes:1});
}
chrome.runtime.onInstalled.addListener(()=>void initialize());
chrome.runtime.onStartup.addListener(()=>void initialize());
let importing=false;
chrome.bookmarks.onImportBegan.addListener(()=>{importing=true;void chrome.storage.session.set({importing:true});});
chrome.bookmarks.onImportEnded.addListener(()=>{importing=false;void chrome.storage.session.remove('importing');void sync();});
let wakeTimer:ReturnType<typeof setTimeout>;
function wakeChanges(){
  clearTimeout(wakeTimer);wakeTimer=setTimeout(()=>void runBatch(),1200);
}
chrome.storage.onChanged.addListener((updates,area)=>{
  if(area==='local'&&(updates.base||updates.model||updates.token))wakeChanges();
});
function bookmarkEvent(id:string,changed:boolean){
  if(importing)return;
  void locked(async()=>{
    if((await chrome.storage.session.get('importing')).importing)return;
    await change(['changes'],tx=>tx.objectStore('changes').put({id,ticket:crypto.randomUUID(),changed,due:0,attempt:0} satisfies AutoJob));
  }).then(async()=>{await sync();wakeChanges();});
}
chrome.bookmarks.onCreated.addListener((id,node)=>{if(node.url)bookmarkEvent(id,false);else if(!importing)void sync();});
chrome.bookmarks.onChanged.addListener((id,details)=>{if(details.url!==undefined)bookmarkEvent(id,true);else {
  void chrome.bookmarks.get(id).then(([node])=>{if(node?.url)bookmarkEvent(id,true);else void sync();},()=>void sync());
}});
for(const event of [chrome.bookmarks.onRemoved,chrome.bookmarks.onMoved])event.addListener(()=>void sync());
// Incremental changes are enabled by default, but an explicit folder exclusion applies.
function allowAuto(row:Row,rules:Rules){return row.ancestors.reduce((state,id)=>rules[id]??state,true);}

async function batch() {
  if(!folders.length)await sync();else await syncTail;
  const epoch=generation, grouped=new Map<string,Row[]>();
  const initial=await config(), pending=await all('changes');
  if(!initial.base||!initial.model||(!initial.running&&!pending.length))return;
  const jobs=new Map(pending.map(j=>[j.id,j]));
  for(const row of await rows()){
    const job=jobs.get(row.id);
    if(job&&(!row.safe||!allowAuto(row,initial.rules))){
      await change(['changes'],tx=>{const store=tx.objectStore('changes'),read=store.get(row.id);read.onsuccess=()=>{if(read.result?.ticket===job.ticket)store.delete(row.id);};});
      jobs.delete(row.id);
    }
    const automatic=jobs.has(row.id)&&job!.due<=Date.now();
    const manual=initial.running&&included(row.ancestors,initial.rules)&&(!row.info||retryable(row.info,initial.startedAt));
    if(!row.safe||(!automatic&&!manual))continue;
    const group=grouped.get(row.key)??[];group.push(row);grouped.set(row.key,group);
  }
  const cache=new Map((await all('info')).map(info=>[info.key,info]));
  const groups=grouped.entries();
  type Settings=Awaited<ReturnType<typeof config>>;
  type Task={key:string;group:Row[];mark:Row};
  const eligible=(row:Row,c:Settings)=>Boolean(jobs.has(row.id)&&jobs.get(row.id)!.due<=Date.now()&&allowAuto(row,c.rules))||(c.running&&included(row.ancestors,c.rules));
  type Outcome={task:Task;record:Info;failed:boolean};
  async function saveBatch(outcomes:Outcome[],c:Settings){
    await locked(async()=>{
      if(epoch!==generation)return;
      const latest=await config();
      await change(['marks','info','links','changes'],tx=>{
        for(const {task:{key,group},record,failed} of outcomes){
          for(const candidate of group){
            if(!eligible(candidate,c))continue;
            const queued=jobs.get(candidate.id);
            const request=tx.objectStore('marks').get(candidate.id);
            request.onsuccess=()=>{
              const live=request.result;
              if(live?.key!==key||live.title!==candidate.title)return;
              const persist=()=>{tx.objectStore('info').put(record);tx.objectStore('links').put({id:live.id,key});};
              if(!queued){if(included(live.ancestors,latest.rules))persist();return;}
              const store=tx.objectStore('changes'),read=store.get(live.id);
              read.onsuccess=()=>{
                if(read.result?.ticket!==queued.ticket||!allowAuto(live,latest.rules))return;
                persist();
                if(failed&&queued.attempt<3)store.put({...queued,changed:true,attempt:queued.attempt+1,due:Date.now()+60000*2**queued.attempt});
                else store.delete(live.id);
              };
            };
          }
        }
      });
      await chrome.storage.session.set({indexRevision:crypto.randomUUID()});
    });
  }
  for(let call=0;call<4;call++){
    const c=await config();
    if(epoch!==generation)return;
    const tasks:Task[]=[];
    let exhausted=false;
    while(tasks.length<4){
      const next=groups.next();
      if(next.done){exhausted=true;break;}
      const [key,group]=next.value;
      const mark=group.find(row=>eligible(row,c)&&jobs.get(row.id)?.changed)??group.find(row=>eligible(row,c));
      if(!mark)continue;
      const task={key,group,mark}, info=cache.get(key), job=jobs.get(mark.id);
      if(!info||job?.changed||(job&&info.status!=='done')||(c.running&&retryable(info,c.startedAt)))tasks.push(task);
      else await saveBatch([{task,record:info,failed:false}],c);
    }
    if(tasks.length){
      if(epoch!==generation)return;
      const marks=tasks.map(task=>task.mark);
      current={id:marks.map(m=>m.id).join(','),title:marks.map(m=>m.title).join(listSeparator()),url:marks.length===1?marks[0].safe:'',ancestors:[...new Set(marks.flatMap(m=>m.ancestors))],count:marks.length};
      await chrome.storage.local.set({used:c.used+1});
      let results:Map<string,Info|Error>;
      try{results=await describeBatch(c,marks);}
      catch(error){results=new Map(marks.map(m=>[m.key,error instanceof Error?error:Error(t('errRequestFailed'))]));}
      const outcomes=tasks.map(task=>{
        const result=results.get(task.key)!;
        if(result instanceof Error){
          const old=cache.get(task.key);
          const prior=old?.status==='done'?old:{key:task.key,status:'error' as const,summary:'',tags:[],source:'',evidence:''};
          return {task,record:{...prior,at:Date.now(),note:result.message},failed:true};
        }
        return {task,record:result,failed:false};
      });
      await saveBatch(outcomes,c);
      current=null;
    }
    if(exhausted)break;
    if(call===3)return;
  }
  if(initial.running&&epoch===generation&&(await config()).startedAt===initial.startedAt)await chrome.storage.local.set({running:false});
}
let active:Promise<void>|undefined;
function runBatch(){return active??=batch().finally(()=>{active=undefined;current=null;});}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='index')void runBatch();});

async function handle(message:{type:string;id?:string;text?:string;query?:string;enabled?:boolean}) {
  if(['scope','clearFolder','clearAll'].includes(message.type)&&!folders.length)await sync();
  switch(message.type){
    case 'sync':await sync();await syncTail;return syncReport;
    case 'rows':if(!folders.length)await sync();else await syncTail;return rows();
    case 'progress':return current;
    case 'folders':if(!folders.length)await sync();return folders;
    case 'scope':return locked(async()=>{
      const folder=folders.find(f=>f.id===message.id);
      if(!folder||typeof message.enabled!=='boolean')throw Error(t('errFolderChanged'));
      const {rules}=await config();
      for(const child of folders)if(child.ancestors.includes(folder.id))delete rules[child.id];
      rules[folder.id]=message.enabled;
      await chrome.storage.local.set({rules});return true;
    });
    case 'clearFolder':
    case 'clearAll':return locked(async()=>{
      const whole=message.type==='clearAll';
      if(!whole&&!folders.some(f=>f.id===message.id))throw Error(t('errFolderChanged'));
      generation++;await chrome.storage.local.set({running:false});
      const [marks,links,info]=await Promise.all([all('marks'),all('links'),all('info')]);
      const targets=new Set(marks.filter(m=>whole||m.ancestors.includes(message.id!)).map(m=>m.id));
      const keep=new Set(links.filter(l=>!targets.has(l.id)).map(l=>l.key));
      await change(['links','info','changes'],tx=>{
        if(whole){tx.objectStore('links').clear();tx.objectStore('info').clear();tx.objectStore('changes').clear();return;}
        for(const id of targets){tx.objectStore('links').delete(id);tx.objectStore('changes').delete(id);}
        for(const entry of info)if(!keep.has(entry.key))tx.objectStore('info').delete(entry.key);
      });await chrome.storage.session.set({indexRevision:crypto.randomUUID()});return true;
    });
    case 'start':{
      const c=await config();
      if(!c.base||!c.model)throw Error(t('errConfigRequired'));
      if(c.running)return true;
      await chrome.storage.local.set({running:true,startedAt:Date.now()});
      await chrome.alarms.create('index',{periodInMinutes:1});void runBatch();return true;
    }
    case 'pause':await chrome.storage.local.set({running:false});return true;
    case 'note':await change(['notes'],tx=>tx.objectStore('notes').put({id:message.id,text:(message.text??'').slice(0,1000)}));return true;
    case 'test':await ask(await config(),isZh()?'输出 {"ok":true}':'Output {"ok":true}',{test:true});return true;
    case 'query':{
      const q=(message.query??'').slice(0,600);
      const instruction=isZh()
        ?'提取与搜索意图直接相关的短语。输出 {"terms":["检索短语"],"concepts":[["必须出现的核心主题","同义词或译名"]],"folder":""}。每组列举同一概念的可互换表达，各组均须匹配，请只列必要概念，不确定就少列。不要用相关平台、工具或背景词代替专名。对于“yum安装和卸载程序”，可用 [["yum","yellowdog updater modified"],["安装","卸载","install","remove","erase","uninstall"]]，不要用 Linux 或 CentOS 代替 yum。时间及文件夹不放入概念。明确指定文件夹时提取名称。'
        :'Extract phrases directly relevant to the search intent. Output {"terms":["search phrase"],"concepts":[["core topic that must appear","synonym or translation"]],"folder":""}. Each concept group lists interchangeable ways to express the same concept; every group must match, so include only essential concepts and omit uncertain ones. Do not substitute broader platforms, tools, or background words for specific names. For "install and uninstall software with yum", use [["yum","yellowdog updater modified"],["install","uninstall","remove","erase","安装","卸载"]], and do not replace yum with Linux or CentOS. Do not put time ranges or folder names in concepts. Extract folder only when the user explicitly names one.';
      const value=await ask(await config(),instruction,{query:q});
      if(!Array.isArray(value?.terms))throw Error(t('errNoSearchTerms'));
      const concepts:string[][]=[];
      if(Array.isArray(value.concepts))for(const group of value.concepts.slice(0,5)){
        if(!Array.isArray(group))continue;
        const aliases=group.filter((s):s is string=>typeof s==='string').map(s=>s.trim().toLowerCase().slice(0,100)).filter(Boolean).slice(0,12);
        if(aliases.length)concepts.push(aliases);
      }
      return {terms:value.terms.filter((s:unknown)=>typeof s==='string').slice(0,12),concepts,folder:typeof value.folder==='string'?value.folder:''};
    }
    default:throw Error(t('errUnknownAction'));
  }
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  handle(msg).then(value=>reply({value}),e=>reply({error:e instanceof Error?e.message:t('errRequestFailed')}));return true;
});
