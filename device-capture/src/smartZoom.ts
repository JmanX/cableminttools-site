export type BarcodeGeometry={decoded:boolean;left:number;top:number;right:number;bottom:number;corners:{x:number;y:number}[]};
export type BarcodeFrame={width:number;height:number;maxZoom:number;decodedCount:number;failed:boolean;barcodes:BarcodeGeometry[];suggestedZoom?:number;suggestionSequence?:number;suggestionAgeMs?:number};
export class SmartZoom {
 ratio=1;min=1;max=1;decoded=false;manual=false;lastStep=0;failures=0;lastTarget:{x:number;y:number}|null=null;
 status='Waiting for scanner frames';potentialCount=0;boxSize=0;nativeSuggestion=0;
 reset(){this.ratio=1;this.decoded=false;this.manual=false;this.lastStep=0;this.failures=0;this.lastTarget=null;this.status='Waiting for scanner frames';this.potentialCount=0;this.boxSize=0;this.nativeSuggestion=0;}
 manualZoom(ratio:number,_now:number){this.ratio=Math.max(this.min,Math.min(this.max,ratio));this.manual=true;this.status='Auto-zoom paused after manual adjustment';return this.ratio;}
 endManual(_now:number){this.manual=true;this.status='Auto-zoom paused after manual adjustment';}
 frame(frame:BarcodeFrame,preview:{width:number;height:number},now:number){
  this.max=Math.max(this.min,Number.isFinite(frame.maxZoom) && frame.maxZoom>0 ? frame.maxZoom : 1);
  this.potentialCount=frame.barcodes.filter(b=>!b.decoded).length;
  this.nativeSuggestion=Number.isFinite(frame.suggestedZoom) ? frame.suggestedZoom! : 0;
  if(frame.decodedCount>0){this.decoded=true;this.failures=0;}
  if(this.decoded){this.status='Barcode decoded — auto-zoom stopped';return null;}
  if(this.manual){this.status='Auto-zoom paused after manual adjustment';return null;}
  if(frame.failed){this.status='Barcode analysis failed — no zoom requested';return null;}
  if(frame.width<=0||frame.height<=0||preview.width<=0||preview.height<=0){this.status='Waiting for valid scanner dimensions';return null;}
  const scale=Math.max(preview.width/frame.width,preview.height/frame.height);
  const dx=(frame.width*scale-preview.width)/2,dy=(frame.height*scale-preview.height)/2;
  const candidates=frame.barcodes.filter(b=>!b.decoded).map(b=>({
   x:((b.left+b.right)*scale/2-dx)/preview.width,y:((b.top+b.bottom)*scale/2-dy)/preview.height,
   size:Math.max((b.right-b.left)*scale/preview.width,(b.bottom-b.top)*scale/preview.height)
  })).filter(b=>b.size>0 && b.x>=.08&&b.x<=.92&&b.y>=.27&&b.y<=.73);
  candidates.sort((a,b)=>Math.hypot(a.x-.5,a.y-.5)-Math.hypot(b.x-.5,b.y-.5));
  const freshSuggestion=(frame.suggestionSequence ?? 0)>0 && (frame.suggestionAgeMs ?? Infinity)<1500 && this.nativeSuggestion>this.ratio+.02;
  // ML Kit can suggest zoom before exposing a bounding box. Its documented
  // most-centered potential barcode is evidence; never use a stale suggestion.
  const target=candidates[0] ?? (freshSuggestion && !this.potentialCount ? {x:.5,y:.5,size:0} : null);
  this.boxSize=target?.size ?? 0;
  if(!target){this.failures=0;this.lastTarget=null;this.status=this.potentialCount ? 'Potential barcode detected outside guide — no zoom requested' : 'No potential barcode detected';return null;}
  if(this.lastTarget && Math.hypot(target.x-this.lastTarget.x,target.y-this.lastTarget.y)>.18)this.failures=0;
  this.lastTarget=target;this.failures++;
  const cap=Math.max(this.min,Math.min(4,this.max));
  let reason='';
  if(this.ratio>=cap)reason='hardware / 4× limit';
  else if(!freshSuggestion && target.size>=.28)reason='barcode already large; no ML Kit suggestion';
  else if(this.failures<3)reason='waiting for stable detection';
  else if(now-this.lastStep<650)reason='cooldown';
  if(reason){this.status='Potential barcode detected — no zoom requested: '+reason;return null;}
  const desired=freshSuggestion ? Math.min(cap,this.nativeSuggestion) : cap;
  this.ratio=Math.min(desired,this.ratio+.12);this.lastStep=now;
  this.status='Auto-zoom requested: '+this.ratio.toFixed(2)+'×';
  return {ratio:this.ratio,size:target.size,failures:this.failures,reason:freshSuggestion ? 'ML Kit zoom suggestion' : 'small centered undecoded barcode'};
 }
}
