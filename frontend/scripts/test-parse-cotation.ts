// Test du parser de cotation NGAP sur les cotations RÉELLES extraites de la base
// (compte de démo Ozzen, 474 passages → 33 cotations distinctes).
//
// Lancer :  npx tsx scripts/test-parse-cotation.ts
//
// Ne nécessite ni base ni variables d'env : c'est un test pur du parser.

import { parseCotation, principalCode } from "../src/lib/ngap/parse-cotation";

interface Case {
  raw: string;
  // lettre-clé principale attendue
  principal: string;
  // codes attendus (ordre conservé), pour vérifier qu'aucun acte n'est perdu
  codes: string[];
}

// Les 33 cotations réellement présentes en base + résultat attendu.
const CASES: Case[] = [
  { raw: "AMI4", principal: "AMI", codes: ["AMI"] },
  { raw: "IFI", principal: "IFI", codes: ["IFI"] },
  { raw: "BSC + IFI", principal: "BSC", codes: ["BSC", "IFI"] },
  { raw: "AMX 4 + MCI", principal: "AMX", codes: ["AMX", "MCI"] },
  { raw: "(AMX 1 + AMX 1) / 2 + N", principal: "AMX", codes: ["AMX", "AMX", "N"] },
  { raw: "AMI 1,5 + MAU + IFA", principal: "AMI", codes: ["AMI", "MAU", "IFA"] },
  { raw: "AMI 1,5 / 2", principal: "AMI", codes: ["AMI"] },
  { raw: "IFI + F", principal: "IFI", codes: ["IFI", "F"] },
  { raw: "BSB + IFI", principal: "BSB", codes: ["BSB", "IFI"] },
  { raw: "AMI 10 + IFA", principal: "AMI", codes: ["AMI", "IFA"] },
  { raw: "(AMX 1 + AMX 1 + AMX 1) / 2", principal: "AMX", codes: ["AMX", "AMX", "AMX"] },
  { raw: "AMI 14 + IFA", principal: "AMI", codes: ["AMI", "IFA"] },
  { raw: "AMI 2 + IFA", principal: "AMI", codes: ["AMI", "IFA"] },
  { raw: "AMI 1,5 + IFA", principal: "AMI", codes: ["AMI", "IFA"] },
  { raw: "BSC + IFI + F", principal: "BSC", codes: ["BSC", "IFI", "F"] },
  { raw: "AMI 4 + IFA", principal: "AMI", codes: ["AMI", "IFA"] },
  { raw: "AMI 1,5 + MAU + IFA + F", principal: "AMI", codes: ["AMI", "MAU", "IFA", "F"] },
  { raw: "AMI 14 + AMI 9 + IFA + N", principal: "AMI", codes: ["AMI", "AMI", "IFA", "N"] },
  { raw: "BSB + IFI + F", principal: "BSB", codes: ["BSB", "IFI", "F"] },
  { raw: "AMI 10 + AMI 6 + AMI 4,1 / 2 + IFA", principal: "AMI", codes: ["AMI", "AMI", "AMI", "IFA"] },
  { raw: "AMI 15 + AMI 10 + AMI 6 + IFA", principal: "AMI", codes: ["AMI", "AMI", "AMI", "IFA"] },
  { raw: "AMI 9 + AMI 4,1 / 2 + IFA", principal: "AMI", codes: ["AMI", "AMI", "IFA"] },
  { raw: "AMI 14 + IFA + F", principal: "AMI", codes: ["AMI", "IFA", "F"] },
  { raw: "AMI 1,5 + IFA + F", principal: "AMI", codes: ["AMI", "IFA", "F"] },
  { raw: "AMI 4,1 + IFA", principal: "AMI", codes: ["AMI", "IFA"] },
  { raw: "AMI 4,1 + IFA + F", principal: "AMI", codes: ["AMI", "IFA", "F"] },
  { raw: "AMI 10 + IFA + F", principal: "AMI", codes: ["AMI", "IFA", "F"] },
  { raw: "AMI 10 + AMI 6 + AMI 4,1 / 2 + IFA + F", principal: "AMI", codes: ["AMI", "AMI", "AMI", "IFA", "F"] },
  { raw: "AMI 15 + AMI 10 + AMI 6 + IFA + F", principal: "AMI", codes: ["AMI", "AMI", "AMI", "IFA", "F"] },
  { raw: "AMI 2 + IFA + F", principal: "AMI", codes: ["AMI", "IFA", "F"] },
  { raw: "DI 1,2", principal: "DI", codes: ["DI"] },
  { raw: "AMI 5 + IFA + F", principal: "AMI", codes: ["AMI", "IFA", "F"] },
  { raw: "AMI 9", principal: "AMI", codes: ["AMI"] },
];

// Quelques vérifications ciblées de coefficients (décimales, sans espace, "/2").
const COEF_CASES: { raw: string; expected: { code: string; coefficient: number }[] }[] = [
  { raw: "AMI4", expected: [{ code: "AMI", coefficient: 4 }] },
  { raw: "AMI 1,5 / 2", expected: [{ code: "AMI", coefficient: 1.5 }] },
  { raw: "DI 1,2", expected: [{ code: "DI", coefficient: 1.2 }] },
  { raw: "AMI 4,1 + IFA", expected: [{ code: "AMI", coefficient: 4.1 }, { code: "IFA", coefficient: 1 }] },
  { raw: "AMX 4 + MCI", expected: [{ code: "AMX", coefficient: 4 }, { code: "MCI", coefficient: 1 }] },
];

let failures = 0;
const fail = (msg: string) => { console.error("  ✗ " + msg); failures++; };

console.log(`\nParser NGAP — ${CASES.length} cotations réelles\n`);

for (const c of CASES) {
  const tokens = parseCotation(c.raw);
  const codes = tokens.map((t) => t.code);
  const principal = principalCode(c.raw);

  if (principal !== c.principal) {
    fail(`"${c.raw}" → principal "${principal}" (attendu "${c.principal}")`);
  }
  if (JSON.stringify(codes) !== JSON.stringify(c.codes)) {
    fail(`"${c.raw}" → codes [${codes.join(", ")}] (attendu [${c.codes.join(", ")}])`);
  }
}

for (const c of COEF_CASES) {
  const got = parseCotation(c.raw).map((t) => ({ code: t.code, coefficient: t.coefficient }));
  if (JSON.stringify(got) !== JSON.stringify(c.expected)) {
    fail(`coef "${c.raw}" → ${JSON.stringify(got)} (attendu ${JSON.stringify(c.expected)})`);
  }
}

if (failures === 0) {
  console.log(`✓ Tous les cas passent (${CASES.length} cotations + ${COEF_CASES.length} contrôles de coefficient).\n`);
  process.exit(0);
} else {
  console.error(`\n${failures} échec(s).\n`);
  process.exit(1);
}
