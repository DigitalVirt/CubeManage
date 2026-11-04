import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Button} from '@heroui/react';
import {RotateCcw} from 'lucide-react';
import {clock,dayClock,type Series} from './LineChart';

/**
 * 可缩放的折线图（节点详情）：在图表上滚动鼠标滚轮，以鼠标所在时间为中心放大 / 缩小时间范围；
 * 按住拖动左右平移；双击或点“还原”回到全部时间范围。最小可放大到 15 分钟。
 * 纵轴按当前可见范围内的最大值自动调整；横轴刻度随范围变化（几天显示日期，一天以内显示时刻）。
 */
type Props={times:number[];series:Series[];format:(v:number)=>string;label:string;height?:number;area?:boolean};
const MIN_SPAN=15*60000;
const niceMax=(v:number)=>{if(!(v>0))return 1;const p=10**Math.floor(Math.log10(v));const n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;};
const dayLabel=(t:number)=>{const d=new Date(t);return (d.getMonth()+1)+'/'+d.getDate();};
const spanText=(ms:number)=>ms>=86400000?+(ms/86400000).toFixed(1)+' 天':ms>=3600000?+(ms/3600000).toFixed(1)+' 小时':Math.round(ms/60000)+' 分钟';

export function ZoomChart({times,series,format,label,height=220,area=true}:Props){
 const box=useRef<HTMLDivElement>(null),svgRef=useRef<SVGSVGElement>(null),clip='zc'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const [width,setWidth]=useState(560),[hover,setHover]=useState<number|null>(null);
 const full:[number,number]=[times[0]??0,times[times.length-1]??1];
 const [view,setView]=useState<[number,number]|null>(null);
 const [a,b]=view||full,span=Math.max(1,b-a);
 const zoomed=view!=null&&(view[0]>full[0]+1000||view[1]<full[1]-1000);
 useEffect(()=>{setView(null);},[full[0],full[1]]);
 useEffect(()=>{const el=box.current;if(!el)return;const ro=new ResizeObserver(([e])=>setWidth(Math.max(240,Math.round(e.contentRect.width))));ro.observe(el);return()=>ro.disconnect();},[]);
 const pad={l:64,r:12,t:10,b:26},w=width-pad.l-pad.r,h=height-pad.t-pad.b;

 // 可见的点：落在 [a,b] 内的点，两侧各多带一个，让线条延伸到边缘
 const [i0,i1]=useMemo(()=>{if(!times.length)return [0,-1];let lo=0;while(lo<times.length&&times[lo]<a)lo++;let hi=times.length-1;while(hi>=0&&times[hi]>b)hi--;return [Math.max(0,lo-1),Math.min(times.length-1,hi+1)];},[times,a,b]);
 const max=useMemo(()=>{let m=0;for(const s of series)for(let i=i0;i<=i1;i++){const v=s.values[i];if(v>m)m=v;}return niceMax(m);},[series,i0,i1]);
 const x=(t:number)=>pad.l+(t-a)/span*w,y=(v:number)=>pad.t+h-(Math.max(0,v)/max)*h;
 const timeTicks=useMemo(()=>{const M=60000,H=3600000,D=86400000,most=Math.max(2,Math.floor(w/96));
  const step=[5*M,10*M,15*M,30*M,H,2*H,3*H,6*H,12*H,D,2*D,7*D].find(s=>span/s<=most)??14*D;const off=new Date(a).getTimezoneOffset()*M;const out:number[]=[];
  for(let t=Math.ceil((a-off)/step)*step+off;t<=b;t+=step)out.push(t);return {ticks:out,step};},[a,b,span,w]);
 const tickText=(t:number)=>timeTicks.step>=86400000?dayLabel(t):span>86400000*1.5?dayClock(t):clock(t);
 const path=(vals:number[])=>{let d='';for(let i=i0;i<=i1;i++){if(vals[i]==null)continue;d+=(d?'L':'M')+x(times[i]).toFixed(1)+' '+y(vals[i]).toFixed(1);}return d;};

 // 滚轮缩放：需要非被动监听才能阻止页面滚动；以鼠标位置对应的时间为中心
 const stateRef=useRef({a,b,full,w,pad});stateRef.current={a,b,full,w,pad};
 useEffect(()=>{const el=svgRef.current;if(!el)return;
  const onWheel=(e:WheelEvent)=>{const {a,b,full,w,pad}=stateRef.current;if(full[1]<=full[0])return;e.preventDefault();
   const r=el.getBoundingClientRect(),f=Math.min(1,Math.max(0,(e.clientX-r.left-pad.l)/w)),c=a+(b-a)*f;
   const dy=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:0;
   if(!dy){const shift=(b-a)*e.deltaX/w;const na=Math.min(Math.max(full[0],a+shift),full[1]-(b-a));setView([na,na+(b-a)]);return;}
   const k=Math.exp(Math.max(-1,Math.min(1,dy/300)));const total=full[1]-full[0];
   const ns=Math.min(total,Math.max(MIN_SPAN,(b-a)*k));let na=c-(c-a)*(ns/(b-a)),nb=na+ns;
   if(na<full[0]){nb+=full[0]-na;na=full[0];}if(nb>full[1]){na-=nb-full[1];nb=full[1];}
   setView(ns>=total-1000?null:[Math.max(full[0],na),Math.min(full[1],nb)]);};
  el.addEventListener('wheel',onWheel,{passive:false});return()=>el.removeEventListener('wheel',onWheel);},[]);

 // 拖动平移
 const drag=useRef<{x:number;a:number;b:number}|null>(null);
 function down(e:React.PointerEvent<SVGSVGElement>){if(!zoomed)return;drag.current={x:e.clientX,a,b};e.currentTarget.setPointerCapture(e.pointerId);}
 function move(e:React.PointerEvent<SVGSVGElement>){
  if(drag.current){const d=drag.current,shift=-(e.clientX-d.x)/w*(d.b-d.a);const na=Math.min(Math.max(full[0],d.a+shift),full[1]-(d.b-d.a));setView([na,na+(d.b-d.a)]);setHover(null);return;}
  if(!times.length)return;const r=e.currentTarget.getBoundingClientRect();const t=a+(e.clientX-r.left-pad.l)/w*span;
  let best=i0;for(let i=i0+1;i<=i1;i++)if(Math.abs(times[i]-t)<Math.abs(times[best]-t))best=i;setHover(times[best]>=a&&times[best]<=b?best:null);
 }
 const up=()=>{drag.current=null;};
 const hx=hover!=null?x(times[hover]):0;

 return <div className="zoom-chart">
  <div className="zc-bar"><div className="lc-legend">{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}</span>)}</div>
   <div className="zc-range"><span className="num">{times.length?`${dayClock(a)} – ${dayClock(b)}`:''}{zoomed?` · ${spanText(span)}`:''}</span>
    {zoomed&&<Button size="sm" variant="ghost" className="zc-reset" onPress={()=>setView(null)}><RotateCcw size={13}/>还原</Button>}</div></div>
  <div className="line-chart" ref={box}>
   <svg ref={svgRef} width={width} height={height} role="img" aria-label={label+'，滚动鼠标滚轮缩放时间范围'} className={zoomed?'is-zoomed':''}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={()=>{if(!drag.current)setHover(null);}} onDoubleClick={()=>setView(null)}>
    <defs><clipPath id={clip}><rect x={pad.l} y={0} width={w} height={height}/></clipPath></defs>
    {[0,.25,.5,.75,1].map(f=>f*max).map(v=><g key={v}><line x1={pad.l} x2={pad.l+w} y1={y(v)} y2={y(v)} className="lc-grid"/><text x={pad.l-8} y={y(v)} className="lc-tick" textAnchor="end" dominantBaseline="middle">{format(v)}</text></g>)}
    {timeTicks.ticks.map(t=><text key={t} x={x(t)} y={height-6} className="lc-tick" textAnchor="middle">{tickText(t)}</text>)}
    <g clipPath={`url(#${clip})`}>{series.map(s=>{const d=path(s.values);if(!d)return null;return <g key={s.name}>
     {area&&<path d={d+`L${x(times[i1]).toFixed(1)} ${pad.t+h}L${x(times[i0]).toFixed(1)} ${pad.t+h}Z`} fill={s.color} opacity={.1}/>}
     <path d={d} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round"/></g>;})}</g>
    {hover!=null&&<g><line x1={hx} x2={hx} y1={pad.t} y2={pad.t+h} className="lc-cross"/>{series.map(s=>s.values[hover]!=null&&<circle key={s.name} cx={hx} cy={y(s.values[hover])} r={3.5} fill="var(--background)" stroke={s.color} strokeWidth={2}/>)}</g>}
   </svg>
   {!times.length&&<div className="zc-empty">暂无数据</div>}
   {hover!=null&&<div className="lc-tip" style={{left:Math.min(hx+12,width-180)}}><strong>{dayClock(times[hover])}</strong>{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}<b>{format(s.values[hover]??0)}</b></span>)}</div>}
  </div>
 </div>;
}
