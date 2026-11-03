import {useEffect,useState,type ReactNode} from 'react';
import {Avatar,Button,Checkbox,Chip,Description,Input,InputGroup,Label,Switch,Table,TextField} from '@heroui/react';
import {ArrowLeft,Briefcase,ChevronDown,Eye,EyeOff,History,Info,Layers,Pencil,Plus,RefreshCw,Search,Trash2,TriangleAlert,UserRound,X} from 'lucide-react';
import {StatusIcon,cloudStatuses,healthStatuses,unknownStatus,type StatusSpec} from '../components/StatusIcon';
import {TaskStatus} from '../components/TaskStatus';
import {Usage} from '../components/NodeTelemetry';
import {Choice} from '../components/Controls';
import {Empty,type EmptyKind} from '../components/Shared';
import {CountryFlag} from '../components/CountryFlag';

/**
 * 设计规范页（/guidelines）：用真实组件展示 DESIGN.md 里的规则，页面不会和应用走样。
 * 左侧为目录侧边栏，滚动时高亮当前章节；窄屏时目录变为顶部横向滚动条。新增或修改规范时同步更新此页。
 */
type Entry={id:string;title:string};
const toc:{group:string;items:Entry[]}[]=[
 {group:'基础',items:[{id:'brand',title:'品牌与 LOGO'},{id:'color',title:'颜色'},{id:'type',title:'尺寸与版式'}]},
 {group:'导航',items:[{id:'header',title:'顶栏与下拉菜单'}]},
 {group:'状态',items:[{id:'cloud-status',title:'实例状态'},{id:'health-status',title:'节点与区域状态'},{id:'task-status',title:'任务状态'}]},
 {group:'组件',items:[{id:'buttons',title:'按钮'},{id:'inputs',title:'输入控件'},{id:'tags',title:'标签与名称'},{id:'usage',title:'使用率'}]},
 {group:'列表页',items:[{id:'list-heading',title:'标题与工具栏'},{id:'list-table',title:'表格与勾选列'},{id:'list-subview',title:'子视图与返回'}]},
 {group:'弹窗',items:[{id:'dialog-confirm',title:'确认弹窗'},{id:'dialog-delete',title:'删除与批量'}]},
 {group:'反馈',items:[{id:'empty',title:'空状态'}]}
];

function Section({id,title,note,children}:{id:string;title:string;note?:ReactNode;children:ReactNode}){
 return <section id={'g-'+id} className="guide-section"><div className="guide-head"><h2>{title}</h2>{note&&<p>{note}</p>}</div><div className="guide-body">{children}</div></section>;
}
function Rules({items}:{items:ReactNode[]}){return <ul className="guide-rules">{items.map((t,i)=><li key={i}>{t}</li>)}</ul>;}
function StatusRows({items}:{items:[string,StatusSpec][]}){
 return <div className="guide-status-list">{items.map(([key,spec])=><div key={key} className="guide-status-row"><StatusIcon spec={spec} size={20}/><strong>{spec.title}</strong><code>{key}</code><span className="guide-swatch" style={{background:spec.color}} aria-hidden="true"/><code>{spec.color}</code><span className="guide-meaning">{spec.meaning}</span></div>)}</div>;
}
const swatches:[string,string,string][]=[['品牌深海蓝','#102442','顶栏、登录页品牌区'],['下拉菜单蓝','#26476F','顶栏下拉菜单底色'],['主色','var(--accent)','主按钮、链接、选中、使用率条'],['头像线条','#1D4ED8','右上角头像图标'],['成功','#15803d','运行中、正常、上行带宽'],['警告','var(--warning)','使用率 ≥ 80%、暂停、谨慎操作提醒'],['危险','var(--danger)','使用率 ≥ 90%、删除'],['停止','#991b1b','已关机、执行失败'],['边框','#d4d4d8','输入框、搜索框、下拉框'],['次要文字','var(--muted)','说明、表头、副行']];
const emptyKinds:[EmptyKind,string][]=[['instance','实例'],['node','节点'],['area','区域'],['image','镜像'],['iso','ISO'],['user','用户'],['log','日志'],['task','任务'],['recycle','回收站'],['search','搜索无结果'],['chart','统计'],['network','网络 / IP'],['box','通用']];
const sampleRows=[{id:1,name:'香港 BGP',node:'HK-KVM-01、HK-KVM-02',lock:2,used:13,free:24,total:39,group:'默认 IPv4 分组'},{id:2,name:'洛杉矶 CN2',node:'',lock:0,used:8,free:15,total:23,group:''},{id:3,name:'东京 高防',node:'TYO-KVM-01',lock:1,used:7,free:13,total:21,group:'高防 IPv4 分组'}];

