import {SmartZoom,type BarcodeFrame} from './smartZoom';
export function runZoomChecks(){
 const z=new SmartZoom(), preview={width:400,height:800};
 const frame:BarcodeFrame={width:400,height:800,maxZoom:8,decodedCount:0,failed:false,barcodes:[{decoded:false,left:190,top:390,right:210,bottom:410,corners:[]},{decoded:false,left:40,top:220,right:60,bottom:240,corners:[]}]};
 if(z.frame(frame,preview,1000)||z.frame(frame,preview,1100))throw Error('Missing debounce');
 const step=z.frame(frame,preview,1200);if(!step||step.ratio!==1.12||step.size!==.05)throw Error('Centered target not used');
 if(z.frame(frame,preview,1250))throw Error('Missing cooldown');
 z.manualZoom(2,2000);if(z.frame(frame,preview,5000))throw Error('Manual gesture must suppress auto zoom');
 z.endManual(5000);if(z.frame(frame,preview,7000))throw Error('Manual cooldown failed');
 z.frame({...frame,decodedCount:1},preview,8000);if(z.frame(frame,preview,9000))throw Error('Decode did not stop zoom');
 z.reset();if(z.ratio!==1||z.decoded)throw Error('Retake reset failed');
 for(let t=10000;t<100000;t+=700)z.frame({...frame,maxZoom:2},preview,t);
 if(z.ratio>2)throw Error('Hardware cap exceeded');
 z.reset();for(let t=10000;t<100000;t+=700)z.frame(frame,preview,t);
 if(z.ratio>4)throw Error('Safe cap exceeded');
 console.log('smart zoom center preference, debounce, cooldown, manual override, decode stop, reset and hardware cap checks passed');
}