import {useState,type FormEvent} from 'react';
import {Button,TextField,Label,Input,InputGroup,Description} from '@heroui/react';
import {ArrowRight,Eye,EyeOff,ShieldCheck} from 'lucide-react';
import {Choice} from '../components/Controls';
import {loadPlatforms,rememberPlatform,forgetPlatform} from '../lib/savedPlatforms';
import {api,send,type Session} from '../lib/api';
import {ErrorBox} from '../components/Shared';

/**
 * The login's picture: one cloud server from order to running, as line art on the brand field.
 * Dashed outline (ordered) → slid into a node's rack → OS image being written → lit and online.
 */
const stages:[string,string][]=[['下单开通','选择规格与系统'],['分配节点','区域 · 节点 · IP'],['安装系统','写入镜像'],['运行中','开机并联网']];
function Lifecycle(){
 const xs=[70,210,350,490];
 return <svg className="login-lifecycle" viewBox="0 0 560 220" role="img" aria-label="云服务器从开通到运行：下单开通、分配节点、安装系统、运行中">
  <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
   <path d="M70 150H490" stroke="#5B93F5"/>
   <g transform="translate(70 0)"><rect x={-44} y={68} width={88} height={52} rx={8} stroke="#6F8FBF" strokeDasharray="6 5"/><path d="M0 82V106M-12 94H12" stroke="#8FB3EF"/></g>
   <g transform="translate(210 0)"><path d="M-54 54V134M54 54V134M-54 62H-48M-54 76H-48M-54 112H-48M-54 126H-48M54 62H48M54 76H48M54 112H48M54 126H48" stroke="#4E6E9E"/><rect x={-40} y={68} width={80} height={52} rx={8} stroke="#8FB3EF"/><path d="M-26 86H-2M-26 94H-2M-26 102H-2" stroke="#4E6E9E"/><path d="M14 88l8 6-8 6" stroke="#8FB3EF"/></g>
   <g transform="translate(350 0)"><rect x={-44} y={68} width={88} height={52} rx={8} stroke="#8FB3EF"/><rect x={-30} y={100} width={60} height={8} rx={4} stroke="#4E6E9E"/><path className="login-install" d="M-26 104H6" stroke="#5B93F5" strokeWidth={4}/><path d="M-30 84H-14M-30 90H-20" stroke="#4E6E9E"/><circle cx={22} cy={86} r={7} stroke="#8FB3EF"/><circle cx={22} cy={86} r={1.5} fill="#8FB3EF" stroke="none"/></g>
   <g transform="translate(490 0)"><rect x={-44} y={68} width={88} height={52} rx={8} stroke="#FFFFFF"/><path d="M-30 86H-6M-30 94H-6M-30 102H-6" stroke="#8FB3EF"/><circle className="login-led" cx={14} cy={94} r={3.5} fill="#4ADE80" stroke="none"/><circle className="login-led login-led-late" cx={26} cy={94} r={3.5} fill="#4ADE80" stroke="none"/><path d="M28 50a14 14 0 0 1 14 14M28 40a24 24 0 0 1 24 24" stroke="#8FB3EF"/><circle cx={28} cy={64} r={2} fill="#8FB3EF" stroke="none"/></g>
   {xs.map((x,i)=>i<3?<circle key={x} cx={x} cy={150} r={5} fill="#5B93F5" stroke="#5B93F5"/>:<g key={x}><circle cx={x} cy={150} r={12} stroke="#5B93F5" strokeOpacity={.5}/><circle cx={x} cy={150} r={7} fill="#FFFFFF" stroke="#FFFFFF"/></g>)}
  </g>
  <g textAnchor="middle" aria-hidden="true">{stages.map(([title,note],i)=><g key={title}><text x={xs[i]} y={182} fontSize={13} fill={i===3?'#FFFFFF':'#C6D5EC'} fontWeight={i===3?600:400}>{title}</text><text x={xs[i]} y={202} fontSize={11} fill="#8199BF">{note}</text></g>)}</g>
 </svg>;
}

