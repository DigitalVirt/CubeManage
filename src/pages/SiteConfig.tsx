import {SITE_NAME_EVENT} from '../lib/siteName';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Button,Checkbox,Input,Label,Switch,Table,Tabs,TextArea,TextField} from '@heroui/react';
import {Pencil,Plus,PlugZap,RefreshCw,RotateCcw,Save,Trash2,TriangleAlert} from 'lucide-react';
import {api,send,type Row,type List} from '../lib/api';
import {Dialog,Empty,ErrorBox,type Notify} from '../components/Shared';
import {FormSkeleton} from '../components/PageSkeleton';
import {TableSkeleton} from '../components/TableSkeleton';
import {Choice} from '../components/Controls';
import {Pager} from '../components/Pager';

/**
 * 系统设置: the platform's 网站配置 API in horizontal tabs. Each tab loads GET /api/site-config/:section,
 * edits a draft, and saves only the changed fields after a confirmation listing old → new values.
 */
type Opt=readonly [string|number,string];
type Field={key:string;label:string;type:'switch'|'text'|'number'|'textarea'|'select'|'list'|'secret'|'secretList'|'ids';options?:readonly Opt[];hint?:string;unit?:string;when?:(v:Row)=>boolean;wide?:boolean;placeholder?:string};
type Group={title:string;note?:string;fields:Field[]};
type Data={values:Row;secrets:Record<string,boolean>;extra:Row;readonly:boolean};

const on=(k:string)=>(v:Row)=>Number(v[k])===1;
const unit:Opt[]=[['day','天'],['hour','小时']];
const overflow:Opt[]=[[0,'不操作'],[1,'暂停实例'],[2,'断网'],[3,'限速']];
const sw=(key:string,label:string,hint?:string):Field=>({key,label,type:'switch',hint});

