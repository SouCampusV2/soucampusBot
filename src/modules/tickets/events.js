/**
 * Ticket event bus. Domain code announces what happened; features that react (order card,
 * staff log, …) subscribe in TicketModule. A new reaction = a new listener, not an edit in
 * every handler that can change a ticket.
 *
 * Events:
 *   'created' { ticketId, type, guildId, clientId }
 *   'status'  { ticketId, type, guildId, from, to }
 *   'review'  { ticketId, guildId, rating }
 *
 * Listeners must not throw (they run inside the emitter's call); async listeners catch their own errors.
 */

import { EventEmitter } from 'node:events';

export const ticketEvents = new EventEmitter();
