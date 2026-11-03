import {useEffect,useMemo,useRef,useState} from 'react';

export type Series={name:string;color:string;values:number[]};
type Props={times:number[];series:Series[];format:(v:number)=>string;timeFormat?:(t:number)=>string;height?:number;area?:boolean;axes?:boolean;label:string};

const niceMax=(v:number)=>{if(!(v>0))return 1;const p=10**Math.floor(Math.log10(v));const n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;};
export const clock=(t:number)=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
export const dayClock=(t:number)=>{const d=new Date(t);return (d.getMonth()+1)+'/'+d.getDate()+' '+clock(t);};

/** A small SVG line chart: y axis with five ticks, time axis, a crosshair with values on hover. Width follows the container. */
export function LineChart({times,series,format,timeFormat=clock,height=220,area=false,axes=true,label}:Props){
 const box=useRef<HTMLDivElement>(null),[width,setWidth]=useState(640),[hover,setHover]=useState<number|null>(null);
 useEffect(()=>{const el=box.current;if(!el)return;const ro=new ResizeObserver(([e])=>setWidth(Math.max(200,Math.round(e.contentRect.width))));ro.observe(el);return()=>ro.disconnect();},[]);
 const pad=axes?{l:72,r:12,t:10,b:26}:{l:0,r:0,t:4,b:0};const w=width-pad.l-pad.r,h=height-pad.t-pad.b;
 const max=useMemo(()=>niceMax(Math.max(0,...series.flatMap(s=>s.values))),[series]);
 const t0=times[0]??0,t1=times[times.length-1]??1,span=Math.max(1,t1-t0);
 const x=(t:number)=>pad.l+(t-t0)/span*w,y=(v:number)=>pad.t+h-(v/max)*h;
 const ticks=[0,.25,.5,.75,1].map(f=>f*max);
 // Ticks on round local times: the smallest step that keeps the labels at least ~110px apart.
 const timeTicks=useMemo(()=>{const H=3600000,max=Math.max(2,Math.floor(w/110));const step=[H/4,H/2,H,2*H,3*H,6*H,12*H,24*H,48*H,7*24*H].find(s=>span/s<=max)??14*24*H;const off=new Date(t0).getTimezoneOffset()*60000;const out:number[]=[];for(let t=Math.ceil((t0-off)/step)*step+off;t<=t1;t+=step)out.push(t);return out;},[w,t0,t1,span]);
 const path=(vals:number[])=>vals.map((v,i)=>(i?'L':'M')+x(times[i]).toFixed(1)+' '+y(v).toFixed(1)).join('');
 function move(e:React.PointerEvent<SVGSVGElement>){if(!times.length)return;const r=e.currentTarget.getBoundingClientRect();const t=t0+(e.clientX-r.left-pad.l)/w*span;let best=0;for(let i=1;i<times.length;i++)if(Math.abs(times[i]-t)<Math.abs(times[best]-t))best=i;setHover(best);}
 const hx=hover!=null?x(times[hover]):0;
 return <div className="line-chart" ref={box}>
  <svg width={width} height={height} role="img" aria-label={label} onPointerMove={move} onPointerLeave={()=>setHover(null)}>
   {axes&&ticks.map(v=><g key={v}><line x1={pad.l} x2={pad.l+w} y1={y(v)} y2={y(v)} className="lc-grid"/><text x={pad.l-10} y={y(v)} className="lc-tick" textAnchor="end" dominantBaseline="middle">{format(v)}</text></g>)}
   {axes&&timeTicks.map(t=><text key={t} x={x(t)} y={height-6} className="lc-tick" textAnchor="middle">{timeFormat(t)}</text>)}
   {series.map(s=>s.values.length>0&&<g key={s.name}>{area&&<path d={path(s.values)+`L${x(times[s.values.length-1]).toFixed(1)} ${pad.t+h}L${x(times[0]).toFixed(1)} ${pad.t+h}Z`} fill={s.color} opacity={.12}/>}<path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={axes?1.75:1.25} strokeLinejoin="round" strokeLinecap="round"/></g>)}
   {hover!=null&&axes&&<g><line x1={hx} x2={hx} y1={pad.t} y2={pad.t+h} className="lc-cross"/>{series.map(s=>s.values[hover]!=null&&<circle key={s.name} cx={hx} cy={y(s.values[hover])} r={3.5} fill="var(--background)" stroke={s.color} strokeWidth={2}/>)}</g>}
  </svg>
  {hover!=null&&axes&&<div className="lc-tip" style={{left:Math.min(hx+12,width-170)}}><strong>{dayClock(times[hover])}</strong>{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}<b>{format(s.values[hover]??0)}</b></span>)}</div>}
 </div>;
}
export function Legend({series}:{series:{name:string;color:string}[]}){return <div className="lc-legend">{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}</span>)}</div>;}
