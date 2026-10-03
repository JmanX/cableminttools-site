const fs=require('node:fs'),path=require('node:path');
const {withDangerousMod}=require('expo/config-plugins');
function patch(file,from,to){
 const source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 if(source.includes(to))return;
 if(!source.includes(from))throw Error('Smart barcode integration requires review: '+file);
 fs.writeFileSync(file,source.replace(from,to));
}
function apply(root){
 const sourceModules=require(path.join(root,'package.json')).expo?.autolinking?.android?.buildFromSource;
 if(!sourceModules?.includes('expo-camera'))throw Error('Camera patches require expo.autolinking.android.buildFromSource: [\"expo-camera\"]. A precompiled camera ignores the Kotlin changes.');
 const pkg=path.dirname(require.resolve('expo-camera/package.json',{paths:[root]}));
 if(require(path.join(pkg,'package.json')).version!=='57.0.5')throw Error('Review smart barcode patch for the new expo-camera version.');
 const java=path.join(pkg,'android/src/main/java/expo/modules/camera');
 if(fs.readFileSync(path.join(java,'ExpoCameraView.kt'),'utf8').includes('// CableMint zoom bridge v1.2.2')){applyAutoZoom(java);applyNativeAutoZoom(java);return;}
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
 patch(view,'              BarcodeAnalyzer(barcodeFormats) {',`              BarcodeAnalyzer(barcodeFormats, { frameWidth, frameHeight, codes, failed ->
                val boxes = mutableListOf<Map<String, Any>>()
                for (code in codes) {
                  val box = code.boundingBox ?: continue
                  val fields = mutableMapOf<String, Any>()
                  fields["decoded"] = code.rawValue != null || code.rawBytes != null
                  fields["left"] = box.left
                  fields["top"] = box.top
                  fields["right"] = box.right
                  fields["bottom"] = box.bottom
                  val corners = mutableListOf<Map<String, Int>>()
                  for (point in code.cornerPoints ?: emptyArray()) {
                    val corner = mutableMapOf<String, Int>()
                    corner["x"] = point.x
                    corner["y"] = point.y
                    corners.add(corner)
                  }
                  fields["corners"] = corners
                  boxes.add(fields)
                }
                val frame = mutableMapOf<String, Any>()
                frame["width"] = frameWidth
                frame["height"] = frameHeight
                frame["maxZoom"] = camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f
                frame["decodedCount"] = codes.count { it.rawValue != null || it.rawBytes != null }
                frame["failed"] = failed
                frame["barcodes"] = boxes
                latestBarcodeFrame = frame
                barcodeFrameSequence++
                onCableMintBarcodes(frame)
              }) {`);
 patch(view,'          onCameraReady(Unit)','          onCameraReady(Unit)\n          onCableMintBarcodes(mapOf("width" to 0, "height" to 0, "maxZoom" to (camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f), "decodedCount" to 0, "failed" to false, "barcodes" to emptyList<Map<String, Any>>()))');
 patch(path.join(java,'CameraViewModule.kt'),'  "onCameraReady",','  "onCableMintBarcodes",\n  "onCameraReady",');
 // v1.2.2: view commands bypass barcode event delivery and wait for CameraX acknowledgement.
 patch(view,'  private val onCableMintBarcodes by EventDispatcher<Map<String, Any>>()',`  private var cableMintZoomRatio: Float? = null
  private var latestBarcodeFrame: Map<String, Any> = emptyMap()
  private var barcodeFrameSequence = 0

  fun cableMintScannerState(): Map<String, Any> {
    val state = camera?.cameraInfo?.zoomState?.value
    return mapOf("ready" to (state != null), "zoom" to (state?.zoomRatio ?: 1f),
      "minZoom" to (state?.minZoomRatio ?: 1f), "maxZoom" to (state?.maxZoomRatio ?: 1f),
      "sequence" to barcodeFrameSequence, "frame" to latestBarcodeFrame)
  }

  fun setCableMintZoom(requested: Float, promise: Promise) {
    val boundCamera = camera
    val state = boundCamera?.cameraInfo?.zoomState?.value
    if (boundCamera == null || state == null || !requested.isFinite()) {
      promise.reject("ERR_ZOOM_NOT_READY", "Camera zoom is not ready. Reopen the camera.", null)
      return
    }
    val target = requested.coerceIn(state.minZoomRatio, state.maxZoomRatio)
    cableMintZoomRatio = target
    val operation = boundCamera.cameraControl.setZoomRatio(target)
    operation.addListener({
      try {
        operation.get()
        promise.resolve(cableMintScannerState())
      } catch (error: Exception) {
        cableMintZoomRatio = boundCamera.cameraInfo.zoomState.value?.zoomRatio
        promise.reject("ERR_ZOOM_APPLY", "Camera could not apply zoom: " + (error.cause?.message ?: error.message), error)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private val onCableMintBarcodes by EventDispatcher<Map<String, Any>>()`);
 patch(view,'    val targetZoomRatio = max(1f, min(maxZoomRatio, value.coerceIn(0f, 1f) * maxZoomRatio))','    val targetZoomRatio = cableMintZoomRatio?.coerceIn(camera?.cameraInfo?.zoomState?.value?.minZoomRatio ?: 1f, maxZoomRatio) ?: max(1f, min(maxZoomRatio, value.coerceIn(0f, 1f) * maxZoomRatio))');
 patch(path.join(java,'CameraViewModule.kt'),'      AsyncFunction("getAvailablePictureSizes")', '      AsyncFunction("getCableMintScannerState") { view: ExpoCameraView ->\n        view.cableMintScannerState()\n      }.runOnQueue(Queues.MAIN)\n\n      AsyncFunction("setCableMintZoom") { view: ExpoCameraView, ratio: Float, promise: Promise ->\n        view.setCableMintZoom(ratio, promise)\n      }.runOnQueue(Queues.MAIN)\n\n      AsyncFunction("getAvailablePictureSizes")');

 fs.appendFileSync(view,'\n// CableMint zoom bridge v1.2.2\n');
 applyAutoZoom(java);
 applyNativeAutoZoom(java);
}
function applyAutoZoom(java){
 const analyzer=path.join(java,'analyzers/BarcodeAnalyzer.kt'),view=path.join(java,'ExpoCameraView.kt');
 if(fs.readFileSync(view,'utf8').includes('// CableMint ML Kit zoom suggestions v1.2.3'))return;
 patch(analyzer,'val onFrame: (Int, Int, List<com.google.mlkit.vision.barcode.common.Barcode>, Boolean) -> Unit','val maxZoom: () -> Float, val onZoomSuggestion: (Float) -> Unit, val onFrame: (Int, Int, List<com.google.mlkit.vision.barcode.common.Barcode>, Boolean) -> Unit');
 patch(analyzer,`  private var barcodeScannerOptions =
    BarcodeScannerOptions.Builder()
      .setBarcodeFormats(barcodeFormats)
      .enableAllPotentialBarcodes()
      .build()
  private var barcodeScanner = BarcodeScanning.getClient(barcodeScannerOptions)`,
 `  // Evaluate limits on the first bound-camera frame, not analyzer construction.
  private val barcodeScanner by lazy {
    val zoomOptions = com.google.mlkit.vision.barcode.ZoomSuggestionOptions.Builder { ratio ->
      onZoomSuggestion(ratio)
      // The app ramps the suggestion through its acknowledged CameraX command.
      // No synchronous camera change occurred in this callback.
      false
    }.setMaxSupportedZoomRatio(maxZoom().coerceIn(1f, 4f)).build()
    BarcodeScanning.getClient(BarcodeScannerOptions.Builder()
      .setBarcodeFormats(barcodeFormats)
      .enableAllPotentialBarcodes()
      .setZoomSuggestionOptions(zoomOptions)
      .build())
  }`);
 patch(analyzer,'    val mediaImage = imageProxy.image','    if (maxZoom() <= 0f) { imageProxy.close(); return }\n    val mediaImage = imageProxy.image');
 patch(view,'  private var barcodeFrameSequence = 0',`  private var barcodeFrameSequence = 0
  private var suggestedZoom = 1f
  private var zoomSuggestionSequence = 0
  private var zoomSuggestionTime = 0L`);
 patch(view,'BarcodeAnalyzer(barcodeFormats, { frameWidth, frameHeight, codes, failed ->',`BarcodeAnalyzer(barcodeFormats, { camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 0f }, { ratio ->
                if (ratio.isFinite() && ratio > 0f) {
                  suggestedZoom = ratio
                  zoomSuggestionSequence++
                  zoomSuggestionTime = android.os.SystemClock.elapsedRealtime()
                }
              }, { frameWidth, frameHeight, codes, failed ->`);
 patch(view,'                frame["barcodes"] = boxes',`                frame["barcodes"] = boxes
                frame["suggestedZoom"] = suggestedZoom
                frame["suggestionSequence"] = zoomSuggestionSequence
                frame["suggestionAgeMs"] = if (zoomSuggestionTime > 0L) android.os.SystemClock.elapsedRealtime() - zoomSuggestionTime else Long.MAX_VALUE`);
 fs.appendFileSync(view,'\n// CableMint ML Kit zoom suggestions v1.2.3\n');
}
function applyNativeAutoZoom(java){
 const analyzer=path.join(java,'analyzers/BarcodeAnalyzer.kt'),view=path.join(java,'ExpoCameraView.kt');
 const android=path.resolve(java,'../../../../../../');
 fs.copyFileSync(path.join(__dirname,'native/CableMintAutoZoom.kt'),path.join(java,'CableMintAutoZoom.kt'));
 const tests=path.join(android,'src/test/java/expo/modules/camera');fs.mkdirSync(tests,{recursive:true});
 fs.copyFileSync(path.join(__dirname,'native/CableMintAutoZoomTest.kt'),path.join(tests,'CableMintAutoZoomTest.kt'));
 patch(path.join(android,'build.gradle'),'dependencies {','dependencies {\n  testImplementation "junit:junit:4.13.2"');
 if(fs.readFileSync(view,'utf8').includes('// CableMint native automatic zoom v1.2.4'))return;
 patch(analyzer,'val onZoomSuggestion: (Float) -> Unit','val onZoomSuggestion: (Float) -> Boolean');
 patch(analyzer,`      onZoomSuggestion(ratio)
      // The app ramps the suggestion through its acknowledged CameraX command.
      // No synchronous camera change occurred in this callback.
      false`,`      // Same CameraControl path as manual zoom; the native controller ramps it.
      onZoomSuggestion(ratio)`);
 // Undecoded candidates may carry empty bytes. Only a nonempty payload is a decode.
 patch(analyzer,'          if (raw == null) continue','          if (raw.isNullOrEmpty()) continue');
 patch(view,'  private var zoomSuggestionTime = 0L',`  private var zoomSuggestionTime = 0L
  private val cableMintAutoZoom = CableMintAutoZoom()
  private var cableMintFrameTime = 0L
  private var cableMintDiagnosticTime = 0L
  private var cableMintDiagnosticStatus = ""

  private fun applyCableMintZoom(target: Float, source: String, complete: (String?) -> Unit): Boolean {
    val boundCamera = camera ?: return false
    val limits = boundCamera.cameraInfo.zoomState.value ?: return false
    if (!target.isFinite()) return false
    val clamped = target.coerceIn(limits.minZoomRatio, limits.maxZoomRatio)
    cableMintZoomRatio = clamped
    android.util.Log.i("CableMintZoom", "zoom requested source=$source current=" + limits.zoomRatio + " requested=" + clamped)
    val operation = try { boundCamera.cameraControl.setZoomRatio(clamped) } catch (error: Exception) {
      complete(error.message ?: "CameraControl rejected zoom"); return false
    }
    operation.addListener({
      val actual = boundCamera.cameraInfo.zoomState.value?.zoomRatio ?: 1f
      val failure = try {
        operation.get()
        if (kotlin.math.abs(actual - clamped) > .03f) "requested ratio not applied" else null
      } catch (error: Exception) { error.cause?.message ?: error.message ?: "CameraControl failed" }
      cableMintZoomRatio = actual
      android.util.Log.i("CableMintZoom", "camera application source=$source requested=$clamped actual=$actual result=" + (failure ?: "applied"))
      complete(failure)
    }, ContextCompat.getMainExecutor(context))
    return true
  }

  private fun applyCableMintAutomaticZoom(ratio: Float, reason: String): Boolean =
    applyCableMintZoom(ratio, reason) { error ->
      cableMintAutoZoom.acknowledged(camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1f, error)
    }

  fun setCableMintAutoZoom(enabled: Boolean): Map<String, Any> {
    if (enabled) cableMintAutoZoom.start(camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1f)
    else cableMintAutoZoom.stop()
    android.util.Log.i("CableMintZoom", "automatic zoom enabled=$enabled")
    return cableMintScannerState()
  }

  fun pauseCableMintAutoZoom(): Map<String, Any> {
    cableMintAutoZoom.pauseManual()
    return cableMintScannerState()
  }`);
 patch(view,'      "sequence" to barcodeFrameSequence, "frame" to latestBarcodeFrame)',`      "sequence" to barcodeFrameSequence, "frame" to latestBarcodeFrame,
      "autoZoom" to cableMintAutoZoom.snapshot(),
      "frameAgeMs" to (if (cableMintFrameTime > 0L) android.os.SystemClock.elapsedRealtime() - cableMintFrameTime else -1L))`);
 patch(view,`    cableMintZoomRatio = target
    val operation = boundCamera.cameraControl.setZoomRatio(target)
    operation.addListener({
      try {
        operation.get()
        promise.resolve(cableMintScannerState())
      } catch (error: Exception) {
        cableMintZoomRatio = boundCamera.cameraInfo.zoomState.value?.zoomRatio
        promise.reject("ERR_ZOOM_APPLY", "Camera could not apply zoom: " + (error.cause?.message ?: error.message), error)
      }
    }, ContextCompat.getMainExecutor(context))`,`    cableMintAutoZoom.pauseManual()
    if (!applyCableMintZoom(target, "manual / capture reset") { error ->
      if (error == null) promise.resolve(cableMintScannerState())
      else promise.reject("ERR_ZOOM_APPLY", "Camera could not apply zoom: " + error, null)
    }) promise.reject("ERR_ZOOM_NOT_READY", "Camera zoom is not ready.", null)`);
 patch(view,`                if (ratio.isFinite() && ratio > 0f) {
                  suggestedZoom = ratio
                  zoomSuggestionSequence++
                  zoomSuggestionTime = android.os.SystemClock.elapsedRealtime()
                }
              }, { frameWidth, frameHeight, codes, failed ->`,`                suggestedZoom = ratio
                zoomSuggestionSequence++
                zoomSuggestionTime = android.os.SystemClock.elapsedRealtime()
                val state = camera?.cameraInfo?.zoomState?.value
                if (state == null) false else cableMintAutoZoom.suggestion(ratio, state.zoomRatio,
                  state.minZoomRatio, state.maxZoomRatio, zoomSuggestionTime, ::applyCableMintAutomaticZoom)
              }, { frameWidth, frameHeight, codes, failed ->
                val now = android.os.SystemClock.elapsedRealtime()
                cableMintFrameTime = now
                val potential = codes.filter { it.rawValue.isNullOrEmpty() && (it.rawBytes == null || it.rawBytes!!.isEmpty()) }
                val decodedCount = codes.size - potential.size
                val zoom = camera?.cameraInfo?.zoomState?.value
                if (zoom != null) cableMintAutoZoom.frame(potential.mapNotNull { code ->
                  code.boundingBox?.let { box -> CableMintAutoZoom.Box(box.left.toFloat(), box.top.toFloat(), box.right.toFloat(), box.bottom.toFloat()) }
                }, decodedCount, frameWidth, frameHeight, width, height, zoom.zoomRatio, zoom.minZoomRatio,
                  zoom.maxZoomRatio, now, failed, ::applyCableMintAutomaticZoom)
                if (now - cableMintDiagnosticTime >= 1500L || cableMintDiagnosticStatus != cableMintAutoZoom.status) {
                  android.util.Log.i("CableMintZoom", "barcode detection potential=" + potential.size +
                    " decoded=" + decodedCount + " boxWidth=" + cableMintAutoZoom.boxWidth +
                    " boxHeight=" + cableMintAutoZoom.boxHeight + " status=" + cableMintAutoZoom.status)
                  cableMintDiagnosticTime = now; cableMintDiagnosticStatus = cableMintAutoZoom.status
                }`);
 patch(view,'                  fields["decoded"] = code.rawValue != null || code.rawBytes != null','                  fields["decoded"] = !code.rawValue.isNullOrEmpty() || (code.rawBytes?.isNotEmpty() == true)');
 patch(view,'                frame["decodedCount"] = codes.count { it.rawValue != null || it.rawBytes != null }','                frame["decodedCount"] = decodedCount');
 patch(path.join(java,'CameraViewModule.kt'),'      AsyncFunction("getAvailablePictureSizes")',`      AsyncFunction("setCableMintAutoZoom") { view: ExpoCameraView, enabled: Boolean ->
        view.setCableMintAutoZoom(enabled)
      }.runOnQueue(Queues.MAIN)

      AsyncFunction("pauseCableMintAutoZoom") { view: ExpoCameraView ->
        view.pauseCableMintAutoZoom()
      }.runOnQueue(Queues.MAIN)

      AsyncFunction("getAvailablePictureSizes")`);
 patch(view,`    return mapOf("ready" to (state != null), "zoom" to (state?.zoomRatio ?: 1f),
      "minZoom" to (state?.minZoomRatio ?: 1f), "maxZoom" to (state?.maxZoomRatio ?: 1f),
      "sequence" to barcodeFrameSequence, "frame" to latestBarcodeFrame,
      "autoZoom" to cableMintAutoZoom.snapshot(),
      "frameAgeMs" to (if (cableMintFrameTime > 0L) android.os.SystemClock.elapsedRealtime() - cableMintFrameTime else -1L))`,`    val fields = mutableMapOf<String, Any>()
    fields["ready"] = state != null; fields["zoom"] = state?.zoomRatio ?: 1f
    fields["minZoom"] = state?.minZoomRatio ?: 1f; fields["maxZoom"] = state?.maxZoomRatio ?: 1f
    fields["sequence"] = barcodeFrameSequence; fields["frame"] = latestBarcodeFrame
    fields["autoZoom"] = cableMintAutoZoom.snapshot()
    fields["frameAgeMs"] = if (cableMintFrameTime > 0L) android.os.SystemClock.elapsedRealtime() - cableMintFrameTime else -1L
    return fields`);
 fs.appendFileSync(view,'\n// CableMint native automatic zoom v1.2.4\n');
}
module.exports=config=>withDangerousMod(config,['android',async mod=>{apply(mod.modRequest.projectRoot);return mod;}]);
module.exports.apply=apply;
