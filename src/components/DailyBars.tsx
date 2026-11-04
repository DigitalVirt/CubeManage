import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';

/**
 * 每天进出流量的柱状图：每天一组两根柱子（进 / 出），纵轴按最大值取整，悬停显示当天的进、出和合计。
 * 天数多时柱子自动变窄，日期标签按宽度隔几天显示一个。
 */
type Day={day:string;in:number;out:number};
const IN='#16a34a',OUT='#2563eb';
const niceMax=(v:number)=>{if(!(v>0))return 1;const p=10**Math.floor(Math.log10(v));const n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;};
const md=(day:string)=>{const [,m,d]=day.split('-');return Number(m)+'/'+Number(d);};

export function DailyBars({days,format,label,height=300,rangeControl}:{days:Day[];format:(v:number)=>string;label:string;height?:number;rangeControl?:ReactNode}){
 const box=useRef<HTMLDivElement>(null),[width,setWidth]=useState(560),[hover,setHover]=useState<number|null>(null);
 useEffect(()=>{const el=box.current;if(!el)return;const ro=new ResizeObserver(([e])=>setWidth(Math.max(240,Math.round(e.contentRect.width))));ro.observe(el);return()=>ro.disconnect();},[]);
 const pad={l:64,r:12,t:10,b:26},w=width-pad.l-pad.r,h=height-pad.t-pad.b;
 const max=useMemo(()=>niceMax(Math.max(0,...days.flatMap(d=>[d.in,d.out]))),[days]);
 const slot=days.length?w/days.length:w,bar=Math.max(2,Math.min(28,slot*.34)),gap=Math.min(4,bar*.2);
 const y=(v:number)=>pad.t+h-(Math.max(0,v)/max)*h;
 const every=Math.max(1,Math.ceil(days.length/Math.max(1,Math.floor(w/48))));
 const cx=(i:number)=>pad.l+slot*(i+.5);
 const hx=hover!=null?cx(hover):0;
 return <div className="zoom-chart">
  <div className="zc-bar"><div className="lc-legend"><span><i style={{background:IN}}/>进</span><span><i style={{background:OUT}}/>出</span></div><div className="zc-range">{rangeControl}</div></div>
  <div className="line-chart" ref={box}>
   <svg width={width} height={height} role="img" aria-label={label} onPointerMove={e=>{if(!days.length)return;const r=e.currentTarget.getBoundingClientRect();const i=Math.floor((e.clientX-r.left-pad.l)/slot);setHover(i>=0&&i<days.length?i:null);}} onPointerLeave={()=>setHover(null)}>
    {[0,.25,.5,.75,1].map(f=>f*max).map(v=><g key={v}><line x1={pad.l} x2={pad.l+w} y1={y(v)} y2={y(v)} className="lc-grid"/><text x={pad.l-8} y={y(v)} className="lc-tick" textAnchor="end" dominantBaseline="middle">{format(v)}</text></g>)}
    {hover!=null&&<rect x={pad.l+slot*hover} y={pad.t} width={slot} height={h} className="db-hover"/>}
    {days.map((d,i)=><g key={d.day}>
     <rect x={cx(i)-bar-gap/2} y={y(d.in)} width={bar} height={Math.max(0,pad.t+h-y(d.in))} rx={Math.min(3,bar/3)} fill={IN}/>
     <rect x={cx(i)+gap/2} y={y(d.out)} width={bar} height={Math.max(0,pad.t+h-y(d.out))} rx={Math.min(3,bar/3)} fill={OUT}/>
     {i%every===0&&<text x={cx(i)} y={height-6} className="lc-tick" textAnchor="middle">{md(d.day)}</text>}
    </g>)}
   </svg>
   {!days.length&&<div className="zc-empty">暂无数据</div>}
   {hover!=null&&days[hover]&&<div className="lc-tip" style={{left:Math.min(hx+12,width-180)}}><strong>{days[hover].day}</strong>
    <span><i style={{background:IN}}/>进<b>{format(days[hover].in)}</b></span><span><i style={{background:OUT}}/>出<b>{format(days[hover].out)}</b></span><span>合计<b>{format(days[hover].in+days[hover].out)}</b></span></div>}
  </div>
 </div>;
}
