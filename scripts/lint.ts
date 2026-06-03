// utils/lint.ts
import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const PROJECT_ROOT = process.cwd();
const ESLINT_JSON_TEMP = 'eslint-report-temp.json';

interface LintMessage {
  filePath: string;
  messages: Array<{
    ruleId: string | null;
    severity: 1 | 2;        // 1 = warning, 2 = error
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  }>;
}

interface LintTask {
  id: string;
  name: string;
  command: string;
  args: string[];
  logFile: string;
}

const tasks: LintTask[] = [
  {
    id: '--eslint',
    name: 'ESLint',
    command: 'eslint',
    args: [
      '.',
      '--max-warnings',
      '0',
      '--format',
      'json',
      '--output-file',
      ESLINT_JSON_TEMP,
    ],
    logFile: 'errors-eslint.log',
  },
  {
    id: '--ts',
    name: 'TypeScript',
    command: 'tsc',
    args: ['-b'],
    logFile: 'errors-ts.log',
  },
  {
    id: '--knip',
    name: 'Unused Files & Exports (Knip)',
    command: 'knip',
    args: ['--production', '--dependencies', '--files', '--exports', '--include-entry-exports'],
    logFile: 'errors-unused.log',
  },
  {
    id: '--depcheck',
    name: 'Unused Dependencies (Depcheck)',
    command: 'depcheck',
    args: [],
    logFile: 'errors-depcheck.log',
  },
];

/**
 * Parse ESLint JSON output and return the report.
 */
async function parseAndDistributeErrors() {
  if (!existsSync(ESLINT_JSON_TEMP)) {
    console.log(`${colors.yellow}No ESLint JSON report found.${colors.reset}`);
    return [];
  }

  const raw = await fs.readFile(ESLINT_JSON_TEMP, 'utf-8');
  let report: LintMessage[];

  try {
    report = JSON.parse(raw);
  } catch (err) {
    console.error(`${colors.red}Failed to parse ESLint JSON:${colors.reset}`, err);
    return [];
  }

  try {
    await fs.unlink(ESLINT_JSON_TEMP);
  } catch { /* ignore */ }

  return report;
}

async function runTask(task: LintTask): Promise<boolean> {
  console.log(`${colors.cyan}Running ${task.name}...${colors.reset}`);

  return new Promise((resolve) => {
    const quote = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    const fullCommand = [task.command, ...task.args].map(quote).join(' ');
    const child = spawn(fullCommand, { cwd: PROJECT_ROOT, shell: true });
    let output = '';

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    child.on('close', async (code) => {
      const success = code === 0;
      const statusColor = success ? colors.green : colors.red;
      const statusLabel = success ? 'SUCCESS' : 'FAILED';

      console.log(
        `${statusColor}${colors.bright}[${statusLabel}]${colors.reset} ${task.name} completed. ${colors.cyan}(Log: ${task.logFile})${colors.reset}`
      );

      try {
        const noisePatterns = [
          /npm warn Unknown env config/i,
          /npm warn Unknown project config/i,
        ];

        const filteredOutput = output
          .split(/\r?\n/)
          .filter(line => {
            const trimmed = line.trim();
            return trimmed && !noisePatterns.some(p => p.test(trimmed));
          })
          .join('\n');

        let logContent = filteredOutput;
        const timestamp = `\n[${new Date().toISOString()}]`;
        logContent += success
          ? `${timestamp} Successfully completed ${task.name}\n`
          : `${timestamp} Failed ${task.name} with exit code ${code}\n`;

        await fs.writeFile(path.resolve(task.logFile), logContent, 'utf8');

        if (task.id === '--eslint') {
          const report = await parseAndDistributeErrors();

          if (report.length > 0) {
            let textReport = '';
            let errorCount = 0;
            let warningCount = 0;

            report.forEach(file => {
              if (file.messages.length === 0) return;

              const absPath = path.resolve(PROJECT_ROOT, file.filePath);
              const relPath = path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');

              textReport += `${relPath}\n`;

              file.messages.forEach(msg => {
                const severity = msg.severity === 2 ? 'error' : 'warning';
                if (msg.severity === 2) errorCount++; else warningCount++;
                textReport += `  ${msg.line}:${msg.column}  ${severity}  ${msg.message}  ${msg.ruleId || ''}\n`;
              });
              textReport += '\n';
            });

            const total = errorCount + warningCount;
            textReport += `${total} problems (${errorCount} errors, ${warningCount} warnings)\n`;

            await fs.writeFile(task.logFile, textReport, 'utf8');
          }
        }

      } catch (err) {
        console.error(`${colors.red}Failed to handle output for ${task.name}${colors.reset}`, err);
      }

      resolve(success);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const selected = tasks.filter(t => args.includes(t.id));
  const toRun = selected.length > 0 ? selected : tasks;

  console.log(`${colors.bright}${colors.cyan}--- Starting Linting Process ---${colors.reset}`);
  console.log(`${colors.bright}Targeting: ${toRun.map(t => t.name).join(', ')}${colors.reset}\n`);

  const results = await Promise.all(toRun.map(runTask));

  console.log('');
  if (results.every(r => r)) {
    console.log(`${colors.green}${colors.bright}All selected tasks passed successfully!${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bright}Some tasks failed. Check .log files.${colors.reset}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
