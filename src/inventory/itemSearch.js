'use strict';
/**
 * Item search — padrão "searchable dropdown" para fluxos em Discord.
 *
 * Discord `StringSelectMenu` NÃO suporta input de texto nativo. Para simular
 * uma dropdown pesquisável, usamos o padrão:
 *   1. Botão `🔎 Procurar item` abre um modal com campo de texto
 *   2. User escreve parte do nome (ex: "ap", "tec", "carregador")
 *   3. Bot normaliza + filtra + ordena por relevância
 *   4. Mostra um select pequeno com os melhores resultados
 *   5. User pica → handler do "purpose" decide o próximo passo
 *
 * Reutilizado por cart, saida_material, saida_issue e outros fluxos de
 * selecção de item. Cada fluxo regista um handler para quando o user pica,
 * que tipicamente abre o modal de quantidade.
 *
 * customIds:
 *   itemsearch::open::<purpose>              — botão abre modal
 *   itemsearch::modal::<purpose>             — submit do modal de query
 *   itemsearch::pick::<purpose>              — user pica um item
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { inventoryRepo } = require('../repositories');
const { safeReply, safeShowModal, getModalField } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZATION + RANKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normaliza string para comparação:
 *   - lowercase
 *   - NFKD para desacoplar acentos (ã→a, ç→c, ó→o)
 *   - remove combining marks
 *   - colapsa whitespace
 *
 * Usado em AMBOS os lados (query e nome do item) para match consistente.
 */
function normalize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pontuação de relevância (maior = melhor):
 *   4 = match exacto
 *   3 = nome começa com o query
 *   2 = uma palavra do nome começa com o query
 *   1 = substring em qualquer sítio
 *   0 = sem match
 *
 * Empate → length do nome ascending (nome mais curto = mais específico).
 */
function _score(queryNorm, nameNorm) {
  if (!queryNorm) return 0;
  if (nameNorm === queryNorm) return 4;
  if (nameNorm.startsWith(queryNorm)) return 3;
  const words = nameNorm.split(' ');
  if (words.some(w => w.startsWith(queryNorm))) return 2;
  if (nameNorm.includes(queryNorm)) return 1;
  return 0;
}

/**
 * Filtra + ordena items por relevância contra `query`.
 * Devolve top `limit` com _score anexado. Items sem score ≥ 1 são excluídos.
 */
function rankItems(query, items, { limit = 20 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const scored = [];
  for (const it of items) {
    const nameNorm = normalize(it.name);
    const score = _score(q, nameNorm);
    if (score > 0) scored.push({ item: it, score, _len: nameNorm.length });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a._len !== b._len) return a._len - b._len;
    return a.item.name.localeCompare(b.item.name);
  });
  return scored.slice(0, limit).map(s => s.item);
}

// ═══════════════════════════════════════════════════════════════════════════
// UI BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Botão "🔎 Procurar item" — abre o modal de pesquisa para este purpose.
 */
function buildSearchButton(purpose, { label = 'Procurar item', style = ButtonStyle.Primary } = {}) {
  return new ButtonBuilder().setCustomId(`itemsearch::open::${purpose}`).setLabel(label).setStyle(style).setEmoji('🔎');
}

/**
 * Modal com um único text input para a query.
 */
function buildSearchModal(purpose) {
  return new ModalBuilder()
    .setCustomId(`itemsearch::modal::${purpose}`)
    .setTitle('Procurar item')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Escreve parte do nome')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: AP, Tec, carregador, micro...')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(50)
      )
    );
}

/**
 * Select com resultados filtrados. Cada option.value = String(itemId).
 */
function buildResultsSelect(purpose, matches) {
  const options = matches.slice(0, 25).map(it => {
    const price = parseFloat(it.estimated_value) || 0;
    const priceTag = price > 0 ? `${Math.round(price).toLocaleString('pt-PT')}€` : 'sem preço';
    const catTag = it.category || 'outros';
    return new StringSelectMenuOptionBuilder()
      .setLabel(String(it.name).slice(0, 100))
      .setDescription(`${catTag} · ${priceTag}`.slice(0, 100))
      .setValue(String(it.id));
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`itemsearch::pick::${purpose}`)
      .setPlaceholder(`Escolhe entre ${matches.length} resultado(s)`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS (entry points registados nos routers)
// ═══════════════════════════════════════════════════════════════════════════

async function handleOpenButton(interaction) {
  const purpose = interaction.customId.split('::')[2];
  const modal = buildSearchModal(purpose);
  await safeShowModal(interaction, modal);
}

async function handleSubmitModal(interaction) {
  const purpose = interaction.customId.split('::')[2];
  const query = String(getModalField(interaction, 'query') || '').trim();

  if (!query) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Escreve algo para pesquisar.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Fetch completo (items count ≤ ~100 — barato). Filtra em memória com
  // normalização JS-side (accent-insensitive); evita precisar da extensão
  // unaccent no Postgres.
  const all = await inventoryRepo.getItems(true);
  const matches = rankItems(query, all, { limit: 25 });

  if (!matches.length) {
    return interaction
      .editReply({
        content: `${EMOJI.INFO} **Nenhum item encontrado** para \`${query}\`. Tenta outras letras ou menos caracteres.`,
      })
      .catch(() => {});
  }

  // Pesquisa demasiado ampla (>25 matches verdadeiros — não cortados pelo limit)
  const tooBroadHint =
    matches.length === 25
      ? '\n_(25 resultados — pesquisa demasiado ampla, escreve mais letras para filtrar melhor.)_'
      : '';

  const select = buildResultsSelect(purpose, matches);
  return interaction
    .editReply({
      content: `🔎 **${matches.length} resultado(s)** para \`${query}\`${tooBroadHint}`,
      components: [select],
    })
    .catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCHER — cada purpose regista o que fazer quando user pica um item
// ═══════════════════════════════════════════════════════════════════════════

const _handlers = new Map(); // purpose → async ({ interaction, itemId, item }) => void

function registerPickHandler(purpose, handler) {
  _handlers.set(purpose, handler);
}

async function handlePick(interaction) {
  const purpose = interaction.customId.split('::')[2];
  const itemId = parseInt(interaction.values[0], 10);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Item não encontrado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  const handler = _handlers.get(purpose);
  if (!handler) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Handler não registado para purpose '${purpose}'.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  return handler({ interaction, itemId, item });
}

module.exports = {
  // Lógica pura (testável)
  normalize,
  rankItems,
  // Builders
  buildSearchButton,
  buildSearchModal,
  buildResultsSelect,
  // Handlers para routers
  handleOpenButton,
  handleSubmitModal,
  handlePick,
  // Dispatcher
  registerPickHandler,
};