const forms:Record<string,Group[]>={
 basic:[
  {title:'站点信息',note:'显示在平台前台、邮件、页脚和 CubeManage 顶栏中的信息。',fields:[{key:'system_domain',label:'系统域名',type:'text',placeholder:'cloud.example.com'},{key:'company_name',label:'网站名称',type:'text',placeholder:'同时显示在 CubeManage 顶栏'},{key:'email',label:'联系邮箱',type:'text'},{key:'registration_number',label:'备案号',type:'text'},{key:'alternate_master_ip',label:'主控高可用 IP',type:'text',hint:'备用主控的地址，没有可留空。'}]},
  {title:'维护模式',note:'开启后用户前台暂停服务并显示维护信息。',fields:[sw('maintenance_mode','维护模式'),{key:'maintenance_information',label:'维护信息',type:'textarea',wide:true,when:on('maintenance_mode')}]},
  {title:'显示',fields:[sw('hide_copyright','隐藏版权信息'),sw('custom_user_copyright','自定义版本信息'),sw('hide_cloud_password','隐藏服务器密码','开启后用户前台不显示实例密码。')]},
  {title:'数据采集',fields:[{key:'pick_limit',label:'采集间隔',type:'number',unit:'分钟 / 次'}]}
 ],
 instance:[
  {title:'回收站',note:'删除后保留的时间，超过后彻底删除。',fields:[{key:'recycle_bin',label:'实例保留时间',type:'number',hint:'0～100'},{key:'recycle_bin_unit',label:'实例时间单位',type:'select',options:unit},{key:'disk_recycle_bin',label:'磁盘保留时间',type:'number',hint:'1～100'},{key:'disk_recycle_bin_unit',label:'磁盘时间单位',type:'select',options:unit},{key:'nat_gateway_recycle_bin',label:'NAT 网关保留时间',type:'number',hint:'1～100'}]},
  {title:'系统盘',fields:[{key:'system_disk_size_for_windows',label:'Windows 默认容量',type:'number',unit:'GB'},{key:'system_disk_size_for_other',label:'其他系统默认容量',type:'number',unit:'GB'},sw('image_min_disk_size_check_switch','校验镜像最小磁盘','创建实例时检查磁盘是否满足镜像要求。')]},
  {title:'资源',fields:[sw('data_disk_oversold','超售模式'),sw('mtu_switch','VPC 网络 MTU 改为 1450'),sw('cpu_limit_switch','CPU 限制'),{key:'cpu_limit_percent',label:'CPU 百分比',type:'number',unit:'%',when:on('cpu_limit_switch')}]},
  {title:'磁盘默认限速',note:'新建实例磁盘的默认读写限制，0 表示不限制。',fields:[sw('disk_config_switch','启用默认限速'),...([['read_bytes_sec','读取速度','MB/s'],['write_bytes_sec','写入速度','MB/s'],['read_iops_sec','读取 IOPS','次/秒'],['write_iops_sec','写入 IOPS','次/秒'],['read_bytes_sec_max','读取突发','MB'],['write_bytes_sec_max','写入突发','MB'],['read_iops_sec_max','读取突发 IOPS','次'],['write_iops_sec_max','写入突发 IOPS','次']] as const).map(([key,label,u])=>({key,label,type:'number' as const,unit:u,when:on('disk_config_switch')}))]}
 ],
 security:[
  {title:'访问端口',note:'主控面板监听的端口。改错会导致无法访问，请确认防火墙已放行。',fields:[sw('http_port_switch','HTTP 端口'),{key:'http_port',label:'HTTP 端口号',type:'number',when:on('http_port_switch')},sw('https_port_switch','HTTPS 端口'),{key:'https_port',label:'HTTPS 端口号',type:'number',when:on('https_port_switch')}]},
  {title:'管理员路径',note:'后台登录地址的目录。修改后，连接设置里的平台地址也要同步修改，否则 CubeManage 将无法连接。',fields:[{key:'admin_path',label:'管理员路径',type:'text'}]},
  {title:'代理与来源 IP',fields:[{key:'proxy_server_list',label:'代理服务器列表',type:'textarea',wide:true,hint:'每行一个地址。'},{key:'request_header_get_ip',label:'获取真实 IP 的请求头',type:'list',wide:true,hint:'每行一个，例如 X-Forwarded-For。'}]}
 ],
 notify:[
  {title:'邮件',note:'关闭邮件开关时平台不允许修改其他邮件参数。',fields:[sw('email_switch','邮件通知'),...([{key:'email_type',label:'邮件类型',type:'select',options:[['smtp','SMTP']]},{key:'email_encoding',label:'邮件编码',type:'select',options:['8bit','7bit','binary','base64','quoted-printable'].map(v=>[v,v] as const)},{key:'email_smtp_host',label:'SMTP 主机',type:'text'},{key:'email_smtp_port',label:'SMTP 端口',type:'text'},{key:'email_smtp_ssl',label:'加密方式',type:'select',options:[['','无'],['ssl','SSL'],['tls','TLS']]},{key:'email_smtp_user',label:'SMTP 用户名',type:'text'},{key:'email_smtp_pwd',label:'SMTP 密码',type:'secret'},{key:'email_system_name',label:'发件人名称',type:'text'},{key:'email_system_email',label:'发件邮箱',type:'text'}] as Field[]).map(f=>({...f,when:on('email_switch')}))]},
  {title:'短信',fields:[{key:'sms_appid',label:'短信应用 ID',type:'text'},{key:'sms_key',label:'短信密钥',type:'secret'}]}
 ],
 ip:[{title:'IP 分配',fields:[{key:'ip_assign_rule',label:'分配规则',type:'select',options:[[1,'随机分配'],[2,'按 IP 地址顺序'],[3,'按 ID 顺序']]},{key:'mac_prefix',label:'MAC 地址前缀',type:'text',placeholder:'52:54:00'},sw('client_show_ip_remark','显示 IP 备注','在用户前台显示 IP 的备注信息。'),sw('ipv6_enable','IPv6')]}],
 traffic:[{title:'全局流量超额',note:'实例流量用完后的默认处理方式；下方节点设置优先。',fields:[{key:'over_flow_suspend',label:'超额动作',type:'select',options:overflow},{key:'over_flow_bw_limit',label:'限速大小',type:'number',unit:'Mbps',when:v=>Number(v.over_flow_suspend)===3}]}],
 ddns:[
  {title:'DDNS',note:'用 DNS 服务商接口自动更新主控和节点的域名解析。',fields:[sw('ddns_switch','启用 DDNS'),{key:'ddns_supplier',label:'服务商',type:'select',options:[['dnspod','DNSPod']]},{key:'ddns_key',label:'密钥 ID',type:'text'},{key:'ddns_token',label:'Token',type:'secret'}]},
  {title:'启用范围',fields:[sw('ddns_domain_enable_main','主控')]}
 ],
 vnc:[{title:'VNC 控制台',note:'网页终端连接实例时使用的地址和证书。',fields:[sw('vnc_switch','VNC'),...([{key:'vnc_ip',label:'VNC 地址',type:'text'},{key:'vnc_domain',label:'域名',type:'list',wide:true,hint:'每行一个。开启时必填。'},{key:'vnc_ssl_crt',label:'证书（CRT）',type:'list',wide:true,hint:'每行一个证书，与域名顺序对应。'},{key:'vnc_ssl_key',label:'私钥（KEY）',type:'secretList',wide:true}] as Field[]).map(f=>({...f,when:on('vnc_switch')}))]}],
 function_switch:[{title:'产品功能',note:'关闭后用户前台不再提供对应功能。',fields:[sw('fs_elastic_ip_product','弹性 IP'),sw('fs_disk_product','磁盘'),sw('fs_vpn_gateway','VPN 网关'),sw('fs_nat_gateway','NAT 网关'),sw('fs_snapshot','快照'),sw('fs_backup','备份'),sw('fs_custom_image','自定义镜像')]}],
 vgpu:[{title:'vGPU',fields:[sw('vgpu_enable','启用 vGPU'),{key:'vgpu_license_server',label:'授权服务器地址',type:'text',when:on('vgpu_enable'),placeholder:'license.example.com:7070'}]}],
 download:[{title:'主控升级下载源',note:'主控在线升级时下载安装包的地址。',fields:[{key:'master_download_domain',label:'下载源地址',type:'text',wide:true}]}],
 debug:[{title:'调试模式',note:'开启后平台输出详细错误信息，排查完成后请关闭。',fields:[sw('status','调试模式')]}],
 evacuation:[{title:'疏散设置',note:'平台接口只提供读取，需在魔方云后台修改。',fields:[sw('evacuation_switch','疏散'),{key:'monitor_frequency',label:'监控频率',type:'number',unit:'秒 / 次'},{key:'fail_times',label:'连续失败次数',type:'number'},{key:'migrate_scope',label:'迁移范围',type:'select',options:[['0','所有节点'],['1','节点分组']]},{key:'balance_strategy',label:'平衡策略',type:'select',options:[[0,'填满一个'],[1,'平均分配']]},{key:'migrate_back',label:'迁回时间',type:'select',options:[[0,'不自动迁回'],[1,'上线后 10 分钟'],[2,'上线后 20 分钟']]},{key:'migrate_back_strategy',label:'迁回策略',type:'select',options:[[0,'自动平衡'],[1,'恢复原始状态']]}]}]
};
export const siteTabs:readonly (readonly [string,string])[]=[['basic','基本信息'],['instance','实例与磁盘'],['security','安全'],['notify','通知'],['ip','IP'],['private_ip','内网 IP'],['traffic','流量'],['ddns','DDNS'],['vnc','VNC'],['function_switch','功能开关'],['vgpu','vGPU'],['evacuation','疏散'],['download','升级源'],['debug','调试']];

