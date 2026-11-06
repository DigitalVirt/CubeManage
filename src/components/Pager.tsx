import {Button} from '@heroui/react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Choice} from './Controls';
import {PAGE_SIZES} from '../lib/urlState';

/** Page numbers to show: first, last and a window around the current page; 0 marks a gap. */
export function pageList(current:number,total:number){const out:number[]=[];for(let n=1;n<=total;n++){if(n===1||n===total||Math.abs(n-current)<=1){if(out.length&&n-out[out.length-1]>1)out.push(0);out.push(n);}}return out;}

/** `total` (when given) shows “共 N 条” left of the page-size select. */
export function Pager({page,totalPages,perPage,loading,onPage,onPerPage,total:count,sizes=PAGE_SIZES}:{page:number;totalPages:number;perPage:number;loading:boolean;onPage:(n:number)=>void;onPerPage:(n:number)=>void;total?:number|null;sizes?:number[]}){
 const total=Math.max(1,totalPages);
 return <nav className="pager" aria-label="分页">
  {count!==undefined&&<span className="pager-total">共 {count??'—'} 条</span>}
  <Choice aria-label="每页数量" value={perPage} onChange={e=>onPerPage(Number(e.target.value))}>{sizes.map(n=><option key={n} value={n}>{n+' 条'}</option>)}</Choice>
  <Button variant="ghost" size="sm" isIconOnly aria-label="上一页" isDisabled={loading||page<=1} onPress={()=>onPage(page-1)}><ChevronLeft size={16}/></Button>
  {pageList(page,total).map((n,i)=>n===0?<span key={'gap'+i} className="pager-gap" aria-hidden="true">…</span>:<Button key={n} size="sm" isIconOnly variant={n===page?'primary':'ghost'} aria-label={'第 '+n+' 页'} aria-current={n===page?'page':undefined} isDisabled={loading&&n!==page} onPress={()=>onPage(n)}>{n}</Button>)}
  <Button variant="ghost" size="sm" isIconOnly aria-label="下一页" isDisabled={loading||page>=total} onPress={()=>onPage(page+1)}><ChevronRight size={16}/></Button>
 </nav>;
}
