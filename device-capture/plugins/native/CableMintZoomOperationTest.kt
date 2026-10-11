package expo.modules.camera

import androidx.camera.core.CameraControl
import com.google.common.util.concurrent.ListenableFuture
import java.lang.reflect.Proxy
import java.util.concurrent.Executor
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test

/** Uses the production operation and the real CameraControl interface, with a test-double camera. */
class CableMintZoomOperationTest {
  private class Future : ListenableFuture<Void> {
    var done=false; var failure: Exception?=null
    private val listeners=mutableListOf<Pair<Runnable,Executor>>()
    fun finish() { done=true;listeners.forEach { it.second.execute(it.first) } }
    override fun addListener(r:Runnable,e:Executor) { if(done)e.execute(r)else listeners.add(Pair(r,e)) }
    override fun cancel(interrupt:Boolean)=false
    override fun isCancelled()=false
    override fun isDone()=done
    override fun get():Void? { check(done);failure?.let { throw ExecutionException(it) };return null }
    override fun get(timeout:Long,unit:TimeUnit):Void?=get()
  }
  private class Lens {
    var actual=1f;var active=true
    val ratios=mutableListOf<Float>();val futures=mutableListOf<Future>()
    val control=Proxy.newProxyInstance(CameraControl::class.java.classLoader,arrayOf(CameraControl::class.java)) { _,method,args ->
      check(method.name=="setZoomRatio") { "Unexpected camera method: " + method.name }
      ratios.add(args!![0] as Float);Future().also { futures.add(it) }
    } as CameraControl
    fun apply(target:Float,complete:(Float,String?)->Unit)=CableMintZoomOperation.submit(control,target,1f,8f,
      {actual},{active},Executor { it.run() },complete)
    fun acknowledge(actual:Float) { this.actual=actual;futures.last().finish() }
  }
  @Test fun undecodedFramesReachProductionCameraControlWithoutManualInteraction() {
    val c=CableMintAutoZoom();val lens=Lens();c.start(lens.actual)
    val box=listOf(CableMintAutoZoom.Box(190f,390f,210f,410f))
    val unrelated=listOf(CableMintAutoZoom.Read(1024,"12345670"),CableMintAutoZoom.Read(256,"0123456789ABCDEF0123"))
    val apply:(Float,String)->Boolean={ratio,reason->
      assertFalse(c.manual)
      println("AUTOMATIC CameraControl.setZoomRatio requested="+ratio+" reason="+reason)
      lens.apply(ratio){actual,error->c.acknowledged(actual,error);println("AUTOMATIC CameraControl acknowledgement actual="+actual+" result="+(error?:"applied"))}
    }
    for(time in 1000L..1002L)c.frame(box,unrelated,400,800,400,800,lens.actual,1f,8f,time,false,apply)
    assertEquals(listOf(1.12f),lens.ratios);assertEquals("requested",c.application)
    lens.acknowledge(1.12f);assertEquals("applied",c.application);assertEquals(1,c.appliedCount)
    c.frame(box,unrelated,400,800,400,800,lens.actual,1f,8f,1800L,false,apply)
    assertEquals(listOf(1.12f,1.24f),lens.ratios)
    lens.acknowledge(1.24f);assertEquals(2,c.appliedCount)
  }
  @Test fun actualRatioAndActiveCameraAreRequiredForApplicationSuccess() {
    val lens=Lens();var result:String?=null
    lens.apply(2f){_,error->result=error};lens.acknowledge(1f)
    assertEquals("requested ratio not applied",result)
    lens.apply(2f){_,error->result=error};lens.active=false;lens.acknowledge(2f)
    assertEquals("camera rebound / stale request",result)
  }
  @Test fun cancelledCameraOperationSurfacesFailureAndManualUsesSameClamp() {
    val lens=Lens();var result:String?=null
    lens.apply(99f){_,error->result=error};assertEquals(listOf(8f),lens.ratios)
    lens.futures.last().failure=Exception("camera closed");lens.acknowledge(1f)
    assertEquals("camera closed",result)
  }
}
