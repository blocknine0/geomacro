#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';


const dir =
  path.resolve(
    'supabase/migrations',
  );

const files =
  fs
    .readdirSync(dir)
    .filter(
      (file) =>
        file.endsWith('.sql'),
    )
    .sort();

const errors = [];


/*
 * ------------------------------------------------------------
 * Migration version integrity
 * ------------------------------------------------------------
 */

const migrationVersions =
  new Map();


for (const file of files) {
  const match =
    file.match(
      /^(\d+)_/,
    );

  if (!match) {
    errors.push(
      `${file}: migration filename must start with a numeric version prefix`,
    );

    continue;
  }

  const version =
    match[1];

  const existing =
    migrationVersions.get(
      version,
    ) ?? [];

  existing.push(
    file,
  );

  migrationVersions.set(
    version,
    existing,
  );
}


for (
  const [
    version,
    versionFiles,
  ]
  of migrationVersions.entries()
) {
  if (
    versionFiles.length >
      1
  ) {
    errors.push(
      `duplicate migration version ${version}: ${versionFiles.join(', ')}`,
    );
  }
}


/*
 * ------------------------------------------------------------
 * SQL normalization
 * ------------------------------------------------------------
 */

function stripSqlComments(
  sql,
) {
  return sql
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ' ',
    )
    .replace(
      /--[^\r\n]*/g,
      ' ',
    );
}


function normalizeIdentifier(
  value,
) {
  return value
    .trim()
    .replace(
      /\s*\.\s*/g,
      '.',
    )
    .toLowerCase();
}


/*
 * ------------------------------------------------------------
 * Constraint replacement detection
 *
 * DROP CONSTRAINT is allowed only when the SAME migration
 * adds the SAME constraint back to the SAME table.
 *
 * This supports safe CHECK-constraint evolution while still
 * rejecting destructive removal of a constraint.
 * ------------------------------------------------------------
 */

const sqlIdentifier =
  String.raw`(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)`;

const qualifiedSqlIdentifier =
  `${sqlIdentifier}(?:\\s*\\.\\s*${sqlIdentifier})?`;


function collectConstraintChanges(
  sql,
  action,
) {
  const optionalIfExists =
    action === 'drop'
      ? String.raw`(?:if\s+exists\s+)?`
      : '';

  const regex =
    new RegExp(
      String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${qualifiedSqlIdentifier})\s+${action}\s+constraint\s+${optionalIfExists}(${sqlIdentifier})(?=\s|;|,|$)`,
      'gi',
    );

  const changes = [];

  for (
    const match of sql.matchAll(
      regex,
    )
  ) {
    const table =
      normalizeIdentifier(
        match[1],
      );

    const constraint =
      normalizeIdentifier(
        match[2],
      );

    changes.push({
      table,
      constraint,

      key:
        `${table}::${constraint}`,
    });
  }

  return changes;
}


/*
 * ------------------------------------------------------------
 * Always-forbidden destructive SQL
 *
 * Constraint replacement is handled separately below.
 * ------------------------------------------------------------
 */

const destructive = [
  [
    /\bdrop\s+table\b/i,
    'DROP TABLE',
  ],

  [
    /\bdrop\s+schema\b/i,
    'DROP SCHEMA',
  ],

  [
    /\btruncate\b/i,
    'TRUNCATE',
  ],

  [
    /\balter\s+table\b[^;]*\bdrop\s+column\b/i,
    'ALTER TABLE ... DROP COLUMN',
  ],

  [
    /\bdelete\s+from\b/i,
    'DELETE FROM',
  ],
];


for (const file of files) {
  const raw =
    fs.readFileSync(
      path.join(
        dir,
        file,
      ),
      'utf8',
    );

  const sql =
    stripSqlComments(
      raw,
    );


  /*
   * Hard destructive rules.
   */
  for (
    const [
      regex,
      label,
    ]
    of destructive
  ) {
    if (
      regex.test(
        sql,
      )
    ) {
      errors.push(
        `${file}: forbidden ${label}`,
      );
    }
  }


  /*
   * Constraint replacement policy.
   */
  const droppedConstraints =
    collectConstraintChanges(
      sql,
      'drop',
    );

  const addedConstraints =
    collectConstraintChanges(
      sql,
      'add',
    );

  const addedKeys =
    new Set(
      addedConstraints.map(
        (change) =>
          change.key,
      ),
    );


  /*
   * Detect ALTER TABLE ... DROP CONSTRAINT syntax that
   * our structured parser failed to understand.
   *
   * Unknown syntax fails closed rather than being ignored.
   */
  const genericDropConstraints =
    [
      ...sql.matchAll(
        /\balter\s+table\b[^;]*\bdrop\s+constraint\b/gi,
      ),
    ];

  if (
    genericDropConstraints.length !==
      droppedConstraints.length
  ) {
    errors.push(
      `${file}: unrecognized ALTER TABLE ... DROP CONSTRAINT syntax`,
    );
  }


  for (
    const dropped
    of droppedConstraints
  ) {
    if (
      !addedKeys.has(
        dropped.key,
      )
    ) {
      errors.push(
        `${file}: forbidden DROP CONSTRAINT without same-migration replacement: ${dropped.table}.${dropped.constraint}`,
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * Required baseline migrations
 * ------------------------------------------------------------
 */

const required = [
  '000_core_schema.sql',
  '001_ai_jury_dispute_system.sql',
  '002_events_schema_backfill.sql',
  '004_gri_audit_system.sql',
  '010_gri_comparison_continuity.sql',
];


for (
  const migration
  of required
) {
  if (
    !files.includes(
      migration,
    )
  ) {
    errors.push(
      `missing required migration ${migration}`,
    );
  }
}


/*
 * ------------------------------------------------------------
 * Result
 * ------------------------------------------------------------
 */

if (
  errors.length
) {
  console.error(
    '❌ Migration safety check failed:\n' +
      errors
        .map(
          (error) =>
            ` - ${error}`,
        )
        .join('\n'),
  );

  process.exit(
    1,
  );
}


console.log(
  `✅ ${files.length} migration(s) passed destructive-SQL, constraint-replacement, and baseline checks.`,
);
