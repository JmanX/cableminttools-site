package com.cableminttools.devicecapture.ocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CableMintOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CableMintOcr")

    // Read the local file directly: Expo Camera's URL scanner requires an
    // optional image-loader service that is absent in this minimal app.
    AsyncFunction("scanBarcodesAsync") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "Android context is unavailable", null)
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(imageUri))
      } catch (error: Exception) {
        promise.reject("IMAGE_READ_FAILED", error.message ?: "Cannot read image", error)
        return@AsyncFunction
      }
      val scanner = BarcodeScanning.getClient()
      scanner.process(image)
        .addOnSuccessListener { codes ->
          promise.resolve(codes.mapNotNull { code ->
            code.rawValue?.let { value ->
              mapOf("data" to value, "type" to "mlkit-${code.format}")
            }
          })
        }
        .addOnFailureListener { error ->
          promise.reject("BARCODE_FAILED", error.message ?: "Barcode recognition failed", error)
        }
        .addOnCompleteListener { scanner.close() }
    }

    AsyncFunction("recognizeAsync") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "Android context is unavailable", null)
        return@AsyncFunction
      }

      val image = try {
        InputImage.fromFilePath(context, Uri.parse(imageUri))
      } catch (error: Exception) {
        promise.reject("IMAGE_READ_FAILED", error.message ?: "Cannot read image", error)
        return@AsyncFunction
      }

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          val lines = result.textBlocks.flatMap { block ->
            block.lines.map { line ->
              val box = line.boundingBox
              mapOf(
                "text" to line.text,
                "left" to (box?.left ?: 0),
                "top" to (box?.top ?: 0),
                "right" to (box?.right ?: 0),
                "bottom" to (box?.bottom ?: 0)
              )
            }
          }
          promise.resolve(mapOf("text" to result.text, "lines" to lines))
        }
        .addOnFailureListener { error ->
          promise.reject("OCR_FAILED", error.message ?: "Text recognition failed", error)
        }
        .addOnCompleteListener { recognizer.close() }
    }
  }
}
