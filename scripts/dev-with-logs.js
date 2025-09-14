"use strict";
/*
  Wrapper to run `next dev` and optionally export server logs to Server_Logs.txt
  Controls:
  - ENV: EXPORT_SERVER_LOGS=true|false (overrides prompt)
  - Prompt: asks each run if not set via ENV
*/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

function parseBool(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return null;
}

async function askYesNo(question, def = true) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = def ? ' [Y/n] ' : ' [y/N] ';
    rl.question(question + suffix, (answer) => {
      rl.close();
      const v = parseBool(answer);
      resolve(v === null ? def : v);
    });
  });
}

async function main() {
  const projectRoot = process.cwd();
  const logFile = path.join(projectRoot, 'Server_Logs.txt');

  let shouldLog = parseBool(process.env.EXPORT_SERVER_LOGS);
  if (shouldLog === null) {
    shouldLog = await askYesNo('Export server logs to Server_Logs.txt?', true);
  }

  let logStream = null;
  if (shouldLog) {
    try {
      // Truncate previous logs on each session start
      logStream = fs.createWriteStream(logFile, { flags: 'w' });
      const header = `===== Session start ${new Date().toISOString()} =====\n`;
      logStream.write(header);
      console.log(`[logs] Exporting server logs to ${logFile}`);
    } catch (e) {
      console.error('[logs] Failed to open log file:', e.message);
      logStream = null;
    }
  } else {
    console.log('[logs] Export to Server_Logs.txt is disabled (set EXPORT_SERVER_LOGS=true to enable).');
  }

  // Resolve Next.js CLI entry and spawn via Node
  let nextBin;
  try {
    nextBin = require.resolve('next/dist/bin/next');
  } catch (e) {
    console.error('Could not resolve Next.js binary. Is `next` installed?');
    process.exit(1);
  }

  const child = spawn(process.execPath, [nextBin, 'dev'], { cwd: projectRoot });

  function pipe(stream, prefix) {
    stream.on('data', (chunk) => {
      try {
        process.stdout.write(chunk);
        if (logStream) logStream.write(chunk);
      } catch {}
    });
  }

  pipe(child.stdout, '');
  pipe(child.stderr, '');

  child.on('close', (code) => {
    if (logStream) {
      logStream.write(`===== Session end ${new Date().toISOString()} (code ${code}) =====\n`);
      logStream.end();
    }
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
