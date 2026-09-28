import { NativeModule, requireNativeModule } from 'expo';

import type { OcrResult, ImageBarcode } from './CableMintOcr.types';
export type { OcrLine, OcrResult, ImageBarcode } from './CableMintOcr.types';

declare class CableMintOcrModule extends NativeModule<{}> {
  recognizeAsync(imageUri: string): Promise<OcrResult>;
  scanBarcodesAsync(imageUri: string): Promise<ImageBarcode[]>;
}

export default requireNativeModule<CableMintOcrModule>('CableMintOcr');
