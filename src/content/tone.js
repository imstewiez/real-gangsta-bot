'use strict';
/**
 * Style guide da Firma RedWood — regras duras de tom e voz.
 *
 * Este ficheiro não é código funcional — é a contract da copy. Qualquer copy
 * nova passa aqui primeiro mentalmente. Se partir uma regra, re-escreve.
 *
 * Ver também:
 *   - voice.js — assinatura, glossary, status labels
 *   - errors.js / success.js — templates das mensagens
 *   - docs/UX_STYLE_GUIDE.md — versão humana deste ficheiro
 */

// Palavras proibidas em copy user-facing. Se aparecer, reescreve.
// Valores são o motivo — útil em reviews e grep.
const FORBIDDEN = {
  operação: 'usa saída',
  operacao: 'usa saida',
  sistema: 'usa bot/firma/casa conforme contexto',
  utilizador: 'usa bairrista/nome/membro',
  entidade: 'não faz sentido em bairro — reescreve',
  processado: 'usa guardado/registado',
  processar: 'usa guardar/registar',
  corporativo: 'obvio',
  gestão: 'ok em dashboard/sheet; evita em texto user-facing',
  reportado: 'usa avisado/registado',
  efetuado: 'usa feito/registado',
  submetido: 'usa enviado',
  validado: 'usa confirmado/aprovado',
};

// Mapa antigo → novo. Se encontrares à esquerda, substitui por direita.
const PREFERRED = {
  operação: 'saída',
  operacao: 'saída',
  utilizador: 'bairrista',
  user: 'bairrista',
  'membro do grupo': 'bairrista',
  processado: 'guardado',
  reportado: 'avisado',
  efetuado: 'feito',
  submetido: 'enviado',
  validado: 'confirmado',
  informações: 'dados',
  'registo de': '', // só "de" a seguir (registo de X → X)
  'por favor': '', // demasiado corporativo
  obrigado: 'fixe', // raro, e quando apareça é mais natural
};

// Rules em prosa — quando em dúvida.
const VOICE_NOTES = [
  'Português europeu. 2ª pessoa singular ("tu"). Nunca 3ª pessoa formal.',
  'Frases curtas. Uma ideia por linha. Blocos grandes matam leitura.',
  'Tom: firme, directo, bairro. Sem caricatura de RP, sem linguagem policial, sem ERP.',
  'Emojis: 0 ou 1 por título. 0 ou 1 por botão. Só se ancorarem significado.',
  'Dados > estética. Se tens número útil, mostra-o. Texto vazio mata UX.',
  'Footer "Firma RedWood" em todas as embeds importantes (painéis, success, rankings, kills, saídas).',
  'Consistência: mesma acção, mesma linguagem. Se "Registar Material" num sítio, não mudes para "Guardar Item" noutro.',
  'Feedbacks: título curto + 1-2 linhas de corpo. Se precisares mais, usa fields.',
  'Mostra progresso sempre que exista: tier progress, peso da semana, rank delta, streak.',
  'Nunca escrevas "por favor", "obrigado", "desculpa" — é desnecessário e soa corporate.',
];

// Templates canónicos — exemplos do que é bom.
const EXAMPLES = {
  error_short: 'Esse nome não está na casa.',
  error_with_cta: 'Sessão foi abaixo. Tenta de novo.',
  success_short: 'Feito. Entrega guardada.',
  success_data: 'Feito. 15× AK guardada — peso da semana: 18k.',
  panel_title: 'Casa — Bairrista',
  audit_title: 'Novo Bairrista — tag aprovada',
  ranking_title: 'Topo da semana',
};

module.exports = {
  FORBIDDEN,
  PREFERRED,
  VOICE_NOTES,
  EXAMPLES,
};
