const fs=require('node:fs'),path=require('node:path');
const {withDangerousMod}=require('expo/config-plugins');
function patch(file,from,to){
 const source=fs.readFileSync(file,'utf8');
 if(source.includes(to))return;
 if(!source.includes(from))throw Error('Smart barcode integration requires review: '+file);
 fs.writeFileSync(file,source.replace(from,to));
}
function apply(root){
 const pkg=path.dirname(require.resolve('expo-camera/package.json',{paths:[root]}));
 if(require(path.join(pkg,'package.json')).version!=='57.0.5')throw Error('Review smart barcode patch for the new expo-camera version.');
 const java=path.join(pkg,'android/src/main/java/expo/modules/camera');
 const analyzer=path.join(java,'analyzers/BarcodeAnalyzer.kt');
 patch(analyzer,'class BarcodeAnalyzer(formats: List<BarcodeType>, val onComplete: (BarCodeScannerResult) -> Unit)',
 'class BarcodeAnalyzer(formats: List<BarcodeType>, val onFrame: (Int, Int, List<com.google.mlkit.vision.barcode.common.Barcode>, Boolean) -> Unit, val onComplete: (BarCodeScannerResult) -> Unit)');
 patch(analyzer,'.setBarcodeFormats(barcodeFormats)','.setBarcodeFormats(barcodeFormats)\n      .enableAllPotentialBarcodes()');
 patch(analyzer,'          if (barcodes.isEmpty()) {\n            return@addOnSuccessListener\n          }\n          val barcode = barcodes.first()',
 '          onFrame(effectiveWidth, effectiveHeight, barcodes, false)\n          for (barcode in barcodes) {');
 patch(analyzer,'          val raw = barcode.rawValue ?: barcode.rawBytes?.let { String(it) }','          val raw = barcode.rawValue ?: barcode.rawBytes?.let { String(it) }\n          if (raw == null) continue');
 patch(analyzer,'        }\n        .addOnFailureListener {','          }\n        }\n        .addOnFailureListener {\n          onFrame(effectiveWidth, effectiveHeight, emptyList(), true)');
 patch(analyzer,'    }\n  }\n}','    } else {\n      imageProxy.close()\n    }\n  }\n}');
 const view=path.join(java,'ExpoCameraView.kt');
 patch(view,'  private val onCameraReady by EventDispatcher<Unit>()','  private val onCableMintBarcodes by EventDispatcher<Map<String, Any>>()\n  private val onCameraReady by EventDispatcher<Unit>()');
 patch(view,'              BarcodeAnalyzer(barcodeFormats) {','              BarcodeAnalyzer(barcodeFormats, { frameWidth, frameHeight, codes, failed ->\n                onCableMintBarcodes(mapOf(\n                  "width" to frameWidth, "height" to frameHeight,\n                  "maxZoom" to (camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f),\n                  "decodedCount" to codes.count { it.rawValue != null || it.rawBytes != null },\n                  "failed" to failed,\n                  "barcodes" to codes.mapNotNull { code -> code.boundingBox?.let { box -> mapOf(\n                    "decoded" to (code.rawValue != null || code.rawBytes != null),\n                    "left" to box.left, "top" to box.top, "right" to box.right, "bottom" to box.bottom,\n                    "corners" to (code.cornerPoints?.map { mapOf("x" to it.x, "y" to it.y) } ?: emptyList())\n                  ) } }\n                ))\n              }) {');
 patch(path.join(java,'CameraViewModule.kt'),'  "onCameraReady",','  "onCableMintBarcodes",\n  "onCameraReady",');
}
module.exports=config=>withDangerousMod(config,['android',async mod=>{apply(mod.modRequest.projectRoot);return mod;}]);
module.exports.apply=apply;
