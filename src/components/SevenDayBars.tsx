import {Tooltip} from '@heroui/react';
import {Empty} from './Shared';

/** 首页“最近七天操作”（方案 B）：顶部三项合计，下方每天一行堆叠横条（创建 / 删除 / 暂停），右侧为当天合计。数据为 v1/index 的 day7。 */
const series=[{key:'create',label:'创建',cls:'is-create'},{key:'recycle',label:'删除',cls:'is-recycle'},{key:'suspend',label:'暂停',cls:'is-suspend'}];
export function SevenDayBars({data}:{data:Record<string,Record<string,unknown>>|undefined}){
 const dates=[...new Set(series.flatMap(s=>Object.keys(data?.[s.key]||{})))].sort().slice(-7).reverse(); // 最新的一天在最上面
 const value=(key:string,date:string)=>{const v=Number(data?.[key]?.[date]);return Number.isFinite(v)&&v>=0?v:0;};
 if(!dates.length)return <Empty kind="chart" size="sm" title="暂无统计数据" text="平台还没有返回每日操作统计。"/>;
 const totals=series.map(s=>dates.reduce((n,d)=>n+value(s.key,d),0));
 const dayTotal=(d:string)=>series.reduce((n,s)=>n+value(s.key,d),0);const max=Math.max(1,...dates.map(dayTotal));
 return <div className="sd">
  <div className="sd-kpi">{series.map((s,i)=><div key={s.key}><span>{s.label}</span><b className="num">{totals[i]}</b></div>)}</div>
  <div className="sd-legend">{series.map(s=><span key={s.key}><i className={s.cls}/>{s.label}</span>)}<small>单位：台</small></div>
  <div className="sd-rows">{dates.map(d=>{const t=dayTotal(d);return <Tooltip key={d} delay={0} closeDelay={0}><Tooltip.Trigger tabIndex={0} aria-label={d+'，'+series.map(s=>s.label+' '+value(s.key,d)+' 台').join('，')} className="sd-row">
   <span className="sd-date num">{d.slice(5)}</span><span className="sd-track"><span className="sd-bar" style={{width:t/max*100+'%'}}>{series.map(s=>{const v=value(s.key,d);return v?<i key={s.key} className={s.cls} style={{flexGrow:v}}/>:null;})}</span></span><b className="sd-total num">{t}</b>
  </Tooltip.Trigger><Tooltip.Content><div className="chart-tooltip"><strong>{d}</strong>{series.map(s=><span key={s.key}><i className={'sd-swatch '+s.cls}/>{s.label}<b>{value(s.key,d)} 台</b></span>)}</div></Tooltip.Content></Tooltip>;})}</div>
 </div>;
}
