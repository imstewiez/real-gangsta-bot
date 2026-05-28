'use strict';
/**
 * Copy do domínio saídas — embeds, prompts, publisher.
 *
 * Nada de "operação" no texto visível. Sempre "saída" / "movimento".
 */

const E = require('./emojis');

// Armas que a Ballas Gang pode emitir em "Pedir à Org". Subset curado do catálogo
// armas_fogo. "Arma Própria" continua a mostrar o catálogo completo
// (armas_fogo + armas_brancas) — cada um leva o que tem.
const ORG_ISSUED_WEAPONS = [
  'AP Pistola',
  'Carabina Especial',
  'Pistola Tec',
  'Pistola .50',
  'Compact Rifle',
  'Espingarda de Assalto',
  'Gusenberg',
  'Gusenberg Sweeper', // nome alternativo (catálogo antigo)
  'Machine Pistol',
  'Micro SMG',
];

// Spots conhecidos — dropdown na criação de saída. Substitui texto livre
// para garantir naming consistente (fundamental para stats por spot).
// Se for spot pontual / raid único → escolher "Outro" e detalhar em notas.
const SPOTS = [
  { value: 'haxixe', label: 'Haxixe', emoji: '🌿' },
  { value: 'meta', label: 'Meta', emoji: '💎' },
  { value: 'coca', label: 'Coca', emoji: '🤍' },
  { value: 'erva', label: 'Erva', emoji: '🍃' },
  { value: 'pecas', label: 'Peças', emoji: '🔩' },
  { value: 'mina_ilegal', label: 'Mina Ilegal', emoji: '⛏️' },
  { value: 'stab_city', label: 'Stab City', emoji: '🔪' },
  { value: 'cacadores', label: 'Caçadores', emoji: '🏹' },
  { value: 'aviao', label: 'Avião', emoji: '✈️' },
  { value: 'eletrica', label: 'Elétrica', emoji: '⚡' },
  { value: 'outro', label: 'Outro spot', emoji: '❓' },
];

// Facções conhecidas — dropdown de inimigo no fecho de saída.
// Se for facção nova / pontual, escolhe "Outra" e regista-se em notas.
// Limite Discord StringSelect: 25 opções. Deixar espaço para "Outra".
const FACTIONS = [
  { value: 'los_vagos', label: 'Los Vagos', emoji: '🟡' },
  { value: 'ballas', label: 'Ballas', emoji: '🟣' },
  { value: 'families', label: 'Families', emoji: '🟢' },
  { value: 'aztecas', label: 'Aztecas', emoji: '🔵' },
  { value: 'marabunta', label: 'Marabunta', emoji: '🟤' },
  { value: 'triads', label: 'Triads', emoji: '🔴' },
  { value: 'lost_mc', label: 'Lost MC', emoji: '⚫' },
  { value: 'bloods', label: 'Bloods', emoji: '🩸' },
  { value: 'angels', label: 'Angels of Death', emoji: '💀' },
  { value: 'policia', label: 'Polícia', emoji: '🚓' },
  { value: 'outra', label: 'Outra facção', emoji: '❓' },
  { value: 'desconhecido', label: 'Desconhecido', emoji: '❔' },
];

