import {Skeleton} from '@heroui/react';
import {TableSkeleton} from './TableSkeleton';

/**
 * 页面加载时的骨架屏（替代转圈的 Loading）：用真实的标题、版式和尺寸占位，数据到达时不跳动。
 * - ListPageSkeleton：标题 + 工具栏 + 表格，用于列表页和导航数据（catalog）尚未读取完成时。
 * - OverviewSkeleton：首页的两张卡片（七天操作、区域分布）和下排两张表。
 * - FormSkeleton：设置类表单（左标签、右输入框）。
 * - BlocksSkeleton：由若干白色卡片组成的页面（新建实例等）。
 */
const Bar=({w,h='.75rem',className=''}:{w:string;h?:string;className?:string})=><Skeleton animationType="pulse" className={'psk-bar '+className} style={{width:w,height:h}}/>;
export function HeadingSkeleton({title}:{title?:string}){return <div className="page-heading"><div>{title?<h1>{title}</h1>:<Bar w="9rem" h="1.5rem"/>}</div></div>;}
export function ListPageSkeleton({title}:{title?:string}){
 return <><HeadingSkeleton title={title}/><section className="data-panel" aria-busy="true"><div className="filter-bar"><div className="filters"><Bar w="9rem" h="2.25rem" className="psk-field"/><Bar w="7rem" h="2.25rem" className="psk-field"/><Bar w="16rem" h="2.25rem" className="psk-field"/></div><div className="filter-actions"><Bar w="2.25rem" h="2.25rem" className="psk-field"/><Bar w="6rem" h="2.25rem" className="psk-field"/></div></div>
  <TableSkeleton columns={[{title:'',width:0},{title:'',width:9,twoLine:true},{title:'',width:7},{title:'',width:6},{title:'',width:6},{title:'',width:5}]} rows={8}/></section></>;
}
export function FormSkeleton({rows=6}:{rows?:number}){
 return <div className="psk-form" aria-busy="true">{Array.from({length:rows},(_,i)=><div key={i} className="psk-form-row"><Bar w={['6rem','8rem','5rem','7rem'][i%4]}/><Bar w="100%" h="2.25rem" className="psk-field"/></div>)}</div>;
}
export function BlocksSkeleton({blocks=3}:{blocks?:number}){
 return <div className="psk-blocks" aria-busy="true">{Array.from({length:blocks},(_,i)=><div key={i} className="psk-card"><Bar w="7rem" h="1rem"/><div className="psk-grid">{Array.from({length:4},(_,j)=><Bar key={j} w="100%" h="2.75rem" className="psk-field"/>)}</div></div>)}</div>;
}
export function OverviewSkeleton({title='控制台',heading=true}:{title?:string;heading?:boolean}){
 return <div aria-busy="true">
  {heading&&<div className="page-heading"><div><h1>{title}</h1></div><Bar w="9rem"/></div>}
  <div className="home-primary-grid">
   <section className="data-panel"><div className="panel-heading"><Bar w="7rem" h="1rem"/></div><div className="psk-kpi">{[0,1,2].map(i=><Bar key={i} w="100%" h="3.5rem" className="psk-field"/>)}</div><div className="psk-rows">{Array.from({length:7},(_,i)=><div key={i} className="psk-row"><Bar w="2.5rem"/><Bar w={[70,55,30,85,45,95,60][i]+'%'} h=".875rem" className="psk-pill"/></div>)}</div></section>
   <section className="data-panel"><div className="panel-heading"><Bar w="6rem" h="1rem"/></div><div className="psk-map"/></section>
  </div>
  <div className="home-ranking">{[0,1].map(i=><section key={i} className="data-panel"><div className="panel-heading"><Bar w="7rem" h="1rem"/></div><TableSkeleton className="home-table" columns={[{title:'实例',width:7},{title:'',width:5},{title:'',width:6},{title:'',width:5}]} rows={8}/></section>)}</div>
 </div>;
}
