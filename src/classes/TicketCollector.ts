import type { Commit } from '../interfaces/Commit.js';
import type { TicketRow } from '../interfaces/TicketRow.js';

export class TicketCollector {
  collect(commits: Commit[]): TicketRow[] {
    const rows: TicketRow[] = [];
    const seen = new Set<string>();

    for (const commit of commits) {
      const tickets = this.getSubjectTickets(commit.subject);
      const title = this.getTitle(commit.subject);

      for (const ticket of tickets) {
        const key = `${ticket}:${commit.hash}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        rows.push({ ticket, parent: this.getParent(ticket, tickets), hash: commit.hash, date: commit.date, title, user: commit.authorName });
      }
    }

    rows.sort((first, second) =>
      first.ticket.localeCompare(second.ticket, 'en', { numeric: true })
      || first.date.getTime() - second.date.getTime()
      || first.hash.localeCompare(second.hash),
    );

    const uniqueTickets = new Map<string, TicketRow>();

    for (const row of rows) {
      const existing = uniqueTickets.get(row.ticket);

      if (!existing) {
        uniqueTickets.set(row.ticket, row);
      } else if (!existing.parent && row.parent) {
        existing.parent = row.parent;
      }
    }

    return [...uniqueTickets.values()].sort((first, second) =>
      first.ticket.localeCompare(second.ticket, 'en', { numeric: true }),
    );
  }

  private getParent(ticket: string, tickets: string[]): string {
    const firstTicket = tickets[0];
    
    if (!firstTicket || ticket === firstTicket || !tickets.includes(ticket)) {
      return '';
    }

    return firstTicket;
  }

  private getSubjectTickets(subject: string): string[] {
    const words = subject.trim().replace(/^Pull request #\d+:\s*/i, '').split(/\s+/);
    const tickets: string[] = [];

    for (const word of words) {
      if (!/^WST-\d+$/.test(word)) {
        break;
      }
      tickets.push(word);
    }

    return tickets;
  }

  private getTitle(subject: string): string {
    return subject.trim()
      .replace(/^Pull request #\d+:\s*/i, '')
      .replace(/^(?:WST-\d+\s+)+/, '')
      .replace(/^[a-zA-Z][\w-]*(?:\([^)]*\))?!?:\s*/, '');
  }
}