const same=(a:unknown,b:unknown)=>JSON.stringify(a??'')===JSON.stringify(b??'');
const listText=(v:unknown)=>Array.isArray(v)?v.join('\n'):String(v??'');
const shown=(f:Field,v:unknown)=>f.type==='ids'?(Array.isArray(v)?v.length+' 个节点':'—'):f.type==='switch'?(Number(v)===1?'开启':'关闭'):f.options?String(f.options.find(([o])=>String(o)===String(v))?.[1]??(v||'—')):Array.isArray(v)?(v.length?v.join('、'):'—'):String(v===''||v==null?'—':v);

function FieldInput({f,value,set,secretSet,readonly}:{f:Field;value:unknown;set:(v:unknown)=>void;secretSet?:boolean;readonly:boolean}){
 if(f.type==='switch')return <div className="cfg-field cfg-switch"><Switch size="sm" isSelected={Number(value)===1} isDisabled={readonly} onChange={v=>set(v?1:0)} aria-label={f.label}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control><Label>{f.label}</Label></Switch.Content></Switch>{f.hint&&<small>{f.hint}</small>}</div>;
 if(f.type==='select')return <div className={'cfg-field'+(f.wide?' is-wide':'')}><span className="cfg-label">{f.label}</span>{readonly?<span className="cfg-static">{shown(f,value)}</span>:<Choice aria-label={f.label} value={String(value??'')} onChange={e=>{const hit=f.options!.find(([o])=>String(o)===e.target.value);set(hit?hit[0]:e.target.value);}}>{f.options!.map(([o,l])=><option key={String(o)} value={String(o)}>{l}</option>)}</Choice>}{f.hint&&<small>{f.hint}</small>}</div>;
 const multi=f.type==='textarea'||f.type==='list'||f.type==='secretList';
 const text=f.type==='list'||f.type==='secretList'?listText(value):String(value??'');
 const write=(v:string)=>set(f.type==='list'||f.type==='secretList'?v.split('\n'):v);
 const secret=f.type==='secret'||f.type==='secretList';
 const hint=secret?(secretSet?'已设置。留空保持不变，填写则替换。':'尚未设置。'):f.hint;
 return <TextField className={'cfg-field'+(f.wide||multi?' is-wide':'')} value={text} onChange={write} isReadOnly={readonly}><Label>{f.label}</Label>
  {multi?<TextArea rows={f.type==='textarea'?3:Math.min(6,Math.max(2,text.split('\n').length))} placeholder={secret&&secretSet?'••••••••（不变）':f.placeholder}/>
   :<div className="cfg-input-row"><Input type={f.type==='secret'?'password':f.type==='number'?'number':'text'} inputMode={f.type==='number'?'numeric':undefined} min={f.type==='number'?0:undefined} autoComplete={secret?'new-password':'off'} placeholder={secret&&secretSet?'••••••••（不变）':f.placeholder}/>{f.unit&&<span className="cfg-unit">{f.unit}</span>}</div>}
  {hint&&<small>{hint}</small>}</TextField>;
}

