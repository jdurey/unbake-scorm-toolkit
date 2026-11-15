/**
 * unbake-scorm-toolkit - Clean-Room SCORM 1.2 / 2004 .zip Inspector & Audit Engine
 *
 * 100% original code authored from public open specifications:
 * - PKWARE APPNOTE.TXT (STORE 0 + DEFLATE 8 + IEEE 802.3 CRC32)
 * - ADL SCORM 1.2 CAM & ADL SCORM 2004 3rd/4th Edition
 * - OASIS XLIFF 1.2
 */

import zlib from "node:zlib";

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes) {
  let crc = 0xffffffff >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZipBuffer(inputBytes) {
  const buf = Buffer.isBuffer(inputBytes) ? inputBytes : Buffer.from(inputBytes);
  if (buf.length < 22) {
    throw new Error("Invalid ZIP archive: buffer shorter than 22-byte EOCD header.");
  }

  let eocdOffset = -1;
  const minPos = Math.max(0, buf.length - 65557);
  for (let pos = buf.length - 22; pos >= minPos; pos--) {
    if (buf.readUInt32LE(pos) === 0x06054b50) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Invalid ZIP archive: End of Central Directory (0x06054b50) not found.");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let cursor = cdOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Corrupt Central Directory entry at offset ${cursor}.`);
    }
    const method = buf.readUInt16LE(cursor + 10);
    const expectedCrc = buf.readUInt32LE(cursor + 16);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);

    const rawName = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf8");
    const normPath = rawName.replace(/\\/g, "/").replace(/^\/+/, "");
    cursor += 46 + nameLen + extraLen + commentLen;

    if (normPath.endsWith("/")) {
      continue;
    }
    if (normPath.split("/").includes("..")) {
      throw new Error(`Unsafe relative path inside ZIP archive: ${normPath}`);
    }

    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid Local File Header for '${normPath}'.`);
    }
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = buf.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = Buffer.from(rawSlice);
    } else if (method === 8) {
      data = zlib.inflateRawSync(rawSlice);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} on '${normPath}'.`);
    }

    const actualCrc = computeCrc32(data);
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `CRC32 mismatch on '${normPath}': expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}.`
      );
    }

    entries.push({
      path: normPath,
      method,
      crc32: actualCrc,
      compressedSize,
      uncompressedSize: data.length || uncompressedSize,
      data
    });
  }

  return entries;
}

