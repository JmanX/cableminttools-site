import { CameraView } from 'expo-camera';
import type { NativeScannerState, NativeZoomApi } from './cameraZoom';
// Expo 57.0.5 exposes its native view ref. The build plugin adds these two view
// commands; this adapter keeps that pinned dependency detail out of the scanner.
export class NativeZoomCamera extends CameraView implements NativeZoomApi {
 private zoomView():NativeZoomApi{
  const view=this._cameraRef.current as unknown as NativeZoomApi|null;
  if(!view || typeof view.setCableMintZoom!=='function' || typeof view.getCableMintScannerState!=='function')throw Error('Native zoom is unavailable. Install the current CableMint Android build.');
  return view;
 }
 async getCableMintScannerState():Promise<NativeScannerState>{return this.zoomView().getCableMintScannerState();}
 async setCableMintZoom(ratio:number):Promise<NativeScannerState>{return this.zoomView().setCableMintZoom(ratio);}
}