const SAIDAS = {
  // Criação
  CREATE_TITLE: `${E.SAIDA} Nova Saída`,
  CREATE_PROMPT: 'Escolhe o tipo de movimento e o spot. O resto acerta-se na rua.',
  FACTIONS,
  SPOTS,
  ORG_ISSUED_WEAPONS,

  WIZARD_TITLE: `${E.FECHAR} Liquidação de Saída`,
  WIZARD_DESC: id => `**Saída #${id}** — fecha nome a nome.`,
  WIZARD_PENDING_HINT: n =>
    `Pendentes: **${n}**. Escolhe o próximo — ou carrega em Concluir para auto-liquidar os restantes como vivos sem kills.`,

  WIZARD_SELECT_PLACEHOLDER: n => `Próximo nome (${n} pendente${n === 1 ? '' : 's'})`,
  WIZARD_BTN_FINISH_PENDING: 'Concluir (auto-liquida restantes)',
  WIZARD_BTN_FINISH_DONE: 'Finalizar e publicar',

  WIZARD_SUMMARY: (id, kills, deaths, survivors, net, profitable, channel) =>
    `${E.FECHAR} Saída **#${id}** fechada.\n` +
    `${E.KILL} ${kills} kills · ${E.MORTE} ${deaths} mortes · ${E.OK} ${survivors} vivos\n` +
    `${E.LUCRO} Líquido: **${Math.round(net || 0).toLocaleString('pt-PT')}€** (${profitable ? 'lucro' : 'prejuízo'})\n` +
    `${E.INFO} Resultados publicados em <#${channel}>.`,

  // ── Liquidação (novo estado intermédio) ─────────────────────────────
  LIQUIDACAO: {
    STATUS_LABEL: 'Em liquidação',
    PING_HEADER: (saidaId, result) => `${E.SAIDA} **Saída #${saidaId}** fechada — resultado: **${result}**`,
    PING_BODY:
      'Preencham o vosso resultado individual ↓\n' +
      'Cliquem no botão **"Preencher o meu Resultado"** no painel da saída.',
    PING_FOOTER: `${E.PENDENTE} A sessão fica em espera até todos preencherem.`,
    PROGRESS: (submitted, total) => `${E.INFO} **${submitted}/${total}** resultado(s) preenchido(s)`,
    ALL_DONE: `${E.OK} **Todos os participantes preencheram!** Staff pode finalizar e publicar.`,
    FINALIZE_BTN: 'Finalizar e Publicar',
    FINALIZE_BTN_FORCE: 'Forçar Fecho (faltam resultados)',
    FINALIZED: (id, kills, deaths, survivors) =>
      `${E.FECHAR} Saída **#${id}** finalizada!\n` +
      `${E.KILL} **${kills}** kills · ${E.MORTE} **${deaths}** mortes · ${E.OK} **${survivors}** vivos`,
    STAFF_NOTIFY_ALL_DONE: saidaId =>
      `${E.OK} **Saída #${saidaId}** — todos os participantes preencheram o resultado!\n` +
      'Carrega em **"Finalizar e Publicar"** no painel da sessão para fechar com dados reais.',
  },

  // Resultados
  RESUMO_TITLE: id => `${E.SAIDA} Saída #${id} — Resumo`,
  DESTAQUES_TITLE: `${E.MVP} Destaques`,
  IMPACTO_TITLE: `${E.TOPO} Impacto Histórico`,

  LABELS: {
    SPOT: 'Spot',
    TIPO: 'Tipo',
    LIDER: 'Líder',
    INIMIGO: 'Inimigo',
    RESULTADO: 'Resultado',
    KILLS: 'Kills',
    MORTES: 'Mortes',
    CARACTERIZADOS: 'Caracterizados',
    TRABALHADORES: 'Trabalhadores',
    ARMA_PROPRIA: 'Arma própria',
    MATERIAL_FORNECIDO: 'Fornecido',
    MATERIAL_DEVOLVIDO: 'Devolvido',
    MATERIAL_PERDIDO: 'Perdido',
    MATERIAL_CRAFTADO: 'Craftado',
    LUCRO_BRUTO: 'Bruto',
    LUCRO_LIQUIDO: 'Líquido',
    MVP: 'MVP',
    TOP_KILLER: 'Top Killer',
    MORTOS: 'Mortos',
    DEVOLVERAM: 'Devolveram',
    DEVENDO: 'Ficaram a dever',
    WINRATE: 'Winrate do spot',
    ORG_KILLS: 'Kills da Ballas Gang (all-time)',
  },

  // Sessão interactiva
  SESSION: {
    TITLE: id => `${E.SAIDA} Sessão de Saída #${id}`,
    REGISTER_CHARACTERIZED: 'Caracterizado',
    REGISTER_WORKER: 'Trabalhador',
    CANCEL_REGISTRATION: 'Cancelar Registo',
    SLOTS_FULL: 'Slots de caracterizados cheios.',
    REGISTERED: type => `Registado como ${type}.`,
    CANCELLED: 'Registo cancelado.',
  },

  // Auto-liquidação
  AUTO_SETTLED: 'Auto-liquidado como vivo sem kills.',

  // Select prompts e placeholders
  SELECTS: {
    QUAL_SAIDA_FECHAR: 'Qual saída vais fechar?',
    QUAL_SAIDA_MATERIAL: 'Escolhe a saída para material',
    QUAL_SAIDA_PARTICIPANTE: 'Escolhe a saída para inscrever',
    TIPO_SAIDA: 'Escolhe o tipo de saída',
    RESULTADO_SAIDA: 'Qual foi o resultado?',
    DIRECAO_MATERIAL: 'Que tipo de movimento?',
    ESCOLHE_MATERIAL: 'Escolhe o material',
    ESCOLHE_PARTICIPANTE: 'Escolhe até 25 nomes',
  },

  // Placeholders de modal
  MODAL: {
    KILLS_LABEL: 'Kills',
    DIED_LABEL: 'Morreu? (S/N)',
    DIED_WITH_MAT_LABEL: 'Morreu com material da Ballas Gang?',
    NOTES_LABEL: 'Notas',
    RESULT_LABEL: 'Resultado (vitória/derrota/empate/sem conflito)',
    ENEMY_LABEL: 'Inimigo · facção',
    CRAFT_LABEL: 'Material craftado (unidades)',
    FLAGS_LABEL: 'Flags (fight,craft,dom)',
  },

  // ── Prompts inline (evitar duplicação em handlers) ──────────────────
  PROMPTS: {
    ESCOLHE_SAIDA_FECHAR: '🏁 Escolhe a saída a fechar:',
    QUAL_RESULTADO: id => `🏁 Saída **#${id}** — qual foi o resultado?`,
    ESCOLHE_CATEGORIA_MATERIAL: 'Categoria **{category}** — escolhe o item:',
    ESCOLHE_PARTICIPANTE: id => `Saída **#${id}** — escolhe quem entra:`,
    TIPO_MOVIMENTO: id => `Saída **#${id}** — que tipo de movimento?`,
    DIRECCAO_MATERIAL: direction => `Que material foi **${direction}**? Escolhe a categoria:`,
    PARTICIPANT_CATEGORY: (id, discordId) => `Saída **#${id}** → <@${discordId}> — categoria:`,
    WIZARD_PARTICIPANT: name => `**${name}** — como foi a saída?`,
    AUTO_SETTLE_HINT: 'Carrega em "Concluir" para auto-liquidar os restantes como vivos sem kills.',
  },
};

