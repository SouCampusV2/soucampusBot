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
  /** Panel Order button → this modal; submitting it creates the ticket — customId order_new */
  ORDER_NEW_MODAL: 'order_new',
  /** Summary card: Version & deadline button — customId order_finish:ticketId */
  ORDER_FINISH: 'order_finish',
  /** Version & deadline modal submit — customId order_finish_modal:ticketId */
  ORDER_FINISH_MODAL: 'order_finish_modal',
  /** Legacy (before 2026-10-26): "Fill order form" button in old tickets — now opens the order modal */
  START_ORDER: 'start_order',
  /** Legacy: "Continue — version & details" button in old tickets — now opens Version & deadline */
  ORDER_FORM_2: 'order_form_2',
  /** Submit Order button (under summary, before freelancers see the order) — customId submit_order:ticketId */
  SUBMIT_ORDER: 'submit_order',
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
  /** Client: may the build / the review appear on soucampus.online — site_consent:ticketId:portfolio|review:yes|no */
  SITE_CONSENT: 'site_consent',
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

/** An order still in the form stage this long after opening gets a reminder… */
export const FORM_REMIND_AFTER_MS = 48 * 60 * 60 * 1000;
/** …and is closed this long after the reminder if still unfinished. */
export const FORM_CLOSE_AFTER_REMIND_MS = 24 * 60 * 60 * 1000;

/** How often the cleanup job looks for channels due for deletion. */
export const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Order answers (field names in ticket_fields). Asked in two modals: the order modal from the
 * panel (need, size, theme, budget + reference files) and Version & deadline in the ticket.
 * reference_urls is legacy (text links from the old form) — still shown when present.
 */
export const ORDER_FIELDS = ['need', 'size', 'theme', 'budget', 'version', 'deadline', 'extra_details', 'reference_urls'];

/** Answers an order needs before it can be submitted. Budget is optional since the order modal
 *  (owner's decision 2026-10-26: "Budget and timeframe — leave empty if you don't know yet"). */
export const REQUIRED_ORDER_FIELDS = ['need', 'size', 'theme', 'version', 'deadline'];

/** Ids of the client-channel messages holding the reference files (comma-separated), in ticket_fields. */
export const REFERENCE_MESSAGES_FIELD = 'reference_msgs';

/** Up to this many reference files per order modal (Discord allows 10). */
export const MAX_REFERENCE_FILES = 10;

/** Minecraft version choices (select in the Version & deadline modal). Values are stored. */
export const MINECRAFT_VERSIONS = [
  { label: 'Java 1.21 (latest)', value: '1.21' },
  { label: 'Java 1.20', value: '1.20' },
  { label: 'Java 1.16 – 1.19', value: '1.16-1.19' },
  { label: 'Java 1.13 – 1.15', value: '1.13-1.15' },
  { label: 'Java 1.12 or older', value: '1.12-' },
  { label: 'Bedrock', value: 'bedrock' },
  { label: 'Not sure yet', value: 'not sure' },
];

/** Budget ranges of the old budget menu: stored values of orders before 2026-10-26 → labels. */
// Euros, same currency as soucampus.online (owner's decision 2026-10-25).
export const ORDER_BUDGET_OPTIONS = [
  { label: '<€100', value: '<100' },
  { label: '€100–€500', value: '100-500' },
  { label: '€501–€1000', value: '501-1000' },
  { label: '€1000+', value: '1000+' },
];

/** Rate limit: max 1 ticket per user per 60 seconds */
export const TICKET_CREATE_COOLDOWN_MS = 60_000;
