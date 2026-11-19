package expo.modules.camera

import org.junit.Assert.*
import org.junit.Test

class CableMintAutoZoomTest {
  private val tiny = listOf(CableMintAutoZoom.Box(190f, 390f, 210f, 410f))
  private val upc = CableMintAutoZoom.Read(1024, "12345670", tiny[0])
  private val qr = CableMintAutoZoom.Read(256, "0123456789ABCDEF0123", tiny[0])
  private fun frame(c: CableMintAutoZoom, boxes: List<CableMintAutoZoom.Box> = tiny,
                    reads: List<CableMintAutoZoom.Read> = emptyList(), time: Long,
                    actual: Float = 1f, maximum: Float = 8f, failed: Boolean = false,
                    apply: (Float, String) -> Boolean) {
    c.frame(boxes, reads, 400, 800, 400, 800, actual, 1f, maximum, time, failed, apply)
  }
  @Test fun irrelevantDecodesDoNotLatchAutoZoomOff() {
    val c = CableMintAutoZoom(); c.start(1f)
    var lens = 1f; val requests = mutableListOf<Float>()
    val apply: (Float, String) -> Boolean = { ratio, _ -> requests.add(ratio); lens = ratio; c.acknowledged(lens); true }
    for(time in listOf(1000L,1100L,1200L,1300L,1900L))
      frame(c, reads=listOf(upc, qr), time=time, actual=lens, apply=apply)
    assertEquals(listOf(1.12f, 1.24f), requests)
    assertTrue(c.enabled); assertFalse(c.manual); assertFalse(c.decoded)
    assertEquals(2,c.decodedCount); assertEquals(0,c.relevantCount)
    assertEquals(1,c.irrelevantCount); assertEquals(1,c.unassignedCount)
    assertEquals(2,c.appliedCount)
  }
  @Test fun clearOrLaterEmptyResultsDoNotLeaveAnUnrelatedDecodeLatch() {
    val c = CableMintAutoZoom(); c.start(1f); var requests=0
    val apply: (Float,String)->Boolean = { _,_->requests++;true }
    frame(c, boxes=emptyList(), reads=listOf(upc), time=1000L, apply=apply)
    frame(c, boxes=emptyList(), time=1100L, apply=apply)
    assertTrue(c.enabled); assertEquals(0,requests)
    for(time in 1200L..1202L)frame(c,time=time,apply=apply)
    assertEquals(1,requests)
  }
  @Test fun noPotentialMeansNoBlindZoomEvenWithMlKitSuggestion() {
    val c=CableMintAutoZoom();c.start(1f)
    val apply: (Float,String)->Boolean={_,_->fail("blind zoom");true}
    frame(c,boxes=emptyList(),time=1000L,apply=apply)
    assertFalse(c.suggestion(3f,1f,1f,8f,1100L,apply))
    assertEquals(1,c.suggestionSequence);assertEquals(3f,c.suggestedZoom,.001f)
    assertTrue(c.status.contains("No fresh potential"))
  }
  @Test fun suggestionUsesConfirmedGeometryAndAcknowledgedLens() {
    val c=CableMintAutoZoom();c.start(1f)
    // Make a stable target while at the cap, then test the callback with actual room to zoom.
    for(time in 1000L..1002L)frame(c,time=time,actual=4f,apply={_,_->fail("cap");true})
    var request=0f
    assertTrue(c.suggestion(3f,1f,1f,8f,1100L){ratio,_->request=ratio;true})
    assertEquals(1.12f,request,.001f);assertEquals("requested",c.application)
    c.acknowledged(1.12f);assertEquals("applied",c.application)
    assertFalse(c.suggestion(3f,1.12f,1f,8f,1200L){_,_->fail("cooldown");true})
  }
  @Test fun identifierNearestGuideStopsAndOtherTargetsCanStillBeScanned() {
    val c=CableMintAutoZoom();c.start(1f);var requests=0
    val apply:(Float,String)->Boolean={_,_->requests++;true}
    val mac=CableMintAutoZoom.Read(1,"AABBCCDDEEFF",tiny[0])
    frame(c,reads=listOf(mac),time=1000L,apply=apply)
    assertTrue(c.decoded);assertTrue(c.enabled);assertEquals(0,requests)
    // Identification stops immediately for that target, not forever for subsequent targets.
    for(time in 2000L..2002L)frame(c,time=time,apply=apply)
    assertEquals(1,requests)
    assertEquals(CableMintAutoZoom.Relevance.IDENTIFIER,CableMintAutoZoom.relevance(CableMintAutoZoom.Read(1,"TESTSN000123")))
    assertEquals(CableMintAutoZoom.Relevance.IDENTIFIER,CableMintAutoZoom.relevance(CableMintAutoZoom.Read(1,"12345678")))
    assertEquals(CableMintAutoZoom.Relevance.IRRELEVANT,CableMintAutoZoom.relevance(CableMintAutoZoom.Read(512,"012345678901")))
  }
  @Test fun closestPotentialWinsOverIdentifierElsewhereAndOffGuideNoise() {
    val c=CableMintAutoZoom();c.start(1f);var request=0f
    val away=CableMintAutoZoom.Read(1,"AABBCCDDEEFF",CableMintAutoZoom.Box(30f,390f,50f,410f))
    for(time in 1000L..1002L)frame(c,reads=listOf(away),time=time,apply={ratio,_->request=ratio;true})
    assertEquals(1.12f,request,.001f)
  }
  @Test fun manualPausePhotoStopAndRebindKeepTheirModeUntilCaptureReset() {
    val c=CableMintAutoZoom();c.start(1f);c.pauseManual();c.cameraRebound()
    val apply:(Float,String)->Boolean={_,_->fail("manual pause / photo stop");true}
    for(time in 1000L..1004L)frame(c,time=time,apply=apply)
    assertFalse(c.suggestion(3f,1f,1f,8f,1100L,apply));assertTrue(c.manual)
    c.start(1f);assertFalse(c.manual);assertTrue(c.enabled);assertEquals(2,c.sessionCount)
    c.stop();for(time in 2000L..2004L)frame(c,time=time,apply=apply)
  }
  @Test fun thinWideButNotLargeOutsideGuideMovingOrFailedTargetsTrigger() {
    val c=CableMintAutoZoom();c.start(1f);var request=0f
    val apply:(Float,String)->Boolean={ratio,_->request=ratio;true}
    val thin=listOf(CableMintAutoZoom.Box(100f,390f,300f,410f))
    for(time in 1L..3L)frame(c,thin,time=time,apply=apply)
    assertEquals(1.12f,request,.001f)
    c.start(1f);request=0f
    for(time in 1L..4L)frame(c,listOf(CableMintAutoZoom.Box(120f,300f,280f,500f)),time=time,apply=apply)
    for(time in 10L..14L)frame(c,listOf(CableMintAutoZoom.Box(190f,20f,210f,40f)),time=time,apply=apply)
    for(time in 20L..24L)frame(c,time=time,failed=true,apply=apply)
    assertEquals(0f,request,.001f)
    c.start(1f)
    for(time in 30L..36L) {
      val x=if(time % 2L == 0L)100f else 250f
      frame(c,listOf(CableMintAutoZoom.Box(x,390f,x+20f,410f)),time=time,apply=apply)
    }
    assertEquals(0f,request,.001f)
  }
  @Test fun rejectionUnappliedAndHardwareCapsStayDistinct() {
    val c=CableMintAutoZoom();c.start(1f)
    for(time in 1L..3L)frame(c,time=time,apply={_,_->false})
    assertEquals("not-applied",c.application);assertEquals(1,c.requestCount)
    c.start(1f)
    for(time in 10L..12L)frame(c,time=time,maximum=1.05f,apply={ratio,_->assertEquals(1.05f,ratio,.001f);true})
    c.acknowledged(1f);assertEquals("not-applied",c.application)
    c.start(4f)
    for(time in 20L..24L)frame(c,time=time,actual=4f,apply={_,_->fail("4x cap");true})
    assertTrue(c.status.contains("limit"))
  }
}
