const fs = require('node:fs'), path = require('node:path');
function replace(source, before, after) {
 if (!source.includes(before)) throw Error('v1.2.5 native integration needs review: '+before.slice(0,90));
 return source.replace(before, after);
}
module.exports = function applyScannerReliability(java) {
 const android=path.resolve(java,'../../../../../../');
 const tests=path.join(android,'src/test/java/expo/modules/camera');
 for(const name of ['CableMintZoomOperation.kt']) fs.copyFileSync(path.join(__dirname,'native',name),path.join(java,name));
 for(const name of ['CableMintZoomOperationTest.kt']) fs.copyFileSync(path.join(__dirname,'native',name),path.join(tests,name));
 const viewPath=path.join(java,'ExpoCameraView.kt');
 let view=fs.readFileSync(viewPath,'utf8').replace(/\r\n/g,'\n');
 if(view.includes('// CableMint scanner reliability v1.2.5')) return;
 view=replace(view,'  private var cableMintDiagnosticStatus = ""',
 '  private var cableMintDiagnosticStatus = ""\n  private var cableMintCameraGeneration = 0\n  private var cableMintCameraRequests = 0\n  private var cableMintAutomaticRequests = 0\n  private var cableMintLastSource = "none"\n  private var cableMintLastApplication = "none"');
 const begin=view.indexOf('  private fun applyCableMintZoom('),end=view.indexOf('  fun setCableMintAutoZoom(',begin);
 if(begin<0||end<0)throw Error('v1.2.5 CameraControl integration missing');
 view=view.slice(0,begin)+
 `  private fun applyCableMintZoom(target: Float, source: String, complete: (Float, String?) -> Unit): Boolean {
    val boundCamera = camera ?: return false
    val limits = boundCamera.cameraInfo.zoomState.value ?: return false
    if (!target.isFinite()) return false
    val generation = cableMintCameraGeneration
    val clamped = target.coerceIn(limits.minZoomRatio, limits.maxZoomRatio)
    cableMintZoomRatio = clamped
    cableMintCameraRequests++; cableMintLastSource = source
    if (source != "manual / capture reset") cableMintAutomaticRequests++
    android.util.Log.i("CableMintZoom", "CameraControl request generation=" + generation +
      " source=" + source + " current=" + limits.zoomRatio + " requested=" + clamped)
    return CableMintZoomOperation.submit(boundCamera.cameraControl, clamped, limits.minZoomRatio, limits.maxZoomRatio,
      { boundCamera.cameraInfo.zoomState.value?.zoomRatio ?: 1f },
      { camera === boundCamera && cableMintCameraGeneration == generation }, ContextCompat.getMainExecutor(context)) { actual, failure ->
      if (camera === boundCamera && cableMintCameraGeneration == generation) {
        cableMintZoomRatio = actual; cableMintLastApplication = failure ?: "applied"
      }
      android.util.Log.i("CableMintZoom", "camera application generation=" + generation + " source=" + source +
        " requested=" + clamped + " actual=" + actual + " result=" + (failure ?: "applied"))
      complete(actual, failure)
    }
  }

  private fun applyCableMintAutomaticZoom(ratio: Float, reason: String): Boolean {
    val session = cableMintAutoZoom.sessionCount
    val generation = cableMintCameraGeneration
    return applyCableMintZoom(ratio, reason) { actual, error ->
      if (session == cableMintAutoZoom.sessionCount && generation == cableMintCameraGeneration)
        cableMintAutoZoom.acknowledged(actual, error)
    }
  }

`+view.slice(end);
 view=replace(view,'if (!applyCableMintZoom(target, "manual / capture reset") { error ->','if (!applyCableMintZoom(target, "manual / capture reset") { _, error ->');
 view=replace(view,'    fields["autoZoom"] = cableMintAutoZoom.snapshot()',
 `    fields["autoZoom"] = cableMintAutoZoom.snapshot()
    fields["zoomCallbackInvocationCount"] = zoomSuggestionSequence
    fields["cameraGeneration"] = cableMintCameraGeneration
    fields["cameraRequestCount"] = cableMintCameraRequests
    fields["automaticCameraRequestCount"] = cableMintAutomaticRequests
    fields["lastCameraSource"] = cableMintLastSource
    fields["lastCameraApplication"] = cableMintLastApplication
    fields["mlKitVersion"] = "17.3.0"
    fields["potentialDetectionConfigured"] = true
    fields["zoomSuggestionsConfigured"] = true`);
 view=replace(view,'    imageAnalysisUseCase = createImageAnalyzer()',
 '    cableMintCameraGeneration++\n    cableMintAutoZoom.cameraRebound()\n    cableMintFrameTime = 0L\n    imageAnalysisUseCase = createImageAnalyzer()');
 view=replace(view,'    camera = cameraProvider.bindToLifecycle(currentActivity, cameraSelector, useCases)',
 '    camera = cameraProvider.bindToLifecycle(currentActivity, cameraSelector, useCases)\n    android.util.Log.i("CableMintZoom", "camera bound generation=" + cableMintCameraGeneration + " auto=" + cableMintAutoZoom.enabled + " manual=" + cableMintAutoZoom.manual)');
 view=replace(view,'      .also { analyzer ->','      .also { analyzer ->\n        val generation = cableMintCameraGeneration');
 view=replace(view,'                suggestedZoom = ratio',
 '                if (generation != cableMintCameraGeneration) return@BarcodeAnalyzer false\n                android.util.Log.i("CableMintZoom", "ML Kit callback generation=" + generation + " suggested=" + ratio)\n                suggestedZoom = ratio');
 view=replace(view,'                val now = android.os.SystemClock.elapsedRealtime()',
 '                if (generation != cableMintCameraGeneration) return@BarcodeAnalyzer\n                val now = android.os.SystemClock.elapsedRealtime()');
 const start=view.indexOf('                if (zoom != null) cableMintAutoZoom.frame(');
 const finish=view.indexOf('                if (now - cableMintDiagnosticTime',start);
 if(start<0||finish<0)throw Error('Frame integration missing');
 view=view.slice(0,start)+
 `                fun bounds(code: com.google.mlkit.vision.barcode.common.Barcode): CableMintAutoZoom.Box? {
                  code.boundingBox?.let { return CableMintAutoZoom.Box(it.left.toFloat(), it.top.toFloat(), it.right.toFloat(), it.bottom.toFloat()) }
                  val points = code.cornerPoints ?: return null
                  if (points.isEmpty()) return null
                  return CableMintAutoZoom.Box(points.minOf { it.x }.toFloat(), points.minOf { it.y }.toFloat(),
                    points.maxOf { it.x }.toFloat(), points.maxOf { it.y }.toFloat())
                }
                val reads = codes.filterNot { it in potential }.map { code ->
                  CableMintAutoZoom.Read(code.format, code.rawValue ?: code.rawBytes?.let { String(it) } ?: "", bounds(code))
                }
                if (zoom != null) cableMintAutoZoom.frame(potential.mapNotNull(::bounds), reads,
                  frameWidth, frameHeight, width, height, zoom.zoomRatio, zoom.minZoomRatio,
                  zoom.maxZoomRatio, now, failed, ::applyCableMintAutomaticZoom, potential.size)
`+view.slice(finish);
 view=replace(view,'                    " decoded=" + decodedCount + " boxWidth=" + cableMintAutoZoom.boxWidth +',
 '                    " decoded=" + decodedCount + " relevant=" + cableMintAutoZoom.relevantCount +\n                    " irrelevant=" + cableMintAutoZoom.irrelevantCount + " unassigned=" + cableMintAutoZoom.unassignedCount +\n                    " enabled=" + cableMintAutoZoom.enabled + " generation=" + generation + " boxWidth=" + cableMintAutoZoom.boxWidth +');
 view=replace(view,'                onBarcodeScanned(it)','                if (generation == cableMintCameraGeneration) onBarcodeScanned(it)');
 view=replace(view,'    this.shouldScanBarcodes = shouldScanBarcodes',
 '    if (this.shouldScanBarcodes == shouldScanBarcodes) return\n    this.shouldScanBarcodes = shouldScanBarcodes');
 fs.writeFileSync(viewPath,view+'\n// CableMint scanner reliability v1.2.5\n');
};
