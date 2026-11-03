import {useEffect,useState} from 'react';
import {Button,Table} from '@heroui/react';
import {ShieldCheck,ExternalLink} from 'lucide-react';
import {api,date,titles,type Session,type Row} from '../lib/api';
import {ErrorBox,Empty,Loading} from '../components/Shared';
export function Settings({session,onDisconnect}:{session:Session;onDisconnect:()=>void}){return <><div className="page-heading"><div><h1>连接设置</h1></div></div><section className="data-panel settings-panel"><h2>平台连接</h2><dl className="settings-list"><div><dt>管理端地址</dt><dd className="mono">{session.baseUrl}</dd></div><div><dt>登录账号</dt><dd>{session.username}</dd></div><div><dt>会话有效期</dt><dd>{session.expires?'到 '+date(session.expires)+' 为止，与平台令牌一致；令牌提前失效或重启服务时需重新登录':'与平台令牌一致'}</dd></div></dl><div className="form-note"><ShieldCheck size={18}/><span>密码只用于登录，不在任何地方保存。会话（平台地址、账号和平台令牌）加密后只保存在当前浏览器的 HttpOnly Cookie 中，页面脚本读不到，服务端也不记录；退出时同时注销平台令牌。</span></div><div className="settings-footer"><a href={session.baseUrl} target="_blank" rel="noreferrer">打开平台<ExternalLink size={14}/></a><Button variant="outline" onPress={onDisconnect}>退出并切换平台</Button></div></section></>;}
