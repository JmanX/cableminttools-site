export type BarcodeGeometry={decoded:boolean;left:number;top:number;right:number;bottom:number;corners:{x:number;y:number}[]};
export type BarcodeFrame={width:number;height:number;maxZoom:number;decodedCount:number;failed:boolean;barcodes:BarcodeGeometry[]};
export class SmartZoom {
 ratio=1;max=1;decoded=false;manual=false;manualUntil=0;lastStep=0;failures=0;lastTarget:{x:number;y:number}|null=null;
 reset(){this.ratio=1;this.decoded=false;this.manual=false;this.manualUntil=0;this.lastStep=0;this.failures=0;this.lastTarget=null;}
 manualZoom(ratio:number,now:number){this.ratio=Math.max(1,Math.min(this.max,ratio));this.manual=true;this.manualUntil=now+2500;return this.ratio;}
 endManual(now:number){this.manual=false;this.manualUntil=now+2500;}
 frame(frame:BarcodeFrame,preview:{width:number;height:number},now:number){
  this.max=Math.max(1,Number.isFinite(frame.maxZoom) ? frame.maxZoom : 1);
  if(frame.decodedCount>0){this.decoded=true;this.failures=0;return null;}
  if(this.decoded||this.manual||now<this.manualUntil||frame.failed||frame.width<=0||frame.height<=0||preview.width<=0||preview.height<=0)return null;
  const scale=Math.max(preview.width/frame.width,preview.height/frame.height);
  const dx=(frame.width*scale-preview.width)/2,dy=(frame.height*scale-preview.height)/2;
  const candidates=frame.barcodes.filter(b=>!b.decoded).map(b=>({
   x:((b.left+b.right)*scale/2-dx)/preview.width,y:((b.top+b.bottom)*scale/2-dy)/preview.height,
   size:Math.max((b.right-b.left)*scale/preview.width,(b.bottom-b.top)*scale/preview.height)
  })).filter(b=>b.size>0 && b.x>=.08&&b.x<=.92&&b.y>=.27&&b.y<=.73);
  candidates.sort((a,b)=>Math.hypot(a.x-.5,a.y-.5)-Math.hypot(b.x-.5,b.y-.5));
  const target=candidates[0];if(!target){this.failures=0;this.lastTarget=null;return null;}
  if(this.lastTarget && Math.hypot(target.x-this.lastTarget.x,target.y-this.lastTarget.y)>.18)this.failures=0;
  this.lastTarget=target;this.failures++;
  const cap=Math.min(4,this.max);
  if((target.size>=.28 && this.failures<8)||this.failures<3||now-this.lastStep<650||this.ratio>=cap)return null;
  this.ratio=Math.min(cap,this.ratio+.12);this.lastStep=now;
  return {ratio:this.ratio,size:target.size,failures:this.failures};
 }
}
