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
- QR codes for text, HTTP(S) URLs, Wi-Fi credentials, and vCard contacts are
  generated locally with the bundled ZXing writer. Payloads and generated SVGs
  remain in renderer memory; temporary preview URLs are revoked when replaced
  or closed. PNG conversion uses an in-memory canvas. The application does not
  navigate to encoded URLs, join networks, or write contacts. Data leaves the
  tool only when the user explicitly copies the payload or exports SVG/PNG.
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
  are written only when the user explicitly exports TXT or VCF. Business-card
  batches accept at most 20 images, reuse one fixed-language OCR session
  sequentially, and keep each contact's editable fields separate in memory.
  Explicit export can write one contact or a combined VCF containing all
  successful, user-reviewed contacts; it never writes to the system address
  book. Client-side PDF generation for document scans uses bundled jsPDF and
  runs locally.
  A separate searchable-PDF action is enabled only after every scanned page
  has valid OCR word boxes. It loads the bundled Noto Sans SC font locally and
  writes the current per-word-reviewed text at the original coordinates as an
  invisible text layer over the
  current page rasters; jsPDF embeds only glyphs used by the document. The
  layer does not use later free-form textarea edits because those edits have no
  reliable geometry. Rotation, reprocessing, deletion, or permanent redaction
  invalidates that page's OCR first, so stale or pre-redaction text cannot be
  exported through this action. The output can contain sensitive searchable
  text and should be protected like the source document.
  When multiple scanned pages contain local PII suggestions, a document-level
  navigation action shows only the aggregate suggestion/page counts and moves
  to the next flagged page in the current order. It loads that page's boxes
  into the existing manual redaction editor but never applies them
  automatically; pixels change only after explicit review and confirmation.
  File OCR batches run sequentially on the device and reuse one fixed-language,
  short-lived worker instead of loading a model for every file or missing scan
  page. The worker is terminated after completion, cancellation, or failure;
  queued files, per-file errors, and completed text remain in renderer memory until reset or tool closure.
  Combined TXT export occurs only after an explicit user action.
  Image OCR word confidence scores and bounding boxes may be shown as a local
  review overlay for file, business-card, and scanned-page results. The chosen
  threshold, low-score/all-word mode, page, and selection are temporary UI
  state; all-word mode presents valid boxes in bounded groups of 100. Scores and geometry are not
  persisted or used to rewrite recognized text automatically. Users may record
  bounded per-word corrections and explicitly apply them. Corrections preserve
  the original geometry and engine confidence, retain the first recognized text
  as provenance, and may use an empty value to delete a false positive. File
  text, business-card parsing, scanned-page text and PII suggestions, layout
  exports, and searchable PDF then use the corrected word text. If a free-form
  edit means the source word can no longer be located in sequence, the update
  fails closed rather than guessing a coordinate. Only an explicit
  “layout JSON”, “layout CSV”, “layout hOCR”, or “layout ALTO” action writes the source filename, dimensions,
  current reviewed words, optional recognition provenance, confidence scores,
  review status, and pixel/normalized geometry to the
  user-selected download location. hOCR is escaped standalone HTML containing
  page, line, word, bounding-box, and confidence markup; it does not execute or
  embed source content as active HTML. ALTO is escaped XML using the official
  4.4 page, block, line, and string hierarchy; it includes engine confidence,
  manual-correction status, and original-recognition alternatives when present.
  Those exports can contain sensitive text and
  should be handled like the source document. PDF pages read directly from an
  embedded text layer do not expose this overlay or layout export.
  After every scanned page has valid word boxes, separate document-level JSON,
  CSV, hOCR, and ALTO actions may combine all pages in the current user-visible order.
  They retain each raster page's dimensions and source filename, reviewed word
  text, original coordinates, confidence, and correction provenance. hOCR uses
  zero-based page numbers and unique cross-page IDs; ALTO uses ordered Page
  elements and one-based physical image numbers. If any page is missing valid
  boxes, both actions remain disabled and no partial layout document is written.
  A scanned-document OCR search is also local and transient. It compares a
  user query of up to 200 characters with the current reviewed text, reports
  only matching page counts in the interface, and navigates in the current
  page order. Queries and matches are not persisted, exported, or sent through
  IPC.
  Scanner OCR language selection is limited to the bundled English,
  Simplified-Chinese-plus-English, and Traditional-Chinese-plus-English data.
  Each reviewed page retains the language used for recognition in renderer
  memory so changing the selector cannot relabel an older page's layout export.
  The optional table assistant uses only those same in-memory word boxes and
  image dimensions. It looks for repeated horizontal gaps across at least three
  lines, retains one bounded simple-table candidate, and lets the user edit each
  inferred cell in temporary component state. It does not contact a table or
  document-understanding service. Only an explicit confirmation writes the
  reviewed CSV, which may contain the same sensitive text as the source. The
  candidate is heuristic and does not establish merged cells, cross-page
  structure, field meaning, or extraction accuracy.
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
  blurred, solid-color, or user-selected local image background output is rendered
  into a local PNG canvas. A custom background is limited to PNG, JPEG, WebP, or
  BMP up to 35 MB and stays in renderer memory; cover/contain placement and focal
  position are applied locally. Subject and background images exceeding 80 million
  decoded pixels are rejected. Removing or resetting the custom background drops
  the component reference, and neither image is uploaded or persisted.
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
  copy, structured extraction, and TXT export use the reviewed text. Free-form
  textarea edits do not change coordinates, while explicit per-word corrections
  recompute PII suggestions from the corrected boxes. Restore resets the text,
  word boxes, and PII suggestions together. A combined TXT is written
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
- Duplicate Image Finder accepts 2–20 explicitly selected local images, with a
  35 MB per-file and 200 MB total limit. It sequentially creates bounded JPEG
  previews, a 128-bit two-direction difference hash, and (when Web Crypto is
  available) a SHA-256 digest. Files, previews, hashes, pair distances, and
  partial errors stay in renderer memory until reset or tool closure. The app
  never deletes, moves, renames, or uploads source files. Perceptual-hash matches
  are review candidates, not proof that two images are semantically identical.