export function writeZipBuffer(fileSpecs) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const spec of fileSpecs) {
    const cleanPath = String(spec.path).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleanPath || cleanPath.split("/").includes("..")) {
      throw new Error(`Unsafe ZIP output path: ${spec.path}`);
    }
    const nameBytes = Buffer.from(cleanPath, "utf8");
    const rawBytes = Buffer.isBuffer(spec.data)
      ? spec.data
      : spec.data instanceof Uint8Array
        ? Buffer.from(spec.data)
        : Buffer.from(String(spec.data), "utf8");

    const method = spec.method === 0 ? 0 : 8;
    const payload = method === 8 && rawBytes.length > 0 ? zlib.deflateRawSync(rawBytes) : rawBytes;
    const actualMethod = method === 8 && rawBytes.length === 0 ? 0 : method;
    const crc = computeCrc32(rawBytes);

    const lh = Buffer.alloc(30 + nameBytes.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(actualMethod, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x5c21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(rawBytes.length, 22);
    lh.writeUInt16LE(nameBytes.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBytes.copy(lh, 30);

    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(actualMethod, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x5c21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(rawBytes.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBytes.copy(cd, 46);

    localParts.push(lh, payload);
    centralParts.push(cd);
    offset += lh.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileSpecs.length, 8);
  eocd.writeUInt16LE(fileSpecs.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function decodeEntities(str) {
  return String(str ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseManifestXml(xmlText) {
  const schemaVerMatch = xmlText.match(/<schemaversion>\s*([\s\S]*?)\s*<\/schemaversion>/i);
  const rawSchemaVer = schemaVerMatch ? stripTags(schemaVerMatch[1]) : "";
  const is2004 =
    /2004|CAM\s*1\.3|1\.3|adlcp_v1p3|imsss/i.test(rawSchemaVer) || /xmlns:imsss=/i.test(xmlText);
  const scormEdition = is2004 ? "SCORM 2004" : "SCORM 1.2";

  const orgTitleMatch = xmlText.match(/<organization\b[^>]*>[\s\S]*?<title>\s*([\s\S]*?)\s*<\/title>/i);
  const title = orgTitleMatch ? stripTags(orgTitleMatch[1]) : "Untitled SCORM Package";

  let masteryScore = null;
  const m12 = xmlText.match(/<(?:adlcp:)?masteryscore>\s*([0-9.]+)\s*<\/(?:adlcp:)?masteryscore>/i);
  const m2004 = xmlText.match(/<(?:imsss:)?minNormalizedMeasure>\s*([0-9.+-]+)\s*<\/(?:imsss:)?minNormalizedMeasure>/i);
  if (m12) {
    masteryScore = Math.round(Number(m12[1]));
  } else if (m2004) {
    const num = Number(m2004[1]);
    masteryScore = num <= 1 ? Math.round(num * 100) : Math.round(num);
  }

  const scos = [];
  const resRegex = /<resource\b([^>]*)>([\s\S]*?)<\/resource>|<resource\b([^>]*)\/>/gi;
  let m;
  while ((m = resRegex.exec(xmlText)) !== null) {
    const attrs = m[1] || m[3] || "";
    const hrefMatch = attrs.match(/\bhref="([^"]+)"/i);
    const idMatch = attrs.match(/\bidentifier="([^"]+)"/i);
    const scormTypeMatch = attrs.match(/\badlcp:scormType="([^"]+)"/i);
    const scormType = scormTypeMatch ? scormTypeMatch[1].toLowerCase() : "sco";
    if (hrefMatch && scormType === "sco") {
      scos.push({
        identifier: idMatch ? idMatch[1] : `SCO_${scos.length + 1}`,
        href: hrefMatch[1]
      });
    }
  }

  return {
    title,
    scormEdition,
    schemaVersion: rawSchemaVer || (is2004 ? "2004 4th Edition" : "1.2"),
    masteryScore,
    scos
  };
}

function collectStringsFromJsonAst(node, outStrings, pathPrefix = "root") {
  if (typeof node === "string") {
    const cleaned = stripTags(node);
    if (cleaned.length >= 3 && /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3040-\u9FFF\uAC00-\uD7AF]/.test(cleaned)) {
      if (!/^(https?:\/\/|media\/|assets\/|#[0-9a-f]{3,8}$)/i.test(cleaned)) {
        outStrings.push({ id: pathPrefix, text: cleaned });
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, idx) => collectStringsFromJsonAst(child, outStrings, `${pathPrefix}.${idx}`));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (["id", "type", "mime", "src", "href", "scormEdition"].includes(k)) continue;
      collectStringsFromJsonAst(v, outStrings, `${pathPrefix}.${k}`);
    }
  }
}

const MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".ogg",
  ".vtt",
  ".srt",
  ".pdf"
]);

export function inspectScormZipBuffer(zipBuffer) {
  const entries = readZipBuffer(zipBuffer);
  const warnings = [];

  const manifestEntry = entries.find((e) => e.path.toLowerCase() === "imsmanifest.xml") ||
    entries.find((e) => e.path.toLowerCase().endsWith("/imsmanifest.xml"));

  if (!manifestEntry) {
    throw new Error("Archive is missing imsmanifest.xml (not a valid ADL SCORM 1.2 or 2004 package).");
  }

  let rootPrefix = "";
  if (manifestEntry.path.includes("/")) {
    rootPrefix = manifestEntry.path.slice(0, manifestEntry.path.lastIndexOf("/") + 1);
    warnings.push(
      `Nested manifest detected at '${manifestEntry.path}'. Most LMS importers require imsmanifest.xml at archive root.`
    );
  }

  const manifestInfo = parseManifestXml(manifestEntry.data.toString("utf8"));

  let payloadFormat = "html5-dom";
  let lessonCount = 0;
  let quizItemCount = 0;
  const extractedStrings = [];

  // 1. Check for Base64 JSON payloads (e.g. runtime-data.js / course-data.js)
  for (const entry of entries) {
    if (!/\.(js|mjs)$/i.test(entry.path)) continue;
    const jsText = entry.data.toString("utf8");
    const b64Matches = jsText.match(/["']([A-Za-z0-9+/]{80,}={0,2})["']/g) || [];
    for (const literal of b64Matches) {
      const rawB64 = literal.slice(1, -1);
      if (rawB64.length % 4 !== 0) continue;
      try {
        const decoded = Buffer.from(rawB64, "base64").toString("utf8");
        if (decoded.trim().startsWith("{")) {
          const parsed = JSON.parse(decoded);
          const rootCourse = parsed.course || parsed;
          if (rootCourse && (Array.isArray(rootCourse.lessons) || Array.isArray(rootCourse.modules))) {
            payloadFormat = "base64-json";
            const lessons = rootCourse.lessons || rootCourse.modules || [];
            lessonCount = lessons.length;
            const topQuiz = Array.isArray(rootCourse.quiz) ? rootCourse.quiz.length : 0;
            let blockQuiz = 0;
            for (const les of lessons) {
              for (const blk of les.blocks || []) {
                if (blk.type === "quiz" && Array.isArray(blk.questions)) {
                  blockQuiz += blk.questions.length;
                }
              }
            }
            quizItemCount = topQuiz || blockQuiz;
            collectStringsFromJsonAst(rootCourse, extractedStrings, "course");
            break;
          }
        }
      } catch {
        // Ignore non-JSON Base64 assets
      }
    }
    if (payloadFormat === "base64-json") break;
  }

  // 2. Check plain JSON course payloads if not Base64
  if (payloadFormat === "html5-dom") {
    for (const entry of entries) {
      if (!/\.json$/i.test(entry.path)) continue;
      try {
        const parsed = JSON.parse(entry.data.toString("utf8"));
        const rootCourse = parsed.course || parsed;
        if (rootCourse && Array.isArray(rootCourse.lessons)) {
          payloadFormat = "json-ast";
          lessonCount = rootCourse.lessons.length;
          quizItemCount = Array.isArray(rootCourse.quiz) ? rootCourse.quiz.length : 0;
          collectStringsFromJsonAst(rootCourse, extractedStrings, "course");
          break;
        }
      } catch {
        // continue
      }
    }
  }

  // 3. Fallback to HTML5 SCO DOM inspection
  if (payloadFormat === "html5-dom") {
    const htmlEntries = entries.filter((e) => /\.(html|htm|xhtml)$/i.test(e.path));
    lessonCount = Math.max(manifestInfo.scos.length, htmlEntries.length);
    for (const hEntry of htmlEntries) {
      const html = hEntry.data.toString("utf8");
      const fieldsets = html.match(/<fieldset\b[\s\S]*?<\/fieldset>/gi) || [];
      quizItemCount += fieldsets.length;
      const textBlocks = html.match(/<(h[1-6]|p|li|summary|legend|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi) || [];
      textBlocks.forEach((blk, idx) => {
        const txt = stripTags(blk);
        if (txt.length >= 3) {
          extractedStrings.push({ id: `${hEntry.path}#${idx + 1}`, text: txt });
        }
      });
    }
  }

  const mediaAssets = [];
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    totalUncompressedBytes += entry.uncompressedSize;
    const dotIdx = entry.path.lastIndexOf(".");
    const ext = dotIdx >= 0 ? entry.path.slice(dotIdx).toLowerCase() : "";
    if (MEDIA_EXTENSIONS.has(ext)) {
      mediaAssets.push({
        path: rootPrefix && entry.path.startsWith(rootPrefix) ? entry.path.slice(rootPrefix.length) : entry.path,
        bytes: entry.uncompressedSize,
        compression: entry.method === 8 ? "DEFLATE" : "STORE"
      });
    }
  }

  return {
    ok: true,
    title: manifestInfo.title,
    scormEdition: manifestInfo.scormEdition,
    schemaVersion: manifestInfo.schemaVersion,
    payloadFormat,
    masteryScore: manifestInfo.masteryScore,
    scoCount: manifestInfo.scos.length,
    lessonCount,
    quizItemCount,
    localizableStringCount: extractedStrings.length,
    mediaAssetCount: mediaAssets.length,
    totalZipEntries: entries.length,
    totalUncompressedBytes,
    rootNormalized: rootPrefix === "",
    warnings,
    scos: manifestInfo.scos,
    mediaAssets,
    sampleStrings: extractedStrings.slice(0, 10)
  };
}

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildXliff12Preview(auditReport, targetLanguage = "es-ES") {
  const units = (auditReport.sampleStrings || [])
    .map(
      (u) => `      <trans-unit id="${escapeXml(u.id)}">
        <source>${escapeXml(u.text)}</source>
        <target state="needs-translation"></target>
      </trans-unit>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="imsmanifest.xml" source-language="en-US" target-language="${escapeXml(targetLanguage)}" datatype="plaintext">
    <body>
${units}
    </body>
  </file>
</xliff>
`;
}

export function formatAuditTable(report) {
  const rows = [
    ["Course Title", report.title],
    ["SCORM Edition", `${report.scormEdition} (${report.schemaVersion})`],
    ["Detected Payload", report.payloadFormat],
    ["Root imsmanifest.xml", report.rootNormalized ? "PASS (at archive root)" : "WARN (nested folder)"],
    ["Mastery Score", report.masteryScore !== null ? `${report.masteryScore}%` : "Not declared"],
    ["Launchable SCOs", String(report.scoCount)],
    ["Lessons Detected", String(report.lessonCount)],
    ["Quiz Items", String(report.quizItemCount)],
    ["Localizable Strings", String(report.localizableStringCount)],
    ["Media Assets", `${report.mediaAssetCount} files (${report.totalUncompressedBytes} bytes total)`]
  ];

  const col1Width = Math.max(...rows.map((r) => r[0].length), 20);
  const lines = [
    `+-${"-".repeat(col1Width)}-+-${"-".repeat(48)}-+`,
    `| ${"Metric".padEnd(col1Width)} | ${"Audit Value".padEnd(48)} |`,
    `+-${"-".repeat(col1Width)}-+-${"-".repeat(48)}-+`
  ];
  for (const [k, v] of rows) {
    lines.push(`| ${k.padEnd(col1Width)} | ${String(v).padEnd(48)} |`);
  }
  lines.push(`+-${"-".repeat(col1Width)}-+-${"-".repeat(48)}-+`);

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of report.warnings) {
      lines.push(`  [!] ${w}`);
    }
  }
  lines.push("");
  lines.push("Need to patch text/media in-place, export a Word .docx storyboard, or translate XLIFF in browser?");
  lines.push("  -> Zero-Upload Browser Studio: https://scorm.stillhumanacademy.com");
  return lines.join("\n");
}

export function buildSampleScormZipBuffer() {
  const coursePayload = {
    course: {
      id: "sample_sec_sop_2026",
      title: "Vendor Incident Escalation SOP",
      masteryScore: 80,
      lessons: [
        {
          id: "les_1",
          title: "Lesson 1: Data Classification",
          blocks: [
            { type: "callout", title: "30-Minute Rule", body: "Report production token exposure within 30 minutes." },
            { type: "richtext", heading: "Classification Tiers", body: "Session cookies and API keys are Tier-1 Restricted." }
          ]
        },
        {
          id: "les_2",
          title: "Lesson 2: Escalation Contacts",
          blocks: [
            { type: "accordion", items: [{ title: "Primary Desk", body: "Contact security-ops@example.org immediately." }] }
          ]
        }
      ],
      quiz: [
        {
          id: "q_1",
          prompt: "Within how many minutes must Tier-1 token exposure be escalated?",
          choices: ["30 minutes", "24 hours"],
          correctIndex: 0
        }
      ]
    }
  };

  const b64 = Buffer.from(JSON.stringify(coursePayload), "utf8").toString("base64");
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="SAMPLE_SCORM_12" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_1">
    <organization identifier="ORG_1">
      <title>Vendor Incident Escalation SOP</title>
      <item identifier="ITEM_1" identifierref="RES_1">
        <title>Vendor Incident Escalation SOP</title>
        <adlcp:masteryscore>80</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_1" type="webcontent" adlcp:scormtype="sco" href="scormcontent/index.html">
      <file href="scormcontent/index.html"/>
      <file href="scormcontent/lib/runtime-data.js"/>
      <file href="media/escalation-flow.svg"/>
    </resource>
  </resources>
</manifest>`;

  const runtimeJs = `window.__COURSE_RUNTIME_B64__ = "${b64}";\n`;
  const indexHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>SOP</title></head><body><script src="lib/runtime-data.js"></script></body></html>`;
  const svgDiagram = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#0f172a"/><text x="16" y="45" fill="#2dd4bf">30-Minute Escalation</text></svg>`;

  return writeZipBuffer([
    { path: "imsmanifest.xml", data: manifestXml, method: 8 },
    { path: "scormcontent/index.html", data: indexHtml, method: 8 },
    { path: "scormcontent/lib/runtime-data.js", data: runtimeJs, method: 8 },
    { path: "media/escalation-flow.svg", data: svgDiagram, method: 0 }
  ]);
}
