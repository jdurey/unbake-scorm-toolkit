import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  readZipBuffer,
  writeZipBuffer,
  inspectScormZipBuffer,
  buildXliff12Preview,
  formatAuditTable,
  buildSampleScormZipBuffer
} from "../src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CLI_BIN = path.join(REPO_ROOT, "bin", "unbake-scorm-inspect.mjs");

test("1. Clean-room PKZIP reader/writer round-trips DEFLATE (8) and STORE (0) entries and catches CRC32 tampering", () => {
  const sampleZip = buildSampleScormZipBuffer();
  const entries = readZipBuffer(sampleZip);
  assert.equal(entries.length, 4);
  assert.ok(entries.some((e) => e.method === 8));
  assert.ok(entries.some((e) => e.method === 0));

  const tampered = Buffer.from(sampleZip);
  const idx = 30 + "imsmanifest.xml".length + 6;
  tampered[idx] ^= 0xff;
  assert.throws(() => readZipBuffer(tampered), /CRC32|incorrect|invalid/i);
});

test("2. Inspects Base64 runtime-data.js SCORM 1.2 .zip and counts SCOs, lessons, quiz items, strings, and media", () => {
  const sampleZip = buildSampleScormZipBuffer();
  const report = inspectScormZipBuffer(sampleZip);

  assert.equal(report.ok, true);
  assert.equal(report.scormEdition, "SCORM 1.2");
  assert.equal(report.payloadFormat, "base64-json");
  assert.equal(report.masteryScore, 80);
  assert.equal(report.scoCount, 1);
  assert.equal(report.lessonCount, 2);
  assert.equal(report.quizItemCount, 1);
  assert.ok(report.localizableStringCount >= 8);
  assert.equal(report.mediaAssetCount, 1);
  assert.equal(report.rootNormalized, true);

  const table = formatAuditTable(report);
  assert.match(table, /Vendor Incident Escalation SOP/);
  assert.match(table, /base64-json/);

  const xliff = buildXliff12Preview(report, "es-ES");
  assert.match(xliff, /target-language="es-ES"/);
  assert.match(xliff, /<trans-unit id=/);
});

test("3. Detects nested SCORM 2004 HTML5 manifest warning and parses minNormalizedMeasure mastery score", () => {
  const manifest2004 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="M2004" version="1.3"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="O1">
    <organization identifier="O1">
      <title>Clinical Safety Refresher</title>
      <item identifier="I1" identifierref="R1">
        <title>Module 1</title>
        <imsss:sequencing><imsss:objectives><imsss:primaryObjective><imsss:minNormalizedMeasure>0.85</imsss:minNormalizedMeasure></imsss:primaryObjective></imsss:objectives></imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="R1" type="webcontent" adlcp:scormType="sco" href="sco1.html">
      <file href="sco1.html"/>
    </resource>
  </resources>
</manifest>`;

  const scoHtml = `<!doctype html><html><body><h1>Clinical Safety</h1><p>Verify patient wristband before medication administration.</p><fieldset><legend>Check ID first?</legend></fieldset></body></html>`;
  const nestedZip = writeZipBuffer([
    { path: "accidental_parent/imsmanifest.xml", data: manifest2004, method: 8 },
    { path: "accidental_parent/sco1.html", data: scoHtml, method: 8 }
  ]);

  const report = inspectScormZipBuffer(nestedZip);
  assert.equal(report.scormEdition, "SCORM 2004");
  assert.equal(report.payloadFormat, "html5-dom");
  assert.equal(report.masteryScore, 85);
  assert.equal(report.rootNormalized, false);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.quizItemCount, 1);
});

test("4. CLI binary executes --write-sample, default audit table, --json, and --xliff-preview cleanly", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unbake-cli-"));
  try {
    const zPath = path.join(tmpDir, "fixture.zip");
    execFileSync(process.execPath, [CLI_BIN, "--write-sample", zPath], { encoding: "utf8" });
    assert.ok(fs.existsSync(zPath));

    const tableOut = execFileSync(process.execPath, [CLI_BIN, zPath], { encoding: "utf8" });
    assert.match(tableOut, /SCORM 1\.2/);
    assert.match(tableOut, /https:\/\/scorm\.stillhumanacademy\.com/);

    const jsonOut = JSON.parse(
      execFileSync(process.execPath, [CLI_BIN, zPath, "--json"], { encoding: "utf8" })
    );
    assert.equal(jsonOut.ok, true);
    assert.equal(jsonOut.lessonCount, 2);

    const xliffOut = execFileSync(process.execPath, [CLI_BIN, zPath, "--xliff-preview", "de-DE"], {
      encoding: "utf8"
    });
    assert.match(xliffOut, /target-language="de-DE"/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("5. Zero external dependencies and zero em-dashes or en-dashes across repository", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.license, "MIT");

  function walk(dir) {
    const list = [];
    for (const entry of fs.readdirSync(dir)) {
      if (entry === ".git" || entry === "node_modules") continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) list.push(...walk(full));
      else if (/\.(mjs|js|json|md|yml)$/.test(entry)) list.push(full);
    }
    return list;
  }

  for (const f of walk(REPO_ROOT)) {
    if (f.endsWith("cli_and_lib.test.mjs")) continue;
    const txt = fs.readFileSync(f, "utf8");
    assert.equal(txt.includes("\u2014"), false, `Em-dash found in ${f}`);
    assert.equal(txt.includes("\u2013"), false, `En-dash found in ${f}`);
  }
});
