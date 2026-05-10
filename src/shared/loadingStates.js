'use strict';
const { MessageFlags } = require('discord.js');
const { SafeEmbedBuilder } = require('./safeEmbed');

async function deferWithLoading(interaction, { ephemeral = true } = {}) {
  const opts = {};
  if (ephemeral) opts.flags = MessageFlags.Ephemeral;
  await interaction.deferReply(opts);
}

async function editToSuccess(interaction, title, description) {
  const embed = new SafeEmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ ${title}`)
    .setDescription(description || '');
  return interaction.editReply({ embeds: [embed] });
}

async function editToError(interaction, title, description) {
  const embed = new SafeEmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`❌ ${title}`)
    .setDescription(description || '');
  return interaction.editReply({ embeds: [embed] });
}

module.exports = {
  deferWithLoading,
  editToSuccess,
  editToError,
};
