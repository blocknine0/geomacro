import {
  spawnSync,
} from "node:child_process";


const tests = [
  "scripts/test-country-risk-v02-methodology-freeze.ts",

  "scripts/test-country-risk-v02-final-convergence.ts",

  "scripts/test-country-risk-v02-event-residual.ts",

  "scripts/test-country-risk-v02-event-reliability.ts",

  "scripts/test-country-risk-v02-component-reliability.ts",

  "scripts/test-country-risk-v02-quality-contract.ts",

  "scripts/test-country-risk-v02-comparison-current.ts",

  "scripts/test-country-risk-v02-first-class-availability.ts",

  "scripts/test-country-risk-v02-three-component.ts",

  "scripts/test-country-risk-v02-geopolitics-zero-aware.ts",

  "scripts/test-country-risk-v02-geopolitics-real.ts",

  "scripts/test-country-risk-v02-geopolitics-component.ts",

  "scripts/test-country-risk-v02-macro.ts",

  "scripts/test-country-risk-v02-macro-global.ts",

  "scripts/test-country-risk-v02-normalization.ts",

  "scripts/test-country-risk-v02-readiness.ts",

  "scripts/test-country-intelligence-state.ts",
];


console.log(
  "==============================================",
);

console.log(
  " GRO v0.2 PHASE 2 CANONICAL VERIFICATION",
);

console.log(
  "==============================================",
);


for (
  const test of tests
) {
  console.log(
    `\n===== ${test} =====`,
  );


  const result =
    spawnSync(
      "npx",
      [
        "tsx",
        test,
      ],
      {
        stdio:
          "inherit",

        env:
          process.env,
      },
    );


  if (
    result.error
  ) {
    throw result.error;
  }


  if (
    result.status !==
    0
  ) {
    throw new Error(
      `Phase-2 canonical verification failed: ${test}`,
    );
  }
}


console.log(
  "\n==============================================",
);

console.log(
  " PASS: ALL PHASE 2 CANONICAL TESTS CLEAN",
);

console.log(
  " PASS: NO PUBLICATION IMPLIED BY THIS RESULT",
);

console.log(
  " PASS: GLOBAL COVERAGE GATE STILL REQUIRED",
);

console.log(
  "==============================================",
);
