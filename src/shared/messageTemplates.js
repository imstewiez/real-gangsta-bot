'use strict';
/**
 * Templates centralizados de mensagens (sucesso, info, prompts).
 *
 * Para textos puramente de erro continua a existir `errorMessages.js` com
 * a API MESSAGES.X(...) — este módulo cobre o resto (sucesso/info/prompts)
 * e os textos das novas features (availability, radio, sticky).
 *
 * Estilo: directo, em pt-PT, voz de bairro/grupo. Sem cringe, sem infantil.
 * Sem emojis a abrir frases (excepto se semanticamente o emoji É a frase).
 */

const AVAILABILITY = {
  SESSION_OPENED: (id, channelId) => `✅ Sessão #${id} publicada em <#${channelId}>.`,
  SESSION_ALREADY_OPEN: id =>
    `⚠️ Já existe uma sessão aberta hoje (#${id}). Fecha-a primeiro com \`/rg-availability-close\`.`,
  SESSION_CLOSED: id => `🔒 Sessão #${id} fechada.`,
  SESSION_NOT_FOUND: () => 'Sessão não encontrada.',
  NO_RECENT: () => 'Sem sessão recente neste canal.',
  VOTE_RECORDED: (slot, stateLabel, stateEmoji) => `${stateEmoji} Voto registado: **${slot}** → **${stateLabel}**`,
  VOTE_BULK_RECORDED: (n, stateLabel, stateEmoji) => `${stateEmoji} ${n} slot(s) marcados como **${stateLabel}**.`,
  REASON: {
    session_not_found: 'Sessão não encontrada.',
    session_closed: 'Sessão fechada — votos congelados.',
    invalid_state: 'Estado inválido.',
  },
};

const RADIO = {
  SET: (typeLabel, typeEmoji, prev, next) => `${typeEmoji} ${typeLabel}: \`${prev || '∅'}\` → \`${next}\`.`,
  RANDOM: (typeLabel, typeEmoji, prev, next) =>
    `🎲 ${typeLabel}: \`${prev || '∅'}\` → \`${next}\` (era \`${prev || '∅'}\`).`,
  SWAPPED: (principal, parceria) => `🔁 Trocadas: 📻 \`${principal}\` • 🤝 \`${parceria}\`.`,
  PUBLISHED: channelId => `📻 Painel publicado em <#${channelId}>.`,
  HISTORY_EMPTY: () => '_Sem histórico ainda._',
};

const STICKY = {
  SET: (sourceKey, channelId, mode) => `📌 Sticky \`${sourceKey}\` activa em <#${channelId}> (modo ${mode}).`,
  REMOVED: (sourceKey, channelId) => `🗑️ Sticky \`${sourceKey}\` removida de <#${channelId}>.`,
  REFRESHED: sourceKey => `🔄 Sticky \`${sourceKey}\` refrescada.`,
  NOT_FOUND: () => 'Sticky não encontrada / inactiva.',
  EMPTY_LIST: () => 'Sem stickys activas.',
};

const TIERS = {
  FIX_DRY_HEADER: (scanned, affected) =>
    `**Modo:** \`DRY-RUN\`\n**Scan:** ${scanned} membros\n**Afectados (YB ou O Gunão):** ${affected}`,
  FIX_APPLY_HEADER: (scanned, affected, swapped, dbUpdated, channelRenamed, failed) =>
    `**Modo:** \`APPLY\`\n**Scan:** ${scanned} membros\n**Afectados:** ${affected}\n**Roles trocadas:** ${swapped}\n**DB actualizada:** ${dbUpdated}\n**Canais renomeados:** ${channelRenamed}\n**Falhas:** ${failed}`,
};

const COMMON = {
  GENERIC_ERROR: () => 'Ocorreu um erro interno. A equipa foi notificada.',
  DRY_RUN_HINT: () => '\n\n> _Dry-run — usa `modo:apply` para aplicar._',
};

module.exports = {
  AVAILABILITY,
  RADIO,
  STICKY,
  TIERS,
  COMMON,
};
