import {SmartZoom,type BarcodeFrame} from './smartZoom';
export function runZoomChecks(){
 const z=new SmartZoom(), preview={width:400,height:800};
 const frame:BarcodeFrame={width:400,height:800,maxZoom:8,decodedCount:0,failed:false,barcodes:[{decoded:false,left:190,top:390,right:210,bottom:410,corners:[]},{decoded:false,left:40,top:220,right:60,bottom:240,corners:[]}]};
 if(z.frame(frame,preview,1000)||z.frame(frame,preview,1100))throw Error('Missing debounce');
 const step=z.frame(frame,preview,1200);if(!step||step.ratio!==1.12||step.size!==.05)throw Error('Centered target not used');
 if(z.frame(frame,preview,1250))throw Error('Missing cooldown');
 z.manualZoom(2,2000);if(z.frame(frame,preview,5000))throw Error('Manual gesture must suppress auto zoom');
 z.endManual(5000);if(z.frame(frame,preview,70000))throw Error('Manual override must last until capture reset');
 z.frame({...frame,decodedCount:1},preview,8000);if(z.frame(frame,preview,9000))throw Error('Decode did not stop zoom');
 z.reset();if(z.ratio!==1||z.decoded)throw Error('Retake reset failed');
 for(let t=10000;t<100000;t+=700)z.frame({...frame,maxZoom:2},preview,t);
 if(z.ratio>2)throw Error('Hardware cap exceeded');
 z.reset();for(let t=10000;t<100000;t+=700)z.frame(frame,preview,t);
 if(z.ratio>4)throw Error('Safe cap exceeded');

 z.reset();for(let t=1000;t<15000;t+=700)if(z.frame({...frame,barcodes:[{decoded:false,left:120,top:300,right:280,bottom:500,corners:[]}]},preview,t))throw Error('Large undecoded codes must not force runaway zoom');
 z.reset();for(let t=1000;t<15000;t+=700)if(z.frame({...frame,barcodes:[{decoded:false,left:190,top:20,right:210,bottom:40,corners:[]}]},preview,t))throw Error('Outside-guide target must not zoom');
 z.reset();z.frame({...frame,barcodes:[]},preview,1000);if(z.status!=='No potential barcode detected')throw Error('Missing no-potential diagnostics');
 z.frame(frame,preview,1100);if(!z.status.includes('no zoom requested'))throw Error('Missing potential/no-request diagnostics');
 z.reset();const suggested={...frame,barcodes:[],suggestedZoom:3,suggestionSequence:1,suggestionAgeMs:100};
 z.frame(suggested,preview,1000);z.frame(suggested,preview,1100);const suggestion=z.frame(suggested,preview,1200);
 if(!suggestion||suggestion.ratio!==1.12||suggestion.reason!=='ML Kit zoom suggestion')throw Error('Native suggestion must ramp gradually even before geometry is exposed');
 z.reset();for(let t=1000;t<4000;t+=700)if(z.frame({...suggested,suggestionAgeMs:5000},preview,t))throw Error('Stale suggestions must not zoom');
 z.reset();for(let t=1000;t<4000;t+=700)if(z.frame({...suggested,decodedCount:1},preview,t))throw Error('Already decoded barcode must stop, not count as auto-zoom failure');
 if(!z.status.includes('decoded'))throw Error('Decode diagnostics missing');
 z.reset();z.manualZoom(2,1000);if(z.frame(suggested,preview,5000))throw Error('Suggestion bypassed manual override');
 z.reset();for(let t=1000;t<9000;t+=700)z.frame({...suggested,maxZoom:1.3},preview,t);if(z.ratio>1.3)throw Error('Suggestion ignored hardware cap');
 console.log('smart zoom center preference, debounce, cooldown, manual override, decode stop, reset and hardware cap checks passed');
}