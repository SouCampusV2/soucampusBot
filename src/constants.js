/**
 * No magic strings — customId prefixes, role names, ticket types.
 */

export const ROLES = {
  CLIENT: 'Client',
  FREELANCER: 'Freelancer',
  MANAGER: 'Manager',
  ADMIN: 'Admin',
};

export const TICKET_TYPES = {
  ORDER: 'order',
  HELP: 'help',
  APPLICATION: 'application',
};

/** customId prefixes for InteractionRouter */
export const PREFIX = {
  CREATE_TICKET: 'create_ticket',
  SELECT_TICKET_TYPE: 'select_ticket_type',
  CONFIRM_TICKET: 'confirm_ticket',
  /** Order dialog: start form (button) — customId start_order:ticketId */
  START_ORDER: 'start_order',
  /** Order form part 1 modal submit (5 fields) — customId order_form_1:ticketId */
  ORDER_FORM_1: 'order_form_1',
  /** Order form part 2 button — customId order_form_2:ticketId */
  ORDER_FORM_2: 'order_form_2',
  /** Order form part 2 modal submit (version, extra_details) — customId order_form_2_modal:ticketId */
  ORDER_FORM_2_MODAL: 'order_form_2_modal',
  /** Order dialog: budget select menu — customId order_budget:ticketId */
  ORDER_BUDGET: 'order_budget',
  /** Edit Order button (under summary) — customId edit_order:ticketId */
  EDIT_ORDER: 'edit_order',
  /** Edit Order modal submit — customId edit_order_modal:ticketId */
  EDIT_ORDER_MODAL: 'edit_order_modal',
  /** Freelancer channel: Submit Quote — customId submit_quote:ticketId */
  SUBMIT_QUOTE: 'submit_quote',
  /** Freelancer: Send Message — customId send_message:ticketId */
  SEND_MESSAGE: 'send_message',
  /** Freelancer: Not Interested — customId decline_order:ticketId */
  DECLINE_ORDER: 'decline_order',
  /** Submit Quote modal submit — customId submit_quote_modal:ticketId */
  SUBMIT_QUOTE_MODAL: 'submit_quote_modal',
  /** Accept a quote = select this freelancer (client only) — customId select_freelancer:ticketId:freelancerId */
  SELECT_FREELANCER: 'select_freelancer',
  /** Contact freelancer — create discussion thread (client only) — customId contact_freelancer:ticketId:freelancerId */
  CONTACT_FREELANCER: 'contact_freelancer',
  /** Close discussion thread — customId close_discussion:ticketId:threadId */
  CLOSE_DISCUSSION: 'close_discussion',
  /** Decline quote with reason (client only) — customId decline_quote:ticketId:proposalId:reason (reason=price|portfolio|deadline) */
  DECLINE_QUOTE: 'decline_quote',
  /** Send Message modal submit (freelancer) — customId send_message_modal:ticketId */
  SEND_MESSAGE_MODAL: 'send_message_modal',
  /** Reply to relay message (client or freelancer) — customId reply_relay:ticketId */
  REPLY_RELAY: 'reply_relay',
  /** Reply relay modal submit — customId reply_relay_modal:ticketId */
  REPLY_RELAY_MODAL: 'reply_relay_modal',
  /** Manager: Confirm Payment Received (STEP 8) — customId confirm_payment:ticketId */
  CONFIRM_PAYMENT: 'confirm_payment',
  /** Manager: Extend Deadline (STEP 9) — customId extend_deadline:ticketId */
  EXTEND_DEADLINE: 'extend_deadline',
  /** Extend Deadline modal submit — customId extend_deadline_modal:ticketId */
  EXTEND_DEADLINE_MODAL: 'extend_deadline_modal',
  /** Manager: Mark as Complete (STEP 10) — customId mark_complete:ticketId */
  MARK_COMPLETE: 'mark_complete',
  /** Client: Submit Review — customId submit_review:ticketId */
  SUBMIT_REVIEW: 'submit_review',
  /** Submit Review modal — customId submit_review_modal:ticketId */
  SUBMIT_REVIEW_MODAL: 'submit_review_modal',
  /** Close a ticket of any type (client or manager, see canCloseTicket) — customId close_ticket:ticketId */
  CLOSE_TICKET: 'close_ticket',
  /** Manager: keep a closed ticket's channel instead of deleting it — customId keep_channel:ticketId */
  KEEP_CHANNEL: 'keep_channel',
  /** Applicant: open (or edit) the team application form — customId start_application:ticketId */
  START_APPLICATION: 'start_application',
  /** Team application modal submit — customId application_modal:ticketId */
  APPLICATION_MODAL: 'application_modal',
  /** Manager: accept an application (gives the Freelancer role) — customId accept_application:ticketId */
  ACCEPT_APPLICATION: 'accept_application',
  /** Manager: reject an application, opens the reason modal — customId reject_application:ticketId */
  REJECT_APPLICATION: 'reject_application',
  /** Reject reason modal submit — customId reject_application_modal:ticketId */
  REJECT_APPLICATION_MODAL: 'reject_application_modal',
};

/** Team application form: field key (in ticket_fields, prefixed app_) -> modal label. Discord allows 5 inputs. */
export const APPLICATION_FIELDS = {
  about: 'About you',
  experience: 'Building experience',
  specialty: 'Styles / specialty',
  timezone: 'Timezone',
  portfolio: 'Portfolio links',
};

/** A closed ticket's channel is deleted this long after closing, unless a manager keeps it. */
export const CHANNEL_DELETE_DELAY_MS = 48 * 60 * 60 * 1000;

/** How often the cleanup job looks for channels due for deletion. */
export const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/** Order dialog: question labels (field names in ticket_fields). Step 8 = budget (Select Menu). */
export const ORDER_QUESTION_KEYS = [
  'need',           // 1. What are you in need of?
  'deadline',       // 2. When is the deadline?
  'reference_urls', // 3. Do you have any reference images? (URLs)
  'size',           // 4. What size would you like your build to be?
  'theme',          // 5. What theme would you like your build to be?
  'version',        // 6. What version do you want your product in?
  'extra_details',  // 7. Would you like to add any more details?
  'budget',         // 8. What is your budget? (Select Menu)
];

/** Budget options for order dialog step 8 (Select Menu values). */
// Euros, same currency as soucampus.online (owner's decision 2026-10-25). Values are unchanged,
// so budgets already saved in ticket_fields keep meaning the same ranges.
export const ORDER_BUDGET_OPTIONS = [
  { label: '<€100', value: '<100' },
  { label: '€100–€500', value: '100-500' },
  { label: '€501–€1000', value: '501-1000' },
  { label: '€1000+', value: '1000+' },
];

/** Rate limit: max 1 ticket per user per 60 seconds */
export const TICKET_CREATE_COOLDOWN_MS = 60_000;