const NEW='__new';

export function Login({onLogin}:{onLogin:(s:Session)=>void}){
 // 登录过的平台地址保存在这个浏览器里（只有地址），有的话默认选中最近一次的；用户名和密码每次输入，从不保存。
 const [saved,setSaved]=useState<string[]>(()=>loadPlatforms());
 const [baseUrl,setBase]=useState(()=>saved[0]||''),[typing,setTyping]=useState(()=>!saved.length);
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[show,setShow]=useState(false);
 const pick=(v:string)=>{if(v===NEW){setTyping(true);setBase('');}else setBase(v);};
 const backToList=()=>{setTyping(false);setBase(saved[0]||'');};
 const remove=()=>{const list=forgetPlatform(baseUrl);setSaved(list);if(list.length)setBase(list[0]);else{setTyping(true);setBase('');}};
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const session=await api<Session>('/login',send('POST',{baseUrl,username,password}));rememberPlatform(baseUrl);onLogin(session);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="login-page">
  <aside className="login-brand">
   <div className="login-mark"><img src="/logo.svg" width={36} height={36} alt=""/><span>Cube<b>Manage</b></span></div>
   <Lifecycle/>
   <div className="login-story">
    <p className="login-trust"><ShieldCheck size={16} aria-hidden="true"/>密码只用于本次登录，不在任何地方保存；会话加密保存在你的浏览器，随平台令牌失效。</p>
   </div>
  </aside>
  <section className="login-main">
   <form className="login-form" onSubmit={submit} noValidate={false}>
    <div className="login-heading"><h1>登录</h1><p>使用云平台管理员账号登录。</p></div>
    {error&&<ErrorBox message={error}/>}
    {typing?<TextField isRequired value={baseUrl} onChange={setBase} name="platform">
     <Label>平台地址</Label>
     <Input placeholder="https://cloud.example.com/管理目录" type="url" autoComplete="url" inputMode="url" autoFocus={saved.length>0}/>
     <Description className="login-platform-help"><span>填写管理端地址，包含管理目录，不需要加 /v1。</span>{saved.length>0&&<button type="button" className="login-link" onClick={backToList}>选择已保存的地址</button>}</Description>
    </TextField>
    :<div className="login-platform">
     <span className="login-field-label">平台地址</span>
     <Choice aria-label="平台地址" value={baseUrl} onChange={e=>pick(e.target.value)}>
      {saved.map(url=><option key={url} value={url}>{url}</option>)}
      <option value={NEW}>+ 输入新的平台地址…</option>
     </Choice>
     <div className="login-platform-help"><span>最近登录过的平台，保存在这个浏览器里。</span><button type="button" className="login-link" onClick={remove}>从列表中移除</button></div>
    </div>}
    <TextField isRequired value={username} onChange={setUsername} name="username">
     <Label>用户名</Label>
     <Input autoComplete="username" placeholder="平台管理员用户名" autoFocus={!typing}/>
    </TextField>
    <TextField isRequired value={password} onChange={setPassword} name="password">
     <Label>密码</Label>
     <InputGroup>
      <InputGroup.Input type={show?'text':'password'} autoComplete="current-password" placeholder="平台管理员密码"/>
      <InputGroup.Suffix><Button variant="ghost" size="sm" isIconOnly type="button" aria-label={show?'隐藏密码':'显示密码'} aria-pressed={show} onPress={()=>setShow(!show)}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</Button></InputGroup.Suffix>
     </InputGroup>
    </TextField>
    <Button type="submit" fullWidth isPending={busy} isDisabled={busy} className="login-submit">{busy?'正在连接平台…':'登录'}{!busy&&<ArrowRight size={16}/>}</Button>
   </form>
   <footer className="login-footer">CubeManage v{__APP_VERSION__}</footer>
  </section>
 </main>;
}
