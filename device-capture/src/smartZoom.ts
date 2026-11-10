export type BarcodeGeometry={decoded:boolean;left:number;top:number;right:number;bottom:number;corners:{x:number;y:number}[]};
export type BarcodeFrame={width:number;height:number;maxZoom:number;decodedCount:number;failed:boolean;barcodes:BarcodeGeometry[];suggestedZoom?:number;suggestionSequence?:number;suggestionAgeMs?:number};
/** Manual gesture state only. Automatic decisions now run natively beside ML Kit. */
export class SmartZoom {
 ratio=1;min=1;max=1;decoded=false;manual=false;
 reset(){this.ratio=1;this.decoded=false;this.manual=false;}
 manualZoom(ratio:number,_now:number){this.ratio=Math.max(this.min,Math.min(this.max,ratio));this.manual=true;return this.ratio;}
 endManual(_now:number){this.manual=true;}
}
