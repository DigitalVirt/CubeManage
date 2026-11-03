import {Button,Spinner,Tooltip} from '@heroui/react';
import {StatusIcon,type StatusSpec} from './StatusIcon';

/**
 * Task status mark (任务列表 v1/tasks: 0 等待执行, 1 正在执行, 2 执行成功, 3 执行失败, 4 强制结束, 5 已取消), icon only:
 * waiting is a grey solid circle with a dash, running is a spinner, success a green solid circle with a tick,
 * failure a deep-red solid circle with a cross. Hovering names the state; a failed task adds the platform's message.
 */
const specs:Record<string,StatusSpec>={
 '0':{title:'等待执行',color:'#9ca3af',glyph:'hold',meaning:'任务排队中，尚未开始'},
 '2':{title:'执行成功',color:'#15803d',glyph:'check',meaning:'任务已完成'},
 '3':{title:'执行失败',color:'#991b1b',glyph:'cross',meaning:'任务执行失败'},
 '4':{title:'强制结束',color:'#71717a',glyph:'stop',meaning:'任务被强制结束'},
 '5':{title:'已取消',color:'#71717a',glyph:'cross',meaning:'任务已取消'}
};

export function TaskStatus({status,msg}:{status:unknown;msg?:unknown}){
 const key=String(status??'');
 const title=key==='1'?'执行中':specs[key]?.title||'未知状态';
 const reason=key==='3'?String(msg??'').trim():'';
 const label=reason?title+'：'+reason:title;
 const mark=key==='1'?<Spinner size="sm" color="accent"/>:specs[key]?<StatusIcon spec={specs[key]} size={18}/>:<span className="task-status-unknown">?</span>;
 return <Tooltip delay={0}><Button variant="ghost" size="sm" isIconOnly aria-label={label} className="task-status-trigger">{mark}</Button><Tooltip.Content className="task-status-tip">{reason?<><strong>{title}</strong><br/>{reason}</>:title}</Tooltip.Content></Tooltip>;
}

/** 进度 as “N%”; nothing to show when the platform gives no number. */
export function taskProgress(value:unknown){const n=Number(value);return value===null||value===undefined||value===''||!Number.isFinite(n)?'—':Math.max(0,Math.min(100,Math.round(n)))+'%';}
