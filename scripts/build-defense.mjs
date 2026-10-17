import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [runtimeRoot, skillDir, pythonExecutable] = process.argv.slice(2);
if (!runtimeRoot || !skillDir || !pythonExecutable)
  throw new Error(
    'Usage: node scripts/build-defense.mjs runtime-node-modules presentation-skill-dir python-executable',
  );
process.env.RUNTIME_NODE_MODULES = runtimeRoot;
const { Presentation, PresentationFile } = await import(
  pathToFileURL(path.join(runtimeRoot, '@oai/artifact-tool/dist/artifact_tool.mjs')).href
);
const { finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href
);
const root = process.cwd();
const build = path.join(root, '.artifact-build/slides');
const output = path.join(root, 'output/presentations');
await fs.mkdir(build, { recursive: true });
await fs.mkdir(output, { recursive: true });
let passed = 'Automated checks';
try {
  const summary = JSON.parse(
    await fs.readFile(path.join(root, '.artifact-build/test-summary.json'), 'utf8'),
  );
  passed = `${summary.numPassedTests} automated tests passed`;
} catch {
  /* No invented numerical evidence. */
}

function text(slide, value, x, y, w, h, size = 30, color = '#172c27', bold = false) {
  const box = slide.shapes.add({
    geometry: 'textbox',
    position: { left: x, top: y, width: w, height: h },
    fill: 'none',
    line: { fill: 'none', width: 0 },
  });
  box.text = value;
  box.text.style = { typeface: 'Arial', fontSize: size, color, bold };
  return box;
}
const slides = [
  {
    title: 'Portable QR attendance',
    cover: true,
    body: [
      'A browser-based classroom system',
      'Offline preparation, local records and teacher verification',
    ],
    notes:
      'Project defense. No institutional logo or team identity was supplied. Present the actual institution/team verbally. Source: implemented project and docs/phase-3-4.md.',
  },
  {
    title: 'Classroom attendance constraints',
    body: [
      'Weak connectivity can interrupt network-dependent workflows.',
      'Roster transcription and exception handling add teacher work.',
      'Time savings require a comparable measured baseline.',
    ],
    notes:
      'Do not present the earlier 15-minute baseline as measured evidence. Source: supplied proposal as problem context, not empirical validation.',
  },
  {
    title: 'Browser delivery and preparation',
    body: [
      'Students and teachers open an HTTPS URL.',
      'Cached website resources support prepared offline use.',
      'First access, a changed browser or cleared data needs preparation.',
    ],
    notes:
      'No native application or installation requirement. Sources: README.md and docs/deployment.md.',
  },
  {
    title: 'Student check-in',
    body: [
      'Confirm the official ID and current room challenge.',
      'Display the QR with a readable screen.',
      'Wait for the teacher to confirm the record was saved.',
    ],
    notes:
      'The student browser has no network acknowledgement from the teacher. Source: docs/student-guide.md.',
  },
  {
    title: 'Local processing architecture',
    body: [
      'Student browser: QR payload with ID, challenge and timestamp.',
      'Teacher browser: roster validation and supervised identity check.',
      'Encrypted IndexedDB: attendance and audit commit together.',
    ],
    notes:
      'The camera is an optical data input. There is no classroom backend or cross-device sync. Sources: src/domain/checkIn.ts, src/db/db.ts, src/db/crypto.ts.',
  },
  {
    title: 'Security and privacy boundaries',
    body: [
      'AES-GCM protects stored private records with authenticated context.',
      'Short numeric PINs remain vulnerable to offline guessing.',
      'QR rotation does not prevent relay or prove physical presence.',
    ],
    notes:
      'Institutional processing rules and privacy review remain required. Sources: docs/threat-model.md; https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/ ; https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html',
  },
  {
    title: 'Classroom exception handling',
    body: [
      'CSV validation preserves Philippine names and original ID formatting.',
      'Manual attendance supports unavailable devices and excusals.',
      'Dispute review preserves both times and blocks unresolved closure.',
    ],
    notes:
      'A duplicate is neutral feedback, not proof of misconduct. Source: src/utils/csv.ts; src/domain/audit.ts; docs/teacher-guide.md.',
  },
  {
    title: 'Validation evidence',
    columns: [
      {
        title: 'Automated evidence',
        lines: [passed, 'Transactions, recovery and exports', 'Manual-dialog lifecycle test'],
      },
      {
        title: 'Field evidence',
        lines: [
          '45-device run: pending',
          'Physical browser matrix: pending',
          'Throughput claim: not established',
        ],
      },
    ],
    notes:
      'No measured classroom performance chart exists. Synthetic fixtures verify calculations but are not empirical results. Sources: tests/; docs/field-protocol.md. Replace pending evidence only with measured observations.',
  },
  {
    title: 'Reporting and recovery',
    body: [
      'Excel includes attendance summary, roster and audit worksheets.',
      'CSV protects formula-looking values and retains Unicode.',
      'Encrypted backups restore atomically after validation.',
    ],
    notes:
      'Downloads are requests, not proof of permanent file storage. Exported attendance reports contain plaintext personal data. Sources: src/utils/excel.ts; src/utils/csvExport.ts; src/db/backup.ts.',
  },
  {
    title: 'Live demonstration sequence',
    body: [
      'Prepare two browsers and a synthetic roster.',
      'Demonstrate a saved scan, manual excusal and disputed duplicate.',
      'Close, reopen with a reason, export and restore a backup.',
    ],
    notes:
      'Rehearse offline readiness and camera permission before the demonstration. Do not use real student data in a public defense. Source: docs/field-protocol.md.',
  },
  {
    title: 'Remaining validation and risks',
    body: [
      'Physical camera quality, glare and OS suspension need device tests.',
      'Browser persistence does not replace independent backups.',
      'Deployment and institutional privacy approval remain release gates.',
    ],
    notes:
      'Sources: docs/deployment.md; docs/threat-model.md; https://webkit.org/blog/14403/updates-to-storage-policy/ . Never describe an unexecuted field check as passed.',
  },
  {
    title: 'Release criteria and questions',
    body: [
      'Verified HTTPS deployment and cold offline use on supported devices.',
      'Measured classroom results and tested recovery on a second device.',
      'Approved handling, retention and incident procedures.',
    ],
    notes:
      'Defensible answers are in docs/threat-model.md. The website is implemented; the physical and institutional gates require external evidence.',
  },
];

