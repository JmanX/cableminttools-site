package expo.modules.camera

import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** Lens policy only. Raw barcode values still go unchanged to technician review. */
internal class CableMintAutoZoom {
  data class Box(val left: Float, val top: Float, val right: Float, val bottom: Float)
  data class Read(val format: Int, val raw: String, val box: Box? = null)
  enum class Relevance { IDENTIFIER, IRRELEVANT, UNASSIGNED }
  companion object {
    // Relevance affects zoom ONLY, never MAC/SN field assignment or cloud records.
    fun relevance(read: Read): Relevance {
      val raw = read.raw.trim()
      if (read.format in setOf(32, 64, 512, 1024)) return Relevance.IRRELEVANT // EAN / UPC
      if (raw.matches(Regex("(?i)([0-9a-f]{12}|([0-9a-f]{2}[:-]){5}[0-9a-f]{2})"))) return Relevance.IDENTIFIER
      if (raw.matches(Regex("(?i)(MAC|S/N|SN|SERIAL)\\s*[:=]\\s*[a-z0-9:._/-]+"))) return Relevance.IDENTIFIER
      // Plain 1D equipment serials, including numeric-only equipment, remain supported.
      if (read.format in setOf(1, 2, 4, 8, 16, 128, 2048, 4096) && raw.length in 4..160 &&
          raw.matches(Regex("[A-Za-z0-9._/-]+"))) return Relevance.IDENTIFIER
      // A device-key QR is not proof of a MAC or serial. Preserve it as unassigned.
      return Relevance.UNASSIGNED
    }
  }
  var enabled = false; private set
  var manual = false; private set
  var decoded = false; private set
  var status = "Waiting for scanner frames"; private set
  var application = "not-requested"; private set
  var requestedZoom = 1f; private set
  var potentialCount = 0; private set
  var decodedCount = 0; private set
  var relevantCount = 0; private set
  var irrelevantCount = 0; private set
  var unassignedCount = 0; private set
  var boxWidth = 0f; private set
  var boxHeight = 0f; private set
  var suggestedZoom = 0f; private set
  var suggestionSequence = 0; private set
  var frameCount = 0; private set
  var requestCount = 0; private set
  var appliedCount = 0; private set
  var sessionCount = 0; private set
  private var lastStep: Long? = null
  private var stableFrames = 0
  private var center: Pair<Float, Float>? = null
  private var lastPotentialTime = -1L
  private var inFlight = false

