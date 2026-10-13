import { writeFileSync } from 'node:fs';
import type { ReleasedTicketRow } from '../interfaces/ReleasedTicketRow.js';

export class TicketCsvWriter {
  write(path: string, tickets: ReleasedTicketRow[]): void {
    const rows = [
      ['ticket', 'parent', 'hash', 'date', 'title', 'user', 'release'],
      ...tickets.map(row => [row.ticket, row.parent, row.hash, row.date.toISOString(), row.title, row.user, row.release]),
    ];
    const csv = rows.map(row => row.map(value => this.escape(value)).join(',')).join('\r\n');

    writeFileSync(path, '\uFEFF' + csv + '\r\n', 'utf8');
  }

  private escape(value: string): string {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replaceAll('"', '""')}"`;
    }

    return value;
  }
}
