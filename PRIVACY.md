# Privacy Notice

Last updated: 2026-08-09

Codex Gesture Dock is a privacy-first Windows desktop utility. Camera and
gesture processing runs locally. The application does not include advertising,
analytics, telemetry, user accounts, or a cloud backend operated by this
project.

## Data processed locally

- Camera video frames are read only while monitoring is active and are processed
  in memory by the bundled MediaPipe models.
- Microphone samples are read only after the user explicitly enables the Dock's
  microphone control. They are used in memory to calculate a live input-level
  meter and are not played back, recorded, transcribed, retained, or uploaded.
- QR codes and barcodes are decoded locally from either the live video element
  or an explicitly selected PNG, JPEG, WebP, or BMP image up to 35 MB. Selected
  images use an in-memory object URL that is revoked after one decode attempt.
  The image and decoded value are not uploaded or retained by the application;
  the value leaves memory only when the user explicitly copies it.
- Document mode accepts an explicit camera capture, a user-selected image, or
  a PDF containing up to 20 pages and no more than 35 MB. Bundled PDF.js
  sequentially rasterizes selected PDFs in memory with a 2200-pixel maximum
  page dimension before they enter the same scan pipeline. This intentionally
  discards original PDF text layers, forms, links, and annotations; document
  mode does not claim native PDF editing or redaction.
  Bundled OpenCV.js detects page edges, corrects perspective, and applies the
  selected color, grayscale, or black-and-white enhancement in an isolated
  local worker. Source images and multi-page scan results remain in renderer
  memory. Nothing is written until the user explicitly exports PNG or PDF; a
  scan sent to OCR follows the same local-only OCR boundary described below.
  A bounded pixel sample of each source page is also analyzed locally for
  resolution, luminance, contrast, edge sharpness, and concentrated highlights.
  The resulting quality metrics and advisory warnings remain with the in-memory
  page; they are not exported, uploaded, or used to block OCR/export.
  Manual privacy redactions are burned as black pixels into the current-page
  raster before PNG/PDF export or OCR. The unredacted base page remains only in
  renderer memory so the user can review, change, or clear boxes; it is never
  exported by the redacted-page actions and is discarded with the page/session.
  Ninety-degree page rotation is also performed on the local raster. Normalized
  redaction boxes rotate with the page and are burned again from the in-memory
  unredacted base; stale OCR text and derived fields are cleared after rotation.
  After scanned-page OCR, word boxes may be checked locally for probable email
  addresses, phone numbers, Chinese mainland identity numbers, and Luhn-valid
  financial card numbers. Matching text, geometry, and suggested redaction boxes
  remain in renderer memory. Suggestions never change pixels automatically: the
  user must review, adjust, delete, or explicitly apply every box.
- File and business-card OCR use bundled Tesseract.js English, Simplified
  Chinese, and Traditional Chinese language data. PDF text extraction and
  scanned-page rendering use the bundled PDF.js worker. Source files,
  recognized text, and parsed contact fields remain in renderer memory. They
  are written only when the user explicitly exports TXT or VCF. Client-side
  PDF generation for document scans uses bundled jsPDF and runs locally. File
  OCR batches run sequentially on the device and reuse one fixed-language,
  short-lived worker instead of loading a model for every file or missing scan
  page. The worker is terminated after completion, cancellation, or failure;
  queued files, per-file errors, and completed text remain in renderer memory until reset or tool closure.
  Combined TXT export occurs only after an explicit user action.
- Receipt/invoice fields are derived from the current OCR text by deterministic
  local matching. The editable merchant, date, document number, subtotal, tax,
  total, and currency values stay in renderer memory until the user explicitly
  copies JSON or exports CSV. No document-understanding API is contacted.
- Machine-readable-zone extraction runs only after a user requests it from a
  completed file or scanned-page OCR result. The bundled dependency-free `mrz`
  parser recognizes ICAO TD1, TD2, and TD3 layouts, performs field-aware OCR
  ambiguity correction, and validates check digits locally. Raw lines, parsed
  identity fields, corrections, and validity details stay in renderer memory.
  Copy and JSON export remain disabled until the user confirms comparison with
  the original document; reviewed JSON omits raw MRZ lines. Check digits detect
  transcription errors and are never presented as document/authenticity proof.
- Face and Photo Privacy uses the bundled MediaPipe BlazeFace model to detect
  face boxes in a user-selected photo. For JPEG and PNG inputs, the bundled
  `exifr` parser also inspects a limited set of common EXIF privacy fields such
  as GPS coordinates, device identifiers, capture time, and author information.
  WebP and BMP inputs are not covered by that inspection. The source photo,
  metadata summary, boxes, and processed image remain in renderer memory. Blur,
  pixelation, or blackout is burned into a newly encoded PNG canvas; the same
  re-encoding path is available when no face is detected. Users can add and
  position manual privacy regions when automatic detection misses a face or
  another visible sensitive area; those regions use the same permanent pixel
  processing and remain in renderer memory. Original EXIF, GPS,
  XMP, IPTC, and ICC payloads are not copied to the exported PNG. Only an
  explicit export action writes it. Detection can miss faces and metadata
  inspection is not content forensics, so the UI requires visual review and
  never describes the result as guaranteed anonymization.