- Image Optimizer accepts one explicitly selected PNG, JPEG, WebP, or BMP and
  uses the browser's local canvas encoder to resize or convert it. Source pixels
  and the encoded preview remain in renderer memory. Re-encoding does not copy
  source EXIF, GPS, XMP, IPTC, or ICC metadata; JPEG also composites transparent
  pixels onto white. Only “confirm and export” writes the new file, and the
  source file is never modified. The browser may cache a generated Blob at its
  discretion until the temporary object URL is revoked.
- Image Crop and Rotate accepts one explicitly selected local image and creates
  a bounded in-memory working raster. Crop percentages, pixel coordinates,
  rotation, aspect ratio, preview Blob, and result remain in renderer memory.
  Every rotation is derived again from the original selected File rather than
  an earlier preview. Only an explicit final export writes a newly encoded PNG,
  JPEG, or WebP; it does not overwrite the source or copy source metadata.
- Image Inspection decodes one explicitly selected local image into a bounded
  transparent in-memory canvas. Its 64-bin histograms, luminance, contrast,
  Laplacian edge response, clipping ratios, transparency ratios, diagnostic
  signals, and preview Blob remain in renderer memory. Fully transparent pixels
  are excluded from exposure metrics. Only an explicit action writes the
  versioned inspection JSON; the source image is never modified or uploaded.
- Image Annotation accepts one explicitly selected local image and keeps its
  normalized rectangles, arrows, numbered markers, text, blur regions, and
  undo history in renderer memory. A bounded working raster is derived from
  the selected file; blur is burned into source pixels before visible marks are
  drawn. Only an explicit preview and final export writes a flattened PNG that
  does not copy source metadata. No editable annotation project is persisted,
  and the selected source is never overwritten or uploaded.
- Contact Sheet accepts 2–20 explicitly selected PNG, JPEG, WebP, or BMP files,
  with a 35 MB per-file and 200 MB total limit. Selection order, temporary
  preview URLs, layout settings, filenames, and the generated preview remain in
  renderer memory. Images are decoded and drawn sequentially into one bounded
  opaque canvas instead of retaining every decoded bitmap at once. Only an
  explicit preview and final export writes a flattened PNG; source metadata is
  not copied, source files are never modified, and no editable layout project
  is persisted or uploaded.
- Long Image Join and Split processes only explicitly selected PNG, JPEG,
  WebP, or BMP files. Join mode accepts 2-12 files, with a 35 MB per-file and
  160 MB total limit; order, direction, spacing, background, and the manual
  0%-50% leading-edge trim for later images remain in renderer memory. It
  reads dimensions and draws files sequentially rather than retaining every
  decoded bitmap. Split mode decodes one file up to 35 MB and divides all
  source pixels into 2-12 adjacent, non-overlapping regions. Decoded sources
  above 80 million pixels are rejected, and every generated PNG is bounded to
  an 8192-pixel side and 24 million pixels. Preview and result object URLs are
  revoked on reset or tool closure. Exports are newly encoded PNG files that
  do not copy source metadata; source files are never modified or uploaded and
  no editable join project is persisted.
