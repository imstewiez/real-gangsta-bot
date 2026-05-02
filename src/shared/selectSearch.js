'use strict';
/**
 * Sistema global de pesquisa para StringSelectMenu.
 *
 * Cada select pesquisável regista as suas opções originais numa store
 * efémera (15 min TTL). O end-user clica "🔍 Pesquisar", escreve num
 * modal, e o select é re-renderizado in-place apenas com as opções que
 * fazem match. O botão "❌ Limpar" restaura a lista completa.
 *
 * Integração:
 *   1. Substitui `new StringSelectMenuBuilder()` por `buildSearchableSelect()`
 *   2. Regista os handlers em routers/buttons.js e routers/modals.js
 *   3. O customId do select MANTÉM-SE — os handlers originais funcionam
 *      sem alterações.
 */

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { createSessionStore } = require('./sessionStore');
const { safeReply, safeUpdate, safeShowModal, getModalField } = require('./interactionHelpers');
const { EMOJI } = require('../content');

const SEARCH_STORE = createSessionStore('selectSearch', { ttlMs: 15 * 60 * 1000 });
const SEARCH_PREFIX = 'search';

/* ── helpers ─────────────────────────────────────────────────────────── */

function _key(...parts) {
  return parts.join('::');
}

function _parseSearchKey(interaction) {
  return interaction.customId.split('::').slice(2).join('::');
}

function _filterOptions(options, query) {
  const q = query.toLowerCase().trim();
  if (!q) return options;
  return options.filter(o => {
    const label = String(o.label || o.data?.label || '').toLowerCase();
    const description = String(o.description || o.data?.description || '').toLowerCase();
    const value = String(o.value || o.data?.value || '').toLowerCase();
    return label.includes(q) || description.includes(q) || value.includes(q);
  });
}

function _buildSelectRow(data, options) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(data.customId)
    .setPlaceholder(data.placeholder)
    .setMinValues(data.minValues ?? 1)
    .setMaxValues(data.maxValues ?? 1)
    .addOptions(options.slice(0, 25));

  return new ActionRowBuilder().addComponents(select);
}

function _buildSearchRow(data, hasFilter) {
  const searchBtn = new ButtonBuilder()
    .setCustomId(_key(SEARCH_PREFIX, 'open', data.searchKey))
    .setLabel('🔍 Pesquisar')
    .setStyle(ButtonStyle.Secondary);

  const clearBtn = new ButtonBuilder()
    .setCustomId(_key(SEARCH_PREFIX, 'clear', data.searchKey))
    .setLabel('❌ Limpar')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!hasFilter);

  return new ActionRowBuilder().addComponents(searchBtn, clearBtn);
}

/**
 * Reconstrói todas as rows da mensagem actual, substituindo apenas as
 * rows que contêm o select alvo ou os botões de pesquisa. Todas as
 * outras rows (botões de confirmação, etc.) preservam-se.
 */
function _rebuildMessageRows(data, filteredOptions, currentRows = []) {
  const newRows = [];
  let replaced = false;

  for (const row of currentRows) {
    const comps = row.components || [];
    const hasTargetSelect = comps.some(c => c.customId === data.customId);
    const hasSearchButtons = comps.some(c => c.customId?.startsWith(_key(SEARCH_PREFIX, '')));

    if (hasTargetSelect || hasSearchButtons) {
      if (!replaced) {
        newRows.push(_buildSelectRow(data, filteredOptions));
        newRows.push(_buildSearchRow(data, filteredOptions.length < data.options.length));
        replaced = true;
      }
      // descarta as rows antigas (select + search)
    } else {
      newRows.push(row);
    }
  }

  if (!replaced) {
    // mensagem nova ou sem rows anteriores — adiciona no fim
    newRows.push(_buildSelectRow(data, filteredOptions));
    newRows.push(_buildSearchRow(data, filteredOptions.length < data.options.length));
  }

  return newRows;
}

/* ── public API ──────────────────────────────────────────────────────── */

/**
 * Constrói um select menu pesquisável.
 *
 * @param {Object} opts
 * @param {string} opts.customId        — customId do select (usado pelo handler original)
 * @param {string} opts.placeholder
 * @param {Array}  opts.options         — Array de {label, value, description?, emoji?, default?}
 *                                       ou de StringSelectMenuOptionBuilder
 * @param {number} [opts.minValues=1]
 * @param {number} [opts.maxValues=1]
 * @param {string} opts.searchKey       — chave única para esta instância (ex: `ajuste::${userId}`)
 * @param {string} [opts.modalTitle='Pesquisar']
 * @param {string} [opts.messageClass='FLOW']
 * @returns {ActionRowBuilder[]}        — [rowSelect, rowSearchButtons]
 */
