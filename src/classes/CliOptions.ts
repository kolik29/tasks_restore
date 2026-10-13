import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export class CliOptions {
  private constructor(
    readonly repositoryPath: string,
    readonly since: Date,
    readonly users: string[],
    readonly outputPath: string,
    readonly branch: string | undefined,
  ) {}

  static parse(): CliOptions | undefined {
    const { values } = parseArgs({
      options: {
        path: { type: 'string' },
        date: { type: 'string' },
        user: { type: 'string' },
        output: { type: 'string', default: 'tickets.csv' },
        branch: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });

    if (values.help) {
      console.log('npm start -- --path /path/to/repo --date YYYY-MM-DD [--user name-or-email,name-or-email] [--output tickets.csv] [--branch branch-name]');
      return undefined;
    }

    if (!values.path || !values.date) {
      throw new Error('Укажите --path и --date. Справка: npm start -- --help');
    }

    const users = CliOptions.parseUsers(values.user);
    const branch = values.branch?.trim();

    if (branch !== undefined && !branch) {
      throw new Error('--branch не может быть пустым');
    }

    const output = values.output ?? 'tickets.csv';

    if (!output.trim()) {
      throw new Error('--output не может быть пустым');
    }

    return new CliOptions(
      resolve(values.path),
      CliOptions.parseDate(values.date),
      users,
      resolve(output),
      branch,
    );
  }

  static parseUsers(value?: string): string[] {
    if (value === undefined) {
      return [];
    }

    const users = value.split(',').map(user => user.trim().toLowerCase());
    
    if (users.some(user => user.length === 0)) {
      throw new Error('--user должен содержать непустые имена или email через запятую');
    }

    return [...new Set(users)];
  }

  static parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('--date должен иметь формат YYYY-MM-DD');
    }

    const date = new Date(`${value}T00:00:00`);
    const [year, month, day] = value.split('-').map(Number);
    const isValid = date.getFullYear() === year
      && date.getMonth() + 1 === month
      && date.getDate() === day;

    if (!isValid) {
      throw new Error(`Некорректная дата: ${value}`);
    }

    return date;
  }
}
