package expo.modules.camera

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** Runs beside ML Kit. No React events or JS polling are needed to operate the lens. */
internal class CableMintAutoZoom {
  data class Box(val left: Float, val top: Float, val right: Float, val bottom: Float)
  var enabled = false
    private set
  var manual = false
    private set
  var decoded = false
    private set
  var status = "Waiting for scanner frames"
    private set
  var application = "not-requested"
    private set
  var requestedZoom = 1f
    private set
  var potentialCount = 0
    private set
  var boxWidth = 0f
    private set
  var boxHeight = 0f
    private set
  var suggestedZoom = 1f
    private set
  var suggestionSequence = 0
    private set
  var frameCount = 0
    private set
  var requestCount = 0
    private set
  var appliedCount = 0
    private set
  private var lastStep: Long? = null
  private var stableFrames = 0
  private var center: Pair<Float, Float>? = null
  private var inFlight = false

  fun start(actual: Float) {
    enabled = true; manual = false; decoded = false
    status = "Waiting for scanner frames"; application = "not-requested"
    requestedZoom = actual; potentialCount = 0; boxWidth = 0f; boxHeight = 0f
    suggestedZoom = actual; suggestionSequence = 0; frameCount = 0
    requestCount = 0; appliedCount = 0; stableFrames = 0; center = null; lastStep = null
    // An older request can still complete. CameraX serializes/cancels lens commands.
    inFlight = false
  }
  fun stop() { enabled = false; status = "Auto-zoom stopped for photo / review" }
  fun pauseManual() { enabled = false; manual = true; status = "Auto-zoom paused after manual adjustment" }
  private fun stopDecoded() { enabled = false; decoded = true; status = "Barcode decoded — auto-zoom stopped" }

  private fun request(desired: Float, actual: Float, minimum: Float, maximum: Float, now: Long,
                      reason: String, apply: (Float, String) -> Boolean): Boolean {
    if (!enabled || manual || decoded) return false
    val cap = max(minimum, min(4f, maximum))
    val blocked = when {
      inFlight -> "camera request pending"
      actual >= cap - .02f -> "hardware / 4× limit"
      lastStep?.let { now - it < 650L } == true -> "cooldown"
      else -> null
    }
    if (blocked != null) { status = "Potential barcode detected — no zoom requested: $blocked"; return false }
    val target = min(desired.coerceIn(minimum, cap), actual + .12f)
    if (target <= actual + .02f) { status = "Potential barcode detected — no zoom requested: suggestion already reached"; return false }
    requestedZoom = target; application = "requested"; inFlight = true
    if (!apply(target, reason)) {
      inFlight = false; application = "not-applied"
      status = "Zoom requested but not applied by camera: unavailable"
      return false
    }
    lastStep = now; requestCount++
    status = "Auto-zoom requested: $target× ($reason)"
    return true
  }

  /** ML Kit's callback directly submits a real, bounded CameraControl request. */
  fun suggestion(ratio: Float, actual: Float, minimum: Float, maximum: Float, now: Long,
                 apply: (Float, String) -> Boolean): Boolean {
    if (!ratio.isFinite() || ratio <= 0f) return false
    suggestedZoom = ratio; suggestionSequence++
    return request(ratio, actual, minimum, maximum, now, "ML Kit zoom suggestion", apply)
  }

  fun frame(boxes: List<Box>, decodedCount: Int, width: Int, height: Int,
            previewWidth: Int, previewHeight: Int, actual: Float, minimum: Float,
            maximum: Float, now: Long, failed: Boolean, apply: (Float, String) -> Boolean) {
    frameCount++; potentialCount = boxes.size
    if (decodedCount > 0) { stopDecoded(); return }
    if (!enabled || manual || decoded) return
    if (failed) { status = "Barcode analysis failed — no zoom requested"; return }
    if (width <= 0 || height <= 0 || previewWidth <= 0 || previewHeight <= 0) {
      status = "Waiting for valid scanner dimensions"; return
    }
    val scale = max(previewWidth.toFloat() / width, previewHeight.toFloat() / height)
    val dx = (width * scale - previewWidth) / 2f
    val dy = (height * scale - previewHeight) / 2f
    data class Target(val x: Float, val y: Float, val w: Float, val h: Float)
    val target = boxes.map { b -> Target(
      ((b.left + b.right) * scale / 2f - dx) / previewWidth,
      ((b.top + b.bottom) * scale / 2f - dy) / previewHeight,
      (b.right - b.left) * scale / previewWidth,
      (b.bottom - b.top) * scale / previewHeight)
    }.filter { it.w > 0f && it.h > 0f && it.x in .08f.. .92f && it.y in .27f.. .73f }
      .minByOrNull { hypot(it.x - .5f, it.y - .5f) }
    if (target == null) {
      stableFrames = 0; center = null; boxWidth = 0f; boxHeight = 0f
      status = if (boxes.isEmpty()) "No potential barcode detected" else "Potential barcode detected outside guide — no zoom requested"
      return
    }
    boxWidth = target.w; boxHeight = target.h
    val previous = center
    if (previous != null && hypot(target.x - previous.first, target.y - previous.second) > .18f) stableFrames = 0
    center = Pair(target.x, target.y); stableFrames++
    if (stableFrames < 3) { status = "Potential barcode detected — no zoom requested: waiting for stable detection"; return }
    // A thin 1D barcode can be wide in the guide yet contain too few pixels to decode.
    if (target.w >= .28f && target.h >= .06f) {
      status = "Potential barcode detected — no zoom requested: barcode already large"
      return
    }
    request(maximum, actual, minimum, maximum, now, "small centered undecoded barcode", apply)
  }

  fun acknowledged(actual: Float, error: String? = null) {
    inFlight = false
    if (error != null || kotlin.math.abs(actual - requestedZoom) > .03f) {
      application = "not-applied"
      if (enabled) status = "Zoom requested but not applied by camera: ${error ?: "ratio unchanged"}"
    } else {
      application = "applied"; appliedCount++
      if (enabled) status = "Automatic zoom applied: $actual×"
    }
  }
  fun snapshot(): Map<String, Any> {
    val fields = mutableMapOf<String, Any>()
    fields["enabled"] = enabled; fields["manual"] = manual; fields["decoded"] = decoded
    fields["status"] = status; fields["application"] = application
    fields["requestedZoom"] = requestedZoom; fields["potentialCount"] = potentialCount
    fields["boxWidth"] = boxWidth; fields["boxHeight"] = boxHeight
    fields["suggestedZoom"] = suggestedZoom; fields["suggestionSequence"] = suggestionSequence
    fields["frameCount"] = frameCount; fields["requestCount"] = requestCount; fields["appliedCount"] = appliedCount
    return fields
  }
}
