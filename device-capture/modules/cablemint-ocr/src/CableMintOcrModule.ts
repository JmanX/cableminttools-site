import { NativeModule, requireNativeModule } from 'expo';

export type OcrLine = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type OcrResult = { text: string; lines: OcrLine[] };

declare class CableMintOcrModule extends NativeModule<{}> {
  recognizeAsync(imageUri: string): Promise<OcrResult>;
}

export default requireNativeModule<CableMintOcrModule>('CableMintOcr');
