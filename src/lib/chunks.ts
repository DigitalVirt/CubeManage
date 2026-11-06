import {ApiError} from './api';

/** 批量操作在浏览器端每批提交的实例数：批次小，单个请求就快，进度也能一批一批往前走。 */
export const BATCH_CHUNK=10;

export type ItemState={state:'wait'|'run'|'ok'|'fail'|'skip';error?:string};
export type Progress={done:number;total:number;items:Record<number,ItemState>};
export type ItemResult={id:number;ok:boolean;error?:string;skipped?:string};

/**
 * Submit ids in chunks, one request per chunk, reporting each instance's state as it goes.
 * A failed chunk marks only its own instances failed; the rest continue. stopped() is checked before each chunk,
 * and instances not yet submitted are reported as skipped. An expired session (401) stops everything and is rethrown.
 */
export async function submitInChunks<R extends {results:ItemResult[]}>(ids:number[],call:(part:number[])=>Promise<R>,
 {onProgress,stopped=()=>false,size=BATCH_CHUNK}:{onProgress:(p:Progress)=>void;stopped?:()=>boolean;size?:number}){
 const items:Record<number,ItemState>=Object.fromEntries(ids.map(id=>[id,{state:'wait'}]));
 const results:ItemResult[]=[],responses:R[]=[];let done=0;
 const report=()=>onProgress({done,total:ids.length,items:{...items}});
 report();
 for(let i=0;i<ids.length;i+=size){
  const part=ids.slice(i,i+size);
  if(stopped()){for(const id of part){items[id]={state:'skip'};results.push({id,ok:false,error:'已停止，未提交'});}done+=part.length;report();continue;}
  for(const id of part)items[id]={state:'run'};report();
  try{
   const r=await call(part);responses.push(r);const got=new Map(r.results.map(x=>[Number(x.id),x]));
   for(const id of part){const one=got.get(id)||{id,ok:false,error:'平台没有返回结果'};results.push(one);items[id]=one.ok?{state:'ok'}:{state:'fail',error:one.error};}
  }catch(e){
   if(e instanceof ApiError&&e.status===401)throw e;
   const error=(e as Error).message;for(const id of part){results.push({id,ok:false,error});items[id]={state:'fail',error};}
  }
  done+=part.length;report();
 }
 const success=results.filter(r=>r.ok).length;
 return {results,responses,total:results.length,success,failed:results.length-success};
}
