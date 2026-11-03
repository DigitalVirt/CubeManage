import {useEffect,useRef,useState} from 'react';
import {InputGroup,Skeleton} from '@heroui/react';
import {CornerDownLeft,Search,Server,User} from 'lucide-react';
import {api} from '../lib/api';

const isMac=typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);
type Hit={kind:'host';id:number;hostname:string;node_name:string;mainip:string}|{kind:'user';id:number;username:string;email:string};

/**
 * Global search (GET /api/search → 全局搜索, v1/global_search): instances and users as you type.
 * An instance opens its detail page; a user opens the instance list filtered to that user (v1/clouds?user=).
 * Results navigate on click; mousedown only keeps focus in the input so the panel stays open until then.
 * ⌘K on macOS, Ctrl+K elsewhere focuses it from anywhere. ↑/↓ move, Enter opens the highlighted
 * result (or searches the instance list when nothing is highlighted), Esc closes.
 */
export function HeaderSearch({onOpen}:{onOpen:(path:string)=>void}){
 const input=useRef<HTMLInputElement>(null),box=useRef<HTMLDivElement>(null);
 const [value,setValue]=useState(''),[open,setOpen]=useState(false),[hits,setHits]=useState<Hit[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(-1);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();input.current?.focus();input.current?.select();setOpen(true);}};
  const away=(e:PointerEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false);};
  window.addEventListener('keydown',key);document.addEventListener('pointerdown',away);
  return()=>{window.removeEventListener('keydown',key);document.removeEventListener('pointerdown',away);};
 },[]);
 useEffect(()=>{
  const q=value.trim();setActive(-1);setError('');
  if(!q){setHits(null);setLoading(false);return;}
  let live=true;setLoading(true);
  const t=setTimeout(()=>{api(`/search?q=${encodeURIComponent(q)}`).then(r=>{if(live)setHits([...r.hosts.map((h:any)=>({kind:'host',...h})),...r.users.map((u:any)=>({kind:'user',...u}))]);}).catch(e=>{if(live){setHits([]);setError(e.message);}}).finally(()=>{if(live)setLoading(false);});},250);
  return()=>{live=false;clearTimeout(t);};
 },[value]);
 function go(hit?:Hit){
  const q=value.trim();
  const path=hit?(hit.kind==='host'?`/clouds/${hit.id}`:`/clouds?user=${hit.id}&username=${encodeURIComponent(hit.username)}`):q?`/clouds?search=${encodeURIComponent(q)}`:'';
  if(!path)return;setOpen(false);input.current?.blur();onOpen(path);
 }
 function keys(e:React.KeyboardEvent){
  const n=hits?.length||0;
  if(e.key==='ArrowDown'&&n){e.preventDefault();setOpen(true);setActive(a=>(a+1)%n);}
  else if(e.key==='ArrowUp'&&n){e.preventDefault();setActive(a=>(a<=0?n:a)-1);}
  else if(e.key==='Enter'){e.preventDefault();go(active>=0&&hits?hits[active]:undefined);}
  else if(e.key==='Escape'){if(open&&value)setOpen(false);else{setValue('');input.current?.blur();}}
 }
 const hosts=(hits||[]).filter(h=>h.kind==='host'),users=(hits||[]).filter(h=>h.kind==='user');
 const row=(h:Hit)=>{const i=hits!.indexOf(h);return <li key={h.kind+h.id} id={'gs-'+i} role="option" aria-selected={i===active} className={'gs-item'+(i===active?' is-active':'')} onPointerEnter={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>go(h)}>
  {h.kind==='host'?<><Server size={16}/><span className="gs-main"><strong>{h.hostname||'实例 #'+h.id}</strong><small>#{h.id}{h.node_name?' · '+h.node_name:''}</small></span><span className="gs-side mono">{h.mainip}</span></>
   :<><User size={16}/><span className="gs-main"><strong>{h.username}</strong><small>#{h.id} · 查看该用户的实例</small></span><span className="gs-side">{h.email}</span></>}
 </li>;};
 const show=open&&value.trim()!=='';
 return <div className="header-search-wrap" ref={box}>
  <InputGroup className="header-search">
   <InputGroup.Prefix><Search size={16}/></InputGroup.Prefix>
   <InputGroup.Input ref={input} type="search" role="combobox" aria-label="全局搜索" aria-expanded={show} aria-controls="global-search-results" aria-activedescendant={active>=0?'gs-'+active:undefined} aria-keyshortcuts={isMac?'Meta+K':'Control+K'}
    placeholder="搜索实例、IP、用户" value={value} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onChange={e=>{setValue(e.target.value);setOpen(true);}} onKeyDown={keys}/>
   <InputGroup.Suffix><kbd className="header-search-kbd" aria-hidden="true">{isMac?<><span className="kbd-cmd">⌘</span>K</>:<>Ctrl K</>}</kbd></InputGroup.Suffix>
  </InputGroup>
  {show&&<div className="gs-panel" id="global-search-results">
   {loading&&!hits?<div className="gs-skeleton" aria-busy="true" aria-label="正在搜索">{[0,1,2].map(i=><div key={i} className="gs-sk-row"><Skeleton animationType="pulse" className="gs-sk-icon"/><span><Skeleton animationType="pulse" className="gs-sk-line" style={{width:['60%','45%','70%'][i]}}/><Skeleton animationType="pulse" className="gs-sk-line is-sub" style={{width:['35%','50%','30%'][i]}}/></span></div>)}</div>:error?<div className="gs-state is-error">{error}</div>:hits&&!hits.length?<div className="gs-state">没有找到“{value.trim()}”相关的实例或用户</div>:hits&&<ul role="listbox" aria-label="搜索结果">
    {hosts.length>0&&<li className="gs-group" role="presentation">实例</li>}{hosts.map(row)}
    {users.length>0&&<li className="gs-group" role="presentation">用户</li>}{users.map(row)}
   </ul>}
   <div className="gs-foot"><span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd><CornerDownLeft size={11}/></kbd>打开</span><span><kbd>Esc</kbd>关闭</span><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>go()}>在实例列表中搜索“{value.trim()}”</button></div>
  </div>}
 </div>;
}
