'use strict';
const { SlashCommandBuilder } = require('discord.js');

// ══════════════════════════════════════════════════════════════════════════════
// Slash commands — conjunto mínimo essencial.
//
// Tudo o que tem equivalente em painel (radio, availability criar/fechar,
// operações criar, stock summary, etc.) fica como botão — menos comandos,
// menos ruído no autocomplete. Os comandos abaixo são os que cobrem:
//   1. consultas rápidas (stock, member, top, items, audit, version)
//   2. acções pontuais que fogem ao fluxo de painel (add-item, close-op, kill)
//   3. administração rara (sync-panels, sync-perms, sticky-*)
// ══════════════════════════════════════════════════════════════════════════════

const commands = [
  // ── Consultas rápidas ───────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-version')
    .setDescription('Identidade da instância actual do bot (commit, host, uptime)'),

  new SlashCommandBuilder()
    .setName('rg-stock')
    .setDescription('Stock atual de materiais'),

  new SlashCommandBuilder()
    .setName('rg-items')
    .setDescription('Catálogo de itens/materiais'),

  new SlashCommandBuilder()
    .setName('rg-member')
    .setDescription('Ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-top-week')
    .setDescription('Top semanal')
    .addStringOption(opt => opt.setName('semana').setDescription('atual/anterior').setRequired(false)
      .addChoices({ name: 'Semana Atual', value: 'current' }, { name: 'Semana Anterior', value: 'previous' })),

  new SlashCommandBuilder()
    .setName('rg-audit')
    .setDescription('Logs de auditoria recentes')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Número de registos (default 20)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-cemetery')
    .setDescription('Leaderboard do cemitério'),

  // ── Acções pontuais que não têm painel ──────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-add-item')
    .setDescription('Adiciona um item ao catálogo')
    .addStringOption(opt => opt.setName('nome').setDescription('Nome do item').setRequired(true))
    .addStringOption(opt => opt.setName('categoria').setDescription('Categoria').setRequired(true))
    .addStringOption(opt => opt.setName('unidade').setDescription('Unidade de medida').setRequired(false))
    .addNumberOption(opt => opt.setName('valor').setDescription('Valor estimado').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-close-operation')
    .setDescription('Fecha uma operação pelo ID (fallback ao painel)')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID da operação').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-kill')
    .setDescription('Regista uma kill no cemitério'),

  // ── Administração (raro) ────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sync-panels')
    .setDescription('Republica/actualiza os painéis do bot nos canais dedicados'),

  new SlashCommandBuilder()
    .setName('rg-sync-perms')
    .setDescription('Aplica perms do template + renomeia painéis + sync child channels à categoria')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  // ── Sticky messages (admin, raro) ───────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sticky-set')
    .setDescription('Configura sticky message num canal')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal alvo').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key (ex: availability:daily, radio:current, panel:chefia)').setRequired(true))
    .addStringOption(opt => opt.setName('modo').setDescription('update (edita) ou repost (republica)').setRequired(true)
      .addChoices({ name: 'update', value: 'update' }, { name: 'repost', value: 'repost' }))
    .addIntegerOption(opt => opt.setName('threshold_msgs').setDescription('Repost após N mensagens novas').setRequired(false))
    .addIntegerOption(opt => opt.setName('threshold_minutes').setDescription('Repost após N minutos').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-sticky-remove')
    .setDescription('Remove sticky message')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-sticky-list')
    .setDescription('Lista sticky messages activas'),
];

module.exports = { commands };
