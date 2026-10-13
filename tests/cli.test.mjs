import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CliOptions } from '../dist/classes/CliOptions.js';
import { TicketCollector } from '../dist/classes/TicketCollector.js';

test('collects unique ticket numbers only from the subject prefix', () => {
  const tickets = new TicketCollector().collect([
    'WST-11111 WST-12345 WST-32165 feat(component): title',
    'WST-12345 fix: another title',
    'WST-2 fix!: title',
    'feat: mention WST-7',
    'WST-1x feat: title',
    'WST-2 feat: mention WST-8',
    'Pull request #2996: WST-12584 fix(cookie): position',
    'Pull request #2979: WST-12626 WST-12736 fix(doctors): slider',
  ].map((subject, index) => ({ subject, hash: String(index), date: new Date('2026-05-01T12:00:00Z'), authorName: 'Alice', authorEmail: 'alice@example.com' })));

  assert.deepEqual(tickets.map(row => row.ticket), ['WST-2', 'WST-11111', 'WST-12345', 'WST-12584', 'WST-12626', 'WST-12736', 'WST-32165']);
  assert.equal(tickets.find(row => row.ticket === 'WST-32165').parent, 'WST-11111');
  assert.equal(tickets.find(row => row.ticket === 'WST-12736').parent, 'WST-12626');
  assert.equal(tickets.find(row => row.ticket === 'WST-11111').parent, '');
  assert.deepEqual(new TicketCollector().collect([]), []);
});

test('keeps the earliest commit and preserves a parent from later commits', () => {
  const base = { authorName: 'Alice', authorEmail: 'alice@example.com' };
  const early = { ...base, hash: 'early', date: new Date('2026-05-01T12:00:00Z'), subject: 'WST-2 feat: initial' };
  const later = { ...base, hash: 'later', date: new Date('2026-05-02T12:00:00Z'), subject: 'WST-1 WST-2 fix: followup' };
  const rows = new TicketCollector().collect([later, early]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.ticket === 'WST-2'), {
    ticket: 'WST-2', parent: 'WST-1', hash: 'early', date: early.date, title: 'initial', user: 'Alice',
  });
});

test('parses multiple users and rejects empty entries', () => {
  assert.deepEqual(CliOptions.parseUsers(' na.kulikov, KOLIK29,na.kulikov '), ['na.kulikov', 'kolik29']);
  assert.deepEqual(CliOptions.parseUsers(), []);
  assert.throws(() => CliOptions.parseUsers('Alice,'));
  assert.throws(() => CliOptions.parseUsers(''));
});

test('validates dates', () => {
  assert.throws(() => CliOptions.parseDate('2026-02-30'));
  assert.throws(() => CliOptions.parseDate('May 1'));
  assert.equal(CliOptions.parseDate('2026-05-01').getDate(), 1);
});

test('CLI scans branches and filters dates and authors', () => {
  const root = mkdtempSync(join(tmpdir(), 'tasks-restore-test-'));
  const repo = join(root, 'repo');
  const output = join(root, 'tickets.csv');
  const cli = resolve('dist/index.js');
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  const commit = (subject, date, author = 'Alice') => execFileSync('git', ['-C', repo, 'commit', '--allow-empty', '-m', subject], {
    env: { ...process.env, GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: `${author.toLowerCase()}@example.com`,
      GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: `${author.toLowerCase()}@example.com`,
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: 'pipe',
  });
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    commit('WST-9 feat: old', '2026-04-01T12:00:00Z');
    commit('WST-1 WST-2 WST-3 feat(ui): hello, "world"', '2026-05-02T12:00:00Z');
    commit('WST-2 fix: followup', '2026-05-03T12:00:00Z');
    commit('WST-4 feat: Bob task', '2026-05-04T12:00:00Z', 'Bob');
    git(['checkout', '-q', '-b', 'feature']);
    commit('Pull request #123: WST-5 feat: branch task', '2026-05-05T12:00:00Z');
    git(['checkout', '-q', 'main']);
    git(['branch', 'release1-stage', 'main~1']);
    git(['update-ref', 'refs/remotes/origin/release1-stage', 'main~1']);
    git(['branch', 'release2-stage', 'main']);
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2026-05-01', '--user', 'ALICE@'], { cwd: root });
    const csv = readFileSync(output, 'utf8');
    assert.equal(csv.split('\r\n')[0], '\uFEFFticket,parent,hash,date,title,user,Релиз');
    assert.equal(csv.split('\r\n').length - 2, 4);
    assert.match(csv, /WST-2,WST-1,[a-f0-9]{40},2026-05-02/);
    assert.match(csv, /WST-3,WST-1,[a-f0-9]{40},2026-05-02/);
    assert.match(csv, /WST-1,,[a-f0-9]{40},2026-05-02T12:00:00.000Z,"hello, ""world""",Alice,release1-stage\r\n/);
    assert.doesNotMatch(csv, /followup/);
    assert.match(csv, /WST-5,,[a-f0-9]{40},2026-05-05T12:00:00.000Z,branch task,Alice,ХФ/);
    assert.doesNotMatch(csv, /WST-(4|9),/);
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2026-05-01'], { cwd: root });
    assert.match(readFileSync(output, 'utf8'), /WST-4,,[a-f0-9]{40},2026-05-04T12:00:00.000Z,Bob task,Bob/);
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2026-05-01', '--user', ' ALICE@, BOB@ '], { cwd: root });
    const combinedCsv = readFileSync(output, 'utf8');
    assert.equal(combinedCsv.split('\r\n').length - 2, 5);
    assert.match(combinedCsv, /WST-4,,[a-f0-9]{40},2026-05-04T12:00:00.000Z,Bob task,Bob/);
    git(['checkout', '-q', '-b', 'tasks/WST-6']);
    commit('feat: task without ticket in subject', '2026-05-06T12:00:00Z');
    git(['update-ref', 'refs/remotes/origin/tasks/WST-6', 'HEAD']);
    git(['checkout', '-q', 'main']);
    git(['branch', 'WST-9_old', 'main~3']);
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2026-05-01', '--user', 'ALICE@'], { cwd: root });
    const branchCsv = readFileSync(output, 'utf8');
    assert.doesNotMatch(branchCsv, /WST-6,/);
    assert.equal(branchCsv.split('\r\n').filter(row => row.startsWith('WST-6,')).length, 0);
    assert.doesNotMatch(branchCsv, /WST-9,/);
    git(['branch', '-D', 'tasks/WST-6']);
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2026-05-01', '--user', 'ALICE@'], { cwd: root });
    assert.doesNotMatch(readFileSync(output, 'utf8'), /WST-6,/);
    const customOutput = join(root, 'restored.csv');
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2026-05-01', '--user', 'Alice', '--output', 'restored.csv'], { cwd: root });
    assert.equal(readFileSync(customOutput, 'utf8'), readFileSync(output, 'utf8'));
    execFileSync(process.execPath, [cli, '--path', repo, '--date', '2027-01-01'], { cwd: root });
    assert.equal(readFileSync(output, 'utf8'), '\uFEFFticket,parent,hash,date,title,user,Релиз\r\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
