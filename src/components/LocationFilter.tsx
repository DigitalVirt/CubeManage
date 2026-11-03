import {Button,Dropdown,Label} from '@heroui/react';
import {ChevronDown,MapPin} from 'lucide-react';
import type {Row} from '../lib/api';

/**
 * 区域 + 节点 in one filter: pick a region first, then (in its submenu) one of its nodes or all of them.
 * Regions without any node are left out.
 * The trigger reads “全部区域”, “香港 · 全部节点” or “香港 / HK-1”. Keys: all | area:<id> | node:<areaId>:<nodeId>.
 */
const areaIdOf=(n:Row)=>String(n.area_id??(typeof n.area==='object'&&n.area?n.area.id:n.area)??'');

export function LocationFilter({areas,nodes,area,node,onChange}:{areas:Row[];nodes:Row[];area:string;node:string;onChange:(area:string,node:string)=>void}){
 const byArea=new Map<string,Row[]>();for(const n of nodes){const k=areaIdOf(n);if(!byArea.has(k))byArea.set(k,[]);byArea.get(k)!.push(n);}
 const areaRow=areas.find(a=>String(a.id)===area),nodeRow=nodes.find(n=>String(n.id)===node);
 const text=!area&&!node?'全部区域':nodeRow?`${areaRow?.name||'区域'} / ${nodeRow.name}`:`${areaRow?.name||'区域 #'+area} · 全部节点`;
 const pick=(key:string)=>{if(key==='all')return onChange('','');const [kind,a,n]=key.split(':');if(kind==='area')onChange(a,'');else if(kind==='node')onChange(a,n);};
 return <Dropdown>
  <Button variant="outline" size="sm" className={'location-filter'+(area||node?' is-active':'')} aria-label={'按区域和节点筛选，当前：'+text}><MapPin size={15}/><span className="location-filter-text">{text}</span><ChevronDown size={14}/></Button>
  <Dropdown.Popover placement="bottom start" className="location-popover">
   <Dropdown.Menu aria-label="选择区域和节点" selectionMode="single" selectedKeys={[node?`node:${area||areaIdOf(nodeRow||{})}:${node}`:area?`area:${area}`:'all']} onAction={k=>pick(String(k))}>
    <Dropdown.Item id="all" textValue="全部区域"><Label>全部区域</Label></Dropdown.Item>
    {areas.map(a=>{const list=byArea.get(String(a.id))||[];
     if(!list.length)return null; // regions without nodes are not offered
     return <Dropdown.SubmenuTrigger key={a.id}>
      <Dropdown.Item id={`group:${a.id}`} textValue={a.name}><Label>{a.name}</Label><small className="location-count">{list.length} 个节点</small><Dropdown.SubmenuIndicator/></Dropdown.Item>
      <Dropdown.Popover className="location-popover"><Dropdown.Menu aria-label={a.name+' 的节点'} selectionMode="single" selectedKeys={[node?`node:${a.id}:${node}`:area===String(a.id)?`area:${a.id}`:'']} onAction={k=>pick(String(k))}>
       <Dropdown.Item id={`area:${a.id}`} textValue={'全部节点 '+a.name}><Label>全部节点</Label></Dropdown.Item>
       {list.map(n=><Dropdown.Item key={n.id} id={`node:${a.id}:${n.id}`} textValue={n.name}><Label>{n.name}</Label></Dropdown.Item>)}
      </Dropdown.Menu></Dropdown.Popover>
     </Dropdown.SubmenuTrigger>;})}
   </Dropdown.Menu>
  </Dropdown.Popover>
 </Dropdown>;
}