function buildSearchableSelect(opts) {
  const {
    customId,
    placeholder,
    options,
    minValues = 1,
    maxValues = 1,
    searchKey,
    modalTitle = 'Pesquisar',
    messageClass = 'FLOW',
  } = opts;

  // Normaliza opções para objetos plain (mais fáceis de filtrar depois)
  const plainOptions = options.map(o => {
    if (o.data) return o.data;
    if (o instanceof StringSelectMenuOptionBuilder) {
      // extrair dados — discord.js v14
      return o.data || {};
    }
    return o;
  });

  SEARCH_STORE.set(searchKey, {
    customId,
    placeholder,
    options: plainOptions,
    minValues,
    maxValues,
    searchKey,
    modalTitle,
    messageClass,
  });

  return [
    _buildSelectRow({ customId, placeholder, minValues, maxValues }, plainOptions),
    _buildSearchRow({ searchKey }, false),
  ];
}

/**
 * Handler para botão `search::open::<searchKey>`.
 */
async function handleSearchOpen(interaction) {
  const searchKey = _parseSearchKey(interaction);
  const data = SEARCH_STORE.get(searchKey);
  if (!data) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Pesquisa expirada — reabre o menu.` },
      { messageClass: 'BANAL' }
    );
  }

  // Guarda referência à mensagem original para o modal poder editá-la depois.
  if (interaction.message) {
    data.messageId = interaction.message.id;
    data.channelId = interaction.message.channelId;
    SEARCH_STORE.set(searchKey, data);
  }

  const modal = new ModalBuilder()
    .setCustomId(_key(SEARCH_PREFIX, 'modal', searchKey))
    .setTitle(data.modalTitle.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Termo de pesquisa')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('Escreve para filtrar...')
      )
    );

  return safeShowModal(interaction, modal);
}

/**
 * Handler para modal `search::modal::<searchKey>`.
 */
async function handleSearchModal(interaction) {
  const searchKey = _parseSearchKey(interaction);
  const data = SEARCH_STORE.get(searchKey);
  if (!data) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Pesquisa expirada — reabre o menu.` },
      { messageClass: 'BANAL' }
    );
  }

  const query = getModalField(interaction, 'query');
  const filtered = _filterOptions(data.options, query);

  if (!filtered.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Nenhum resultado para "**${query}**". Tenta outro termo.` },
      { messageClass: 'BANAL' }
    );
  }

  // ModalSubmitInteraction não tem message — usamos a referência guardada.
  if (data.messageId) {
    try {
      let currentRows = [];
      // Tentativa 1: webhook edit (funciona para ephemerals)
      if (interaction.webhook) {
        const msg = await interaction.webhook.editMessage(data.messageId, { components: [] }).catch(() => null);
        if (msg) {
          currentRows = msg.components || [];
          const newRows = _rebuildMessageRows(data, filtered, currentRows);
          await interaction.webhook.editMessage(data.messageId, { components: newRows });
          return interaction.deferUpdate().catch(() => {});
        }
      }
      // Tentativa 2: channel fetch (mensagens públicas)
      if (data.channelId) {
        const channel = await interaction.client.channels.fetch(data.channelId);
        const msg = await channel.messages.fetch(data.messageId);
        currentRows = msg.components || [];
        const newRows = _rebuildMessageRows(data, filtered, currentRows);
        await msg.edit({ components: newRows });
        return interaction.deferUpdate().catch(() => {});
      }
    } catch (e) {
      // fallback para safeReply se não conseguir editar a mensagem original
    }
  }

  const newRows = _rebuildMessageRows(data, filtered, interaction.message?.components || []);
  return safeReply(interaction, { components: newRows }, { messageClass: data.messageClass });
}

/**
 * Handler para botão `search::clear::<searchKey>`.
 */
async function handleSearchClear(interaction) {
  const searchKey = _parseSearchKey(interaction);
  const data = SEARCH_STORE.get(searchKey);
  if (!data) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Pesquisa expirada.` }, { messageClass: 'BANAL' });
  }

  const newRows = _rebuildMessageRows(data, data.options, interaction.message?.components || []);

  // ButtonInteraction pode ter message — usa preferencialmente edit directo.
  if (interaction.message) {
    try {
      await interaction.message.edit({ components: newRows });
      return interaction.deferUpdate().catch(() => {});
    } catch {
      // fallback
    }
  }

  return safeUpdate(interaction, { components: newRows }, { messageClass: data.messageClass });
}

/**
 * Guarda/atualiza opções de um select já existente (útil quando os dados
 * mudam dinamicamente, ex.: stock actualizado).
 */
function refreshSearchOptions(searchKey, newOptions) {
  const data = SEARCH_STORE.get(searchKey);
  if (!data) return;
  data.options = newOptions.map(o => (o.data ? o.data : o));
  SEARCH_STORE.set(searchKey, data);
}

module.exports = {
  buildSearchableSelect,
  handleSearchOpen,
  handleSearchModal,
  handleSearchClear,
  refreshSearchOptions,
};
