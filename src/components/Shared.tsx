import {Button,Modal,Chip,Spinner,toast} from '@heroui/react';
import {AlertCircle,Check,RefreshCw,X} from 'lucide-react';
import type {ReactNode} from 'react';
/** Logo + name. With `name` (the platform's 网站名称) the name is shown as is; without it, the CubeManage wordmark. */
export function Brand({name}:{name?:string}={}){return <span className="brand"><img src="/logo.svg" width={30} height={30} alt=""/>{name?<span className="brand-name" title={name}>{name}</span>:<span>Cube<span className="brand-light">Manage</span></span>}</span>;}
export function Status({value,task=false}:{value:unknown;task?:boolean}){const key=String(value);const map:Record<string,[string,string]>=task?{'0':['等待执行','warning'],'1':['执行中','info'],'2':['执行成功','success'],'3':['执行失败','danger'],'4':['已结束','neutral'],'5':['已取消','neutral']}:{on:['运行中','success'],off:['已关机','neutral'],suspend:['已暂停','warning'],paused:['已挂起','warning'],init:['创建中','info'],recycle:['回收站','neutral'],rescue:['救援中','warning'],'1':['正常','success'],'0':['异常','danger']};const [text,tone]=map[key]||['未知','neutral'];return <Chip variant="soft" color={tone==='success'?'success':tone==='warning'?'warning':tone==='danger'?'danger':tone==='info'?'accent':'default'}><Chip.Label>{text}</Chip.Label></Chip>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><AlertCircle size={18}/><span>{message}</span>{retry&&<Button size="sm" variant="ghost" onPress={retry}>重试</Button>}</div>;}
/** Isometric empty-state illustrations in public/empty/<kind>.svg; "+" badge where something can be created, "!" where nothing came back. */
export type EmptyKind='instance'|'node'|'area'|'image'|'iso'|'user'|'log'|'task'|'recycle'|'search'|'chart'|'network'|'box';
/** Empty state: illustration, title, why it is empty, and the next step. `sm` (72px art) inside small panels; `md` (96px) for lists. */
export function Empty({kind='box',title='暂无数据',text,actions,size='md'}:{kind?:EmptyKind;title?:string;text?:ReactNode;actions?:ReactNode;size?:'md'|'sm'}){const px=size==='sm'?72:96;return <div className={'empty empty-'+size}><img className="empty-art" src={`/empty/${kind}.svg`} width={px} height={px} alt="" draggable={false}/><h3>{title}</h3>{text&&<p>{text}</p>}{actions&&<div className="empty-actions">{actions}</div>}</div>;}
export function Loading(){return <div className="loading" role="status" aria-label="正在加载"><Spinner/></div>;}
/** Every dialog is HeroUI's Modal: Backdrop › Container › Dialog with its own CloseTrigger, Header/Heading, Body, Footer. Closing (× or Esc) calls onClose. */
export function Dialog({title,children,onClose,footer,wide=false}:{title:string;children:ReactNode;onClose:()=>void;footer?:ReactNode;wide?:boolean}){return <Modal.Backdrop isOpen onOpenChange={open=>{if(!open)onClose();}} isDismissable={false} isKeyboardDismissDisabled={false}><Modal.Container size={wide?'lg':'md'} scroll="inside"><Modal.Dialog><Modal.CloseTrigger aria-label="关闭弹窗"/><Modal.Header><Modal.Heading>{title}</Modal.Heading></Modal.Header><Modal.Body>{children}</Modal.Body>{footer&&<Modal.Footer>{footer}</Modal.Footer>}</Modal.Dialog></Modal.Container></Modal.Backdrop>;}
export function Refresh({onPress,disabled=false}:{onPress:()=>void;disabled?:boolean}){return <Button variant="outline" size="sm" onPress={onPress} isDisabled={disabled}><RefreshCw size={15}/>刷新</Button>;}
export type NotifyTone='success'|'danger'|'warning'|'info';
export type Notify=(message:string,tone?:NotifyTone)=>void;
/**
 * Operation feedback is HeroUI's Simple Toast (toast() + <Toast.Provider/> in App). Callers pass the tone for errors;
 * without one, a message that reports failures is a warning (partly failed batch) or danger, otherwise success.
 */
export const notify:Notify=(message,tone)=>{
 const t=tone??(/失败/.test(message)?(/成功/.test(message)?'warning':'danger'):/无法|错误/.test(message)?'danger':'success');
 toast[t](message,{timeout:t==='danger'||t==='warning'?8000:4000});
};
