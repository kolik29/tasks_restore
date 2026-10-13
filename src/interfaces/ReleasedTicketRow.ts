import type { TicketRow } from './TicketRow.js';

export interface ReleasedTicketRow extends TicketRow {
  release: string;
}