async function deck(content, name) {
  const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
  for (const [index, data] of content.entries()) {
    const slide = presentation.slides.add();
    slide.background.fill = data.cover ? '#123b32' : '#f5f6f2';
    const ink = data.cover ? '#ffffff' : '#172c27';
    text(
      slide,
      data.title,
      72,
      data.cover ? 168 : 62,
      1136,
      data.cover ? 170 : 110,
      data.cover ? 76 : 48,
      ink,
      true,
    );
    if (data.columns) {
      for (const [column, item] of data.columns.entries()) {
        const x = 72 + column * 590;
        text(slide, item.title, x, 220, 530, 70, 32, '#123b32', true);
        item.lines.forEach((line, row) => text(slide, line, x, 315 + row * 82, 530, 74, 29));
      }
    } else
      data.body.forEach((line, row) =>
        text(
          slide,
          line,
          72,
          (data.cover ? 380 : 245) + row * 105,
          1100,
          90,
          data.cover ? 32 : 31,
          ink,
        ),
      );
    text(
      slide,
      String(index + 1).padStart(2, '0'),
      1165,
      654,
      50,
      32,
      18,
      data.cover ? '#ffffff' : '#52655e',
    );
    slide.speakerNotes.text = data.notes ?? 'Source: docs/student-guide.md.';
    const png = await presentation.export({ slide, format: 'png', scale: 1 });
    await fs.writeFile(
      path.join(build, `${name}-${String(index + 1).padStart(2, '0')}.png`),
      new Uint8Array(await png.arrayBuffer()),
    );
  }
  const candidate = path.join(build, `${name}-draft.pptx`);
  await (await PresentationFile.exportPptx(presentation)).save(candidate);
  await finalizePresentation({
    workspaceDir: root,
    candidatePath: candidate,
    finalPath: path.join(output, `${name}.pptx`),
    pythonExecutable,
    integrityValidatorPath: path.join(
      skillDir,
      'container_tools/inspect_presentation_package_integrity.py',
    ),
    layoutValidatorPath: path.join(
      skillDir,
      'container_tools/inspect_presentation_layout_geometry.py',
    ),
    layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
    explicitTotalSlideCount: content.length,
    fontPolicy: { basis: 'design', families: ['Arial'] },
    verifyArtifactToolImport: true,
    receiptPath: path.join(build, `${name}-validation.json`),
  });
}
await deck(slides, 'attendance-defense');
await deck(
  [
    {
      title: 'Your browser attendance pass',
      body: [
        '1. Prepare the website online before class.',
        '2. Confirm your student ID and room challenge.',
        '3. Show your QR and wait for saved confirmation.',
      ],
      notes:
        'No installation required. Remember ID is optional. Ask for manual attendance if the device or cached website is unavailable. Source: docs/student-guide.md.',
    },
  ],
  'student-onboarding',
);
console.log('Created defense and student onboarding presentations.');