- Image adjustment decodes one explicitly selected PNG, JPEG, WebP, or BMP and
  applies exposure, contrast, temperature, saturation, and grayscale in a fixed
  order. A bounded preview is held in renderer memory; full-size bounded pixels
  are created only for an explicit export and processed in cooperative chunks.
  PNG/WebP retain alpha while JPEG composites onto white. Source files and
  metadata are never modified, copied, persisted, or uploaded.
- Batch watermarking accepts 1–12 explicitly selected local images plus an
  optional local logo. The first bounded preview and each final bounded output
  are rendered with Canvas in the renderer. Final images are processed and
  downloaded one at a time so a full high-resolution batch is not retained in
  memory. Source files, logo pixels, settings, and metadata are not uploaded or
  persisted; only explicit downloads leave the tool state.
- Color Lab decodes one explicitly selected PNG, JPEG, WebP, or BMP into a
  bounded white-backed in-memory canvas and runs the bundled Color Thief
  quantizer locally. The normalized pixels, OKLCH palette, sampled points,
  foreground/background colors, and WCAG contrast result stay in renderer
  memory. Nothing is written automatically; CSS or JSON leaves the tool only
  when the user explicitly copies it. A sampled color-pair ratio is not treated
  as a complete accessibility audit of the image or design.
  The same bounded RGBA buffer can be processed cooperatively in memory with
  public-domain Viénot 1999 and Brettel 1997 reference transforms to preview
  three missing-cone color-vision conditions. Replacing a preview or leaving the
  tool revokes its temporary object URL; only explicit PNG export writes data.
  The preview is an approximation, not a diagnosis or accessibility guarantee.
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

- Batch Person Background accepts 2–12 explicitly selected subject images, with
  the same 35 MB per-file limit and a 160 MB aggregate limit. It processes files
  sequentially, keeps only bounded 1200 px review previews together, and regenerates
  confirmed successful items one at a time at up to 4096 px for explicit download.
  A failure does not stop later files, and cancellation stops after the current
  non-interruptible model operation. Batch mode never applies one portrait's manual
  mask strokes to another portrait and does not persist source or result images.

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

Expression Masks loads the bundled MediaPipe Face Landmarker only after the
user selects Mask mode and starts the camera. Face landmarks and blendshape
scores are used transiently to draw the selected overlay in the renderer; they
are not uploaded, recorded, written to disk, or used to infer identity or
emotion. Leaving Mask mode stops the analysis loop and clears the overlay.

This notice applies to the open-source Codex Gesture Dock application in this
repository. A distributor that adds telemetry, accounts, or another network
service must publish a separate notice and obtain any consent required by
applicable law. Material privacy changes must be documented before release.

Security or privacy concerns can be reported through the repository's GitHub
issue tracker without including sensitive task content, file paths, or logs.

Batch image conversion accepts 1–20 explicitly selected PNG, JPEG, WebP, or BMP
files. The renderer keeps the file handles, first-image preview, and one encoded
result at a time in memory; it does not upload images, copy EXIF/GPS metadata,
overwrite sources, or retain a batch after the workspace is reset. Files leave
the app only when the user confirms the browser downloads.

Screenshot beautification accepts one explicitly selected local image. The
source, bounded preview, style settings, and one rendered result remain in the
renderer memory. Backgrounds, window chrome, padding, corners, and shadows are
drawn locally; the app does not upload the screenshot, copy its metadata, or
claim that decorative window chrome proves an originating application.

Ink Extraction accepts one explicitly selected local image. The source,
bounded preview, settings, and one rendered result remain in renderer memory.
The app applies deterministic luminance thresholds locally, clears RGB in
fully transparent output pixels, and writes only when the user explicitly
exports a newly encoded PNG. Partly transparent edge pixels can still contain
source colors, so this feature is not a privacy-redaction tool. It does not
identify a signer, authenticate a signature or stamp, or establish identity,
authorization, or legal validity.

Color Key accepts one explicitly selected local image. The source, bounded
preview, sampled color and one rendered result remain in renderer memory. The
app computes OKLab color distance locally, clears RGB in fully transparent
output pixels, and writes only after explicit PNG export. Partly transparent
edge pixels still contain source colors, and similarly colored content anywhere
in the image can be removed; this is not a privacy-redaction or semantic
background-removal tool.

Sticker Outline accepts one explicitly selected transparent PNG or WebP. The
source, bounded preview, alpha-distance workspace and one rendered result stay
in renderer memory. It scans alpha, trims to visible pixels, and draws a local
raster outline; temporary object URLs are revoked when replaced. Only explicit
PNG export writes data, without copying source metadata. The outline does not
identify the depicted subject or create a vector/print cutting path.
