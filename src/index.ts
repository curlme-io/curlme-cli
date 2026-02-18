#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import axios from 'axios';
import { password, select } from '@inquirer/prompts';
import api from './api';
import config, { clearActiveBin, getActiveBin, getRecentBins, pushRecentBin, setActiveBin } from './config';

type BinRecord = {
  id: string;
  publicId: string;
  name: string;
  requestCount?: number;
};

type RequestRecord = {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  contentType?: string;
  ip?: string;
  timestamp: number;
  size: number;
};

type GlobalOptions = {
  bin?: string;
  global?: boolean;
  json?: boolean;
  noCreate?: boolean;
};

const program = new Command();

const VERSION = '1.1.0';
const KNOWN_TOP_LEVEL = [
  'init',
  'new',
  'bin',
  'use',
  'listen',
  'latest',
  'show',
  'replay',
  'diff',
  'open',
  'export',
  'login',
  'status',
  'upgrade',
  'auth',
  'billing',
  'request'
];

process.on('unhandledRejection', (reason) => {
  if (reason === '') {
    process.exit(0);
  }
  if (reason instanceof Error) {
    console.error(pc.red(`Error: ${reason.message}`));
  } else if (reason) {
    console.error(pc.red(`Error: ${String(reason)}`));
  }
  process.exit(1);
});

const endpointFor = (binId: string) => `${api.getBaseUrl()}/h/${binId}`;
const dashboardFor = (binId: string, requestId?: string) => {
  const base = `${api.getBaseUrl()}/bin/${binId}`;
  return requestId ? `${base}?requestId=${encodeURIComponent(requestId)}` : base;
};

const shortRequestId = (id: string) => (id.startsWith('req_') ? id.slice(0, 10) : `req_${id.slice(0, 6)}`);

const toIso = (ts: number) => new Date(ts).toISOString();

const toClock = (ts: number) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const bytes = (size: number) => {
  if (size < 1024) return `${size}B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
};

const printHeader = (binId: string, requestCount?: number, mode?: string) => {
  const right = requestCount !== undefined ? `${requestCount} requests` : mode ?? 'ready';
  console.log(`BIN ${binId}  |  endpoint ${endpointFor(binId)}  |  ${right}`);
};

const printRequestRow = (idx: number, req: RequestRecord) => {
  const row = [
    String(idx).padEnd(2),
    toClock(req.timestamp).padEnd(8),
    req.method.padEnd(6),
    (req.path || '/').slice(0, 28).padEnd(28),
    bytes(req.size).padStart(7),
    shortRequestId(req.id)
  ].join('  ');
  console.log(row);
};

const printRequestDetail = (req: RequestRecord, indexLabel?: string) => {
  const label = indexLabel ? `${indexLabel}  (${shortRequestId(req.id)})` : shortRequestId(req.id);
  console.log(`Request ${label}`);
  console.log(`Time: ${toIso(req.timestamp)}`);
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path || '/'}`);
  console.log(`IP: ${req.ip || '-'}`);
  console.log(`Size: ${bytes(req.size)}`);
  console.log('');
  console.log('Headers');
  const entries = Object.entries(req.headers || {});
  if (entries.length === 0) {
    console.log('- (none)');
  } else {
    for (const [k, v] of entries) {
      console.log(`- ${k}: ${v}`);
    }
  }
  console.log('');
  console.log('Body');
  if (!req.body) {
    console.log('(empty)');
    return;
  }
  try {
    const parsed = JSON.parse(req.body);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(req.body);
  }
};

const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

