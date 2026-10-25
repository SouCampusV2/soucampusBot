import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import './helpers/db.js';
import { createTicket, getTicketById } from '../src/modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket, backfillStatus } from '../src/modules/tickets/TicketStatus.js';

const newTicket = (type = 'order') =>
  createTicket({ type, guildId: 'g-status', clientId: 'client', clientChannelId: `ch-${Math.random()}` }).id;

test('a new order starts in the form stage, help and applications start open', () => {
  assert.equal(getTicketById(newTicket('order')).status, STATUS.FORM);
  assert.equal(getTicketById(newTicket('help')).status, STATUS.OPEN);
  assert.equal(getTicketById(newTicket('application')).status, STATUS.OPEN);
});

test('an order walks form → open → assigned → paid → completed → closed', () => {
  const id = newTicket();
  assert.equal(transitionTicket(id, STATUS.OPEN), true);
  assert.equal(transitionTicket(id, STATUS.ASSIGNED, { assignedFreelancerId: 'f1' }), true);
  assert.equal(transitionTicket(id, STATUS.PAID), true);
  assert.equal(transitionTicket(id, STATUS.COMPLETED), true);
  assert.equal(transitionTicket(id, STATUS.CLOSED), true);
  const t = getTicketById(id);
  assert.equal(t.status, STATUS.CLOSED);
  assert.equal(t.assigned_freelancer_id, 'f1');
});

test('skipping a stage is refused and changes nothing', () => {
  const id = newTicket();
  assert.equal(transitionTicket(id, STATUS.PAID), false, 'cannot pay an order still in the form');
  assert.equal(getTicketById(id).status, STATUS.FORM);
});

test('the same transition twice (double click) succeeds only once', () => {
  const id = newTicket();
  transitionTicket(id, STATUS.OPEN);
  transitionTicket(id, STATUS.ASSIGNED, { assignedFreelancerId: 'f1' });
  assert.equal(transitionTicket(id, STATUS.PAID), true);
  assert.equal(transitionTicket(id, STATUS.PAID), false);
});

test('legacy flags are still written so the old code can read the same database', () => {
  const id = newTicket();
  transitionTicket(id, STATUS.OPEN);
  transitionTicket(id, STATUS.ASSIGNED, { assignedFreelancerId: 'f1' });
  transitionTicket(id, STATUS.PAID);
  assert.equal(getTicketById(id).payment_confirmed, 1);
  transitionTicket(id, STATUS.COMPLETED);
  assert.equal(getTicketById(id).completed, 1);
});

test('order-only stages do not exist for help tickets', () => {
  const id = newTicket('help');
  assert.equal(transitionTicket(id, STATUS.PAID), false);
  assert.equal(transitionTicket(id, STATUS.CLOSED), true);
});

test('an unknown ticket id is refused, not thrown', () => {
  assert.equal(transitionTicket('nope', STATUS.OPEN), false);
});

test('backfill derives the status of tickets created before the column existed', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tickets (id TEXT PRIMARY KEY, type TEXT, assigned_freelancer_id TEXT,
      payment_confirmed INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, status TEXT);
    CREATE TABLE ticket_fields (ticket_id TEXT, field_name TEXT, field_value TEXT);
    INSERT INTO tickets (id, type) VALUES ('form', 'order'), ('help', 'help');
    INSERT INTO tickets (id, type) VALUES ('open', 'order');
    INSERT INTO ticket_fields VALUES ('open', 'budget', '1000+');
    INSERT INTO tickets (id, type, assigned_freelancer_id) VALUES ('assigned', 'order', 'f');
    INSERT INTO tickets (id, type, assigned_freelancer_id, payment_confirmed) VALUES ('paid', 'order', 'f', 1);
    INSERT INTO tickets (id, type, assigned_freelancer_id, payment_confirmed, completed) VALUES ('done', 'order', 'f', 1, 1);
  `);
  backfillStatus(db);
  const status = Object.fromEntries(db.prepare('SELECT id, status FROM tickets').all().map((r) => [r.id, r.status]));
  assert.deepEqual(status, {
    form: 'form', help: 'open', open: 'open', assigned: 'assigned', paid: 'paid', done: 'completed',
  });
});