/** One tab backed by GET/PUT /api/site-config/:section. `extra` renders custom content after the field groups. */
function SectionForm({section,notify,extra,custom}:{section:string;notify:Notify;extra?:(data:Data)=>ReactNode;custom?:{key:string;label:string;render:(value:unknown,set:(v:unknown)=>void,data:Data)=>ReactNode;group:string}}){
 const groups=forms[section];
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Row>({}),[error,setError]=useState(''),[revision,setRevision]=useState(0),[confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
 useEffect(()=>{let live=true;setError('');api<Data>('/site-config/'+section).then(d=>{if(live){setData(d);setDraft(structuredClone(d.values));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[section,revision]);
 const fields=useMemo(()=>[...groups.flatMap(g=>g.fields),...(custom?[{key:custom.key,label:custom.label,type:'ids' as const}]:[])],[groups,custom]);
 const changed=data?fields.filter(f=>{const a=draft[f.key],b=data.values[f.key];if(f.type==='ids'){const n=(x:unknown)=>(Array.isArray(x)?x:[]).map(Number).sort((p,q)=>p-q);return !same(n(a),n(b));}if(f.type==='secret')return a!=='';if(f.type==='secretList')return Array.isArray(a)&&a.some(s=>String(s).trim());if(f.type==='list')return !same((a as string[]||[]).map(s=>String(s).trim()).filter(Boolean),b);return !same(String(a??''),String(b??''))&&!same(a,b);}):[];
 if(error)return <ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>;
 if(!data)return <FormSkeleton rows={6}/>;
 const readonly=data.readonly;
 const set=(k:string)=>(v:unknown)=>setDraft(d=>({...d,[k]:v}));
 async function save(){setBusy(true);setSaveError('');try{const values=Object.fromEntries(changed.map(f=>{let v=draft[f.key];if(f.type==='list'||f.type==='secretList')v=(v as string[]).map(s=>String(s).trim()).filter(Boolean);return [f.key,v];}));await api('/site-config/'+section,send('PUT',{values}));setConfirming(false);notify('平台配置已保存');if('company_name' in values)window.dispatchEvent(new Event(SITE_NAME_EVENT));setRevision(v=>v+1);}catch(e){setSaveError((e as Error).message);}finally{setBusy(false);}}
 return <div className="cfg-section">
  {readonly&&<div className="cfg-note"><TriangleAlert size={16}/>此分组只能查看，平台接口没有提供修改。</div>}
  {groups.map(g=><section className="cfg-group" key={g.title}><div className="cfg-group-head"><h2>{g.title}</h2>{g.note&&<p>{g.note}</p>}</div><div className="cfg-fields">
   {g.fields.filter(f=>!f.when||f.when(draft)).map(f=><FieldInput key={f.key} f={f} value={draft[f.key]} set={set(f.key)} secretSet={data.secrets[f.key]} readonly={readonly}/>)}
   {custom&&custom.group===g.title&&<div className="cfg-field is-wide"><span className="cfg-label">{custom.label}</span>{custom.render(draft[custom.key],set(custom.key),data)}</div>}
  </div></section>)}
  {extra?.(data)}
  {!readonly&&<div className={'cfg-savebar'+(changed.length?' is-dirty':'')}><span>{changed.length?`${changed.length} 项修改未保存`:'没有未保存的修改'}</span><Button variant="outline" size="sm" isDisabled={!changed.length} onPress={()=>setDraft(structuredClone(data.values))}><RotateCcw size={15}/>撤销修改</Button><Button size="sm" isDisabled={!changed.length} onPress={()=>{setSaveError('');setConfirming(true);}}><Save size={15}/>保存</Button></div>}
  {confirming&&<Dialog title="确认保存平台配置" onClose={()=>{if(!busy)setConfirming(false);}} footer={<><Button variant="outline" isDisabled={busy} onPress={()=>setConfirming(false)}>取消</Button><Button isPending={busy} onPress={save}>确认保存</Button></>}>
   <p>以下修改会直接写入平台的全局配置：</p>
   <ul className="cfg-diff">{changed.map(f=><li key={f.key}><strong>{f.label}</strong><span>{f.type==='secret'||f.type==='secretList'?'替换为新的值':<>{shown(f,data.values[f.key])} → {shown(f,f.type==='list'?(draft[f.key] as string[]).map(s=>String(s).trim()).filter(Boolean):draft[f.key])}</>}</span></li>)}</ul>
   {section==='security'&&<div className="cfg-note is-danger"><TriangleAlert size={16}/>端口或管理员路径改错会导致平台无法访问。修改管理员路径后，请到连接设置更新平台地址。</div>}
   {saveError&&<ErrorBox message={saveError}/>}
  </Dialog>}
 </div>;
}

function ReadonlyInfo({rows}:{rows:[string,unknown][]}){const list=rows.filter(([,v])=>v!==undefined&&v!==null&&v!=='');if(!list.length)return null;return <section className="cfg-group"><div className="cfg-group-head"><h2>版本信息</h2><p>由平台返回，只读。</p></div><dl className="cfg-info">{list.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl></section>;}

/** DDNS node scope: every node grouped by area, ticked when DDNS is enabled for it. */
function DdnsNodes({value,set,data}:{value:unknown;set:(v:unknown)=>void;data:Data}){
 const chosen=new Set((Array.isArray(value)?value:[]).map(Number));const areas:Row[]=Array.isArray(data.extra.area)?data.extra.area:[];
 if(!areas.length)return <small className="cfg-muted">平台没有返回节点。</small>;
 const toggle=(id:number,yes:boolean)=>{const next=new Set(chosen);if(yes)next.add(id);else next.delete(id);set([...next]);};
 return <div className="cfg-node-groups">{areas.map(a=><div key={a.id} className="cfg-node-group"><span className="cfg-node-area">{a.name}</span><div>{(a.node||[]).map((n:Row)=><Checkbox key={n.id} isSelected={chosen.has(Number(n.id))} isDisabled={n.is_domain===false} onChange={v=>toggle(Number(n.id),v)}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control><Label>{n.name}<small className="mono"> {n.ip}</small></Label></Checkbox.Content></Checkbox>)}</div></div>)}</div>;
}

/** 内网IP设置: each node's private IP, saved together. */
function PrivateIp({notify}:{notify:Notify}){
 const [areas,setAreas]=useState<Row[]|null>(null),[draft,setDraft]=useState<Record<string,string>>({}),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
 useEffect(()=>{let live=true;setError('');api('/site-config/private_ip').then(r=>{if(live){setAreas(r.areas);setDraft(Object.fromEntries(r.areas.flatMap((a:Row)=>a.node.map((n:Row)=>[String(n.id),String(n.private_ip??'')]))));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[revision]);
 if(error)return <ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>;
 if(!areas)return <FormSkeleton rows={4}/>;
 const original=Object.fromEntries(areas.flatMap(a=>a.node.map((n:Row)=>[String(n.id),String(n.private_ip??'')])));
 const changed=Object.keys(draft).filter(k=>draft[k].trim()!==original[k]);
 async function save(){setBusy(true);setSaveError('');try{await api('/site-config/private_ip',send('PUT',{private_ip:Object.fromEntries(changed.map(k=>[k,draft[k].trim()]))}));notify('节点内网 IP 已保存');setRevision(v=>v+1);}catch(e){setSaveError((e as Error).message);}finally{setBusy(false);}}
 return <div className="cfg-section"><section className="cfg-group"><div className="cfg-group-head"><h2>节点内网 IP</h2><p>节点之间通信使用的内网地址，留空表示不设置。</p></div><div>
  {!areas.length?<Empty kind="network" title="没有节点" text="平台还没有返回节点，添加节点后可以在这里设置内网 IP。"/>:<Table><Table.ScrollContainer><Table.Content aria-label="节点内网 IP" className="cfg-table"><Table.Header><Table.Column isRowHeader>节点</Table.Column><Table.Column>区域</Table.Column><Table.Column>公网 IP</Table.Column><Table.Column>内网 IP</Table.Column></Table.Header><Table.Body>{areas.flatMap(a=>a.node.map((n:Row)=><Table.Row key={n.id}><Table.Cell>{n.name}</Table.Cell><Table.Cell>{a.name}</Table.Cell><Table.Cell><span className="mono">{n.ip}</span></Table.Cell><Table.Cell><TextField aria-label={n.name+' 内网 IP'} value={draft[String(n.id)]??''} onChange={v=>setDraft(d=>({...d,[String(n.id)]:v}))}><Input className="mono cfg-ip-input" placeholder="10.0.0.1"/></TextField></Table.Cell></Table.Row>))}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
  {saveError&&<ErrorBox message={saveError}/>}
 </div></section>
 <div className={'cfg-savebar'+(changed.length?' is-dirty':'')}><span>{changed.length?`${changed.length} 个节点未保存`:'没有未保存的修改'}</span><Button variant="outline" size="sm" isDisabled={!changed.length||busy} onPress={()=>setDraft(original)}><RotateCcw size={15}/>撤销修改</Button><Button size="sm" isDisabled={!changed.length} isPending={busy} onPress={save}><Save size={15}/>保存</Button></div></div>;
}

/** 节点流量设置: per-node over-quota action, overriding the global one. */
function NodeTraffic({notify}:{notify:Notify}){
 const [result,setResult]=useState<List|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[perPage,setPerPage]=useState(20),[revision,setRevision]=useState(0);
 const [form,setForm]=useState<{row:Row|null;node:string;action:string;limit:string}|null>(null),[removing,setRemoving]=useState<Row|null>(null),[nodes,setNodes]=useState<Row[]>([]),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 useEffect(()=>{let live=true;setError('');api<List>(`/site-config/node_traffic?page=${page}&per_page=${perPage}`).then(r=>{if(live)setResult(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[page,perPage,revision]);
 useEffect(()=>{if(form&&!form.row&&!nodes.length)api<List>('/resources/nodes?per_page=100').then(r=>setNodes(r.data)).catch(()=>{});},[form,nodes.length]);
 const label=(v:unknown)=>overflow.find(([o])=>String(o)===String(v))?.[1]||'—';
 async function run(fn:()=>Promise<unknown>,message:string){setBusy(true);setActionError('');try{await fn();setForm(null);setRemoving(null);notify(message);setRevision(v=>v+1);}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}
 const submit=()=>form&&run(()=>form.row?api('/site-config/node_traffic',send('PUT',{node_ids:[Number(form.row.node_id)],over_flow_suspend:Number(form.action),over_flow_bw_limit:form.limit})):api('/site-config/node_traffic',send('POST',{node_id:Number(form.node),over_flow_suspend:Number(form.action),over_flow_bw_limit:form.limit})),form.row?'节点流量设置已修改':'节点流量设置已添加');
 const used=new Set((result?.data||[]).map(r=>String(r.node_id)));
 return <section className="cfg-group"><div className="cfg-group-head"><h2>节点流量设置</h2><p>为个别节点单独设置超额动作，优先于全局设置。</p><Button size="sm" variant="outline" onPress={()=>{setActionError('');setForm({row:null,node:'',action:'1',limit:''});}}><Plus size={15}/>添加节点</Button></div><div>
  {error?<ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>:!result?<TableSkeleton columns={[{title:'节点',width:7},{title:'超额动作',width:6},{title:'限速',width:4},{title:'',width:0}]} rows={3}/>:!result.data.length?<Empty kind="network" size="sm" title="没有节点单独设置" text="所有节点使用全局流量超额设置。" actions={<Button size="sm" variant="outline" onPress={()=>{setActionError('');setForm({row:null,node:'',action:'1',limit:''});}}><Plus size={15}/>添加节点</Button>}/>:<Table><Table.ScrollContainer><Table.Content aria-label="节点流量设置" className="cfg-table"><Table.Header><Table.Column isRowHeader>节点</Table.Column><Table.Column>区域</Table.Column><Table.Column>节点 IP</Table.Column><Table.Column>超额动作</Table.Column><Table.Column>限速</Table.Column><Table.Column>操作</Table.Column></Table.Header><Table.Body>{result.data.map(r=><Table.Row key={r.id??r.node_id}><Table.Cell>{r.node_name||'#'+r.node_id}</Table.Cell><Table.Cell>{r.area_name||'—'}</Table.Cell><Table.Cell><span className="mono">{r.ip||'—'}</span></Table.Cell><Table.Cell>{label(r.over_flow_suspend)}</Table.Cell><Table.Cell className="num">{Number(r.over_flow_suspend)===3&&r.over_flow_bw_limit?r.over_flow_bw_limit+' Mbps':'—'}</Table.Cell><Table.Cell><div className="row-actions"><Button variant="ghost" size="sm" isIconOnly aria-label={'修改 '+(r.node_name||r.node_id)} onPress={()=>{setActionError('');setForm({row:r,node:String(r.node_id),action:String(r.over_flow_suspend??1),limit:String(r.over_flow_bw_limit??'')});}}><Pencil size={15}/></Button><Button variant="ghost" size="sm" isIconOnly aria-label={'删除 '+(r.node_name||r.node_id)} onPress={()=>{setActionError('');setRemoving(r);}}><Trash2 size={15}/></Button></div></Table.Cell></Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
  {result&&result.meta.total_pages>1&&<div className="list-footer"><div className="list-footer-start"/><Pager page={page} totalPages={result.meta.total_pages} perPage={perPage} loading={false} onPage={setPage} onPerPage={n=>{setPerPage(n);setPage(1);}}/></div>}
 </div>
 {form&&<Dialog title={form.row?'修改节点流量设置 · '+(form.row.node_name||form.row.node_id):'添加节点流量设置'} onClose={()=>{if(!busy)setForm(null);}} footer={<><Button variant="outline" isDisabled={busy} onPress={()=>setForm(null)}>取消</Button><Button isPending={busy} isDisabled={busy||(!form.row&&!form.node)||(form.action==='3'&&!(Number(form.limit)>0))} onPress={submit}>保存</Button></>}>
  <div className="cfg-dialog-fields">
   {!form.row&&<div className="cfg-field"><span className="cfg-label">节点</span><Choice aria-label="节点" value={form.node} onChange={e=>setForm({...form,node:e.target.value})}><option value="">请选择节点</option>{nodes.filter(n=>!used.has(String(n.id))).map(n=><option key={n.id} value={String(n.id)}>{n.name}{n.area_name?' · '+n.area_name:''}</option>)}</Choice></div>}
   <div className="cfg-field"><span className="cfg-label">超额动作</span><Choice aria-label="超额动作" value={form.action} onChange={e=>setForm({...form,action:e.target.value})}>{overflow.map(([o,l])=><option key={o} value={String(o)}>{l}</option>)}</Choice></div>
   {form.action==='3'&&<TextField className="cfg-field" value={form.limit} onChange={v=>setForm({...form,limit:v})}><Label>限速大小</Label><div className="cfg-input-row"><Input type="number" min={1} inputMode="numeric"/><span className="cfg-unit">Mbps</span></div></TextField>}
  </div>{actionError&&<ErrorBox message={actionError}/>}
 </Dialog>}
 {removing&&<Dialog title="删除节点流量设置" onClose={()=>{if(!busy)setRemoving(null);}} footer={<><Button variant="outline" isDisabled={busy} onPress={()=>setRemoving(null)}>取消</Button><Button variant="danger" isPending={busy} onPress={()=>run(()=>api('/site-config/node_traffic',send('DELETE',{node_ids:[Number(removing.node_id)]})),'节点流量设置已删除')}>删除</Button></>}><p>删除后节点 {removing.node_name||'#'+removing.node_id} 改用全局流量超额设置。</p>{actionError&&<ErrorBox message={actionError}/>}</Dialog>}
 </section>;
}

function VgpuTest({data}:{data:Data}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState<{ok:boolean;text:string}|null>(null);const server=String(data.values.vgpu_license_server||'');
 return <section className="cfg-group"><div className="cfg-group-head"><h2>测试连接</h2><p>使用已保存的授权服务器地址测试连接。</p></div><div className="cfg-inline">
  <Button size="sm" variant="outline" isDisabled={!server} isPending={busy} onPress={async()=>{setBusy(true);setResult(null);try{const r=await api('/site-config/vgpu/test',send('POST',{vgpu_license_server:server}));setResult({ok:true,text:r.message});}catch(e){setResult({ok:false,text:(e as Error).message});}finally{setBusy(false);}}}><PlugZap size={15}/>测试 {server||'（未保存地址）'}</Button>
  {result&&<span className={result.ok?'cfg-ok':'cfg-bad'}>{result.text}</span>}
  {data.extra.vgpu_host_use&&<span className="cfg-muted">当前有实例正在使用 vGPU。</span>}
 </div></section>;
}

export function SiteConfig({notify}:{notify:Notify}){
 const [params,setParams]=useSearchParams();const tab=siteTabs.some(([k])=>k===params.get('tab'))?params.get('tab')!:'basic';
 const [reload,setReload]=useState(0);
 const select=(k:string)=>setParams(p=>{const n=new URLSearchParams(p);n.set('tab',k);return n;},{replace:true});
 const body=(k:string)=>{switch(k){
  case 'basic':return <SectionForm section="basic" notify={notify} extra={d=><ReadonlyInfo rows={[['系统版本',d.extra.system_version_number],['版本类型',d.extra.system_version],['授权版本',d.extra.edition===1||d.extra.edition==='1'?'专业版':d.extra.edition===0||d.extra.edition==='0'?'免费版':d.extra.edition],['客户端版本',d.extra.client_version],['客户端更新时间',d.extra.client_update_date],['开发文档',d.extra.apidoc]]}/>}/>;
  case 'private_ip':return <PrivateIp notify={notify}/>;
  case 'traffic':return <><SectionForm section="traffic" notify={notify}/><NodeTraffic notify={notify}/></>;
  case 'ddns':return <SectionForm section="ddns" notify={notify} custom={{key:'ddns_domain_enable',label:'节点',group:'启用范围',render:(v,set,d)=><DdnsNodes value={v} set={set} data={d}/>}} extra={d=>d.extra.main_control?.domain?<p className="cfg-muted cfg-after">主控域名：{d.extra.main_control.domain}{d.extra.main_control.ddns_update_time?' · 上次推送 '+d.extra.main_control.ddns_update_time:''}</p>:null}/>;
  case 'vnc':return <SectionForm section="vnc" notify={notify} extra={d=>Array.isArray(d.extra.enable_vnc_ip)&&d.extra.enable_vnc_ip.length?<p className="cfg-muted cfg-after">可用 VNC 地址：<span className="mono">{d.extra.enable_vnc_ip.join('、')}</span></p>:null}/>;
  case 'vgpu':return <SectionForm section="vgpu" notify={notify} extra={d=><VgpuTest data={d}/>}/>;
  case 'debug':return <SectionForm section="debug" notify={notify} extra={d=>d.extra.debug_html?<section className="cfg-group"><div className="cfg-group-head"><h2>调试信息</h2><p>平台返回的内容，按纯文本显示。</p></div><pre className="cfg-pre">{String(d.extra.debug_html)}</pre></section>:null}/>;
  default:return <SectionForm section={k} notify={notify}/>;
 }};
 return <>
  <div className="page-heading"><div><h1>系统设置</h1></div><div className="heading-actions"><Button variant="outline" size="sm" isIconOnly aria-label="重新读取配置" onPress={()=>setReload(v=>v+1)}><RefreshCw size={15}/></Button></div></div>
  <Tabs className="cfg-tabs" selectedKey={tab} onSelectionChange={k=>select(String(k))}>
   <Tabs.ListContainer><Tabs.List aria-label="设置分组">{siteTabs.map(([k,t])=><Tabs.Tab key={k} id={k}>{t}<Tabs.Indicator/></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
   {siteTabs.map(([k])=><Tabs.Panel key={k} id={k} className="cfg-panel">{k===tab&&<div key={reload}>{body(k)}</div>}</Tabs.Panel>)}
  </Tabs>
 </>;
}
