#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ── Config file ───────────────────────────────────────────────────────────────

const CONFIG_DIR  = join(homedir(), '.ghostwire');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function readConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')); }
  catch { return {}; }
}

function writeConfig(data) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getToken() {
  const { token } = readConfig();
  return token ?? null;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function apiUrl(path) {
  const { host = 'http://localhost:3001' } = readConfig();
  return `${host}${path}`;
}

function authHeaders() {
  const token = getToken();
  if (!token) {
    console.error(chalk.red('✗ Not logged in. Run: ghostwire login'));
    process.exit(1);
  }
  return { Authorization: `Bearer ${token}` };
}

// ── Banner ─────────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(
    chalk.bold.hex('#6366f1')('  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗██╗    ██╗██╗██████╗ ███████╗') + '\n' +
    chalk.bold.hex('#8b5cf6')(' ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝██║    ██║██║██╔══██╗██╔════╝') + '\n' +
    chalk.bold.hex('#a855f7')(' ██║  ███╗███████║██║   ██║███████╗   ██║   ██║ █╗ ██║██║██████╔╝█████╗  ') + '\n' +
    chalk.bold.hex('#c084fc')(' ██║   ██║██╔══██║██║   ██║╚════██║   ██║   ██║███╗██║██║██╔══██╗██╔══╝  ') + '\n' +
    chalk.bold.hex('#e879f9')(' ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   ╚███╔███╔╝██║██║  ██║███████╗') + '\n' +
    chalk.bold.hex('#f0abfc')('  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝    ╚══╝╚══╝ ╚═╝╚═╝  ╚═╝╚══════╝') + '\n' +
    chalk.dim('  Live Visual API Builder CLI  ') + chalk.hex('#6366f1')('v1.0.0') + '\n'
  );
}

// ── Commands ───────────────────────────────────────────────────────────────────

program
  .name('ghostwire')
  .description(chalk.cyan('CLI for the Live Visual API Builder'))
  .version('1.0.0');

// ── ghostwire login ────────────────────────────────────────────────────────────

program
  .command('login')
  .description('Authenticate and save credentials locally')
  .option('--host <url>', 'Backend URL', 'http://localhost:3001')
  .action(async (opts) => {
    printBanner();
    console.log(chalk.bold('  Login to Ghostwire\n'));

    const { username, password } = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: chalk.cyan('  Username:'),
        validate: v => v.trim().length >= 3 || 'Username must be at least 3 characters',
      },
      {
        type: 'password',
        name: 'password',
        message: chalk.cyan('  Password:'),
        mask: '●',
        validate: v => v.length >= 6 || 'Password must be at least 6 characters',
      },
    ]);

    const spinner = ora({ text: 'Authenticating…', color: 'magenta' }).start();

    try {
      const res = await axios.post(`${opts.host}/api/auth/login`, { username, password });
      const { token, user } = res.data;

      writeConfig({ token, host: opts.host, username: user.username });
      spinner.succeed(chalk.green(`Logged in as ${chalk.bold(user.username)}`));
      console.log(chalk.dim(`  Token saved to ${CONFIG_FILE}`));
    } catch (err) {
      const msg = err.response?.data?.error ?? err.message;
      spinner.fail(chalk.red(`Login failed: ${msg}`));
      process.exit(1);
    }
  });

// ── ghostwire logout ───────────────────────────────────────────────────────────

program
  .command('logout')
  .description('Clear saved credentials')
  .action(() => {
    writeConfig({});
    console.log(chalk.green('✓ Logged out. Credentials cleared.'));
  });

// ── ghostwire whoami ───────────────────────────────────────────────────────────

program
  .command('whoami')
  .description('Show current logged-in user')
  .action(async () => {
    const spinner = ora({ text: 'Fetching identity…', color: 'cyan' }).start();
    try {
      const res = await axios.get(apiUrl('/api/auth/me'), { headers: authHeaders() });
      spinner.stop();
      const { user } = res.data;
      console.log(chalk.bold.cyan('  Current User'));
      console.log(chalk.dim('  ─────────────────────'));
      console.log(`  Username : ${chalk.white(user.username)}`);
      console.log(`  Role     : ${chalk.hex('#a855f7')(user.role)}`);
      console.log(`  Host     : ${chalk.dim(readConfig().host ?? 'http://localhost:3001')}`);
    } catch (err) {
      spinner.fail(chalk.red('Failed to fetch user: ' + (err.response?.data?.error ?? err.message)));
      process.exit(1);
    }
  });

// ── ghostwire deploy <file> ────────────────────────────────────────────────────

