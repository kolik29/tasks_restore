import type { TicketRow } from '../interfaces/TicketRow.js';
import type { ReleasedTicketRow } from '../interfaces/ReleasedTicketRow.js';
import { GitRepository } from './GitRepository.js';

export class ReleaseResolver {
  constructor(private readonly repository: GitRepository) {}

  resolve(tickets: TicketRow[]): ReleasedTicketRow[] {
    const releases = new Map<string, string>();

    return tickets.map(ticket => {
      if (!ticket.hash) {
        return { ...ticket, release: '' };
      }

      let release = releases.get(ticket.hash);
      if (release === undefined) {
        const branches = this.repository.getStageBranchesContaining(ticket.hash);
        release = branches[0] ?? 'ХФ';
        releases.set(ticket.hash, release);
      }

      return { ...ticket, release };
    });
  }
}
