// @ts-nocheck -- browser-only harness; production source is independently typechecked.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FieldWorkspace } from '../../src/FieldWorkspace';
function Preview(){const [width,setWidth]=useState(390);return <><div style={{padding:12,fontSize:13,display:'flex',gap:12,justifyContent:'center',alignItems:'center'}}><strong>Native UI preview · synthetic adapters</strong><select aria-label="Phone width" value={width} onChange={e=>setWidth(Number(e.target.value))}><option>360</option><option>390</option><option>430</option></select><label><input type="checkbox" onChange={e=>globalThis.__offline=e.target.checked}/>Offline fixture</label><label><input type="checkbox" onChange={e=>globalThis.__serialOnly=e.target.checked}/>Serial-only fixture</label></div><div id="phone" style={{height:780,width,maxWidth:'100vw',margin:'0 auto',display:'flex',overflow:'hidden',background:'#EDF3F5',boxShadow:'0 8px 30px #20313B20'}}><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width,height:780},insets:{top:0,bottom:0,left:0,right:0}}}><FieldWorkspace session={{user:{id:'demo-tech',email:'technician@example.test'}}}/></SafeAreaProvider></div></>;}
createRoot(document.getElementById('root')).render(<Preview/>);
