const text=(key,label,extra={})=>({key,label,...extra});
const number=(key,label,extra={})=>({key,label,type:'number',min:0,integer:true,...extra});
const select=(key,label,options,extra={})=>({key,label,type:'select',options:options.map(([value,label])=>({value,label})),...extra});
const mediaFields=group=>[text('name','名称',{required:true}),text('filename','文件名',{required:true}),number(group,group==='image_group_id'?'镜像组 ID':'ISO 组 ID',{min:1}),select('status','状态',[['1','启用'],['2','停用']],{default:'1'}),text('url','下载地址',{type:'url'}),select('upload_type','来源',[['0','手动上传'],['1','URL 下载']],{default:'0'})];
export const management={
 images:{title:'镜像管理',read:'images/new_list',write:'image',fields:[...mediaFields('image_group_id'),select('boot_type','初始化方式',[['cloud_init','cloud-init'],['config','配置方式']],{default:'cloud_init'}),select('startup_mode','启动模式',[['bios','BIOS'],['uefi','UEFI']],{default:'bios'}),select('disk_driver','磁盘驱动',[['virtio','VirtIO'],['ide','IDE'],['sata','SATA'],['scsi','SCSI']],{default:'virtio'}),text('on_script','开机脚本',{type:'textarea'})]},
 isos:{title:'ISO 管理',read:'isos/new_list',write:'iso',fields:mediaFields('iso_group_id')},
 users:{title:'用户管理',read:'user',write:'user',fields:[text('username','用户名',{required:true}),text('password','初始密码',{type:'password',secret:true,createOnly:true,required:true}),text('real_name','姓名'),text('email','邮箱',{type:'email'}),text('phone','电话'),select('state','状态',[['1','启用'],['0','停用']],{default:'1'}),text('remark','备注',{type:'textarea'})]},
 'system-logs':{title:'系统日志',read:'aLog'},
 'login-logs':{title:'登录日志',read:'aLog',query:{type:['=',1]}},
 'task-logs':{title:'任务日志',read:'tasks'},
 'adsl-logs':{title:'ADSL 日志',read:'adsl/log'},
 blacklists:{title:'黑名单记录',read:'blacklists',write:'blacklists',noEdit:true,fields:[text('ip','封停 IP',{required:true}),text('expired_time','解封时间',{type:'datetime-local',required:true}),text('description','封停原因',{type:'textarea'})]}
};
export function managementQuery(kind,params){
 const entry=management[kind],q={page:Math.max(1,parseInt(params.page)||1),per_page:Math.min(100,Math.max(1,parseInt(params.per_page)||20)),orderby:'id',sort:'desc',...entry.query};
 if(params.search){const key=['images','isos'].includes(kind)?'name':['system-logs','login-logs'].includes(kind)?'des':'search';if(kind!=='task-logs')q[key]=String(params.search).slice(0,256);}
 if(params.status!==undefined&&params.status!==''){if(['images','isos','task-logs'].includes(kind))q.status=String(params.status);else if(kind==='users')q.state=String(params.status);}
 if(params.start_time)q.start_time=Number(params.start_time);if(params.end_time)q.end_time=Number(params.end_time);
 return q;
}
export function normalizeManagedList(result){const value=result?.data&&!Array.isArray(result.data)?result.data:result;if(Array.isArray(value?.list))return {data:value.list,meta:{total:value.total,page:value.page,total_page:value.total_page,per_page:value.per_page}};return result;}
