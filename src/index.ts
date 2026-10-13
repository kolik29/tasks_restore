import { CliOptions } from './classes/CliOptions.js';
import { GitRepository } from './classes/GitRepository.js';
import { TicketCollector } from './classes/TicketCollector.js';
import { TicketCsvWriter } from './classes/TicketCsvWriter.js';
import { ReleaseResolver } from './classes/ReleaseResolver.js';

function main(): void {
  const options = CliOptions.parse();
  
  if (!options) {
    return;
  }

  const repository = new GitRepository(options.repositoryPath);
  const commits = repository.getCommits(options.since, options.users);
  const tickets = new TicketCollector().collect(commits);
  const releasedTickets = new ReleaseResolver(repository).resolve(tickets);

  const outputPath = options.outputPath;

  new TicketCsvWriter().write(outputPath, releasedTickets);

  const ticketCount = new Set(tickets.map(row => row.ticket)).size;

  console.log(`Сохранено тикетов: ${ticketCount}. Строк: ${tickets.length}. Файл: ${outputPath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Ошибка: ${message}`);
  process.exitCode = 1;
}
