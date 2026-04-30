'use strict';
/**
 * /entrega e /venda — submissões rápidas single-item com autocomplete.
 *
 * O campo `item` usa setAutocomplete(true) → à medida que o user escreve,
 * o handler de autocomplete (src/app/discord/routers/autocomplete.js)
 * devolve matches fuzzy. Native search, sem dropdowns.
 *
 * Submete via recordDeliveryBatch (reutiliza toda a infraestrutura
 * atómica + log agregado + undo) com 1 linha. Feedback ephemeral com
 * botão "↩ Desfazer (5 min)".
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { inventoryRepo, memberRepo } = require('../repositories');
const { recordDeliveryBatch } = require('../inventory/inventoryEngine');
const { buildSubmissionFeedback } = require('../inventory/bairristaCart');

async function _handle(interaction, tipo) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const itemName = interaction.options.getString('item', true);
  const quantity = interaction.options.getInteger('quantidade', true);
  const nota = interaction.options.getString('nota') || '';
  const precoCustom = tipo === 'venda' ? interaction.options.getInteger('preco') : null;

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Não estás registado na firma. Pede a tag primeiro.` },
      { messageClass: 'ERROR' }
    );
  }

  // Resolve item: exact match primeiro, fuzzy fallback (autocomplete já devolve
  // nomes canónicos, mas se user submeteu texto livre sem tab, tenta fuzzy).
  let item = await inventoryRepo.getItemByName(itemName);
  if (!item) {
    const results = await inventoryRepo.searchItemsByName(itemName, { limit: 1 });
    if (results.length) item = results[0];
  }
  if (!item) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Item não encontrado: \`${itemName}\`. Escreve no campo para pesquisar.` },
      { messageClass: 'ERROR' }
    );
  }

  let result;
  try {
    result = await recordDeliveryBatch({
      discordId: interaction.user.id,
      tipo,
      lines: [
        {
          itemId: item.id,
          quantity,
          unitPrice: tipo === 'venda' && precoCustom != null ? precoCustom : null,
        },
      ],
      globalNotes: nota,
      createdBy: interaction.user.id,
    });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }

  // Auto-promoção (mesmo padrão do cart)
  let promotionLine = '';
  try {
    const { checkAndPromote, getPromotionProgress, formatTierName } = require('../members/autoPromotionEngine');
    const promoResult = await checkAndPromote(interaction.user.id, interaction.guild, interaction.client).catch(
      () => null
    );
    if (promoResult?.promoted) {
      promotionLine = `${EMOJI.LIDER} **Subida automática** — agora és **${formatTierName(promoResult.to)}**!`;
    } else {
      const progress = await getPromotionProgress(interaction.user.id).catch(() => null);
      if (progress && !progress.maxedOut && progress.threshold) {
        promotionLine = `${EMOJI.TOPO} ${progress.nextTierName}: **${progress.progress}%** (faltam ${progress.remaining.toLocaleString('pt-PT')})`;
      }
    }
  } catch (_) {
    /* promo é best-effort */
  }

  const feedback = buildSubmissionFeedback({
    submissionId: result.submissionId,
    tipo,
    totalQty: result.totalQty,
    totalValue: result.totalValue,
    lineCount: 1,
    promotionLine,
  });

  return interaction
    .editReply({ content: '', embeds: [feedback.embed], components: feedback.components })
    .catch(() => {});
}

async function handleEntrega(interaction) {
  return _handle(interaction, 'entrega');
}

async function handleVenda(interaction) {
  return _handle(interaction, 'venda');
}

module.exports = { handleEntrega, handleVenda };
