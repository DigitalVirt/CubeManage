import type {ReactNode} from 'react';

/**
 * Status marks: a solid circle in the state's colour with a white glyph.
 * Colour family carries the meaning: green running, deep red stopped or failing,
 * amber held, blue in progress, grey out of service or unknown.
 */
type Glyph='check'|'stop'|'pause'|'hold'|'trash'|'clock'|'dots'|'restart'|'plus'|'cross'|'question'|'arrow'|'chevrons';
export type StatusSpec={title:string;color:string;glyph:Glyph;meaning:string};

/** Every value the platform documents (v1/clouds/:id/status and the v1/clouds status filter): 12 in all. */
export const cloudStatuses:Record<string,StatusSpec>={
 on:{title:'运行中',color:'#15803d',glyph:'check',meaning:'实例已开机并正常运行'},
 off:{title:'已关机',color:'#991b1b',glyph:'stop',meaning:'实例已停止，磁盘和 IP 保留'},
 suspend:{title:'已暂停',color:'#b45309',glyph:'pause',meaning:'已暂停，原因见暂停类型：流量超额或到期暂停'},
 paused:{title:'已挂起',color:'#c2410c',glyph:'hold',meaning:'实例已挂起，可通过“解除挂起”恢复'},
 init:{title:'创建中',color:'#1d4ed8',glyph:'clock',meaning:'正在分配资源并写入镜像'},
 task:{title:'任务中',color:'#1d4ed8',glyph:'dots',meaning:'有任务正在执行，任务名称见悬停提示'},
 wait_reboot:{title:'等待重启',color:'#1d4ed8',glyph:'restart',meaning:'配置已变更，重启后生效'},
 cold_migrate:{title:'冷迁移中',color:'#1d4ed8',glyph:'arrow',meaning:'关机迁移到其他节点，可查询迁移进度'},
 hot_migrate:{title:'热迁移中',color:'#1d4ed8',glyph:'chevrons',meaning:'不停机迁移到其他节点'},
 rescue:{title:'救援系统',color:'#c2410c',glyph:'plus',meaning:'已进入救援系统，退出后恢复原系统'},
 recycle:{title:'回收站',color:'#71717a',glyph:'trash',meaning:'已删除，保留期内可从回收站恢复'},
 unknown:{title:'未知',color:'#71717a',glyph:'question',meaning:'平台无法确定实例状态'}
};
/** Sub-types the platform returns beside a status. */
export const suspendTypes:Record<string,string>={traffic:'流量超额',due:'到期暂停'};
export const unknownStatus:StatusSpec={title:'未识别状态',color:'#71717a',glyph:'question',meaning:'平台返回了文档之外的状态值'};
export const healthStatuses:Record<string,StatusSpec>={
 '1':{title:'正常',color:'#15803d',glyph:'check',meaning:'节点或区域在线、监控正常'},
 '0':{title:'异常',color:'#b91c1c',glyph:'cross',meaning:'节点或区域离线，或监控获取失败'}
};

const glyphs:Record<Glyph,ReactNode>={
 check:<path d="m8 12 3 3 5-6" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>,
 stop:<rect x={8.25} y={8.25} width={7.5} height={7.5} rx={1.25} fill="#fff"/>,
 pause:<path d="M10 8.5v7M14 8.5v7" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/>,
 hold:<path d="M8 12h8" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/>,
 trash:<path d="M8.5 9.25h7M10.5 9.25V8h3v1.25M9.5 9.25l.6 6.75h3.8l.6-6.75" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>,
 clock:<path d="M12 7.5V12l3 2" fill="none" stroke="#fff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"/>,
 dots:<path d="M8 12h.01M12 12h.01M16 12h.01" fill="none" stroke="#fff" strokeWidth={2.75} strokeLinecap="round"/>,
 restart:<><path d="M15.6 10A4 4 0 1 0 16 13" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"/><path d="M16.2 7.6v2.9h-2.9" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></>,
 plus:<path d="M12 8v8M8 12h8" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/>,
 cross:<path d="m9 9 6 6M15 9l-6 6" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/>,
 arrow:<path d="M7.5 12h8.5M13 8.5l3.5 3.5-3.5 3.5" fill="none" stroke="#fff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"/>,
 chevrons:<path d="M7.5 8.5 11 12l-3.5 3.5M12.5 8.5 16 12l-3.5 3.5" fill="none" stroke="#fff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"/>,
 question:<><path d="M10 9.6a2.1 2.1 0 1 1 2.9 1.9c-.6.3-.9.7-.9 1.3v.4" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"/><path d="M12 15.6h.01" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/></>
};

export function StatusIcon({spec,size=18}:{spec:StatusSpec;size?:number}){
 return <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx={12} cy={12} r={10} fill={spec.color}/>{glyphs[spec.glyph]}</svg>;
}
export const cloudStatus=(status:unknown)=>cloudStatuses[String(status)]||unknownStatus;
export const healthStatus=(status:unknown)=>healthStatuses[Number(status)===1?'1':'0'];
