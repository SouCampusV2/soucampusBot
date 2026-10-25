/**
 * Test database: a fresh in-memory SQLite per test process (node --test runs each file
 * in its own process), with the real schema and migrations applied.
 */

import { initDatabase } from '../../src/core/Database.js';
import { createTicket, saveTicketField, setFreelancerChannelId } from '../../src/modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket } from '../../src/modules/tickets/TicketStatus.js';
import { createProposal, acceptProposal } from '../../src/modules/proposals/ProposalRepository.js';
import { setSetting } from '../../src/core/GuildConfig.js';

initDatabase(':memory:');

export { setSetting };

/**
 * Create an order ticket in the DB, optionally further along the lifecycle.
 * By default the order has finished its form (status open); `inForm` keeps it in the form stage.
 * @param {{ guildId: string, clientId: string, clientChannelId: string, freelancerChannelId?: string,
 *           assignedFreelancerId?: string, completed?: boolean, paid?: boolean, inForm?: boolean }} opts
 * @returns {string} ticketId
 */
export function seedOrder(opts) {
  const { id } = createTicket({
    type: 'order',
    guildId: opts.guildId,
    clientId: opts.clientId,
    clientChannelId: opts.clientChannelId,
  });
  saveTicketField(id, 'need', 'A spawn castle');
  for (const [name, value] of Object.entries(opts.fields ?? {})) saveTicketField(id, name, value);
  if (opts.inForm) return id;
  transitionTicket(id, STATUS.OPEN);
  if (opts.freelancerChannelId) setFreelancerChannelId(id, opts.freelancerChannelId);
  if (opts.assignedFreelancerId) {
    const { id: proposalId } = createProposal({
      ticketId: id,
      freelancerId: opts.assignedFreelancerId,
      price: '€200',
      deadline: '2026-12-01',
      message: '',
    });
    acceptProposal(proposalId, id, opts.assignedFreelancerId);
  }
  if (opts.paid || opts.completed) transitionTicket(id, STATUS.PAID);
  if (opts.completed) transitionTicket(id, STATUS.COMPLETED);
  return id;
}
