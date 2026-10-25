/**
 * Slash command /setup — configure the bot for THIS server (admin only).
 * Stores values in guild_config so the bot can be added to any server and configured in-Discord.
 *
 * Subcommands:
 *   /setup active_orders   <category>   — category for new order/help/application tickets
 *   /setup quotes          <category>   — category for freelancer quote channels
 *   /setup archived        <category>   — category completed tickets are moved to
 *   /setup reviews         <channel>    — channel where reviews are posted
 *   /setup manager_role    <role>       — the Manager role
 *   /setup freelancer_role <role>       — the Freelancer role
 *   /setup color           <hex>        — brand color for embeds (e.g. #5865F2)
 *   /setup panel           [channel]    — post the ticket panel (defaults to current channel)
 *   /setup view                          — show current configuration
 */

import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { setSetting, getGuildConfig } from '../core/GuildConfig.js';
import { getTicketPanelPayload } from '../embeds/templates.js';
import { replyError } from '../utils/replies.js';
import { logger } from '../utils/logger.js';

export const setupCommandData = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the ticket bot for this server (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName('active_orders').setDescription('Category for new ticket channels')
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
    s.setName('manager_role').setDescription('The Manager role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
  .addSubcommand((s) =>
    s.setName('freelancer_role').setDescription('The Freelancer role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
  .addSubcommand((s) =>
    s.setName('color').setDescription('Brand color for embeds (hex, e.g. #5865F2)')
      .addStringOption((o) => o.setName('hex').setDescription('#RRGGBB').setRequired(true)))
  .addSubcommand((s) =>
    s.setName('panel').setDescription('Post the ticket panel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (defaults to here)').addChannelTypes(ChannelType.GuildText).setRequired(false)))
  .addSubcommand((s) => s.setName('view').setDescription('Show current configuration'))
  .toJSON();

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export async function handleSetupCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'setup') return;
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  try {
    switch (sub) {
      case 'active_orders':
      case 'quotes':
      case 'archived': {
        const key = { active_orders: 'category_active_orders', quotes: 'category_quotes', archived: 'category_archived' }[sub];
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
      case 'manager_role':
      case 'freelancer_role': {
        const key = sub === 'manager_role' ? 'role_manager' : 'role_freelancer';
        const role = interaction.options.getRole('role');
        setSetting(guildId, key, role.id);
        await interaction.reply({ content: `✅ Set **${sub.replace('_', ' ')}** to <@&${role.id}>.`, flags: MessageFlags.Ephemeral });
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
        await channel.send(getTicketPanelPayload(guildId));
        setSetting(guildId, 'channel_panel', channel.id);
        await interaction.reply({ content: `✅ Ticket panel posted in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
        return;
      }
      case 'view': {
        const cfg = getGuildConfig(guildId);
        const line = (label, val, kind) => {
          if (!val) return `• **${label}**: _not set_`;
          if (kind === 'channel') return `• **${label}**: <#${val}>`;
          if (kind === 'role') return `• **${label}**: <@&${val}>`;
          return `• **${label}**: \`${val}\``;
        };
        const text = [
          line('Active orders category', cfg.category_active_orders, 'channel'),
          line('Quotes category', cfg.category_quotes, 'channel'),
          line('Archived category', cfg.category_archived, 'channel'),
          line('Reviews channel', cfg.channel_reviews, 'channel'),
          line('Panel channel', cfg.channel_panel, 'channel'),
          line('Manager role', cfg.role_manager, 'role'),
          line('Freelancer role', cfg.role_freelancer, 'role'),
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
