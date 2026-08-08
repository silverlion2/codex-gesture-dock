# Privacy Notice

Last updated: 2026-08-08

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
- QR codes and barcodes are decoded locally from the live video element. The
  decoded value remains in renderer memory and is not uploaded or retained by
  the application.
- Document mode creates an in-memory PNG only after the user clicks capture.
  Nothing is written until the user explicitly clicks save; the resulting file
  is stored in the user-selected/default download location and is not uploaded.
- File and business-card OCR use bundled Tesseract.js English, Simplified
  Chinese, and Traditional Chinese language data. PDF text extraction and
  scanned-page rendering use the bundled PDF.js worker. Source files,
  recognized text, and parsed contact fields remain in renderer memory. They
  are written only when the user explicitly exports TXT or VCF.
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
document, contact, or posture data. The installed build
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
