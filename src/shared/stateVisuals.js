'use strict';
/**
 * Standardized visual states for panels and embeds.
 */

const STATE_VISUALS = Object.freeze({
  pending:    { emoji: '🕐', color: 'WARNING', label: 'Pendente' },
  analysing:  { emoji: '🔎', color: 'WARNING', label: 'Em análise' },
  approved:   { emoji: '✅', color: 'SUCCESS', label: 'Aprovado' },
  rejected:   { emoji: '❌', color: 'DANGER',  label: 'Rejeitado' },
  fulfilled:  { emoji: '📦', color: 'SUCCESS', label: 'Entregue' },
  cancelled:  { emoji: '🚫', color: 'DANGER',  label: 'Cancelado' },
  completed:  { emoji: '✅', color: 'SUCCESS', label: 'Concluído' },
  failed:     { emoji: '⚠️', color: 'DANGER',  label: 'Falhado' },
  in_progress:{ emoji: '🔵', color: 'INFO',    label: 'Em progresso' },
  active:     { emoji: '🟢', color: 'SUCCESS', label: 'Activo' },
  resolved:   { emoji: '✅', color: 'SUCCESS', label: 'Resolvido' },
  ignored:    { emoji: '⚪', color: 'BANAL',   label: 'Ignorado' },
  open:       { emoji: '🔴', color: 'DANGER',  label: 'Aberto' },
  away:       { emoji: '🔴', color: 'WARNING', label: 'Ausente' },
  warning:    { emoji: '⚠️', color: 'WARNING', label: 'Atenção' },
  fixed:      { emoji: '🛠️', color: 'SUCCESS', label: 'Corrigido' },
});

function stateVisual(state) {
  return STATE_VISUALS[state?.toLowerCase()] || { emoji: '❓', color: 'BANAL', label: state || 'Desconhecido' };
}

function stateLabel(state) {
  const v = stateVisual(state);
  return `${v.emoji} ${v.label}`;
}

module.exports = { STATE_VISUALS, stateVisual, stateLabel };
