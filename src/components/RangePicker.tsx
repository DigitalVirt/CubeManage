import {useEffect,useRef,useState} from 'react';
import {Button} from '@heroui/react';
import {CalendarRange} from 'lucide-react';
import {dayClock} from './LineChart';

/** 图表时间范围：null 表示默认的“最近 3 天”。st / et 为毫秒时间戳。 */
export type Range={st:number;et:number}|null;
const DAY=86400000,MAX=31*DAY;
const presets:[string,number][]=[['最近 1 天',1],['最近 3 天',3],['最近 7 天',7],['最近 15 天',15],['最近 30 天',30]];
/** 毫秒 → datetime-local 输入框的本地时间字符串 */
const toInput=(t:number)=>{const d=new Date(t-new Date(t).getTimezoneOffset()*60000);return d.toISOString().slice(0,16);};

/**
 * 点击图表右上角的时间范围，弹出面板：快捷选择最近 1 / 3 / 7 / 15 / 30 天，或自选开始和结束时间（最长 31 天）。
 * 面板之外点击或按 Esc 关闭。所有图表共用一个时间范围。
 */
export function RangePicker({range,start,end,onChange}:{range:Range;start:number;end:number;onChange:(r:Range)=>void}){
 const [open,setOpen]=useState(false),[from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState('');
 const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;setFrom(toInput(start));setTo(toInput(end));setError('');
  const close=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc);};},[open]);
 function preset(n:number){onChange(n===3?null:{st:Date.now()-n*DAY,et:Date.now()});setOpen(false);}
 function apply(){
  const st=new Date(from).getTime(),et=new Date(to).getTime();
  if(!Number.isFinite(st)||!Number.isFinite(et))return setError('请选择开始和结束时间');
  if(et<=st)return setError('结束时间要晚于开始时间');
  if(et-st>MAX)return setError('时间范围最长 31 天');
  if(et-st<15*60000)return setError('时间范围至少 15 分钟');
  onChange({st,et:Math.min(et,Date.now())});setOpen(false);
 }
 return <div className="range-picker" ref={box}>
  <Button size="sm" variant="ghost" className="rp-trigger" aria-expanded={open} aria-haspopup="dialog" onPress={()=>setOpen(o=>!o)}>
   <CalendarRange size={13}/><span className="num">{dayClock(start)} – {dayClock(end)}</span>
  </Button>
  {open&&<div className="rp-panel" role="dialog" aria-label="选择时间范围">
   <div className="rp-presets">{presets.map(([t,n])=><button key={n} type="button" className={!range&&n===3?'is-active':''} onClick={()=>preset(n)}>{t}</button>)}</div>
   <label className="rp-field"><span>开始时间</span><input type="datetime-local" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="rp-field"><span>结束时间</span><input type="datetime-local" value={to} min={from||undefined} max={toInput(Date.now())} onChange={e=>setTo(e.target.value)}/></label>
   {error&&<p className="rp-error">{error}</p>}
   <div className="rp-actions"><Button size="sm" variant="outline" onPress={()=>setOpen(false)}>取消</Button><Button size="sm" onPress={apply}>应用</Button></div>
  </div>}
 </div>;
}
