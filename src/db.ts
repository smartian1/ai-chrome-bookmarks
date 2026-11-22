import {defaults, type Config, type Info, type Mark, type Row} from './core';
type Note={id:string;text:string};
export type AutoJob={id:string;ticket:string;changed:boolean;due:number;attempt:number};
type Stores={marks:Mark; info:Info; notes:Note; links:{id:string;key:string}; changes:AutoJob};
let opening:Promise<IDBDatabase>|undefined;
function database() {
  return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('bookmark-trails',3);
    request.onupgradeneeded=event=>{
      const db=request.result;
      if(event.oldVersion===0)for(const [name,keyPath] of [['marks','id'],['info','key'],['notes','id']]) db.createObjectStore(name,{keyPath});
      db.createObjectStore('changes',{keyPath:'id'});
      if(event.oldVersion>=2)return;
      const links=db.createObjectStore('links',{keyPath:'id'});
      if(event.oldVersion===1){
        const tx=request.transaction!,keys=tx.objectStore('info').getAllKeys();
        keys.onsuccess=()=>{
          const existing=new Set(keys.result),marks=tx.objectStore('marks').openCursor();
          marks.onsuccess=()=>{const cursor=marks.result;if(!cursor)return;
            const mark=cursor.value as Mark;if(existing.has(mark.key))links.put({id:mark.id,key:mark.key});cursor.continue();};
        };
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
export async function all<K extends keyof Stores>(name:K):Promise<Stores[K][]> {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(name).objectStore(name).getAll();
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
export async function change(names:(keyof Stores)[],write:(tx:IDBTransaction)=>void) {
  const db=await database();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(names,'readwrite');
    tx.oncomplete=()=>resolve(); tx.onabort=()=>reject(tx.error); write(tx);
  });
}
export async function rows():Promise<Row[]> {
  const [marks,info,notes,links]=await Promise.all([all('marks'),all('info'),all('notes'),all('links')]);
  const attached=new Map(links.map(link=>[link.id,link.key]));
  const byKey=new Map(info.map(v=>[v.key,v])), byId=new Map(notes.map(n=>[n.id,n.text]));
  return marks.map(r=>({...r,info:attached.get(r.id)===r.key?byKey.get(r.key):undefined,note:byId.get(r.id)}));
}
export async function config():Promise<Config> {return chrome.storage.local.get<Config>(defaults);}
export async function indexBytes(){
  const [info,links]=await Promise.all([all('info'),all('links')]);
  const encoder=new TextEncoder();
  return [...info,...links].reduce((total,row)=>total+encoder.encode(JSON.stringify(row)).byteLength,0);
}