  fun start(actual: Float) {
    sessionCount++; enabled = true; manual = false; decoded = false
    status = "Waiting for scanner frames"; application = "not-requested"
    requestedZoom = actual; potentialCount = 0; decodedCount = 0
    relevantCount = 0; irrelevantCount = 0; unassignedCount = 0
    boxWidth = 0f; boxHeight = 0f; suggestedZoom = 0f; suggestionSequence = 0
    frameCount = 0; requestCount = 0; appliedCount = 0
    stableFrames = 0; center = null; lastStep = null; lastPotentialTime = -1L; inFlight = false
  }
  fun stop() { enabled = false; status = "Auto-zoom disabled for photo / review" }
  fun pauseManual() { enabled = false; manual = true; status = "Auto-zoom disabled after manual adjustment" }
  fun cameraRebound() {
    // Preserve the capture's mode/manual pause and ratio. Reject old analyzer work in the view.
    stableFrames = 0; center = null; lastPotentialTime = -1L; decoded = false; inFlight = false
    if (enabled) status = "Camera rebound — waiting for fresh potential detection"
  }
  private fun eligible(now: Long): Boolean {
    if (!enabled || manual) return false
    if (decoded) { status = "Identifier-shaped barcode decoded nearest guide — no zoom needed"; return false }
    if (lastPotentialTime < 0L || now - lastPotentialTime > 1000L) {
      status = "No fresh potential barcode in guide — no zoom requested"; return false
    }
    if (stableFrames < 3) { status = "Potential detected — waiting for three stable frames"; return false }
    return true
  }
  private fun request(desired: Float, actual: Float, minimum: Float, maximum: Float, now: Long,
                      reason: String, apply: (Float, String) -> Boolean): Boolean {
    if (!eligible(now)) return false
    val cap = max(minimum, min(4f, maximum))
    val blocked = when {
      inFlight -> "camera request pending"
      actual >= cap - .02f -> "hardware / 4× limit"
      lastStep?.let { now - it < 650L } == true -> "cooldown"
      else -> null
    }
    if (blocked != null) { status = "Potential detected — no zoom requested: $blocked"; return false }
    val target = min(desired.coerceIn(minimum, cap), actual + .12f)
    if (target <= actual + .02f) { status = "Potential detected — suggestion already reached"; return false }
    requestedZoom = target; application = "requested"; inFlight = true; requestCount++
    status = "Auto-zoom requested: $target× ($reason)"
    if (!apply(target, reason)) {
      inFlight = false; application = "not-applied"
      status = "Zoom requested but not applied by camera: unavailable"; return false
    }
    lastStep = now
    return true
  }
  /** Count every callback, including ones rejected without recent potential evidence. */
  fun suggestion(ratio: Float, actual: Float, minimum: Float, maximum: Float, now: Long,
                 apply: (Float, String) -> Boolean): Boolean {
    suggestionSequence++
    if (!ratio.isFinite() || ratio <= 0f) { if (enabled) status = "Invalid ML Kit zoom suggestion"; return false }
    suggestedZoom = ratio
    return request(ratio, actual, minimum, maximum, now, "ML Kit zoom suggestion", apply)
  }
  fun frame(boxes: List<Box>, reads: List<Read>, width: Int, height: Int,
            previewWidth: Int, previewHeight: Int, actual: Float, minimum: Float,
            maximum: Float, now: Long, failed: Boolean, apply: (Float, String) -> Boolean, reportedPotentialCount: Int = boxes.size) {
    frameCount++; potentialCount = reportedPotentialCount; decodedCount = reads.size
    relevantCount = reads.count { relevance(it) == Relevance.IDENTIFIER }
    irrelevantCount = reads.count { relevance(it) == Relevance.IRRELEVANT }
    unassignedCount = decodedCount - relevantCount - irrelevantCount
    decoded = false
    if (!enabled || manual) return
    if (failed || width <= 0 || height <= 0 || previewWidth <= 0 || previewHeight <= 0) {
      stableFrames = 0; center = null; lastPotentialTime = -1L
      status = if (failed) "Barcode analysis failed — no zoom requested" else "Waiting for valid scanner dimensions"
      return
    }
    val scale = max(previewWidth.toFloat() / width, previewHeight.toFloat() / height)
    val dx = (width * scale - previewWidth) / 2f
    val dy = (height * scale - previewHeight) / 2f
    data class Target(val x: Float, val y: Float, val w: Float, val h: Float) {
      fun distance() = hypot(x - .5f, y - .5f)
      fun inGuide() = w > 0f && h > 0f && x in .08f.. .92f && y in .27f.. .73f
    }
    fun project(b: Box) = Target(
      ((b.left + b.right) * scale / 2f - dx) / previewWidth,
      ((b.top + b.bottom) * scale / 2f - dy) / previewHeight,
      (b.right - b.left) * scale / previewWidth, (b.bottom - b.top) * scale / previewHeight)
    val target = boxes.map(::project).filter { it.inGuide() }.minByOrNull { it.distance() }
    val identified = reads.filter { relevance(it) == Relevance.IDENTIFIER }.mapNotNull { it.box }
      .map(::project).filter { it.inGuide() }.minByOrNull { it.distance() }
    // An unrelated decode never latches the whole session off. Choose the nearest guide target.
    if (identified != null && (target == null || identified.distance() <= target.distance())) {
      decoded = true; stableFrames = 0; center = null; lastPotentialTime = -1L
      status = "Identifier-shaped barcode decoded nearest guide — no zoom needed"; return
    }
    if (target == null) {
      stableFrames = 0; center = null; lastPotentialTime = -1L; boxWidth = 0f; boxHeight = 0f
      status = if (potentialCount == 0) "No potential barcode detected — no zoom requested" else if (boxes.isEmpty()) "Potential detected without geometry — no zoom requested" else "Potential barcode outside guide — no zoom requested"
      return
    }
    boxWidth = target.w; boxHeight = target.h
    val previous = center
    if (previous != null && hypot(target.x - previous.first, target.y - previous.second) > .08f) stableFrames = 0
    center = Pair(target.x, target.y); stableFrames++; lastPotentialTime = now
    if (stableFrames < 3) { status = "Potential detected — waiting for three stable frames"; return }
    if (target.w >= .28f && target.h >= .06f) {
      lastPotentialTime = -1L; status = "Potential detected — barcode already large; no zoom requested"; return
    }
    val desired = if (suggestedZoom > actual + .02f) suggestedZoom else maximum
    request(desired, actual, minimum, maximum, now,
      if (suggestedZoom > actual + .02f) "ML Kit suggestion / confirmed potential" else "small centered undecoded barcode", apply)
  }
  fun acknowledged(actual: Float, error: String? = null) {
    inFlight = false
    if (error != null || kotlin.math.abs(actual - requestedZoom) > .03f) {
      application = "not-applied"
      if (enabled) status = "Zoom requested but not applied by camera: " + (error ?: "ratio unchanged")
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
    fields["decodedCount"] = decodedCount; fields["relevantCount"] = relevantCount
    fields["irrelevantCount"] = irrelevantCount; fields["unassignedCount"] = unassignedCount
    fields["boxWidth"] = boxWidth; fields["boxHeight"] = boxHeight
    fields["suggestedZoom"] = suggestedZoom; fields["suggestionSequence"] = suggestionSequence
    fields["frameCount"] = frameCount; fields["requestCount"] = requestCount; fields["appliedCount"] = appliedCount
    fields["sessionCount"] = sessionCount
    return fields
  }
}
