const geometry=(left:number,top:number,right:number,bottom:number)=>({left,top,right,bottom,boundingBox:{left,top,right,bottom},coordinateSpace:'image',cornerPoints:[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]});
const line=(text:string,box:any)=>({text,...box,elements:[{text,...box}]});
export default {
 async recognizeAsync(){await new Promise(r=>setTimeout(r,300));const serialOnly=(globalThis as any).__serialOnly;return {text:serialOnly?'SN: DEMO-SERIAL-2401':'MAC: AA110533D733\nSN: DEMO-SERIAL-2401',lines:serialOnly?[line('SN:',geometry(20,130,55,150)),line('DEMO-SERIAL-2401',geometry(100,165,270,185))]:[line('MAC:',geometry(20,20,70,40)),line('AB110533D733',geometry(100,55,270,75)),line('SN:',geometry(20,130,55,150)),line('DEMO-SERIAL-2401',geometry(100,165,270,185))]};},
 async scanBarcodesAsync(){return (globalThis as any).__serialOnly?[]:[{data:'AA110533D733',type:'code128',source:'image',...geometry(100,15,350,50)},{data:'DEMO-SERIAL-2401',type:'code128',source:'image',...geometry(100,125,350,160)}];},
};