program
  .command('deploy <file>')
  .description('Push a YAML pipeline to the platform and hot-reload all clients')
  .option('--dry-run', 'Validate the YAML without deploying')
  .action(async (file, opts) => {
    // Read YAML
    let yaml;
    try {
      yaml = readFileSync(file, 'utf-8');
    } catch {
      console.error(chalk.red(`✗ Cannot read file: ${file}`));
      process.exit(1);
    }

    if (opts.dryRun) {
      // Validate only — parse client-side
      const spinner = ora({ text: 'Validating YAML…', color: 'yellow' }).start();
      try {
        const { load } = await import('js-yaml');
        const parsed = load(yaml);
        const nodeCount = parsed?.nodes?.length ?? 0;
        const edgeCount = parsed?.edges?.length ?? 0;
        spinner.succeed(chalk.yellow(`Dry-run OK — ${nodeCount} node(s), ${edgeCount} edge(s). Nothing deployed.`));
      } catch (e) {
        spinner.fail(chalk.red(`Invalid YAML: ${e.message}`));
        process.exit(1);
      }
      return;
    }

    const spinner = ora({ text: `Deploying ${chalk.bold(file)}…`, color: 'magenta' }).start();

    try {
      const res = await axios.post(
        apiUrl('/api/cli/deploy'),
        { yaml },
        { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
      );

      const { id, nodeCount, edgeCount, deployedAt } = res.data;
      spinner.succeed(chalk.green('Pipeline deployed successfully!'));
      console.log('');
      console.log(chalk.bold('  Deployment Summary'));
      console.log(chalk.dim('  ─────────────────────────────'));
      console.log(`  Deployment ID : ${chalk.white('#' + id)}`);
      console.log(`  Nodes         : ${chalk.cyan(nodeCount)}`);
      console.log(`  Edges         : ${chalk.cyan(edgeCount)}`);
      console.log(`  Deployed at   : ${chalk.dim(new Date(deployedAt).toLocaleString())}`);
      console.log('');
      console.log(chalk.hex('#6366f1')('  ✦ Canvas hot-reloaded on all connected clients'));
    } catch (err) {
      const msg = err.response?.data?.error ?? err.message;
      spinner.fail(chalk.red(`Deployment failed: ${msg}`));
      process.exit(1);
    }
  });

// ── ghostwire status ───────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show platform health and active deployment info')
  .action(async () => {
    const spinner = ora({ text: 'Fetching status…', color: 'cyan' }).start();
    try {
      const [healthRes, deployRes] = await Promise.all([
        axios.get(apiUrl('/health')),
        axios.get(apiUrl('/api/deployments/active'), { headers: authHeaders() }).catch(() => null),
      ]);

      spinner.stop();
      const h = healthRes.data;
      const d = deployRes?.data?.deployment;

      console.log('');
      console.log(chalk.bold('  Platform Status'));
      console.log(chalk.dim('  ─────────────────────────────'));
      const statusColor = h.status === 'ok' ? chalk.green : chalk.red;
      console.log(`  Status    : ${statusColor(h.status?.toUpperCase())}`);
      console.log(`  Clients   : ${chalk.cyan(h.clients)}`);
      console.log(`  Uptime    : ${chalk.dim(formatUptime(h.uptime))}`);
      console.log(`  Queue     : ${chalk.dim(`${h.queue?.active ?? 0} active / ${h.queue?.pending ?? 0} pending`)}`);

      console.log('');
      console.log(chalk.bold('  Active Deployment'));
      console.log(chalk.dim('  ─────────────────────────────'));
      if (d) {
        const schema = typeof d.schema === 'string' ? JSON.parse(d.schema) : d.schema;
        console.log(`  ID        : ${chalk.white('#' + d.id)}`);
        console.log(`  Status    : ${chalk.hex('#10b981')(d.status)}`);
        console.log(`  Nodes     : ${chalk.cyan(schema?.nodes?.length ?? 0)}`);
        console.log(`  Edges     : ${chalk.cyan(schema?.edges?.length ?? 0)}`);
        console.log(`  Deployed  : ${chalk.dim(d.deployedAt ? new Date(d.deployedAt).toLocaleString() : 'N/A')}`);
      } else {
        console.log(`  ${chalk.dim('No active deployment')}`);
      }
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Status check failed: ' + (err.response?.data?.error ?? err.message)));
      process.exit(1);
    }
  });

// ── ghostwire analytics ────────────────────────────────────────────────────────

program
  .command('analytics')
  .description('Show pipeline analytics summary')
  .action(async () => {
    const spinner = ora({ text: 'Fetching analytics…', color: 'cyan' }).start();
    try {
      const res = await axios.get(apiUrl('/api/analytics'), { headers: authHeaders() });
      spinner.stop();
      const a = res.data;

      const srPct   = ((a.successRate ?? 0) * 100).toFixed(1);
      const errPct  = (100 - parseFloat(srPct)).toFixed(1);
      const srColor = parseFloat(srPct) >= 95 ? chalk.green : parseFloat(srPct) >= 80 ? chalk.yellow : chalk.red;

      console.log('');
      console.log(chalk.bold('  Analytics'));
      console.log(chalk.dim('  ─────────────────────────────'));
      console.log(`  Total Hits    : ${chalk.white(a.totalHits ?? 0)}`);
      console.log(`  Success Rate  : ${srColor(srPct + '%')}`);
      console.log(`  Error Rate    : ${chalk.red(errPct + '%')}`);
      console.log(`  Avg Latency   : ${chalk.cyan((a.avgLatency ?? 0).toFixed(0) + ' ms')}`);
      console.log(`  Active Conns  : ${chalk.cyan(a.activeConns ?? 0)}`);
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Failed: ' + (err.response?.data?.error ?? err.message)));
      process.exit(1);
    }
  });

// ── ghostwire nodes ────────────────────────────────────────────────────────────

program
  .command('nodes')
  .description('List top failing nodes')
  .action(async () => {
    const spinner = ora({ text: 'Fetching node stats…', color: 'cyan' }).start();
    try {
      const res = await axios.get(apiUrl('/api/analytics/top-failing'), { headers: authHeaders() });
      spinner.stop();
      const nodes = res.data.nodes ?? [];

      console.log('');
      console.log(chalk.bold('  Top Failing Nodes'));
      console.log(chalk.dim('  ─────────────────────────────────────'));

      if (nodes.length === 0) {
        console.log(chalk.green('  All nodes healthy — no failures recorded.'));
      } else {
        for (const n of nodes) {
          const bar = '█'.repeat(Math.min(n.fail_count, 20));
          console.log(`  ${chalk.red(bar.padEnd(20, '░'))}  ${chalk.white(n.node_id.padEnd(20))}  ${chalk.red(n.fail_count + ' failures')}`);
        }
      }
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Failed: ' + (err.response?.data?.error ?? err.message)));
      process.exit(1);
    }
  });

// ── Utility ────────────────────────────────────────────────────────────────────

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

program.parse();
