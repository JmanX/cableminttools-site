import type { BarcodeFrame } from './smartZoom';
export type NativeAutoZoomState={enabled:boolean;manual:boolean;decoded:boolean;status:string;application:string;requestedZoom:number;potentialCount:number;boxWidth:number;boxHeight:number;suggestedZoom:number;suggestionSequence:number;frameCount:number;requestCount:number;appliedCount:number};
export type NativeScannerState={ready:boolean;zoom:number;minZoom:number;maxZoom:number;sequence:number;frame:BarcodeFrame|Record<string,never>;autoZoom?:NativeAutoZoomState;frameAgeMs?:number};
export interface NativeZoomApi {getCableMintScannerState():Promise<NativeScannerState>;setCableMintZoom(ratio:number):Promise<NativeScannerState>;setCableMintAutoZoom(enabled:boolean):Promise<NativeScannerState>;pauseCableMintAutoZoom():Promise<NativeScannerState>}
/** Serializes/coalesces pinch commands. Display values only after CameraX acknowledgement. */
export class CameraZoom {
 min=1;max=1;actual=1;requested=1;ready=false;busy=false;
 application: 'not-requested'|'requested'|'applied'|'not-applied'='not-requested';
 private pending:number|null=null;private active=true;
 constructor(private api:NativeZoomApi,private changed:(s:NativeScannerState)=>void,private failed:(e:Error)=>void,private log:(data:object)=>void=()=>{}){}
 private accept(s:NativeScannerState){
  if(!s.ready || !Number.isFinite(s.zoom) || !Number.isFinite(s.maxZoom) || !Number.isFinite(s.minZoom) || s.minZoom<=0 || s.maxZoom<s.minZoom)throw Error('Camera did not report a supported zoom range.');
  this.min=s.minZoom;this.max=s.maxZoom;this.actual=s.zoom;this.changed(s);
 }
 async initialize(automatic=false){
  const limits=await this.api.getCableMintScannerState();
  if(!this.active)return;
  this.accept(limits);
  const normal=Math.max(this.min,Math.min(this.max,1));
  this.requested=normal;
  const result=await this.api.setCableMintZoom(normal);
  if(!this.active)return;
  this.accept(result);
  const enabled=await this.api.setCableMintAutoZoom(automatic);
  if(!this.active)return;
  this.accept(enabled);this.ready=true;
  this.log({currentZoom:this.actual,requestedZoom:normal,minZoom:this.min,maxZoom:this.max,reason:'capture reset'});
 }
 request(ratio:number){
  if(!this.active || !this.ready || !Number.isFinite(ratio))return;
  this.requested=Math.max(this.min,Math.min(this.max,ratio));this.pending=this.requested;this.application='requested';
  this.log({currentZoom:this.actual,requestedZoom:this.requested});
  void this.flush();
 }
 private async flush(){
  if(this.busy)return;
  this.busy=true;
  try{
   while(this.active && this.pending!==null){
    const target=this.pending;this.pending=null;
    try{
     const state=await this.api.setCableMintZoom(target);
     if(this.active){
      this.accept(state);
      if(Math.abs(this.actual-target)>.03)throw Error('Zoom requested but not applied by camera: requested '+target.toFixed(2)+'×, actual '+this.actual.toFixed(2)+'×');
      this.application='applied';this.log({currentZoom:this.actual,requestedZoom:target,acknowledged:true});
     }
    }catch(error){
     if(this.active){this.pending=null;this.requested=this.actual;this.application='not-applied';this.failed(error instanceof Error ? error : Error(String(error)));}
    }
   }
  }finally{this.busy=false;}
 }
 async poll(){
  const state=await this.api.getCableMintScannerState();
  if(this.active){
   this.accept(state);
   if(!this.busy && state.autoZoom?.enabled){this.requested=state.autoZoom.requestedZoom;this.application=state.autoZoom.application as typeof this.application;}
  }
  return state;
 }
 async pauseAutomatic(){return this.api.pauseCableMintAutoZoom();}
 async stopAutomatic(){return this.api.setCableMintAutoZoom(false);}
 dispose(){this.active=false;this.ready=false;this.pending=null;}
}
