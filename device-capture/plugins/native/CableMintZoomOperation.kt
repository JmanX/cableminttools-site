package expo.modules.camera

import androidx.camera.core.CameraControl
import java.util.concurrent.Executor
import kotlin.math.abs

/** The single CameraX operation used by BOTH manual and automatic requests. */
internal object CableMintZoomOperation {
  fun submit(control: CameraControl, target: Float, minimum: Float, maximum: Float,
             readActual: () -> Float, isActive: () -> Boolean, executor: Executor,
             complete: (Float, String?) -> Unit): Boolean {
    if (!target.isFinite() || !isActive()) return false
    val clamped = target.coerceIn(minimum, maximum)
    val operation = try { control.setZoomRatio(clamped) } catch (error: Exception) {
      complete(readActual(), error.message ?: "CameraControl rejected zoom"); return false
    }
    operation.addListener({
      var failure = try { operation.get(); null } catch (error: Exception) {
        error.cause?.message ?: error.message ?: "CameraControl failed"
      }
      val actual = readActual()
      if (!isActive()) failure = "camera rebound / stale request"
      else if (failure == null && abs(actual - clamped) > .03f) failure = "requested ratio not applied"
      complete(actual, failure)
    }, executor)
    return true
  }
}
