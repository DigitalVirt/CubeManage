import {useEffect} from 'react';
import {useSearchParams} from 'react-router-dom';

/**
 * List pages keep their place in the URL (page, page size, search and filters), so a reload, a shared link or
 * back/forward returns to the same view. Defaults are left out to keep URLs short; other parameters are kept.
 */
export const PAGE_SIZES=[10,20,50,100];
export const pageFrom=(p:URLSearchParams)=>{const n=parseInt(p.get('page')||'',10);return Number.isSafeInteger(n)&&n>0?n:1;};
export const perPageFrom=(p:URLSearchParams)=>{const n=Number(p.get('per_page'));return PAGE_SIZES.includes(n)?n:20;};

export function useUrlState(values:Record<string,string|number>,defaults:Record<string,string|number>){
 const [params,setParams]=useSearchParams();
 const key=JSON.stringify(values);
 useEffect(()=>{
  const next=new URLSearchParams(params);
  for(const [k,v] of Object.entries(values)){const s=String(v??'');if(s===''||s===String(defaults[k]??''))next.delete(k);else next.set(k,s);}
  if(next.toString()!==params.toString())setParams(next,{replace:true});
 },[key]); // eslint-disable-line react-hooks/exhaustive-deps
}
