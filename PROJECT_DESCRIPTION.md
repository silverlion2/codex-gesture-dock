# Codex Gesture Dock — Project Description

Codex Gesture Dock is a privacy-first Windows desktop companion for controlling
Codex workflows with camera gestures and for completing common visual tasks
locally. It combines an always-on-top Electron dock, a bounded Codex App Server
adapter, fixed Windows actions, posture assistance, document scanning, OCR, and
image utilities in one application.

## Purpose

The project is designed for people who want faster hands-free access to common
Codex and Windows actions without sending camera frames, documents, or OCR
content to a cloud vision service. It also consolidates small visual workflows
that would otherwise require several websites or desktop applications.

## Main capabilities

- **Codex and Windows control:** six deliberate hold gestures, task browsing,
  active-turn steering, approval handling, emergency stop, and fixed Windows
  shortcuts protected by application identity and foreground-window checks.
- **Hands-free control:** an opt-in air pointer for local cursor movement,
  stable-dwell pinch click and open-palm scrolling, plus session-only local
  speech recognition for 19 fixed Chinese or English commands.
- **Posture and camera assistance:** personal posture calibration, local pose
  scoring, reminders, gesture guidance, face privacy masks, expression masks,
  person segmentation, and bounded object detection.
- **Document workflows:** camera/photo/PDF import, perspective correction,
  rotation, enhancement, page ordering, permanent redaction, quality guidance,
  multilingual OCR, document search, receipt and MRZ extraction, and searchable
  PDF generation.
- **OCR workflows:** image and batch OCR, business-card extraction, editable
  vCard output, word-confidence review, human corrections, simple table review,
  and JSON, CSV, hOCR 1.2, and ALTO 4.4 layout exports.
- **Codes:** live and file-based QR/barcode scanning, batch result export, and
  local QR creation for text, HTTP(S) links, Wi-Fi credentials, and contacts.
- **Image tools:** comparison, duplicate discovery, resizing, conversion,
  cropping, inspection, annotation, contact sheets, long-image stitching and
  splitting, adjustments, batch processing, watermarking, screenshot framing,
  signature/ink extraction, chroma keying, sticker outlines, background tools,
  palette analysis, contrast checks, and color-vision simulation.

## Privacy and safety model

Camera inference, OCR, barcode processing, document rendering, image editing,
and fixed-command speech recognition run locally with application-bundled or
Windows-provided runtimes. The application does not record video or speech and
does not automatically upload source files or recognition results. Files are
written only after an explicit export action. Destructive visual operations use
previews and human review; automatic detections and OCR confidence values are
presented as aids rather than guarantees.

Codex and Windows control are separated into bounded adapters. Windows actions
come from fixed allowlists, the emergency-stop state persists locally, and audit
records exclude task text, window contents, keystrokes, images, audio, and OCR
data. Voice control is off by default, lasts only for the current session, and
cannot approve Codex security prompts.

## Technology

- React 19, TypeScript, and Vite
- Electron for the Windows desktop shell
- MediaPipe Tasks for local pose, gesture, face, segmentation, and object tasks
- Windows System.Speech for fixed-command local voice control
- Tesseract.js for offline English, Simplified Chinese, and Traditional Chinese OCR
- OpenCV.js and PDF.js for document processing
- ZXing for QR/barcode scanning and QR creation
- Vitest, Node test runner, Playwright, and axe-core for verification

## Current status

The release-candidate source version is `0.6.0`. The latest published stable
version remains `v0.5.0`; the visual/OCR baseline on `main` was completed in
commit [`05892ff`](https://github.com/silverlion2/codex-gesture-dock/commit/05892ff1cda7f97dbe06ef57bf49b0fd70cb945a).
The application is an unofficial community project and is not affiliated with
or endorsed by OpenAI.

## Documentation

- [README and setup](README.md)
- [Chinese project description](docs/project-description-zh.md)
- [Development log](docs/development-log.md)
- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Privacy notice](PRIVACY.md)
- [Chinese user guide](docs/user-guide-zh.md)
- [Changelog](CHANGELOG.md)
