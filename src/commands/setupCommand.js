/**
 * Slash command /setup — configure the bot for THIS server (admin only).
 * Stores values in guild_config so the bot can be added to any server and configured in-Discord.
 *
 * Subcommands:
 *   /setup active_orders   <category>   — category for order tickets (fallback for the others)
 *   /setup help_category   <category>   — category for support tickets
 *   /setup applications_category <category> — category for team applications
 *   /setup quotes          <category>   — category for freelancer quote channels
 *   /setup archived        <category>   — category completed tickets are moved to
 *   /setup reviews         <channel>    — channel where reviews are posted
 *   /setup manager_role    <role> [role2..role5] — manager roles (replaces the list; e.g. Moderator + Commission Team)
 *   /setup freelancer_role <role> [role2..role5] — builder roles (replaces the list; the first is given on an accepted application)
 *   /setup color           <hex>        — brand color for embeds (e.g. #5865F2)
 *   /setup panel           [channel]    — post the ticket panel, or update ours in place
 *   /setup links [terms] [privacy] [banner] — legal links and banner on the panel
 *   /setup log_channel     <channel>    — staff log: one line per ticket event
 *   /setup client_roles [client] [notable] [vip] — roles given after a paid order (see ClientTiers.js)
 *   /setup notify          [who]        — person/role pinged in every new ticket and quote channel (empty = off)
 *   /setup site_channel <kind> <channel> [new_link] — webhook the website posts through:
 *                          portfolio / premade / free builds / announcements (one link per kind)
 *   /setup showcase_channel, announcements_channel — the same for one kind (older names, kept)
 *   /setup rules           [channel] [image] — post the rules card, or update ours in place
 *   /setup staff_channels                — Staff category: #staff-announcements + #staff-chat (managers + builders)
 *   /setup view                          — show current configuration
 */

import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { setSetting, getSetting, getGuildConfig } from '../core/GuildConfig.js';
import { upsertPanel } from '../utils/panel.js';
import { SITE_CHANNELS, connectSiteChannel } from '../modules/site/showcaseWebhook.js';
import { upsertRules } from '../utils/rules.js';
import { parseReactionList } from '../modules/site/showcaseReactions.js';
import { ensureStaffChannels, STAFF_ROLES_MISSING } from '../modules/staff/staffChannels.js';
import { replyError } from '../utils/replies.js';
import { logger } from '../utils/logger.js';

/** Option names of a role list: role (required) and role2..role5. */
const ROLE_LIST_OPTIONS = ['role', 'role2', 'role3', 'role4', 'role5'];

function addRoleList(sub) {
  for (const [n, name] of ROLE_LIST_OPTIONS.entries()) {
    sub.addRoleOption((o) => o.setName(name).setDescription(n ? 'One more role' : 'Role').setRequired(n === 0));
  }
  return sub;
}