- Person Background uses the bundled MediaPipe SelfieSegmenter model to create
  an in-memory foreground confidence mask for a user-selected photo. Transparent,
  blurred, or solid-color background output is rendered into a local PNG canvas.
  Users can paint bounded keep-person or remove-background corrections over the
  generated mask, undo or cancel those strokes, and preview the recomposited
  result. The photo, mask, correction strokes, and preview stay in renderer memory; only an explicit
  “confirm and export” action writes the processed PNG. Segmentation can miss
  fine hair, transparent accessories, and motion edges, so the UI requires an
  original-image comparison before users rely on the export.
- OCR text and sensitive-text suggestions for scanned pages are keyed by the
  in-memory page identifier. Page switching and reordering preserve them;
  pixel-changing operations invalidate only the affected page. “OCR missing
  pages” runs pages sequentially and preserves completed results if cancelled.
  Users can correct each page’s OCR text or restore the recognized original;
  copy, structured extraction, and TXT export use the reviewed text while the
  original coordinate suggestions stay unchanged. A combined TXT is written
  only after an explicit export and distinguishes pages that have not been
  recognized from pages intentionally reviewed to empty.
- Object Recognition uses either the bundled MediaPipe EfficientDet-Lite0 model
  or a user-selected, MediaPipe-compatible `.tflite` object detector up to
  100 MB to return category names, confidence scores, and boxes for one
  explicitly captured camera frame or a user-selected photo. An optional UTF-8
  TXT label map is limited to 256 KB and 10,000 indexed lines. Imported model
  bytes, labels, the frame/photo, and detections stay in renderer memory and
  are discarded when the bundled model is restored or the tool closes. They
  are never uploaded or added to application storage. The user can filter,
  enable, or skip each candidate; only an explicit copy or export action writes
  reviewed JSON to the clipboard or an annotated PNG to disk. Results are not
  used for identity, safety, accessibility, surveillance, or automated actions.
- Image Comparison decodes two explicitly selected PNG, JPEG, WebP, or BMP
  files into bounded in-memory RGBA canvases and runs the bundled Pixelmatch
  algorithm locally. Original dimensions, normalized pixels, wipe position,
  tolerance, metrics, and the diff image remain in renderer memory. No image
  or metric is uploaded or persisted; only an explicit export writes a newly
  encoded diff PNG. Pixel similarity is not treated as proof of functional,
  semantic, visual-quality, or accessibility equivalence.
- Body landmarks, posture calibration, and detected gestures are not written to
  disk or sent over the network.
- Daily posture totals, reminder preferences, gesture mode, selected camera and
  microphone identifiers, camera framing/mirroring, viewed-file markers, the
  selected Codex task identifier, window bounds, and the Windows-control
  emergency-stop state are stored on the local device.
- Windows-control audit logs contain timestamps, allowlisted action names,
  process metadata, outcome, and identity-verification status. They do not
  contain camera frames, task content, window text, arbitrary keystrokes, or
  file contents.
- Recent Codex task and file metadata is requested from the locally installed
  Codex App Server and displayed in memory. Absolute paths are not exposed to
  the renderer process.

The Dock requests camera video permission only when a camera session starts and
requests microphone permission only when the user explicitly enables its audio
input control. “Activate Codex microphone” is a separate gesture action that
sends Codex Desktop's fixed dictation shortcut; Codex Desktop controls its own
microphone permission and audio data.

## Network access

The application does not upload camera, microphone, scan, barcode, OCR,
document, contact, image-comparison, or posture data. The installed build
connects to this project's public GitHub Releases endpoint to check for and
download updates. Development mode may connect to a loopback-only Vite server.
Codex Desktop and GitHub have their own privacy practices, which this project
does not control.

## Retention and deletion

Local preferences and task binding remain until the user resets them or removes
the application data directory. Audit files are stored by day and are not
uploaded or automatically deleted. To remove all Dock data, fully exit the
application and delete:

```text
%APPDATA%\codex-gesture-dock
```

Uninstalling the application does not automatically delete that directory, so
users can choose whether to retain or erase local history.

## Scope and changes

This notice applies to the open-source Codex Gesture Dock application in this
repository. A distributor that adds telemetry, accounts, or another network
service must publish a separate notice and obtain any consent required by
applicable law. Material privacy changes must be documented before release.

Security or privacy concerns can be reported through the repository's GitHub
issue tracker without including sensitive task content, file paths, or logs.
