export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type Geometry = {
  boundingBox?: Bounds | null;
  cornerPoints?: Point[];
  coordinateSpace?: 'image' | 'preview';
  imageWidth?: number;
  imageHeight?: number;
};
export type OcrElement = Geometry & { text: string };
export type OcrLine = Bounds & Geometry & { text: string; elements?: OcrElement[] };
export type OcrResult = { text: string; lines: OcrLine[]; imageWidth?: number; imageHeight?: number };
export type ImageBarcode = Geometry & { data: string; type: string; source?: 'image' | 'live'; format?: number };
