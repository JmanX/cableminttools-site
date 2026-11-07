package com.cableminttools.devicecapture.ocr

import android.net.Uri
import android.graphics.Point
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CableMintOcrModule : Module() {
  private fun geometry(box: Rect?, points: Array<Point>?, image: InputImage): Map<String, Any?> {
    val rotated = image.rotationDegrees % 180 != 0
    return mapOf(
      "boundingBox" to box?.let { mapOf("left" to it.left, "top" to it.top, "right" to it.right, "bottom" to it.bottom) },
      "cornerPoints" to (points?.map { mapOf("x" to it.x, "y" to it.y) } ?: emptyList()),
      "coordinateSpace" to "image",
      "imageWidth" to if (rotated) image.height else image.width,
      "imageHeight" to if (rotated) image.width else image.height
    )
  }

  private fun barcodeType(format: Int): String = when (format) {
    1 -> "code128"; 2 -> "code39"; 4 -> "code93"; 8 -> "codabar"
    16 -> "datamatrix"; 32 -> "ean13"; 64 -> "ean8"; 128 -> "itf14"
    256 -> "qr"; 512 -> "upc_a"; 1024 -> "upc_e"; 2048 -> "pdf417"; 4096 -> "aztec"
    else -> "unknown"
  }
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
              geometry(code.boundingBox, code.cornerPoints, image) + mapOf(
                "data" to value, "type" to barcodeType(code.format), "format" to code.format, "source" to "image"
              )
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
              geometry(box, line.cornerPoints, image) + mapOf(
                "text" to line.text,
                "left" to (box?.left ?: 0),
                "top" to (box?.top ?: 0),
                "right" to (box?.right ?: 0),
                "bottom" to (box?.bottom ?: 0),
                "elements" to line.elements.map { element ->
                  geometry(element.boundingBox, element.cornerPoints, image) + mapOf("text" to element.text)
                }
              )
            }
          }
          val rotated = image.rotationDegrees % 180 != 0
          promise.resolve(mapOf("text" to result.text, "lines" to lines,
            "imageWidth" to if (rotated) image.height else image.width,
            "imageHeight" to if (rotated) image.width else image.height))
        }
        .addOnFailureListener { error ->
          promise.reject("OCR_FAILED", error.message ?: "Text recognition failed", error)
        }
        .addOnCompleteListener { recognizer.close() }
    }
  }
}
