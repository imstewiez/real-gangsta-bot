'use strict';
const { EmbedBuilder } = require('discord.js');
const { safeReply } = require('./interactionHelpers');
const { warn } = require('../logger');

const LIMITS = Object.freeze({
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER_TEXT: 2048,
  TOTAL_EMBED: 6000,
  EMBEDS_PER_MESSAGE: 10,
});

function truncate(str, maxLen, suffix = '…') {
  if (!str) return str;
  if (str.length <= maxLen) return str;
  const keep = maxLen - suffix.length;
  if (keep <= 0) return suffix;
  return str.slice(0, keep) + suffix;
}

class SafeEmbedBuilder extends EmbedBuilder {
  setTitle(title) {
    return super.setTitle(truncate(String(title || ''), LIMITS.TITLE));
  }

  setDescription(description) {
    super.setDescription(truncate(String(description || ''), LIMITS.DESCRIPTION));
    this._enforceTotalLimit();
    return this;
  }

  setFooter(options) {
    if (options && typeof options === 'object' && options.text !== undefined) {
      options.text = truncate(String(options.text), LIMITS.FOOTER_TEXT);
    } else if (typeof options === 'string') {
      options = truncate(String(options), LIMITS.FOOTER_TEXT);
    }
    return super.setFooter(options);
  }

  addFields(...fields) {
    const normalized = fields.flat();
    const safeFields = normalized.map(f => ({
      name: truncate(String(f.name || '\u200b'), LIMITS.FIELD_NAME),
      value: truncate(String(f.value || '\u200b'), LIMITS.FIELD_VALUE),
      inline: f.inline,
    }));
    super.addFields(safeFields);
    this._enforceTotalLimit();
    return this;
  }

  addFieldsSafe(fields) {
    if (!Array.isArray(fields)) return this;
    const safeFields = [];
    for (const f of fields) {
      if (!f || typeof f !== 'object') continue;
      safeFields.push({
        name: truncate(String(f.name ?? '\u200b'), LIMITS.FIELD_NAME),
        value: truncate(String(f.value ?? '\u200b'), LIMITS.FIELD_VALUE),
        inline: f.inline,
      });
    }
    if (safeFields.length) {
      super.addFields(safeFields);
      this._enforceTotalLimit();
    }
    return this;
  }

  _enforceTotalLimit() {
    const json = this.toJSON();
    const size = JSON.stringify(json).length;
    if (size > LIMITS.TOTAL_EMBED) {
      warn(`[SafeEmbedBuilder] Embed JSON exceeded ${LIMITS.TOTAL_EMBED} chars (${size}). Trimming description.`);
      const desc = this.data.description || '';
      const overage = size - LIMITS.TOTAL_EMBED;
      const newDesc = truncate(desc, Math.max(0, desc.length - overage - 1));
      super.setDescription(newDesc || '\u200b');
    }
  }
}

async function replySafe(interaction, payload, opts = {}) {
  const { embeds, ...rest } = payload;
  if (!Array.isArray(embeds) || embeds.length <= LIMITS.EMBEDS_PER_MESSAGE) {
    return safeReply(interaction, payload, opts);
  }

  const chunks = [];
  for (let i = 0; i < embeds.length; i += LIMITS.EMBEDS_PER_MESSAGE) {
    chunks.push(embeds.slice(i, i + LIMITS.EMBEDS_PER_MESSAGE));
  }

  const firstPayload = { ...rest, embeds: chunks[0] };
  let result = await safeReply(interaction, firstPayload, opts);

  for (let i = 1; i < chunks.length; i++) {
    const followPayload = { embeds: chunks[i] };
    try {
      result = await interaction.followUp(followPayload);
    } catch (e) {
      warn(`[replySafe] followUp failed: ${e.message}`);
      break;
    }
  }
  return result;
}

module.exports = {
  SafeEmbedBuilder,
  replySafe,
  LIMITS,
};
