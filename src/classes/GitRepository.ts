import { execFileSync } from 'node:child_process';
import type { Commit } from '../interfaces/Commit.js';

export class GitRepository {
  constructor(private readonly path: string) {}

  getStageBranchesContaining(hash: string): string[] {
    const references = execFileSync('git', [
      '-C', this.path, 'for-each-ref', `--contains=${hash}`,
      '--format=%(refname)%09%(symref)', 'refs/heads', 'refs/remotes',
    ], { encoding: 'utf8' });
    const names = new Set<string>();

    for (const line of references.trim().split('\n')) {
      const [reference, symbolicTarget] = line.split('\t');
      if (!reference || symbolicTarget || !reference.endsWith('-stage')) {
        continue;
      }

      const name = reference
        .replace(/^refs\/heads\//, '')
        .replace(/^refs\/remotes\/[^/]+\//, '');
      names.add(name);
    }

    return [...names].sort((first, second) => first.localeCompare(second, 'en', { numeric: true }));
  }

  getCommits(since: Date, users: string[] = [], branch?: string): Commit[] {
    const references = branch ? [this.resolveBranch(branch)] : ['--all', 'HEAD'];

    return this.readCommits(references)
      .filter(commit => commit.date >= since)
      .filter(commit => this.matchesAuthor(commit, users));
  }

  private resolveBranch(branch: string): string {
    const references = branch.startsWith('refs/')
      ? [branch]
      : [`refs/heads/${branch}`, `refs/remotes/${branch}`];

    for (const reference of references) {
      if (!reference.startsWith('refs/heads/') && !reference.startsWith('refs/remotes/')) {
        continue;
      }

      try {
        return execFileSync('git', ['-C', this.path, 'show-ref', '--verify', '--hash', reference], {
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();
      } catch {
        // Try the remote-tracking reference if the local branch does not exist.
      }
    }

    throw new Error(`Ветка не найдена: ${branch}. Укажите локальную ветку или origin/имя-ветки.`);
  }

  private readCommits(references: string[] = ['--all', 'HEAD']): Commit[] {
    const log = execFileSync('git', [
      '-C', this.path,
      'log', ...references, '-z',
      '--format=%H%x00%cI%x00%an%x00%ae%x00%s',
    ], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });

    const fields = log.split('\0');
    const commits: Commit[] = [];
    const fieldsPerCommit = 5;

    for (let offset = 0; offset + fieldsPerCommit <= fields.length; offset += fieldsPerCommit) {
      commits.push({
        hash: fields[offset]!,
        date: new Date(fields[offset + 1]!),
        authorName: fields[offset + 2]!,
        authorEmail: fields[offset + 3]!,
        subject: fields[offset + 4]!,
      });
    }

    return commits;
  }

  private matchesAuthor(commit: Commit, users: string[]): boolean {
    if (users.length === 0) {
      return true;
    }

    const name = commit.authorName.toLowerCase();
    const email = commit.authorEmail.toLowerCase();
    return users.some(user => name.includes(user.toLowerCase()) || email.includes(user.toLowerCase()));
  }
}
