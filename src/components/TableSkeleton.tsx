import {Skeleton,Table} from '@heroui/react';

/**
 * Loading state for a list: the table's own frame and real column headers, each value replaced by a
 * flat bar at roughly its real size, rows at their real pitch, so nothing shifts when the data lands.
 * `widths` gives each column's bar width in rem; 0 draws a small square (status, checkbox, icon).
 */
export function TableSkeleton({columns,rows=8,className}:{columns:{title:string;width:number;twoLine?:boolean}[];rows?:number;className?:string}){
 return <Table aria-busy="true"><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="正在加载列表" className={'table-skeleton '+(className||'')}>
  <Table.Header>{columns.map((c,i)=><Table.Column key={i} isRowHeader={i===0}>{c.title}</Table.Column>)}</Table.Header>
  <Table.Body>{Array.from({length:Math.max(1,Math.min(rows,20))},(_,r)=><Table.Row key={r}>{columns.map((c,i)=><Table.Cell key={i}>{c.width===0?<Skeleton animationType="pulse" className="sk-square"/>:<div className="sk-stack"><Skeleton animationType="pulse" className="sk-bar" style={{width:(c.width*(r%3===1?.8:r%3===2?.9:1))+'rem'}}/>{c.twoLine&&<Skeleton animationType="pulse" className="sk-bar sk-sub" style={{width:(c.width*.6)+'rem'}}/>}</div>}</Table.Cell>)}</Table.Row>)}</Table.Body>
 </Table.Content></Table.ScrollContainer></Table>;
}
