import {Globe2} from 'lucide-react';
export function CountryFlag({code,name}:{code?:string;name?:string}){
 const countryCode=String(code||({'中国香港':'HK','美国':'US','日本':'JP','新加坡':'SG','德国':'DE'} as Record<string,string>)[name||'']||'').toLowerCase();
 return /^[a-z]{2}$/.test(countryCode)?<span className={'fi fi-'+countryCode+' country-flag'} role="img" aria-label={name||countryCode.toUpperCase()} title={name||countryCode.toUpperCase()}/>:<Globe2 size={17} aria-label={name||'国家或地区未知'}/>;
}
