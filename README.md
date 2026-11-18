# unbake-scorm-toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18.0.0-339933.svg)](./package.json)
[![RiseKit Chrome Extension](https://img.shields.io/badge/Chrome_Web_Store-RiseKit_for_Rise_360-0f766e.svg)](https://chromewebstore.google.com/detail/risekit-for-rise-360-them/efgobfllpgjbbbnfckodiljfokafmfmf)

Zero-dependency, 100% clean-room Node.js CLI and ESM library for inspecting published **ADL SCORM 1.2** and **SCORM 2004** `.zip` archives, decoding Base64 JSON course payloads (`runtime-data.js`), verifying IEEE 802.3 CRC32 integrity, auditing root `imsmanifest.xml` placement, and counting SCOs, quiz items, OASIS XLIFF 1.2 localization strings, and packaged media assets.

> [!TIP]
> **Need a 1-click Chrome Extension for Rise 360 or a zero-install browser GUI for orphaned SCORM `.zip` rescue?**
> - **Free Chrome Extension for Rise 360 Themes, Video Scrubber Gates & Word `.docx` Backups:** [**Install RiseKit for Rise 360 on Chrome Web Store**](https://chromewebstore.google.com/detail/risekit-for-rise-360-them/efgobfllpgjbbbnfckodiljfokafmfmf)
> - **Full Local Browser Studio (`0` bytes uploaded to any server):** **[scorm.stillhumanacademy.com](https://scorm.stillhumanacademy.com)**
>
> - **Edit Orphaned or Rise-Exported SCORM `.zip` Without Source Files:** [scorm.stillhumanacademy.com/edit-rise-360-scorm-without-source](https://scorm.stillhumanacademy.com/edit-rise-360-scorm-without-source)
> - **Extract a Microsoft Word (`.docx`) SME Storyboard from Any SCORM `.zip`:** [scorm.stillhumanacademy.com/extract-word-storyboard-from-scorm-zip](https://scorm.stillhumanacademy.com/extract-word-storyboard-from-scorm-zip)
> - **Extract & Re-Inject OASIS XLIFF 1.2 Translations Inside SCORM `.zip`:** [scorm.stillhumanacademy.com/translate-scorm-package-xliff](https://scorm.stillhumanacademy.com/translate-scorm-package-xliff)
> - **Clean-Room Local 8-Block SCORM 1.2 Course Studio (One-Time Ownership):** [scorm.stillhumanacademy.com/local-scorm-block-editor-one-time](https://scorm.stillhumanacademy.com/local-scorm-block-editor-one-time)

---

## Why Instructional Designers & LMS Engineers Use This

1. **Orphaned SCORM `.zip` Triage:** An external vendor leaves without transferring cloud source links, or an authoring seat lapses at `$1,499/yr`, leaving only the compiled `.zip` in Cornerstone, Workday, Canvas, or Moodle. `unbake-scorm-inspect` tells you in milliseconds whether the course stores copy in Base64 JSON (`base64-json`), plain JSON (`json-ast`), or semantic HTML5 (`html5-dom`), plus exact lesson, quiz, string, and media counts.
2. **Root `imsmanifest.xml` & CRC32 Pre-Flight:** Catches accidental parent-folder nesting (`course_folder/imsmanifest.xml`) and corrupt DEFLATE/STORE ZIP entries before LMS upload fails.
3. **Localization & Storyboard Scoping:** Counts localizable UTF-8 text units and previews OASIS XLIFF 1.2 XML (`--xliff-preview es-ES`) so translation vendors can quote accurately without source files.

---

## Quick Start (CLI)

Requires Node.js `>= 18` with **zero npm install dependencies**:

```bash
git clone https://github.com/jdurey/unbake-scorm-toolkit.git
cd unbake-scorm-toolkit
npm test
```

### 1. Audit Any SCORM 1.2 or SCORM 2004 `.zip`

```bash
node ./bin/unbake-scorm-inspect.mjs ./examples/sample_orphaned_scorm12.zip
```

Sample output:

```text
+----------------------+--------------------------------------------------+
| Metric               | Audit Value                                      |
+----------------------+--------------------------------------------------+
| Course Title         | Vendor Incident Escalation SOP                   |
| SCORM Edition        | SCORM 1.2 (1.2)                                  |
| Detected Payload     | base64-json                                      |
| Root imsmanifest.xml | PASS (at archive root)                           |
| Mastery Score        | 80%                                              |
| Launchable SCOs      | 1                                                |
| Lessons Detected     | 2                                                |
| Quiz Items           | 1                                                |
| Localizable Strings  | 11                                               |
| Media Assets         | 1 files (1388 bytes total)                       |
+----------------------+--------------------------------------------------+
```

### 2. Machine-Readable JSON Report for CI / LMS Pipelines

```bash
node ./bin/unbake-scorm-inspect.mjs ./examples/sample_orphaned_scorm12.zip --json
```

### 3. Preview OASIS XLIFF 1.2 Localization Units

```bash
node ./bin/unbake-scorm-inspect.mjs ./examples/sample_orphaned_scorm12.zip --xliff-preview es-ES
```

---

## Programmatic Node.js / ESM Library Usage

```js
import fs from "node:fs";
import { inspectScormZipBuffer, buildXliff12Preview } from "unbake-scorm-toolkit";

const zipBytes = fs.readFileSync("./examples/sample_orphaned_scorm12.zip");
const report = inspectScormZipBuffer(zipBytes);

console.log(report.scormEdition); // "SCORM 1.2"
console.log(report.payloadFormat); // "base64-json"
console.log(report.localizableStringCount); // 11

const xliffXml = buildXliff12Preview(report, "fr-FR");
```

---

## Browser GUI for In-Place Patching, Word `.docx` Storyboards & Clean-Room Authoring

When you are ready to go beyond CLI inspection and visually edit lessons, swap media, export an ECMA-376 Microsoft Word (`.docx`) SME review storyboard, round-trip full OASIS XLIFF 1.2 translations, or compile 8-block Clean-Room SCORM 1.2 + IMS QTI 2.1 packages with a live **ADL SCORM 1.2 CMI API Debugger**:

- **Launch UnbakeSCORM Studio:** [https://scorm.stillhumanacademy.com](https://scorm.stillhumanacademy.com)

All processing runs 100% in local browser RAM with zero server uploads and zero recurring subscriptions.

## Clean-Room & Open-Spec Compliance

100% original clean-room code authored from public specifications (PKWARE ZIP APPNOTE, ADL SCORM 1.2 CAM, ADL SCORM 2004, OASIS XLIFF 1.2). No proprietary third-party authoring runtime code is bundled or redistributed.

## License

MIT License. See [LICENSE](./LICENSE).
