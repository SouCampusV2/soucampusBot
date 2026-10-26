/**
 * Minimal fakes of discord.js objects for handler tests.
 * They record what the bot did (replies, sent messages, permission edits, DMs)
 * instead of talking to Discord, so a test can assert on the recorded calls.
 */

import { Collection, PermissionFlagsBits } from 'discord.js';

let seq = 0;
export const nextId = () => String(100000 + ++seq);

export function fakeRole(name, id = nextId()) {
  return { id, name };
}

export function fakeGuild({ id = 'guild-1', roles = [] } = {}) {
  const guild = {
    id,
    roles: { cache: new Collection(roles.map((r) => [r.id, r])) },
    members: { fetch: async (userId) => guild._members.get(userId) ?? null },
    _members: new Map(),
    createdChannels: [],
    channels: {
      fetch: async (id) => guild.createdChannels.find((c) => c.id === id && !c.deleted) ?? null,
      create: async (options) => {
        const channel = fakeChannel(guild, { parentId: options.parent ?? null });
        channel.name = options.name;
        channel.type = options.type;
        channel.permissionOverwritesOnCreate = options.permissionOverwrites;
        guild.createdChannels.push(channel);
        return channel;
      },
    },
  };
  return guild;
}

export function fakeMember(guild, { id = nextId(), roles = [], admin = false, name } = {}) {
  const displayName = name ?? `user-${id}`;
  const member = {
    id,
    guild,
    displayName,
    user: { id, username: displayName, displayName },
    roles: {
      cache: new Collection(roles.map((r) => [r.id, r])),
      async add(roleId) {
        member.roles.cache.set(roleId, guild.roles.cache.get(roleId) ?? { id: roleId });
      },
    },
    permissions: { has: (perm) => admin && perm === PermissionFlagsBits.Administrator },
  };
  guild._members.set(id, member);
  return member;
}

export function fakeChannel(guild, { id = nextId(), parentId = null } = {}) {
  const channel = {
    id,
    guild,
    guildId: guild?.id,
    parentId,
    sent: [],
    overwrites: [],
    posted: new Map(),
    async send(payload) {
      const data = typeof payload === 'string' ? { content: payload } : payload;
      channel.sent.push(data);
      const message = {
        id: nextId(),
        ...data,
        // Uploaded files come back as attachments with a url, like real messages.
        attachments: new Collection((data.files ?? []).map((f, n) => [String(n), { url: f.attachment, name: f.name }])),
        async edit(p) {
          Object.assign(message, typeof p === 'string' ? { content: p } : p);
          return message;
        },
      };
      channel.posted.set(message.id, message);
      return message;
    },
    messages: {
      fetch: async (id) => {
        const message = channel.posted.get(id);
        if (!message) throw new Error('Unknown Message');
        return message;
      },
    },
    permissionOverwrites: {
      async set(list) {
        channel.permissionOverwritesOnCreate = list;
      },
      async edit(target, perms) {
        channel.overwrites.push({ target: typeof target === 'string' ? target : target.id, perms });
      },
    },
    async setParent(newParentId) {
      channel.parentId = newParentId;
    },
    deleted: false,
    async delete() {
      channel.deleted = true;
    },
    isThread: () => false,
  };
  return channel;
}

export function fakeClient(channels = []) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const dms = [];
  return {
    dms,
    user: { id: 'bot-user' },
    channels: { fetch: async (id) => byId.get(id) ?? null },
    users: {
      fetch: async (id) => ({
        id,
        username: `user-${id}`,
        displayName: `user-${id}`,
        send: async (content) => dms.push({ to: id, content }),
      }),
    },
  };
}

/**
 * Fake interaction. Enforces Discord's "answer once" rule: a second reply/update throws,
 * just like the real API does.
 */
export function fakeInteraction({ client, member, guild, channel, fields = {}, selects = {}, files = {}, values, message } = {}) {
  const user = {
    ...member.user,
    send: async (content) => client?.dms.push({ to: member.id, content }),
  };
  const interaction = {
    client,
    member,
    user,
    guild,
    guildId: guild?.id,
    channel,
    values,
    message: message ?? { content: '', embeds: [] },
    replied: false,
    deferred: false,
    calls: [],
    fields: {
      getTextInputValue: (key) => fields[key] ?? '',
      getStringSelectValues: (key) => selects[key] ?? [],
      // Modal file uploads: { field_references: [{ url, name }] }; null when none, like discord.js.
      getUploadedFiles: (key) => (files[key] ? new Collection(files[key].map((f, n) => [String(n), f])) : null),
    },
  };
  const acknowledged = () => interaction.replied || interaction.deferred;
  const answer = (kind) => async (payload) => {
    if (acknowledged()) throw new Error(`Interaction already acknowledged (tried ${kind})`);
    interaction.replied = true;
    interaction.calls.push({ kind, payload });
  };
  const defer = (kind) => async (payload) => {
    if (acknowledged()) throw new Error(`Interaction already acknowledged (tried ${kind})`);
    interaction.deferred = true;
    interaction.calls.push({ kind, payload });
  };
  const afterAck = (kind) => async (payload) => {
    if (!acknowledged()) throw new Error(`${kind} before the interaction was acknowledged`);
    interaction.calls.push({ kind, payload });
  };
  interaction.reply = answer('reply');
  interaction.update = answer('update');
  interaction.showModal = answer('showModal');
  interaction.deferReply = defer('deferReply');
  interaction.deferUpdate = defer('deferUpdate');
  interaction.editReply = afterAck('editReply');
  interaction.followUp = afterAck('followUp');
  return interaction;
}

/** The text of the first answer the bot gave to an interaction. */
export function answerText(interaction) {
  const first = interaction.calls[0];
  if (!first) return undefined;
  const p = first.payload;
  return typeof p === 'string' ? p : p?.content;
}

export function answerKind(interaction) {
  return interaction.calls[0]?.kind;
}

/** The text of the last message the bot showed for an interaction (after defers/edits). */
export function finalText(interaction) {
  const last = [...interaction.calls].reverse().find((c) => c.payload);
  const p = last?.payload;
  return typeof p === 'string' ? p : p?.content;
}

const toJson = (c) => (typeof c?.toJSON === 'function' ? c.toJSON() : c);

/** Every component (as JSON) in a payload — classic action rows and V2 cards alike. */
export function allComponents(payload) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.type) out.push(node);
    Object.values(node).forEach(walk);
  };
  walk((payload?.components ?? []).map(toJson));
  return out;
}

/** Every custom_id in a payload (buttons, selects), in order. */
export function customIds(payload) {
  return allComponents(payload).map((c) => c.custom_id).filter(Boolean);
}

/** The component with this custom_id, as JSON. */
export function findComponent(payload, customId) {
  return allComponents(payload).find((c) => c.custom_id === customId);
}

/** All text a user would see in a payload — content, embeds and V2 text — for regex checks. */
export function payloadText(payload) {
  if (typeof payload === 'string') return payload;
  return JSON.stringify({
    content: payload?.content,
    embeds: (payload?.embeds ?? []).map((e) => e.data ?? e),
    components: (payload?.components ?? []).map(toJson),
  });
}
