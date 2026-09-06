import { execSync } from 'child_process';
import fs from 'fs';

const PHASE_LABEL = process.env.PHASE || 'Fase1_Initial';
const TREATMENT_LABEL = process.env.TREATMENT || 'Pure_Vibe_Coding';
const BASE_COMMIT = process.env.BASE_COMMIT || 'HEAD~1';
const OUTPUT_FILE = `metrics_${TREATMENT_LABEL}_${PHASE_LABEL}`;

console.log(`🚀 Extracting metrics for: [${TREATMENT_LABEL}] - [${PHASE_LABEL}]...`);

function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (error) {
    return error.stdout || '';
  }
}

function getEslintMetrics() {
  console.log('📊 Running ESLint static analysis...');
  const rawJson = runCommand('npx eslint src --ext .ts,.tsx -f json');
  
  let totalErrors = 0;
  let totalWarnings = 0;
  let anyTypeErrors = 0;
  let complexityViolations = 0;

  if (rawJson) {
    try {
      const results = JSON.parse(rawJson);
      results.forEach((file) => {
        totalErrors += file.errorCount;
        totalWarnings += file.warningCount;

        file.messages.forEach((msg) => {
          if (msg.ruleId === '@typescript-eslint/no-explicit-any') {
            anyTypeErrors++;
          }
          if (msg.ruleId === 'complexity') {
            complexityViolations++;
          }
        });
      });
    } catch (e) {
      console.error('⚠️ Failed to parse ESLint output JSON');
    }
  }

  return { totalErrors, totalWarnings, anyTypeErrors, complexityViolations };
}

function getGitMetrics() {
  console.log('📈 Calculating Git Code Churn...');
  const stats = runCommand(`git diff --numstat ${BASE_COMMIT} HEAD`);
  
  let linesAdded = 0;
  let linesDeleted = 0;
  let filesChanged = 0;

  if (stats) {
    const lines = stats.trim().split('\n');
    lines.forEach((line) => {
      const parts = line.split('\t');
      if (parts.length === 3) {
        const added = parseInt(parts[0], 10) || 0;
        const deleted = parseInt(parts[1], 10) || 0;
        linesAdded += added;
        linesDeleted += deleted;
        filesChanged++;
      }
    });
  }

  return { linesAdded, linesDeleted, totalChurn: linesAdded + linesDeleted, filesChanged };
}

function getTscErrors() {
  console.log('🔍 Checking TypeScript Type Errors...');
  const tscOutput = runCommand('npx tsc --noEmit');
  const errorMatches = tscOutput.match(/error TS\d+/g);
  return errorMatches ? errorMatches.length : 0;
}

const eslintData = getEslintMetrics();
const gitData = getGitMetrics();
const tscErrors = getTscErrors();

const finalMetrics = {
  timestamp: new Date().toISOString(),
  treatment: TREATMENT_LABEL,
  phase: PHASE_LABEL,
  eslintErrors: eslintData.totalErrors,
  eslintWarnings: eslintData.totalWarnings,
  anyTypeViolations: eslintData.anyTypeErrors,
  complexityViolations: eslintData.complexityViolations,
  typeScriptErrors: tscErrors,
  linesAdded: gitData.linesAdded,
  linesDeleted: gitData.linesDeleted,
  totalCodeChurn: gitData.totalChurn,
  filesChanged: gitData.filesChanged,
};

fs.writeFileSync(`${OUTPUT_FILE}.json`, JSON.stringify(finalMetrics, null, 2));
console.log(`✅ Exported JSON: ${OUTPUT_FILE}.json`);

const csvHeader = 'Timestamp,Treatment,Phase,ESLint_Errors,ESLint_Warnings,Any_Types,Complexity_Violations,TSC_Errors,Lines_Added,Lines_Deleted,Total_Churn,Files_Changed\n';
const csvRow = `${finalMetrics.timestamp},${finalMetrics.treatment},${finalMetrics.phase},${finalMetrics.eslintErrors},${finalMetrics.eslintWarnings},${finalMetrics.anyTypeViolations},${finalMetrics.complexityViolations},${finalMetrics.typeScriptErrors},${finalMetrics.linesAdded},${finalMetrics.linesDeleted},${finalMetrics.totalCodeChurn},${finalMetrics.filesChanged}\n`;

const csvPath = 'experiment_summary.csv';
if (!fs.existsSync(csvPath)) {
  fs.writeFileSync(csvPath, csvHeader);
}
fs.appendFileSync(csvPath, csvRow);

console.log(`📊 Updated CSV summary: ${csvPath}`);
console.log(finalMetrics);