// ── Enum canónico + labels ────────────────────────────────────────────
// ÚNICA fonte de verdade para resultados de saída. Qualquer handler que
// precise de mostrar ou iterar resultados usa estas constantes.

const VALID_RESULTS = ['vitoria', 'derrota', 'empate', 'sem_conflito', 'abortada'];

const RESULT_LABEL = {
  vitoria: `${E.VITORIA} Vitória`,
  derrota: `${E.DERROTA} Derrota`,
  empate: `${E.EMPATE} Empate`,
  sem_conflito: `${E.INFO} Sem conflito`,
  abortada: `${E.WARN} Abortada`,
  // Legacy (data histórica pré-2026-04): mapear para display correcto.
  win: `${E.VITORIA} Vitória`,
  loss: `${E.DERROTA} Derrota`,
  draw: `${E.EMPATE} Empate`,
};

// Labels sem emoji — para places onde emoji vive separado (ex: selects).
const RESULT_NAME = {
  vitoria: 'Vitória',
  derrota: 'Derrota',
  empate: 'Empate',
  sem_conflito: 'Sem conflito',
  abortada: 'Abortada',
};

// Emoji map — usado em selects + embeds.
const RESULT_EMOJI = {
  vitoria: '🏆',
  derrota: '☠️',
  empate: '⚖️',
  sem_conflito: 'ℹ️',
  abortada: '⚠️',
};

// Descrição curta — usada em dropdown options (Discord mostra abaixo do label).
const RESULT_DESCRIPTION = {
  vitoria: 'Ganhámos a fight',
  derrota: 'Perdemos',
  empate: 'Nenhum lado ganhou',
  sem_conflito: 'Não houve fight',
  abortada: 'Saída cancelada/abortada',
};

module.exports = { SAIDAS, VALID_RESULTS, RESULT_LABEL, RESULT_NAME, RESULT_EMOJI, RESULT_DESCRIPTION };
