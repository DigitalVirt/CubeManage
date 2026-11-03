import {Children,isValidElement,type ReactNode} from 'react';
import {Select,ListBox} from '@heroui/react';

type Props={children:ReactNode;value:string|number;onChange:(event:{target:{value:string}})=>void; 'aria-label'?:string; id?:string; required?:boolean; className?:string};
export function Choice({children,value,onChange,'aria-label':ariaLabel,id,required}:Props){
 const options=Children.toArray(children).filter(isValidElement) as React.ReactElement<{value?:string|number;children:ReactNode}>[];
 return <Select aria-label={ariaLabel||'选择选项'} id={id} isRequired={required} selectedKey={String(value)===''?'__empty':String(value)} onSelectionChange={key=>onChange({target:{value:key==='__empty'?'':String(key)}})}><Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger><Select.Popover><ListBox>{options.map((o,i)=><ListBox.Item key={String(o.props.value??i)||'__empty'} id={String(o.props.value??i)||'__empty'} textValue={String(o.props.children)}>{o.props.children}</ListBox.Item>)}</ListBox></Select.Popover></Select>;
}
