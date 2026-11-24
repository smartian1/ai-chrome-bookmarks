export type Mark = {id:string; title:string; url:string; folder:string; ancestors:string[]; date:number; key:string; root:boolean; host:string; safe:string};
export type Info = {key:string; summary:string; tags:string[]; evidence:string; source:string; at:number; status:'done'|'error'|'skipped'; note?:string};
export type Row = Mark & {info?:Info; note?:string};
export type Rules=Record<string,boolean>;
export type Config = {base:string; model:string; token:string; running:boolean; startedAt:number; used:number; rules:Rules};
export const defaults:Config = {base:'',model:'',token:'',running:false,startedAt:0,used:0,rules:{}};
export function included(ancestors:string[],rules:Rules){
  return ancestors.reduce((state,id)=>rules[id]??state,false);
}
export function retryable(info:Info,startedAt:number){
  return info.status!=='done'&&info.at<startedAt;
}
export type Folder={id:string;title:string;ancestors:string[];path:string};
export function foldersOf(nodes:chrome.bookmarks.BookmarkTreeNode[],ancestors:string[]=[],path='',rootTitle='All folders'):Folder[]{
  return nodes.flatMap(node=>{
    if(node.url)return [];
    const parents=[...ancestors,node.id], name=[path,node.title].filter(Boolean).join(' / ');
    return [{id:node.id,title:node.title||rootTitle,ancestors:parents,path:name},...foldersOf(node.children??[],parents,name,rootTitle)];
  });
}

export function publicPage(raw:string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port ||
        !host.includes('.') || /(?:^|\.)\d+$|:|\.$|\.(?:local|localhost|internal|intranet|lan|test|invalid|home|arpa|onion|corp|private)$/.test(host) ||
        /(?:^|[./_-])(?:oauth|authorize|token|password|secret|invite|reset|login|signin|session|logout|auth)(?:[./_-]|$)/i.test(decodeURIComponent(u.pathname)) ||
        /[A-Za-z0-9_-]{32,}/.test(decodeURIComponent(u.pathname)) ||
        [...u.searchParams.keys()].some(k=>/token|pass|secret|key|code|session|auth|sign|email|credential/i.test(k))) return '';
    return u.origin + u.pathname;
  } catch { return ''; }
}
export function flatten(nodes:chrome.bookmarks.BookmarkTreeNode[], folder='',ancestors:string[]=[]):Mark[] {
  return nodes.flatMap(node=>{
    if (!node.url) return flatten(node.children??[],[folder,node.title].filter(Boolean).join(' / '),[...ancestors,node.id]);
    const safe = publicPage(node.url);
    const parsed = safe ? new URL(safe) : undefined;
    const root = parsed?.pathname==='/' && !new URL(node.url).search && !new URL(node.url).hash;
    const title=node.title.trim();
    // Keep query-specific pages distinct without transmitting their query strings.
    const key = root ? `site:${parsed!.origin}` : JSON.stringify([node.url,title]);
    return [{id:node.id,title,url:node.url,folder,ancestors,date:node.dateAdded??0,key,root,host:parsed?.hostname??'',safe}];
  });
}
export function monthRange(query:string, now=new Date()) {
  const q=query.toLowerCase();
  const offset=q.includes('上个月')||q.includes('上月')||/\b(?:last|previous)\s+month\b/.test(q)?-1:q.includes('本月')||q.includes('这个月')||/\bthis\s+month\b/.test(q)?0:null;
  return offset===null ? undefined : [new Date(now.getFullYear(),now.getMonth()+offset,1).getTime(),new Date(now.getFullYear(),now.getMonth()+offset+1,1).getTime()];
}
function tokens(text:string) {
  const lower=text.toLowerCase();
  const words=lower.match(/[a-z0-9]+|[\u3400-\u9fff]+/g)??[];
  return [...new Set(words.flatMap(w=>w.length>2 && /^[\u3400-\u9fff]/.test(w)?[w,...Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2))]:[w]))];
}
// In mixed-language queries, Latin names often identify the tool or format.
// Common English verbs and connectors are not identifying names.
const genericWords=new Set('a an the for and or with in on to how of is use using find tool tools app apps install installation uninstall remove software program setup config tutorial guide'.split(' '));
function wordMatch(text:string,term:string){
  if(!/^[a-z0-9]+$/i.test(term))return text.includes(term);
  return new RegExp(`(?:^|[^a-z0-9])${term}(?=$|[^a-z0-9])`,'i').test(text);
}
export function search(rows:Row[], query:string, extra:string[]=[], folder='', concepts:string[][]=[]) {
  const q=query.trim().toLowerCase(), terms=tokens(q), range=monthRange(q);
  const mixed=/[\u3400-\u9fff]/.test(q);
  const names=mixed?(q.match(/[a-z0-9]+/g)??[]).filter(t=>/[a-z]/.test(t)&&!genericWords.has(t)):[];
  const expansions=[...new Set(extra.map(t=>t.trim().toLowerCase()).filter(Boolean))];
  return rows.filter(r=>(!range || (r.date>=range[0] && r.date<range[1])) && (!folder || r.folder.toLowerCase().split(' / ').includes(folder.toLowerCase())))
    .map(r=>{
      const content=[r.title,r.host,r.note,r.info?.summary,...(r.info?.tags??[]),r.info?.evidence,r.safe||r.url].filter(Boolean).join('\n').toLowerCase();
      const searchable=content+'\n'+r.folder.toLowerCase();
      if(names.length&&!names.some(name=>wordMatch(searchable,name)))return {r,score:0};
      if(concepts.some(group=>!group.some(alias=>wordMatch(searchable,alias))))return {r,score:0};
      const fields:[string,number][]=[[r.title,9],[r.host,7],[r.note??'',10],[r.info?.summary??'',6],[(r.info?.tags??[]).join(' '),6],[r.folder,4],[r.safe||r.url,2],[r.info?.evidence??'',2]];
      let score=0;
      for(const [s,weight] of fields) {
        const value=s.toLowerCase();
        if(q && value===q) score+=weight*30;
        else if(q && value.includes(q)) score+=weight*5;
        for(const term of terms) if(value.includes(term)) score+=weight;
        for(const term of expansions) if(wordMatch(value,term)) score+=weight*0.5;
        for(const group of concepts) if(group.some(term=>wordMatch(value,term))) score+=weight;
      }
      return {r,score};
    }).filter(x=>!q || x.score>0 || (range && (/^(?:上个月|上月|本月|这个月)(?:收藏的?)?$/.test(q) || /^(?:(?:bookmarks?|saved|added)\s+(?:from|in)\s+)?(?:last|previous|this)\s+month$/.test(q))))
    .sort((a,b)=>b.score-a.score || b.r.date-a.r.date).slice(0,50).map(x=>x.r);
}
