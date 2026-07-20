# Third-party notices

Codex Gesture Dock includes or bundles the following third-party software and
assets. Their licenses are included in `third_party_licenses/` and remain in
effect independently of this project's MIT license.

| Component | Version | License | Use |
| --- | --- | --- | --- |
| MediaPipe Tasks Vision | 0.10.35 | Apache-2.0 | Local pose and hand-gesture inference, WebAssembly runtime, and task models |
| Lucide React | 0.468.0 | ISC | User-interface icons |
| React and React DOM | 19.0.0 | MIT | User interface runtime |
| Electron | 43.1.1 | MIT and bundled Chromium notices | Desktop runtime |

Electron's packaged distribution includes its own `LICENSE` and
`LICENSES.chromium.html` notices. The MediaPipe model and WebAssembly files are
distributed solely for local inference; this application does not transmit
camera frames to a remote service.
