import {useEffect,useRef} from 'react';
import type {Row} from '../lib/api';
import type {Progress} from '../lib/chunks';
import {TaskStatus} from './TaskStatus';

const text={run:'正在提交…',ok:'已提交',fail:'失败',skip:'已停止，未提交',wait:'排队中'};

/** 批量提交的进度：总进度条 + 每个实例的状态（排队中 / 正在提交 / 已提交 / 失败 / 已停止）。 */
export function BatchProgress({title,rows,progress,okText='已提交'}:{title:string;rows:Row[];progress:Progress;okText?:string}){
 const failed=Object.values(progress.items).filter(x=>x.state==='fail').length;
 // 列表按原顺序显示，自动滚动到当前正在提交的那一行（没有在提交的就停在最后一个完成的），始终可见。
 // 只滚动列表自身，不带动整个对话框或页面。
 const listRef=useRef<HTMLUListElement>(null);
 useEffect(()=>{const list=listRef.current;if(!list)return;
  const target=list.querySelector<HTMLElement>('li.is-run')||[...list.querySelectorAll<HTMLElement>('li.is-ok,li.is-fail,li.is-skip')].pop();
  if(!target)return;
  // 用实际位置计算，不依赖父元素的定位方式：目标行相对列表内容顶部的位置
  const top=target.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop,bottom=top+target.offsetHeight;
  if(top<list.scrollTop||bottom>list.scrollTop+list.clientHeight)list.scrollTo({top:Math.max(0,top-(list.clientHeight-target.offsetHeight)/2),behavior:'smooth'});
 },[progress]);
 return <div className="batch-progress" role="status" aria-live="polite">
  <div className="batch-progress-head"><strong>{title}</strong><span className="num">{progress.done} / {progress.total}{failed?` · 失败 ${failed}`:''}</span></div>
  <div className="batch-progress-bar" aria-hidden="true"><i style={{width:(progress.total?progress.done/progress.total*100:0)+'%'}}/></div>
  <ul className="batch-progress-list" ref={listRef}>{rows.map(r=>{const id=Number(r.id),it=progress.items[id]||{state:'wait'};return <li key={id} className={'is-'+it.state}>
   <TaskStatus status={it.state==='run'?1:it.state==='ok'?2:it.state==='fail'?3:it.state==='skip'?5:0} msg={it.error}/>
   <span className="batch-progress-name">{r.hostname||'#'+id}</span>
   <small>{it.state==='ok'?okText:it.state==='fail'?it.error||text.fail:text[it.state]}</small>
  </li>;})}</ul>
 </div>;
}
