#!/usr/bin/env node
/**
 * unbake-scorm-inspect CLI
 * Zero-dependency clean-room SCORM 1.2 / 2004 .zip manifest, Base64 JSON payload,
 * XLIFF localization string, and media asset inspector.
 *
 * Interactive zero-upload browser GUI (patch .zip, export Word .docx storyboard, XLIFF 1.2):
 *   https://scorm.stillhumanacademy.com
 */

import fs from "node:fs";
import path from "node:path";
import {
  inspectScormZipBuffer,
  buildXliff12Preview,
  formatAuditTable,
  buildSampleScormZipBuffer
} from "../src/index.mjs";

const VERSION = "1.0.0";

function printHelp() {
  const help = `unbake-scorm-inspect v${VERSION}
Zero-dependency clean-room SCORM 1.2 & SCORM 2004 .zip manifest & Base64 payload inspector.
Browser Studio (patch .zip, Word .docx storyboard, XLIFF 1.2): https://scorm.stillhumanacademy.com

Usage:
  unbake-scorm-inspect <course_scorm.zip> [options]
  unbake-scorm-inspect --write-sample <sample_scorm.zip>

Options:
  --json                   Print machine-readable JSON audit report to stdout
  --xliff-preview <lang>   Emit sample OASIS XLIFF 1.2 XML (e.g. es-ES, fr-FR, de-DE)
  --write-sample <path>    Generate a synthetic clean-room Base64 SCORM 1.2 .zip fixture
  -h, --help               Show this help message
  -v, --version            Show CLI version
`;
  process.stdout.write(help);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("-v") || args.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exitCode = args.length === 0 ? 1 : 0;
    return;
  }

  const writeSampleIdx = args.indexOf("--write-sample");
  if (writeSampleIdx >= 0) {
    const outTarget = args[writeSampleIdx + 1];
    if (!outTarget) {
      throw new Error("Missing file path after --write-sample.");
    }
    const zipBuf = buildSampleScormZipBuffer();
    fs.mkdirSync(path.dirname(path.resolve(outTarget)), { recursive: true });
    fs.writeFileSync(outTarget, zipBuf);
    process.stdout.write(`Wrote clean-room sample SCORM 1.2 archive (${zipBuf.length} bytes) -> ${path.resolve(outTarget)}\n`);
    return;
  }

  const zipPath = args.find((a) => !a.startsWith("-"));
  if (!zipPath) {
    throw new Error("Missing SCORM .zip file path. Run with --help for usage.");
  }

  const rawBytes = fs.readFileSync(zipPath);
  const report = inspectScormZipBuffer(rawBytes);

  const xliffIdx = args.indexOf("--xliff-preview");
  if (xliffIdx >= 0) {
    const lang = args[xliffIdx + 1] && !args[xliffIdx + 1].startsWith("-") ? args[xliffIdx + 1] : "es-ES";
    process.stdout.write(buildXliff12Preview(report, lang));
    return;
  }

  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  process.stdout.write(formatAuditTable(report) + "\n");
}

try {
  main();
} catch (err) {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
}
