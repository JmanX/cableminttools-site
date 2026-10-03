import {SmartZoom} from './smartZoom';
export function runZoomChecks(){
 const z=new SmartZoom();z.min=.5;z.max=6;
 if(z.manualZoom(99,1000)!==6 || !z.manual)throw Error('Manual maximum/override');
 if(z.manualZoom(-99,2000)!==.5)throw Error('Manual minimum');
 z.endManual(3000);if(!z.manual)throw Error('Pinch must pause automatic zoom');
 z.decoded=true;z.reset();if(z.ratio!==1||z.manual||z.decoded)throw Error('Retake must reset gesture/decode state');
 console.log('manual zoom gesture clamps and capture reset passed; automatic controller tested in native Kotlin');
}