const closestCommands = (inputCmd: string) => {
  const scored = KNOWN_TOP_LEVEL.map((name) => ({ name, dist: levenshtein(inputCmd, name) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map((x) => x.name);
  return scored;
};

const isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function openUrl(url: string) {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    const { default: open } = await dynamicImport('open');
    await open(url);
  } catch (error: any) {
    console.error(pc.red(`Failed to open browser: ${error.message}`));
    console.log(url);
  }
}

const getBinOrExit = async (options: GlobalOptions): Promise<string> => {
  const candidate = options.bin || getActiveBin(Boolean(options.global));
  if (!candidate) {
    console.error('No active bin. Run: curlme init (or: curlme bin <name|id>).');
    process.exit(1);
  }

  try {
    const bin = await api.getBin(candidate);
    setActiveBin(bin.publicId, Boolean(options.global));
    pushRecentBin(bin.publicId, Boolean(options.global));
    return bin.publicId;
  } catch {
    if (!options.bin) {
      clearActiveBin(Boolean(options.global));
    }
    console.error(`Active bin '${candidate}' not found. Set one with: curlme bin`);
    process.exit(1);
  }
};

const resolveRef = (ref: string | undefined, reqs: RequestRecord[]): RequestRecord | null => {
  if (!ref) return null;
  if (/^\d+$/.test(ref)) {
    const index = Number(ref);
    return reqs[index - 1] ?? null;
  }
  const matches = reqs.filter((r) => r.id === ref || r.id.startsWith(ref) || shortRequestId(r.id) === ref);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Short ID '${ref}' matches multiple requests. Use a longer prefix.`);
  }
  return null;
};

const pickRequest = async (reqs: RequestRecord[], title: string): Promise<RequestRecord | null> => {
  if (!isTTY()) return null;
  if (reqs.length === 0) return null;
  const top = reqs.slice(0, 10);
  const value = await select<string>({
    message: title,
    choices: top.map((r, i) => ({
      value: r.id,
      name: `${i + 1}. ${toClock(r.timestamp)}  ${r.method.padEnd(6)} ${(r.path || '/').slice(0, 32)}  ${shortRequestId(r.id)}`
    }))
  });
  return top.find((r) => r.id === value) ?? null;
};

const requireRefOrPick = async (
  ref: string | undefined,
  reqs: RequestRecord[],
  title: string
): Promise<RequestRecord> => {
  if (ref) {
    const resolved = resolveRef(ref, reqs);
    if (!resolved) {
      throw new Error(`Request '${ref}' not found.`);
    }
    return resolved;
  }

  if (isTTY()) {
    const picked = await pickRequest(reqs, title);
    if (!picked) {
      throw new Error('No requests in the active bin yet. Next: curlme listen');
    }
    return picked;
  }

  throw new Error('Missing <ref>. In non-TTY mode provide a request ref, e.g. `curlme show 1`.');
};

const parseDurationMs = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d+)(ms|s|m|h)?$/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60_000;
  if (unit === 'h') return amount * 3_600_000;
  return undefined;
};

const printQuickHelp = () => {
  console.log(program.helpInformation());
  console.log('No active bin found. Run: curlme init');
};

const doInit = async (name?: string, options?: GlobalOptions) => {
  const spinner = ora('Creating bin...').start();
  try {
    const binName = name || ('bin-' + Math.random().toString(36).slice(2, 8));
    const bin = await api.createBin(binName);
    setActiveBin(bin.publicId, Boolean(options?.global));
    pushRecentBin(bin.publicId, Boolean(options?.global));
    spinner.stop();

    const createdKind = typeof bin.isTemporary === 'boolean'
      ? (bin.isTemporary ? 'temporary bin' : 'bin')
      : (config.get('apiKey') ? 'bin' : 'temporary bin');

    console.log(`Created ${createdKind}: ${bin.publicId}`);
    console.log(`Endpoint: ${endpointFor(bin.publicId)}`);
    console.log('Active bin set for this workspace.');
    console.log('');
    console.log('Next: curlme listen');
  } catch (error: any) {
    spinner.fail(`Failed to create bin: ${error.message}`);
  }
};

const doBinSet = async (selector?: string, global = false) => {
  if (!selector) {
    const bins = (await api.getBins()) as BinRecord[];
    const active = getActiveBin(global);

    if (bins.length === 0) {
      console.log('No bins found. Run: curlme init');
      return;
    }

    printHeader(active || '-', undefined, `${bins.length} bins`);
    console.log(`Active: ${active || '-'}`);
    const recent = getRecentBins(global);
    if (recent.length > 0) {
      console.log(`Recent: ${recent.join(', ')}`);
    }

    if (!isTTY()) {
      return;
    }

    const picked = await select<string>({
      message: 'Select active bin',
      choices: bins.slice(0, 20).map((b) => ({
        value: b.publicId,
        name: `${b.publicId}${b.publicId === active ? ' (active)' : ''}  ${b.name}`
      }))
    });

    setActiveBin(picked, global);
    pushRecentBin(picked, global);
    console.log(`Active bin: ${picked}`);
    return;
  }

  const bins = (await api.getBins()) as BinRecord[];
  const match = bins.find((b) => b.publicId === selector || b.publicId.startsWith(selector) || b.name === selector);
  if (!match) {
    throw new Error(`Bin '${selector}' not found.`);
  }

  setActiveBin(match.publicId, global);
  pushRecentBin(match.publicId, global);
  console.log(`Active bin: ${match.publicId}`);
  console.log(`Endpoint: ${endpointFor(match.publicId)}`);
};

const doStatus = async (options: GlobalOptions) => {
  const active = getActiveBin(Boolean(options.global));
  console.log(`Base URL: ${api.getBaseUrl()}`);
  console.log(`Auth: ${config.get('apiKey') ? 'configured' : 'missing'}`);
  console.log(`Active bin: ${active || '-'}`);
  if (active) {
    console.log(`Endpoint: ${endpointFor(active)}`);
  }

  try {
    const user = await api.getWhoAmI();
    console.log(`User: ${user.email || user.name || 'unknown'}`);
    console.log(`Plan: ${user.plan || 'FREE'}`);
  } catch {
    console.log('User: not authenticated');
  }
};

program
  .name('curlme')
  .description('Terminal-first HTTP request debugging')
  .version(VERSION)
  .option('--bin <id>', 'Explicit bin (advanced mode)')
  .option('--global', 'Use global context instead of workspace context')
  .option('--json', 'Machine-readable output')
  .option('--no-create', 'Do not auto-create bin on `curlme`')
  .showHelpAfterError();

program.helpInformation = function helpInformation() {
  return `curlme - Terminal-first HTTP request debugging\n\nUsage:\n  curlme [command] [flags]\n  curlme                 Show active context or help\n\nCore:\n  init [name]            Create temp/named bin and set active\n  new [name]             Alias for init\n  bin [name|id]          Show/set active bin (alias: use)\n  listen, l              Stream incoming requests\n  latest                 Show latest request (full details)\n  show, s [ref]          Show request details (picker in TTY if ref omitted)\n  replay, r [ref]        Replay request (--to required; picker in TTY if ref omitted)\n  diff, d [a] [b]        Diff requests (default: 1 vs 2)\n  open [ref]             Open dashboard for active bin/request\n  export                 Export request history\n\nAccount:\n  login                  Authenticate\n  upgrade                Billing/plan\n  status                 Auth + active context + endpoint\n\n\nFlags:\n  --bin <id>             Explicit bin (advanced mode)\n  --global               Read/write global context\n  --json                 Scriptable output\n  --ui                   Interactive UI mode\n  --no-create            Do not auto-create bin on no-arg run\n  -h, --help             Help\n  -v, --version          Version\n`;
};

program
  .command('init [name]')
  .description('Create temp/named bin and set active')
  .action(async (name: string | undefined) => {
    await doInit(name, program.opts<GlobalOptions>());
  });

program
  .command('new [name]')
  .description('Alias for init')
  .action(async (name: string | undefined) => {
    await doInit(name, program.opts<GlobalOptions>());
  });

const bin = program
  .command('bin [selector]')
  .description('Show or set active bin context')
  .action(async (selector: string | undefined) => {
    try {
      const opts = program.opts<GlobalOptions>();
      await doBinSet(selector, Boolean(opts.global));
    } catch (error: any) {
      console.error(error.message);
    }
  });

bin
  .command('set <selector>')
  .description('Set active bin')
  .action(async (selector: string) => {
    try {
      const opts = program.opts<GlobalOptions>();
      await doBinSet(selector, Boolean(opts.global));
    } catch (error: any) {
      console.error(error.message);
    }
  });

bin
  .command('clear')
  .description('Clear active bin for this workspace')
  .action(() => {
    const opts = program.opts<GlobalOptions>();
    clearActiveBin(Boolean(opts.global));
    console.log('Active bin cleared.');
  });

bin
  .command('tail')
  .description('Deprecated alias')
  .action(() => {
    console.log("'bin tail' is deprecated. Use: curlme listen");
  });

bin
  .command('use [selector]')
  .description('Deprecated alias for `curlme bin`')
  .action(async (selector: string | undefined) => {
    console.log("Deprecated: 'bin use' -> 'bin'. Will be removed in v2.0.");
    const opts = program.opts<GlobalOptions>();
    await doBinSet(selector, Boolean(opts.global));
  });

bin
  .command('create [name]')
  .description('Deprecated alias for `curlme init`')
  .action(async (name: string | undefined) => {
    console.log("Deprecated: 'bin create' -> 'init'. Will be removed in v2.0.");
    await doInit(name, program.opts<GlobalOptions>());
  });

bin
  .command('list')
  .alias('ls')
  .description('Deprecated list command')
  .action(async () => {
    console.log("Deprecated: 'bin list' -> 'bin'. Will be removed in v2.0.");
    await doBinSet(undefined, Boolean(program.opts<GlobalOptions>().global));
  });

program
  .command('use [selector]')
  .description('Alias for `curlme bin [selector]`')
  .action(async (selector: string | undefined) => {
    await doBinSet(selector, Boolean(program.opts<GlobalOptions>().global));
  });

program
  .command('listen')
  .alias('l')
  .description('Stream incoming requests')
  .option('--since <duration>', 'Show backlog before streaming (e.g. 5m)')
  .action(async (cmdOptions: { since?: string }) => {
    const opts = program.opts<GlobalOptions>();
    const binId = await getBinOrExit(opts);

    let lastSince = Date.now();
    const sinceMs = parseDurationMs(cmdOptions.since);
    if (sinceMs) {
      lastSince = Date.now() - sinceMs;
    }

    printHeader(binId, undefined, 'listening');
    console.log('1  TIME      METHOD  PATH                          SIZE     ID');

    const seen = new Set<string>();
    let rowIndex = 0;

    const poll = async () => {
      try {
        const reqs = (await api.getRequests(binId, lastSince)) as RequestRecord[];
        reqs
          .sort((a, b) => a.timestamp - b.timestamp)
          .forEach((req) => {
            if (seen.has(req.id)) return;
            rowIndex += 1;
            seen.add(req.id);
            printRequestRow(rowIndex, req);
            lastSince = Math.max(lastSince, req.timestamp + 1);
          });
      } catch {
        // keep polling
      }
      setTimeout(poll, 1200);
    };

    poll();
  });

program
  .command('latest')
  .description('Show latest request (same as show 1)')
  .option('--summary', 'One-line summary')
  .action(async (cmdOptions: { summary?: boolean }) => {
    try {
      const opts = program.opts<GlobalOptions>();
      const binId = await getBinOrExit(opts);
      const reqs = (await api.getRequests(binId)) as RequestRecord[];
      if (reqs.length === 0) {
        console.log(`No requests yet in active bin '${binId}'. Send one, then run: curlme listen`);
        return;
      }

      printHeader(binId, reqs.length, 'latest');
      if (cmdOptions.summary) {
        console.log('1  TIME      METHOD  PATH                          SIZE     ID');
        printRequestRow(1, reqs[0]);
        return;
      }

      printRequestDetail(reqs[0], '1');
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command('show [ref]')
  .alias('s')
  .description('Show request details')
  .option('--headers', 'Show headers only')
  .option('--body', 'Show body only')
  .option('--meta', 'Show metadata only')
  .action(async (ref: string | undefined, cmdOptions: { headers?: boolean; body?: boolean; meta?: boolean }) => {
    try {
      const opts = program.opts<GlobalOptions>();
      const binId = await getBinOrExit(opts);
      const reqs = (await api.getRequests(binId)) as RequestRecord[];
      if (reqs.length === 0) {
        console.log(`No requests yet in active bin '${binId}'. Send one, then run: curlme listen`);
        return;
      }

      const selected = await requireRefOrPick(ref, reqs, 'Select request');
      const index = reqs.findIndex((r) => r.id === selected.id);
      printHeader(binId, reqs.length, 'show');

      if (cmdOptions.headers) {
        console.log('Headers');
        for (const [k, v] of Object.entries(selected.headers || {})) {
          console.log(`- ${k}: ${v}`);
        }
        return;
      }

      if (cmdOptions.body) {
        console.log(selected.body || '(empty)');
        return;
      }

      if (cmdOptions.meta) {
        console.log(`Request: ${index + 1}`);
        console.log(`ID: ${selected.id}`);
        console.log(`Time: ${toIso(selected.timestamp)}`);
        console.log(`Method: ${selected.method}`);
        console.log(`Path: ${selected.path || '/'}`);
        console.log(`IP: ${selected.ip || '-'}`);
        console.log(`Size: ${bytes(selected.size)}`);
        return;
      }

      printRequestDetail(selected, String(index + 1));
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command('replay [ref]')
  .alias('r')
  .description('Replay request to target URL')
  .requiredOption('--to <url>', 'Target URL')
  .option('--timeout <ms>', 'Request timeout', '15000')
  .action(async (ref: string | undefined, cmdOptions: { to: string; timeout: string }) => {
    try {
      const opts = program.opts<GlobalOptions>();
      const binId = await getBinOrExit(opts);
      const reqs = (await api.getRequests(binId)) as RequestRecord[];
      if (reqs.length === 0) {
        console.log(`No requests yet in active bin '${binId}'. Send one, then run: curlme listen`);
        return;
      }

      const selected = await requireRefOrPick(ref, reqs, 'Pick request to replay');
      const targetUrl = new URL(selected.path || '/', cmdOptions.to).toString();
      const started = Date.now();

      const response = await axios({
        method: selected.method,
        url: targetUrl,
        headers: {
          ...selected.headers,
          'x-replayed-by': 'curlme'
        },
        data: selected.body,
        timeout: Number(cmdOptions.timeout),
        validateStatus: () => true
      });

      const elapsed = Date.now() - started;
      console.log(`Replayed request ${shortRequestId(selected.id)} to ${cmdOptions.to}`);
      console.log(`Response: ${response.status} in ${elapsed}ms`);
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command('diff [a] [b]')
  .alias('d')
  .description('Diff requests (default: 1 vs 2)')
  .action(async (a: string | undefined, b: string | undefined) => {
    try {
      const opts = program.opts<GlobalOptions>();
      const binId = await getBinOrExit(opts);
      const reqs = (await api.getRequests(binId)) as RequestRecord[];

      if (reqs.length < 2) {
        console.log('Need at least 2 requests to diff. Next: curlme listen');
        return;
      }

      const leftRef = a || '1';
      const rightRef = b || '2';
      const left = resolveRef(leftRef, reqs);
      const right = resolveRef(rightRef, reqs);

      if (!left || !right) {
        throw new Error(`Could not resolve diff refs '${leftRef}' and '${rightRef}'.`);
      }

      const leftIndex = reqs.findIndex((r) => r.id === left.id) + 1;
      const rightIndex = reqs.findIndex((r) => r.id === right.id) + 1;

      console.log(`Diff ${leftIndex} vs ${rightIndex}`);
      if (left.method !== right.method) console.log(`- Method: ${left.method} -> ${right.method}`);
      if ((left.path || '/') !== (right.path || '/')) console.log(`- Path: ${left.path || '/'} -> ${right.path || '/'}`);
      if (bytes(left.size) !== bytes(right.size)) console.log(`- Body size: ${bytes(left.size)} -> ${bytes(right.size)}`);

      const headerKeys = new Set<string>([...Object.keys(left.headers || {}), ...Object.keys(right.headers || {})]);
      let headerChanges = 0;
      for (const key of headerKeys) {
        const lv = (left.headers || {})[key];
        const rv = (right.headers || {})[key];
        if (lv === rv) continue;
        if (lv === undefined) console.log(`- Header added: ${key}`);
        else if (rv === undefined) console.log(`- Header removed: ${key}`);
        else console.log(`- Header changed: ${key}`);
        headerChanges += 1;
        if (headerChanges >= 8) break;
      }

      if (left.body === right.body && left.method === right.method && left.path === right.path && left.size === right.size) {
        console.log('No material differences found.');
      }
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command('open [ref]')
  .description('Open dashboard for active bin or request')
  .action(async (ref: string | undefined) => {
    try {
      const opts = program.opts<GlobalOptions>();
      const binId = await getBinOrExit(opts);
      let requestId: string | undefined;
      if (ref) {
        const reqs = (await api.getRequests(binId)) as RequestRecord[];
        const selected = resolveRef(ref, reqs);
        if (!selected) {
          throw new Error(`Request '${ref}' not found.`);
        }
        requestId = selected.id;
      }

      const url = dashboardFor(binId, requestId);
      console.log(`Opening ${url}`);
      await openUrl(url);
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command('export')
  .description('Export request history')
  .option('--format <format>', 'json|curl', 'json')
  .action(async (cmdOptions: { format: string }) => {
    try {
      const opts = program.opts<GlobalOptions>();
      const binId = await getBinOrExit(opts);
      const payload = await api.getExport(binId, cmdOptions.format);
      if (opts.json) {
        console.log(JSON.stringify(payload));
        return;
      }
      console.log(JSON.stringify(payload, null, 2));
    } catch (error: any) {
      console.error(error.message);
    }
  });

program
  .command('login')
  .description('Authenticate CLI with API key')
  .action(async () => {
    try {
      const key = await password({
        message: 'Enter API key',
        mask: '*'
      });

      if (!key || !key.trim()) {
        console.error('No API key provided.');
        return;
      }

      config.set('apiKey', key.trim());
      const user = await api.getWhoAmI();
      console.log(`Authenticated as ${user.email || user.name || 'user'}`);
    } catch (error: any) {
      config.delete('apiKey');
      console.error(`Authentication failed: ${error.message}`);
    }
  });

program
  .command('status')
  .description('Show auth and active context')
  .action(async () => {
    await doStatus(program.opts<GlobalOptions>());
  });

program
  .command('upgrade')
  .description('Open billing/upgrade')
  .action(async () => {
    const url = `${api.getBaseUrl()}/pricing`;
    console.log(`Opening ${url}`);
    await openUrl(url);
  });

program
  .command('billing')
  .description('Deprecated alias for `upgrade`')
  .action(async () => {
    console.log("Deprecated: 'billing' -> 'upgrade'. Will be removed in v2.0.");
    const url = `${api.getBaseUrl()}/account?tab=plan`;
    await openUrl(url);
  });

// Backward-compatible auth group
const auth = program.command('auth').description('Deprecated auth group');
auth
  .command('login')
  .action(async () => {
    console.log("Deprecated: 'auth login' -> 'login'. Will be removed in v2.0.");
    await program.parseAsync(['node', 'curlme', 'login'], { from: 'user' });
  });
auth
  .command('whoami')
  .action(async () => {
    console.log("Deprecated: 'auth whoami' -> 'status'. Will be removed in v2.0.");
    await doStatus(program.opts<GlobalOptions>());
  });
auth
  .command('logout')
  .action(() => {
    config.delete('apiKey');
    console.log('Logged out.');
  });

// Backward-compatible request group
const requestGroup = program.command('request').description('Deprecated request group');
requestGroup
  .command('latest')
  .action(async () => {
    console.log("Deprecated: 'request latest' -> 'latest'. Will be removed in v2.0.");
    await program.parseAsync(['node', 'curlme', 'latest'], { from: 'user' });
  });
requestGroup
  .command('show [ref]')
  .action(async (ref: string | undefined) => {
    console.log("Deprecated: 'request show' -> 'show'. Will be removed in v2.0.");
    const argv = ref ? ['node', 'curlme', 'show', ref] : ['node', 'curlme', 'show'];
    await program.parseAsync(argv, { from: 'user' });
  });
requestGroup
  .command('replay [ref]')
  .requiredOption('--to <url>')
  .action(async (ref: string | undefined, cmdOptions: { to: string }) => {
    console.log("Deprecated: 'request replay' -> 'replay'. Will be removed in v2.0.");
    const argv = ['node', 'curlme', 'replay'];
    if (ref) argv.push(ref);
    argv.push('--to', cmdOptions.to);
    await program.parseAsync(argv, { from: 'user' });
  });
requestGroup
  .command('diff [a] [b]')
  .action(async (a: string | undefined, b: string | undefined) => {
    console.log("Deprecated: 'request diff' -> 'diff'. Will be removed in v2.0.");
    const argv = ['node', 'curlme', 'diff'];
    if (a) argv.push(a);
    if (b) argv.push(b);
    await program.parseAsync(argv, { from: 'user' });
  });

program.on('command:*', (operands) => {
  const attempted = operands[0];
  if (!attempted) return;

  if (attempted === 'requests' || attempted === 'request') {
    console.error("Unknown command 'requests'. Did you mean: show, latest, or listen?");
    process.exit(1);
  }

  const suggestions = closestCommands(attempted).join(', ');
  console.error(`Unknown command '${attempted}'. Did you mean: ${suggestions}?`);
  process.exit(1);
});

(async () => {
  const argv = process.argv.slice(2);
  const noCommand = argv.length === 0 || (argv.length === 1 && argv[0] === '--no-create');

  if (noCommand) {
    const noCreate = argv.includes('--no-create');
    const active = getActiveBin(false);

    if (active) {
      printHeader(active);
      console.log('Next: curlme listen');
      console.log('Then: curlme latest');
      console.log('Then: curlme show 1');
      return;
    }

    if (noCreate) {
      printQuickHelp();
      return;
    }

    printQuickHelp();
    return;
  }

  await program.parseAsync(process.argv);
})();