export function Guidelines(){
 const [show,setShow]=useState(false),[pick,setPick]=useState(''),[on,setOn]=useState(true),[checked,setChecked]=useState(true),[picked,setPicked]=useState<Set<number>>(new Set([1])),[active,setActive]=useState('brand');
 // 滚动时高亮目录中当前可见的章节。
 useEffect(()=>{
  const nodes=toc.flatMap(g=>g.items).map(i=>document.getElementById('g-'+i.id)).filter(Boolean) as HTMLElement[];
  const io=new IntersectionObserver(entries=>{const hit=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(hit)setActive(hit.target.id.slice(2));},{rootMargin:'-80px 0px -65% 0px'});
  nodes.forEach(n=>io.observe(n));return()=>io.disconnect();
 },[]);
 const jump=(id:string)=>{document.getElementById('g-'+id)?.scrollIntoView({behavior:'smooth',block:'start'});setActive(id);};
 const allPicked=sampleRows.every(r=>picked.has(r.id)),somePicked=!allPicked&&sampleRows.some(r=>picked.has(r.id));
 return <>
  <div className="page-heading"><div><h1>设计规范</h1></div></div>
  <div className="guide-layout">
   <nav className="guide-nav" aria-label="设计规范目录">
    {toc.map(g=><div key={g.group} className="guide-nav-group"><span>{g.group}</span>{g.items.map(i=><a key={i.id} href={'#g-'+i.id} className={active===i.id?'is-active':''} aria-current={active===i.id?'location':undefined} onClick={e=>{e.preventDefault();jump(i.id);}}>{i.title}</a>)}</div>)}
   </nav>
   <div className="guide-content">

  <Section id="brand" title="品牌与 LOGO" note="LOGO 为蓝色等角立方体，顶面一格升起成白色小立方体，表示被部署和管理的实例。同一个文件（public/logo.svg）用于顶栏、登录页和 favicon。">
   <div className="guide-row guide-brand">
    <img src="/logo.svg" width={96} height={96} alt="CubeManage LOGO"/>
    <div className="guide-brand-bar"><img src="/logo.svg" width={30} height={30} alt=""/><span>星河云</span></div>
    <img src="/logo.svg" width={16} height={16} alt=""/>
   </div>
   <Rules items={['顶栏 LOGO 旁的文字是网站配置里的“网站名称”（company_name），未设置时显示 CubeManage 字标；名称缓存在浏览器本地，过长时省略号截断。','LOGO 即首页链接，导航中不再单列“控制台”。']}/>
  </Section>

  <Section id="color" title="颜色">
   <div className="guide-swatches">{swatches.map(([name,value,use])=><div key={name} className="guide-color"><span className="guide-swatch large" style={{background:value}} aria-hidden="true"/><div><strong>{name}</strong><code>{value}</code><small>{use}</small></div></div>)}</div>
  </Section>

  <Section id="type" title="尺寸与版式">
   <dl className="kv-grid">{[['页面标题','24px / 600，行高 36px，下方间距 20px'],['区块标题','16px / 600'],['正文与表格','14px'],['说明与副行','12–13px，次要文字色'],['控件圆角','10px（--field-radius）；弹层 14px，弹层选项 10px'],['控件高度','36px（工具栏的搜索框、按钮、下拉框）/ 40px（表单）'],['页面边距','32px，窄屏 16px'],['表头','无竖向分割线、无底色带']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  </Section>

  <Section id="header" title="顶栏与下拉菜单" note="顶栏通栏深海蓝，导航一级按钮保留图标，下拉菜单只放文字。下拉菜单用比顶栏浅一档的蓝色，与顶栏同一色调。">
   <div className="global-header guide-header">
    <span className="brand"><img src="/logo.svg" width={30} height={30} alt=""/><span className="brand-name">星河云</span></span>
    <nav className="header-nav guide-header-nav"><Button size="sm" variant="secondary"><Briefcase size={16}/><span>业务管理</span><ChevronDown className="nav-chevron" size={13}/></Button><Button size="sm" variant="ghost"><History size={16}/><span>日志</span><ChevronDown className="nav-chevron" size={13}/></Button></nav>
    <div className="header-account"><Avatar size="sm" className="header-avatar"><Avatar.Fallback><UserRound size={18} strokeWidth={2.25} aria-hidden="true"/></Avatar.Fallback></Avatar></div>
   </div>
   <div className="dropdown__popover nav-popover guide-popover" role="presentation">
    <div className="menu-item" data-selected="true"><span data-slot="label">实例管理</span></div>
    <div className="menu-item" data-hovered="true"><span data-slot="label">用户管理</span></div>
   </div>
   <Rules items={[
    '导航顺序：业务管理（实例管理、用户管理）、区域节点、网络管理（管理 IPv4、管理 IPv6、ADSL 维护）、镜像管理、日志、设置。实例详情和回收站也高亮“业务管理”。',
    <>下拉菜单（<code>nav-popover</code>）：底色 #26476F、边框 #3A5D86，文字 #E1EAF7，悬停 #30578A，当前项 #3A6599 白字，选中标记 #B5D3FF。</>,
    '右上角头像：白色圆底，深蓝（#1D4ED8）线性用户图标，线宽 2.25，不显示首字母。',
    '全局搜索结果保留白色卡片，便于阅读主机名和 IP。'
   ]}/>
  </Section>

  <Section id="cloud-status" title="实例状态" note="依据平台 API 文档的 12 种状态，只用图标表示，悬停显示名称。图标为实心圆加白色符号，颜色表达类别：绿色运行、深红停止、琥珀与橙色为暂停、挂起或救援，蓝色为进行中，灰色为回收站或未知。">
   <StatusRows items={[...Object.entries(cloudStatuses),['（文档外）',unknownStatus]]}/>
  </Section>

  <Section id="health-status" title="节点与区域状态" note="实心圆加白色符号：绿色对号正常、红色叉号异常。节点状态列可点击刷新，刷新时图标替换为旋转的刷新符号。镜像 / ISO 的启用状态、停用的 IP 段也使用这组图标。">
   <StatusRows items={Object.entries(healthStatuses).map(([k,v])=>[k==='1'?'status = 1':'status = 0',v])}/>
  </Section>

  <Section id="task-status" title="任务状态" note="只显示图标，悬停显示状态名称；执行失败时同时显示平台返回的原因。等待执行为灰色横线、执行中为转圈、成功为绿色对号、失败为深红叉号、强制结束与已取消为灰色。">
   <div className="guide-row guide-task-row">{[['0','等待执行'],['1','执行中'],['2','执行成功'],['3','执行失败'],['4','强制结束'],['5','已取消']].map(([v,t])=><span key={v} className="guide-task"><TaskStatus status={v} msg={v==='3'?'节点通信超时':undefined}/><small>{t}</small></span>)}</div>
  </Section>

  <Section id="buttons" title="按钮" note="一屏只放一个主按钮（白字蓝底）。次要操作用描边按钮，表格内和工具类操作用带提示的仅图标幽灵按钮，危险操作用红色。圆角 10px。">
   <div className="guide-row">
    <Button size="sm"><Plus size={16}/>新建实例</Button>
    <Button size="sm" variant="outline"><ArrowLeft size={16}/>返回 IP 段</Button>
    <Button size="sm" variant="outline" isIconOnly aria-label="刷新"><RefreshCw size={15}/></Button>
    <Button size="sm" variant="ghost" isIconOnly aria-label="编辑"><Pencil size={15}/></Button>
    <Button size="sm" variant="danger"><Trash2 size={15}/>删除实例</Button>
    <Button size="sm" isDisabled>不可用</Button>
   </div>
  </Section>

  <Section id="inputs" title="输入控件" note="标签在上，说明写在输入框下方。输入框、搜索框、下拉框统一 1px 灰色边框、10px 圆角；输入框内的图标按钮用浅灰色，不加分隔线。勾选一律用 HeroUI Checkbox。">
   <div className="guide-fields">
    <TextField><Label>平台地址</Label><Input placeholder="https://cloud.example.com/管理目录"/><Description>填写管理端地址，包含管理目录。</Description></TextField>
    <TextField><Label>密码</Label><InputGroup><InputGroup.Input type={show?'text':'password'} placeholder="平台管理员密码"/><InputGroup.Suffix><Button variant="ghost" size="sm" isIconOnly aria-label={show?'隐藏密码':'显示密码'} onPress={()=>setShow(!show)}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</Button></InputGroup.Suffix></InputGroup></TextField>
    <div className="guide-field"><span className="guide-label">搜索</span><InputGroup className="resource-search"><InputGroup.Prefix><Search size={17}/></InputGroup.Prefix><InputGroup.Input aria-label="搜索示例" placeholder="搜索主机名 / IP 地址"/></InputGroup></div>
    <div className="guide-field"><span className="guide-label">筛选下拉</span><Choice aria-label="筛选示例" value={pick} onChange={e=>setPick(e.target.value)}><option value="">全部区域</option><option value="hk">香港 MG</option><option value="us">美国 Pro</option></Choice></div>
    <div className="guide-field"><span className="guide-label">勾选与开关</span><div className="guide-row"><Checkbox isSelected={checked} onChange={setChecked}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control><Label>记住我的筛选条件</Label></Checkbox.Content></Checkbox><Switch size="sm" isSelected={on} onChange={setOn} aria-label="启用示例"><Switch.Content aria-label="启用示例"><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch></div></div>
   </div>
  </Section>

  <Section id="tags" title="标签与名称" note="页面标题后不放数量徽标，数量写在列表底部“共 N 条”。分组标识是小号浅蓝底；文字状态标签用 HeroUI Chip 的 soft 样式（浅底深字）。实例名称是普通链接，仅悬停时显示下划线；可点进下一级的名称（如 IP 段名称）为蓝色链接。">
   <div className="guide-row">
    <span className="group-tag">MG</span><span className="group-tag">9929</span>
    <Chip variant="soft" color="success" size="sm">空闲</Chip><Chip variant="soft" color="accent" size="sm">已分配</Chip><Chip variant="soft" color="warning" size="sm">已锁定</Chip><Chip variant="soft" color="danger" size="sm">异常</Chip><Chip variant="soft" size="sm">已结束</Chip>
    <a className="owner-count-link" href="#g-tags" onClick={e=>e.preventDefault()}>香港 BGP</a>
   </div>
   <div className="instance-cell guide-sample"><a className="instance-link" href="#instance-sample" onClick={e=>e.preventDefault()}>VM-7JGph2LZnhAd</a><div className="instance-sub"><CountryFlag code="HK" name="中国香港"/><span className="num">#39615</span><span aria-hidden="true">·</span><span>HK-MG-2</span><span className="group-tag">MG</span></div></div>
  </Section>

  <Section id="usage" title="使用率" note="数值在上、细条在下。低于 80% 用主色，80% 起为警告色，90% 起为危险色；实例未运行或没有数据时显示“—”。节点列表的 CPU、内存、磁盘细条撑满单元格（最小 6rem）。">
   <div className="guide-row guide-usage"><Usage value={34.2} label="示例 34.2%"/><Usage value={82.6} label="示例 82.6%"/><Usage value={93.1} label="示例 93.1%"/><Usage value={null} label="示例无数据"/></div>
  </Section>

  <Section id="list-heading" title="标题与工具栏" note="所有列表页统一：实例、区域、节点、任务中心；镜像、ISO、用户、各类日志、黑名单；回收站；IPv4、IPv6、ADSL。新增列表页同样遵守。">
   <div className="guide-toolbar">
    <h3 className="guide-inline-title">IPv4 管理</h3>
    <div className="filter-bar"><div className="filters">
     <Choice aria-label="分组示例" value="" onChange={()=>{}}><option value="">全部分组</option><option value="1">默认分组</option></Choice>
     <InputGroup className="resource-search"><InputGroup.Prefix><Search size={17}/></InputGroup.Prefix><InputGroup.Input aria-label="搜索示例" placeholder="搜索 IP 段名称"/></InputGroup>
    </div><div className="filter-actions">
     <Button variant="outline" size="sm" isIconOnly aria-label="刷新"><RefreshCw size={15}/></Button>
     <Button size="sm"><Plus size={16}/>新建 IP 段</Button>
     <Button variant="outline" size="sm"><Layers size={15}/>分组</Button>
    </div></div>
   </div>
   <Rules items={[
    '标题行只放页面标题：不放数量徽标、按钮、小标题或说明段落；高 36px，下方间距 20px。',
    '工具栏左侧：筛选下拉 → 搜索框（16rem）→ 有筛选时的“清除筛选”。',
    '工具栏右侧（靠右对齐）：刷新（仅图标）→ 新建（主按钮）→ 其他按钮（描边：分组、回收站、迁移队列、批量导入、返回）。',
    '工具栏不放说明文字；需要说明的放进空状态或弹窗。窄屏时整行换行，按钮组回到左侧，搜索框占满一行。',
    '页脚：左侧为批量操作（带已选数量），右侧为“共 N 条”、每页条数和分页。'
   ]}/>
  </Section>

  <Section id="list-table" title="表格与勾选列" note="勾选列用 HeroUI Checkbox（className=“table-check”），表头为“全选本页”并支持半选，列宽取最小。数量各占一列；没有内容的单元格（如未指定节点、未分组）直接留空。">
   <Table><Table.ScrollContainer><Table.Content aria-label="勾选列示例" className="net-table guide-table"><Table.Header>
    <Table.Column><Checkbox slot={null} className="table-check" aria-label="全选本页" isSelected={allPicked} isIndeterminate={somePicked} onChange={v=>setPicked(v?new Set(sampleRows.map(r=>r.id)):new Set())}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Column>
    {['名称','节点','锁定','已用','空闲','总数','分组'].map((t,i)=><Table.Column key={t} isRowHeader={i===0}>{t}</Table.Column>)}
   </Table.Header><Table.Body>{sampleRows.map(r=><Table.Row key={r.id}>
    <Table.Cell><Checkbox slot={null} className="table-check" aria-label={'选择 '+r.name} isSelected={picked.has(r.id)} onChange={v=>setPicked(s=>{const n=new Set(s);if(v)n.add(r.id);else n.delete(r.id);return n;})}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox.Content></Checkbox></Table.Cell>
    <Table.Cell><a className="owner-count-link" href="#g-list-table" onClick={e=>e.preventDefault()}>{r.name}</a></Table.Cell><Table.Cell>{r.node}</Table.Cell>
    {[r.lock,r.used,r.free,r.total].map((n,i)=><Table.Cell key={i}><span className="num">{n}</span></Table.Cell>)}<Table.Cell>{r.group}</Table.Cell>
   </Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>
  </Section>

  <Section id="list-subview" title="子视图与返回" note="不使用 Tab。下一级列表作为子视图记在网址的 ?view= 中（如 IP 段 → IP 地址、分组），点名称或“分组”按钮进入，新增一条浏览历史；工具栏最右为“返回 …”描边按钮，浏览器后退同样返回。">
   <div className="guide-row"><a className="owner-count-link" href="#g-list-subview" onClick={e=>e.preventDefault()}>香港 BGP</a><span className="guide-arrow">→</span><span>IP 地址列表</span><Button variant="outline" size="sm"><ArrowLeft size={16}/>返回 IP 段</Button></div>
  </Section>

  <Section id="dialog-confirm" title="确认弹窗" note="开关类、无需填写内容的操作（如节点的启用 / 维护）只确认：标题 + 一条提醒 + 取消 / 确认，不要求输入编号，也不重复显示对象信息。按钮最小宽度 6.5rem。">
   <div className="guide-dialogs">
    <div className="guide-dialog"><h3>禁用节点</h3><div className="cfg-note"><TriangleAlert size={16}/><span>禁用后节点停止参与平台的资源分配，请先确认当前业务安排。</span></div><footer><Button className="node-switch-btn" variant="outline">取消</Button><Button className="node-switch-btn" variant="danger">确认</Button></footer></div>
    <div className="guide-dialog"><h3>启用节点</h3><div className="node-switch-note"><Info size={16}/><span>启用后节点重新参与平台的资源分配。</span></div><footer><Button className="node-switch-btn" variant="outline">取消</Button><Button className="node-switch-btn">确认</Button></footer></div>
   </div>
   <Rules items={['会减少可用资源或影响业务的操作（禁用、开启维护）用琥珀色提醒和红色确认按钮；恢复类操作用浅蓝提醒和蓝色确认按钮。','所有弹窗都是 HeroUI Modal：点遮罩不关闭，Esc 和右上角关闭按钮可关闭。']}/>
  </Section>

  <Section id="dialog-delete" title="删除与批量" note="删除弹窗为红色提示 + 所选记录列表，服务端核对所选数量；平台部分拒绝时在同一弹窗列出成功与失败数量和原因。批量修改只提交填写或选择了的项目，下拉默认项为“不修改”。删除区域、节点等单个重要资源仍需输入编号确认。">
   <div className="guide-dialogs">
    <div className="guide-dialog"><h3>删除 2 个 IP</h3><div className="cfg-note is-danger"><TriangleAlert size={16}/><span>只能删除未分配的 IP，已分配给实例的 IP 会被平台拒绝删除。</span></div><ul className="recycle-list"><li><strong className="mono">203.0.113.12</strong><span className="num">#12</span></li><li><strong className="mono">203.0.113.13</strong><span className="num">#13</span></li></ul><footer><Button className="node-switch-btn" variant="outline">取消</Button><Button className="node-switch-btn" variant="danger">删除</Button></footer></div>
   </div>
  </Section>

  <Section id="empty" title="空状态" note="列表或卡片没有内容时显示：等角线框插画、标题、为什么是空的、下一步操作。可新建的场景带“+”徽标，无数据或无结果带“!”徽标。列表用 96px，卡片和子列表用 72px。搜索或筛选无结果统一用放大镜插画，并提供“清除搜索 / 清除筛选”。">
   <div className="guide-empty-grid">{emptyKinds.map(([k,t])=><figure key={k}><img src={`/empty/${k}.svg`} width={96} height={96} alt=""/><figcaption>{t}<small>{k}</small></figcaption></figure>)}</div>
   <div className="guide-empty-samples">
    <div className="guide-empty-card"><Empty kind="instance" title="还没有实例" text="创建第一台云服务器后，它的状态、配置和用量会显示在这里。" actions={<><Button size="sm"><Plus size={15}/>新建实例</Button><Button size="sm" variant="outline"><RefreshCw size={15}/>刷新</Button></>}/></div>
    <div className="guide-empty-card"><Empty kind="search" title="没有找到匹配的实例" text={<>没有名称或 IP 包含 <strong>“web-99”</strong> 的实例。</>} actions={<Button size="sm" variant="outline"><X size={15}/>清除筛选</Button>}/></div>
    <div className="guide-empty-card"><Empty kind="chart" title="暂无统计数据" text="平台还没有返回每日操作统计。"/></div>
   </div>
  </Section>

   </div>
  </div>
 </>;
}
