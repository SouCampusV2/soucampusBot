/**
 * Client consent for the website (phase 4). Nothing about an order reaches soucampus.online
 * unless the client said yes — separately for the build (portfolio) and for their review.
 *
 * site_consent:<ticketId>:<portfolio|review>:<yes|no>
 *   portfolio — asked when the order is marked complete (markComplete.js)
 *   review    — asked right after the review is submitted (submitReviewModal.js)
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../tickets/TicketRepository.js';
import { getReviewByTicketId } from '../reviews/ReviewRepository.js';
import { run } from '../../core/Database.js';
import { enqueue, buildPortfolioDraft, flushOutbox } from './SiteBridge.js';
import { ensureTicketClient } from '../../utils/permissions.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

/** Where each consent is stored: "UPDATE ... WHERE <column> IS NULL" records only the first answer. */
const CONSENT_SQL = {
  portfolio: 'UPDATE tickets SET portfolio_consent = ? WHERE id = ? AND portfolio_consent IS NULL',
  review: 'UPDATE reviews SET site_consent = ? WHERE ticket_id = ? AND site_consent IS NULL',
};

export async function handleSiteConsent(interaction, parts) {
  const [, ticketId, what, answer] = parts;
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (!ticket || !CONSENT_SQL[what] || !['yes', 'no'].includes(answer)) {
    await interaction.reply({ content: 'Invalid data.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await ensureTicketClient(interaction, ticket))) return;

  const yes = answer === 'yes';
  const { changes } = run(CONSENT_SQL[what], [yes ? 1 : 0, ticketId]);
  if (!changes) {
    await interaction.reply({ content: 'You have already answered this. Thank you!', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await interaction.update({
      content: yes
        ? '✅ Thank you! The SouCampus team will review it before anything appears on the website.'
        : '👍 Got it — it stays private.',
      components: [],
    });
    if (!yes) return;
    if (what === 'portfolio') {
      enqueue('portfolio_draft', `portfolio:${ticketId}`, await buildPortfolioDraft(interaction.client, ticket));
    } else {
      const review = getReviewByTicketId(ticketId);
      if (review) {
        enqueue('review', `review:${ticketId}`, {
          ticketId,
          rating: review.rating,
          comment: review.comment ?? '',
          // The client agreed to show THEIR review — their display name signs it.
          name: interaction.member?.displayName || interaction.user.username,
        });
      }
    }
    // Deliver now if the site is configured; otherwise the cleanup sweep retries later.
    flushOutbox().catch((err) => logger.warn('Immediate website flush failed', { error: err.message }));
    logger.info('Website consent given', { ticketId, what });
  } catch (err) {
    logger.error('site_consent failed', { ticketId, what, error: err.message });
    await replyError(interaction, 'Saved your answer, but sending it on failed — the team will see it.');
  }
}
