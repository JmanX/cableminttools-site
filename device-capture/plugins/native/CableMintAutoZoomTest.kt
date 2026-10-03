package expo.modules.camera

import org.junit.Assert.*
import org.junit.Test

class CableMintAutoZoomTest {
  private val tiny = listOf(CableMintAutoZoom.Box(190f, 390f, 210f, 410f))
  @Test fun distantUndecodedFramesIndependentlyDriveCameraWithoutManualInput() {
    val controller = CableMintAutoZoom()
    var lens = 1f
    val requests = mutableListOf<Float>()
    controller.start(lens)
    val camera: (Float, String) -> Boolean = { ratio, _ ->
      requests.add(ratio); lens = ratio; controller.acknowledged(lens); true
    }
    for (time in listOf(1000L, 1100L, 1200L, 1300L, 1900L)) {
      controller.frame(tiny, 0, 400, 800, 400, 800, lens, 1f, 8f, time, false, camera)
    }
    assertEquals(2, requests.size)
    assertEquals(1.12f, requests[0], .001f)
    assertEquals(1.24f, requests[1], .001f)
    assertEquals(2, controller.appliedCount)
    controller.frame(tiny, 1, 400, 800, 400, 800, lens, 1f, 8f, 3000L, false, camera)
    controller.frame(tiny, 0, 400, 800, 400, 800, lens, 1f, 8f, 4000L, false, camera)
    assertEquals(2, requests.size); assertTrue(controller.decoded)
  }
  @Test fun mlKitCallbackRequestsLensWithoutWaitingForJsOrRepeatedFrames() {
    val controller = CableMintAutoZoom(); controller.start(1f)
    var requested = 0f
    assertTrue(controller.suggestion(3f, 1f, .5f, 6f, 1000L) { ratio, _ -> requested = ratio; true })
    assertEquals(1.12f, requested, .001f)
    assertEquals("requested", controller.application)
    controller.acknowledged(1.12f)
    assertEquals("applied", controller.application)
    assertFalse(controller.suggestion(3f, 1.12f, .5f, 6f, 1100L) { _, _ -> fail("cooldown"); true })
  }
  @Test fun manualButtonsAndPinchPauseUntilNewCapture() {
    val controller = CableMintAutoZoom(); controller.start(1f); controller.pauseManual()
    assertFalse(controller.suggestion(3f, 2f, 1f, 8f, 9000L) { _, _ -> fail("manual override"); true })
    controller.start(1f)
    assertTrue(controller.suggestion(3f, 1f, 1f, 8f, 10000L) { _, _ -> true })
    controller.stop()
    assertFalse(controller.suggestion(3f, 1.12f, 1f, 8f, 20000L) { _, _ -> fail("photo stop"); true })
  }
  @Test fun thinWideBarcodeTriggersButLargeAndOutsideGuideDoNot() {
    val controller = CableMintAutoZoom(); controller.start(1f)
    var requested = 0f
    val camera: (Float, String) -> Boolean = { ratio, _ -> requested = ratio; true }
    for (time in 1L..3L) controller.frame(listOf(CableMintAutoZoom.Box(100f, 390f, 300f, 410f)), 0, 400, 800, 400, 800, 1f, 1f, 8f, time, false, camera)
    assertEquals(1.12f, requested, .001f)
    controller.start(1f); requested = 0f
    for (time in 1L..3L) controller.frame(listOf(CableMintAutoZoom.Box(120f, 300f, 280f, 500f)), 0, 400, 800, 400, 800, 1f, 1f, 8f, time, false, camera)
    assertEquals(0f, requested, .001f)
    for (time in 10L..13L) controller.frame(listOf(CableMintAutoZoom.Box(190f, 20f, 210f, 40f)), 0, 400, 800, 400, 800, 1f, 1f, 8f, time, false, camera)
    assertEquals(0f, requested, .001f)
  }
  @Test fun rejectionUnappliedRequestAndHardwareLimitsAreReported() {
    val controller = CableMintAutoZoom(); controller.start(1f)
    assertFalse(controller.suggestion(3f, 1f, 1f, 8f, 1000L) { _, _ -> false })
    assertEquals("not-applied", controller.application)
    controller.start(1f)
    assertTrue(controller.suggestion(3f, 1f, 1f, 1.05f, 1000L) { ratio, _ -> assertEquals(1.05f, ratio, .001f); true })
    controller.acknowledged(1f)
    assertEquals("not-applied", controller.application)
    assertTrue(controller.status.contains("not applied"))
    controller.start(4f)
    assertFalse(controller.suggestion(8f, 4f, 1f, 8f, 1000L) { _, _ -> fail("4x cap"); true })
  }
  @Test fun noPotentialAndPotentialWithoutRequestHaveDistinctDiagnostics() {
    val controller = CableMintAutoZoom(); controller.start(1f)
    val camera: (Float, String) -> Boolean = { _, _ -> fail("no request expected"); true }
    controller.frame(emptyList(), 0, 400, 800, 400, 800, 1f, 1f, 8f, 1000L, false, camera)
    assertEquals("No potential barcode detected", controller.status)
    controller.frame(tiny, 0, 400, 800, 400, 800, 1f, 1f, 8f, 1100L, false, camera)
    assertTrue(controller.status.contains("no zoom requested"))
    assertEquals(1, controller.potentialCount)
  }
}
