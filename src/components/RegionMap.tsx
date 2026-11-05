import {useMemo} from 'react';
import {Button,Tooltip} from '@heroui/react';
import {type Row} from '../lib/api';
import {CountryFlag} from './CountryFlag';
import {Empty} from './Shared';
import {GRID_COLS,GRID_ROWS,COUNTRY_POS,landCells,project} from '../lib/worldDots';

/**
 * 首页“区域分布”：点阵世界地图（浅灰陆地点），每个区域按国家代码定位为蓝色圆点（大小随实例数），旁边常驻“区域名 + 实例数”标签。
 * 悬停（或键盘聚焦）显示卡片：国旗、区域名、节点数、实例数；同一国家多个区域合并为一个点，卡片里逐个列出。点击进入该区域的节点列表（合并的点进入区域列表）。
 */
const CELLS=landCells();
export function RegionMap({areas,onOpen}:{areas:Row[];onOpen:(areaId:unknown|null)=>void}){
 // 同一国家 / 地区的多个区域合并成一个点：标签为国家名 + 实例合计，悬停列出各区域概况；只有一个区域时显示该区域的节点。
 const groups=useMemo(()=>{const map=new Map<string,Row[]>();for(const a of areas){const code=String(a.country_code||'').toUpperCase()||'#'+a.id;map.set(code,[...(map.get(code)||[]),a]);}
  const list=[...map.entries()].map(([code,items])=>({code,items,inst:items.reduce((n,a)=>n+(Number(a.cloud_num)||0),0)}));const max=Math.max(1,...list.map(g=>g.inst));
  return list.map(g=>{const pos=COUNTRY_POS[g.code];const [x,y]=pos?project(pos[0],pos[1]):[0,0];const one=g.items.length===1;
   return {...g,one,name:one?String(g.items[0].name):String(g.items[0].country_name||g.code),pos:pos?{left:x/GRID_COLS*100,top:y/GRID_ROWS*100}:null,size:10+14*Math.sqrt(g.inst/max)};});},[areas]);
 // 区域之间的传输连线：区域 ≤3 个时两两相连，否则都连到实例最多的区域（减少交叉）。弧线为两端渐隐的细光轨；
 // 每条连线两个方向各有一束带拖尾的流光，错开时间出发；系统开启“减少动态效果”时只保留静态光轨。
 const links=useMemo(()=>{const pts=groups.filter(g=>g.pos).map(g=>({code:g.code,inst:g.inst,x:g.pos!.left/100*GRID_COLS,y:g.pos!.top/100*GRID_ROWS}));if(pts.length<2)return [];
  const pairs:[typeof pts[0],typeof pts[0]][]=[];if(pts.length<=3){for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)pairs.push([pts[i],pts[j]]);}else{const hub=[...pts].sort((a,b)=>b.inst-a.inst)[0];for(const p of pts)if(p!==hub)pairs.push([hub,p]);}
  const f=(n:number)=>n.toFixed(2);
  return pairs.map(([a,b])=>{const dist=Math.hypot(b.x-a.x,b.y-a.y);const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-Math.min(12,dist*.22);
   return {key:a.code+'-'+b.code,a:[a.x,a.y],b:[b.x,b.y],d:`M${f(a.x)} ${f(a.y)} Q${f(mx)} ${f(my)} ${f(b.x)} ${f(b.y)}`,r:`M${f(b.x)} ${f(b.y)} Q${f(mx)} ${f(my)} ${f(a.x)} ${f(a.y)}`};});},[groups]);
 const motion=useMemo(()=>{try{return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return true;}},[]);
 if(!areas.length)return <Empty kind="area" size="sm" title="暂无区域数据" text="添加区域和节点后，这里会在地图上显示各区域的资源分布。"/>;
 const unplaced=groups.filter(g=>!g.pos).flatMap(g=>g.items);
 // 悬停卡片只显示区域、节点数、实例数。
 // 悬停卡片（版本 A）：实例数为主角（蓝色大号数字），节点数一行小字；合并多个区域时逐行列出，每行配占比细条，不用分隔线。
 const card=(g:{name:string;items:Row[];one:boolean;inst:number})=>{const nodeSum=g.one?g.items[0].node_num:g.items.reduce((n,a)=>n+(Number(a.node_num)||0),0);const max=Math.max(1,...g.items.map(a=>Number(a.cloud_num)||0));return <div className="rm-card">
  <div className="rm-card-title"><CountryFlag code={g.items[0].country_code} name={g.items[0].country_name}/><span>{g.name}</span>{!g.one&&<small className="rm-card-count">{g.items.length} 个区域</small>}</div>
  <div className="rm-big"><b className="num">{g.inst}</b><span>台实例</span></div>
  <div className="rm-sub">分布在 <b className="num">{nodeSum??'—'}</b> 个节点</div>
  {!g.one&&<div className="rm-rows">{g.items.map(a=><div key={a.id} className="rm-row"><span>{a.name}</span><small className="num"><b>{a.cloud_num??0}</b> 台 · {a.node_num??'—'} 节点</small><span className="rm-share"><i style={{width:(Number(a.cloud_num)||0)/max*100+'%'}}/></span></div>)}</div>}
 </div>;};
 return <div className="rm">
  <div className="rm-map">
   <svg viewBox={`0 0 ${GRID_COLS} ${GRID_ROWS}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">{CELLS.map(([x,y])=><circle key={x+'-'+y} cx={x+.5} cy={y+.5} r={.32}/>)}</svg>
   <svg className="rm-links" viewBox={`0 0 ${GRID_COLS} ${GRID_ROWS}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>{links.map(l=><linearGradient key={l.key} id={'rm-g-'+l.key} gradientUnits="userSpaceOnUse" x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]}><stop offset="0" stopColor="var(--accent)" stopOpacity="0"/><stop offset=".5" stopColor="var(--accent)" stopOpacity=".45"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient>)}</defs>
    {links.map((l,i)=><g key={l.key}>
     <path d={l.d} className="rm-arc" stroke={`url(#rm-g-${l.key})`}/>
     {motion&&[l.d,l.r].map((d,k)=><g key={k} className="rm-comet" style={{animationDelay:-(i*1.7+k*2.9)+'s',animationDuration:(5.2+(i%3)*.9)+'s'}}>{['tail','body','head'].map(part=><path key={part} d={d} pathLength={100} className={'rm-comet-'+part}/>)}</g>)}
    </g>)}
   </svg>
   {groups.map(g=>g.pos&&<Tooltip key={g.code} delay={80} closeDelay={150}>
    <Button variant="ghost" className={'rm-pin'+(g.pos.left>78?' is-left':'')} style={{left:g.pos.left+'%',top:g.pos.top+'%'}} aria-label={g.one?`${g.name}：节点 ${g.items[0].node_num??'—'}，实例 ${g.inst}，点击查看节点`:`${g.name}：${g.items.length} 个区域，实例 ${g.inst}，点击查看全部区域`} onPress={()=>onOpen(g.one?g.items[0].id:null)}>
     <span className="rm-dot" style={{width:g.size,height:g.size}}><i/></span><span className="rm-label"><CountryFlag code={g.items[0].country_code} name={g.items[0].country_name}/><span>{g.name}</span>{!g.one&&<small>{g.items.length} 区</small>}<b className="num">{g.inst}</b></span>
    </Button>
    <Tooltip.Content placement="bottom" className="rm-tooltip">{card(g)}</Tooltip.Content>
   </Tooltip>)}
  </div>
  {/* 手机上不显示地图，只列出各区域（节点数、实例数），点击进入。 */}
  <ul className="rm-legend">{groups.flatMap(g=>g.items).concat(unplaced).map(a=><li key={a.id}><button type="button" onClick={()=>onOpen(a.id)}><CountryFlag code={a.country_code} name={a.country_name}/><span className="rm-legend-name">{a.name}</span><small><b className="num">{a.node_num??0}</b> 节点</small><small><b className="num">{a.cloud_num??0}</b> 实例</small></button></li>)}</ul>
  {unplaced.length>0&&<div className="rm-unplaced"><span>未定位：</span>{unplaced.map(a=><Button key={a.id} size="sm" variant="ghost" onPress={()=>onOpen(a.id)}><CountryFlag code={a.country_code} name={a.country_name}/>{a.name}<b className="num">{a.cloud_num??0}</b></Button>)}</div>}
 </div>;
}
