import {CameraZoom,type NativeScannerState,type NativeZoomApi} from './cameraZoom';
export async function runCameraZoomChecks(){
 const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
 let state:NativeScannerState={ready:true,zoom:3,minZoom:.5,maxZoom:6,sequence:1,frame:{}};
 const calls:number[]=[],shown:number[]=[],errors:string[]=[];
 let resolve:((s:NativeScannerState)=>void)|undefined, reject:((e:Error)=>void)|undefined;
 let immediate=true;
 const api:NativeZoomApi={getCableMintScannerState:async()=>state,setCableMintZoom:async ratio=>{
  calls.push(ratio);
  if(immediate){state={...state,zoom:ratio};return state;}
  return new Promise((yes,no)=>{resolve=yes;reject=no;});
 }};
 const driver=new CameraZoom(api,s=>shown.push(s.zoom),e=>errors.push(e.message));
 await driver.initialize();assert(driver.ready && calls[0]===1 && driver.actual===1,'New capture must reset native zoom to 1x');
 immediate=false;driver.request(2);
 assert(calls.at(-1)===2 && driver.actual===1 && shown.at(-1)===1,'Display must wait for native acknowledgement');
 driver.request(4);driver.request(99);
 assert(calls.length===2,'Pinch commands must serialize');
 resolve!({...state,zoom:2});await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert(calls.at(-1)===6,'Latest pinch command must coalesce and clamp to hardware max');
 resolve!({...state,zoom:6});await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert(driver.actual===6,'Native acknowledgement must update current zoom');
 driver.request(-99);assert(calls.at(-1)===.5,'Hardware minimum must clamp');
 reject!(Error('camera closed'));await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert(driver.actual===6 && errors[0]==='camera closed','Rejected zoom must preserve actual display and surface error');
 driver.request(2);driver.dispose();const count=shown.length;
 resolve!({...state,zoom:2});await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert(shown.length===count,'Old camera acknowledgements must not affect a new capture');
 const unapplied=new CameraZoom({getCableMintScannerState:async()=>({...state,zoom:1}),setCableMintZoom:async()=>({...state,zoom:1})},()=>{},e=>errors.push(e.message));
 await unapplied.initialize();unapplied.request(2);await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert(unapplied.application==='not-applied'&&unapplied.actual===1&&errors.some(e=>e.includes('not applied')),'Camera acknowledgement with unchanged zoom must expose requested/not-applied failure');
 const unavailable=new CameraZoom({...api,getCableMintScannerState:async()=>({...state,ready:false})},()=>{},()=>{});
 let threw=false;try{await unavailable.initialize();}catch{threw=true;}
 assert(threw && !unavailable.ready,'Unavailable hardware must not expose UI-only zoom');
 console.log('native zoom command, acknowledgement, coalescing, hardware clamps, reset, rejection and stale-camera checks passed');
}