export const setupCommandData = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the ticket bot for this server (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName('active_orders').setDescription('Category for order tickets (and other types without their own)')
      .addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('help_category').setDescription('Category for support tickets')
      .addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('applications_category').setDescription('Category for team applications')
      .addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('quotes').setDescription('Category for freelancer quote channels')
      .addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('archived').setDescription('Category for archived/completed tickets')
      .addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('reviews').setDescription('Channel where reviews are posted')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) =>
    addRoleList(s.setName('manager_role').setDescription('Manager roles — replaces the list (up to 5)')))
  .addSubcommand((s) =>
    addRoleList(s.setName('freelancer_role').setDescription('Builder roles — replaces the list (up to 5, the first is the main one)')))
  .addSubcommand((s) =>
    s.setName('color').setDescription('Brand color for embeds (hex, e.g. #5865F2)')
      .addStringOption((o) => o.setName('hex').setDescription('#RRGGBB').setRequired(true)))
  .addSubcommand((s) =>
    s.setName('panel').setDescription('Post the ticket panel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to here)').addChannelTypes(ChannelType.GuildText).setRequired(false)))
  .addSubcommand((s) =>
    s.setName('log_channel').setDescription('Staff log channel: one line per ticket event')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel (staff only)').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) =>
    s.setName('client_roles').setDescription('Roles for clients after paid orders: Client (1), Notable (5 + 500), VIP (10 + 1000)')
      .addRoleOption((o) => o.setName('client').setDescription('First paid order'))
      .addRoleOption((o) => o.setName('notable').setDescription('5+ paid orders and 500+ in total'))
      .addRoleOption((o) => o.setName('vip').setDescription('10+ paid orders and 1000+ in total')))
  .addSubcommand((s) =>
    s.setName('notify').setDescription('Who gets pinged in every new ticket and quote channel')
      .addMentionableOption((o) => o.setName('who').setDescription('A person or a role; leave empty to turn pings off')))
  .addSubcommand((s) =>
    s.setName('site_channel').setDescription('Channel the website posts to (gives a webhook link)')
      .addStringOption((o) =>
        o.setName('kind').setDescription('What the website posts there').setRequired(true).addChoices(
          { name: 'Portfolio', value: 'portfolio' },
          { name: 'Premade builds', value: 'premade' },
          { name: 'Free builds', value: 'free' },
          { name: 'Announcements', value: 'announcements' }
        ))
      .addChannelOption((o) => o.setName('channel').setDescription('Text or announcement channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addBooleanOption((o) => o.setName('new_link').setDescription('Issue a new link; the old one stops working')))
  .addSubcommand((s) =>
    s.setName('showcase_channel').setDescription('Channel the website posts portfolio works to (same as site_channel kind:Portfolio)')
      .addChannelOption((o) => o.setName('channel').setDescription('Text or announcement channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addBooleanOption((o) => o.setName('new_link').setDescription('Issue a new link; the old one stops working')))
  .addSubcommand((s) =>
    s.setName('announcements_channel').setDescription('Channel the website posts announcements to (same as site_channel kind:Announcements)')
      .addChannelOption((o) => o.setName('channel').setDescription('Text or announcement channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addBooleanOption((o) => o.setName('new_link').setDescription('Issue a new link; the old one stops working')))
  .addSubcommand((s) =>
    s.setName('rules').setDescription('Post the server rules, or update ours in place')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to the last one used, else here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName('image').setDescription('Picture under the rules (https://…); "none" removes it')))
  .addSubcommand((s) =>
    s.setName('links').setDescription('Links and banner on the ticket panel')
      .addStringOption((o) => o.setName('terms').setDescription('Terms page (https://…)'))
      .addStringOption((o) => o.setName('privacy').setDescription('Privacy page (https://…)'))
      .addStringOption((o) => o.setName('banner').setDescription('Banner image on top of the panel (https://…)')))
  .addSubcommand((s) =>
    s.setName('showcase_reactions').setDescription('Reactions the bot adds under website posts (portfolio, premade, free)')
      .addStringOption((o) => o.setName('emojis').setDescription('Up to 10 emoji, space-separated (empty = none)').setRequired(false)))
  .addSubcommand((s) =>
    s.setName('staff_channels').setDescription('Create #staff-announcements and #staff-chat (managers + builders only)'))
  .addSubcommand((s) => s.setName('view').setDescription('Show current configuration'))
  .toJSON();

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export async function handleSetupCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'setup') return;
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }
  // Discord hides /setup from non-admins by default, but a server can override that in
  // Integrations — so the handler checks again. Manager roles are NOT enough: /setup decides who
  // the managers are.
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only server administrators can run /setup.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  try {
    switch (sub) {
      case 'active_orders':
      case 'help_category':
      case 'applications_category':
      case 'quotes':
      case 'archived': {
        const key = {
          active_orders: 'category_active_orders',
          help_category: 'category_help',
          applications_category: 'category_applications',
          quotes: 'category_quotes',
          archived: 'category_archived',
        }[sub];
        const category = interaction.options.getChannel('category');
        setSetting(guildId, key, category.id);
        await interaction.reply({ content: `✅ Set **${sub}** category to **${category.name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      case 'reviews': {
        const channel = interaction.options.getChannel('channel');
        setSetting(guildId, 'channel_reviews', channel.id);
        await interaction.reply({ content: `✅ Reviews will be posted in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
        return;
      }
      case 'site_channel':
      case 'showcase_channel':
      case 'announcements_channel': {
        const kind = { showcase_channel: 'portfolio', announcements_channel: 'announcements' }[sub] ?? interaction.options.getString('kind');
        const meta = SITE_CHANNELS[kind];
        const channel = interaction.options.getChannel('channel');
        const rotate = interaction.options.getBoolean('new_link') ?? false;
        // Fetching/creating webhooks is a few API calls — answer within Discord's 3 seconds first.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const webhook = await connectSiteChannel(kind, channel, interaction.client.user.id, { rotate });
        await interaction.editReply({
          content:
            `✅ The website will post ${meta.label} in <#${channel.id}>.\n` +
            `Put this link into the site’s environment as **${meta.env}** (Vercel → Settings → Environment Variables):\n` +
            `||${webhook.url}||\n` +
            '⚠️ Treat it like a password: anyone with it can post in that channel. Leaked? Run this again with `new_link: true`.',
        });
        return;
      }
      case 'rules': {
        const image = interaction.options.getString('image')?.trim();
        if (image && image.toLowerCase() !== 'none' && !/^https:\/\//.test(image)) {
          await interaction.reply({ content: '**image** must be an https:// link (or `none`).', flags: MessageFlags.Ephemeral });
          return;
        }
        // Fetching and editing the old post can exceed Discord's 3 seconds.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const savedId = getSetting(guildId, 'channel_rules');
        const channel =
          interaction.options.getChannel('channel') ||
          (savedId && (await interaction.client.channels.fetch(savedId).catch(() => null))) ||
          interaction.channel;
        if (image) setSetting(guildId, 'rules_image_url', image.toLowerCase() === 'none' ? '' : image);
        const result = await upsertRules(channel);
        await interaction.editReply({
          content: result === 'updated' ? `✅ Rules updated in <#${channel.id}>.` : `✅ Rules posted in <#${channel.id}>.`,
        });
        return;
      }
      case 'showcase_reactions': {
        const text = interaction.options.getString('emojis')?.trim() ?? '';
        const list = parseReactionList(text);
        if (!list) {
          await interaction.reply({
            content: 'Give up to 10 emoji separated by spaces — normal ones (🔥) or this server’s (:name:). Empty = no reactions.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        setSetting(guildId, 'showcase_reactions', list.join(' '));
        await interaction.reply({
          content: list.length ? `✅ New showcase posts will get: ${list.join(' ')}` : '✅ Showcase posts will get no reactions.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case 'log_channel': {
        const channel = interaction.options.getChannel('channel');
        setSetting(guildId, 'channel_log', channel.id);
        await interaction.reply({
          content: `✅ Ticket events will be logged in <#${channel.id}>. Keep it visible to staff only.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case 'client_roles': {
        const given = ['client', 'notable', 'vip'].filter((o) => interaction.options.getRole(o));
        for (const option of given) setSetting(guildId, `role_${option}`, interaction.options.getRole(option).id);
        await interaction.reply({
          content: given.length
            ? `✅ Saved: ${given.map((o) => `${o} → <@&${interaction.options.getRole(o).id}>`).join(', ')}. The bot role must be above these roles to give them.`
            : 'Give at least one of: client, notable, vip.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      case 'notify': {
        const who = interaction.options.getMentionable('who');
        if (!who) {
          setSetting(guildId, 'notify_target', null);
          await interaction.reply({ content: '✅ New channels will not ping anyone.', flags: MessageFlags.Ephemeral });
          return;
        }
        const isRole = interaction.options.getRole('who') != null;
        setSetting(guildId, 'notify_target', `${isRole ? 'role' : 'user'}:${who.id}`);
        const mention = isRole ? `<@&${who.id}>` : `<@${who.id}>`;
        await interaction.reply({
          content: `✅ ${mention} will be pinged in every new ticket and quote channel.`
            + (isRole ? ' The role must be mentionable, or the bot needs "Mention all roles".' : ''),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      case 'manager_role':
      case 'freelancer_role': {
        const key = sub === 'manager_role' ? 'role_manager' : 'role_freelancer';
        const ids = [...new Set(ROLE_LIST_OPTIONS.map((n) => interaction.options.getRole(n)?.id).filter(Boolean))];
        setSetting(guildId, key, ids.join(','));
        const what = sub === 'manager_role' ? 'Manager roles' : 'Builder roles';
        await interaction.reply({
          content: `✅ **${what}**: ${ids.map((id) => `<@&${id}>`).join(', ')}.`
            + ' Channels made before keep their old permissions — run `/setup staff_channels` again to refresh the staff channels.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      case 'color': {
        const hex = interaction.options.getString('hex').trim();
        if (!HEX_RE.test(hex)) {
          await interaction.reply({ content: 'Please provide a valid hex color, e.g. `#5865F2`.', flags: MessageFlags.Ephemeral });
          return;
        }
        setSetting(guildId, 'brand_color', hex.startsWith('#') ? hex : `#${hex}`);
        await interaction.reply({ content: `✅ Brand color set to \`${hex}\`.`, flags: MessageFlags.Ephemeral });
        return;
      }
      case 'panel': {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        // Answer first: posting/editing the panel can exceed Discord's 3 seconds (it did, 26.10).
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await upsertPanel(channel, interaction.client.user.id);
        setSetting(guildId, 'channel_panel', channel.id);
        await interaction.editReply({
          content: result === 'updated' ? `✅ Ticket panel updated in <#${channel.id}>.` : `✅ Ticket panel posted in <#${channel.id}>.`,
        });
        return;
      }
      case 'links': {
        const changes = { terms: 'terms_url', privacy: 'privacy_url', banner: 'panel_banner_url' };
        const given = Object.entries(changes).filter(([option]) => interaction.options.getString(option));
        for (const [option] of given) {
          if (!/^https:\/\//.test(interaction.options.getString(option).trim())) {
            await interaction.reply({ content: `**${option}** must be an https:// link.`, flags: MessageFlags.Ephemeral });
            return;
          }
        }
        for (const [option, key] of given) setSetting(guildId, key, interaction.options.getString(option).trim());
        await interaction.reply({
          content: given.length
            ? `✅ Saved: ${given.map(([o]) => o).join(', ')}. Run \`/setup panel\` to refresh the panel.`
            : 'Give at least one of: terms, privacy, banner.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case 'staff_channels': {
        // Category + two channels + intro posts: well over Discord's 3 seconds.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await ensureStaffChannels(interaction.guild, interaction.client.user.id);
        if (!result) {
          await interaction.editReply({ content: STAFF_ROLES_MISSING });
          return;
        }
        const [announcements, chat] = result.channels;
        await interaction.editReply({
          content:
            (result.created ? '✅ Staff channels created: ' : '✅ Staff channels already exist — permissions refreshed: ') +
            `<#${announcements.id}> (managers post, builders read) and <#${chat.id}> (managers and builders).`,
        });
        return;
      }
      case 'view': {
        const cfg = getGuildConfig(guildId);
        const line = (label, val, kind) => {
          if (!val) return `• **${label}**: _not set_`;
          if (kind === 'channel') return `• **${label}**: <#${val}>`;
          if (kind === 'role') return `• **${label}**: ${val.split(',').map((id) => `<@&${id}>`).join(', ')}`;
          return `• **${label}**: \`${val}\``;
        };
        const text = [
          line('Orders category', cfg.category_active_orders, 'channel'),
          line('Support category', cfg.category_help, 'channel'),
          line('Applications category', cfg.category_applications, 'channel'),
          line('Quotes category', cfg.category_quotes, 'channel'),
          line('Archived category', cfg.category_archived, 'channel'),
          line('Reviews channel', cfg.channel_reviews, 'channel'),
          line('Panel channel', cfg.channel_panel, 'channel'),
          line('Staff log channel', cfg.channel_log, 'channel'),
          line('Showcase channel', cfg.channel_showcase, 'channel'),
          line('Announcements channel', cfg.channel_announcements, 'channel'),
          line('Premade channel', cfg.channel_premade, 'channel'),
          line('Free builds channel', cfg.channel_free, 'channel'),
          line('Rules channel', cfg.channel_rules, 'channel'),
          line('Rules picture', cfg.rules_image_url, 'text'),
          line('Staff announcements', cfg.channel_staff_announcements, 'channel'),
          line('Staff chat', cfg.channel_staff_chat, 'channel'),
          line('Showcase reactions', cfg.showcase_reactions, 'text'),
          line('Terms link', cfg.terms_url, 'text'),
          line('Privacy link', cfg.privacy_url, 'text'),
          line('Panel banner', cfg.panel_banner_url, 'text'),
          line('Manager roles', cfg.role_manager, 'role'),
          line('Builder roles', cfg.role_freelancer, 'role'),
          line('Client role (1 order)', cfg.role_client, 'role'),
          line('Notable client role', cfg.role_notable, 'role'),
          line('VIP client role', cfg.role_vip, 'role'),
          cfg.notify_target
            ? `• **Pinged in new channels**: ${cfg.notify_target.startsWith('role:') ? `<@&${cfg.notify_target.slice(5)}>` : `<@${cfg.notify_target.slice(5)}>`}`
            : line('Pinged in new channels', null),
          line('Brand color', cfg.brand_color, 'text'),
        ].join('\n');
        await interaction.reply({ content: `**Current configuration**\n${text}\n\n_Unset values fall back to .env if present._`, flags: MessageFlags.Ephemeral });
        return;
      }
      default:
        await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.error('setup command failed', { sub, error: err.message });
    await replyError(interaction, 'Failed to update configuration.');
  }
}
