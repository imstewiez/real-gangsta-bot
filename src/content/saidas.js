'use strict';
/**
 * Copy do domínio saídas — embeds, prompts, publisher.
 *
 * Nada de "operação" no texto visível. Sempre "saída" / "movimento".
 */

const E = require('./emojis');

// Armas que a firma pode emitir em "Pedir à Org". Subset curado do catálogo
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
  'Machine Pistol',
  'Micro SMG',
];

// Spots conhecidos — dropdown na criação de saída. Substitui texto livre
// para garantir naming consistente (fundamental para stats por spot).
// Se for spot pontual / raid único → escolher "Outro" e detalhar em notas.
const SPOTS = [
  { value: 'haxixe',      label: 'Haxixe',       emoji: '🌿' },
  { value: 'meta',        label: 'Meta',         emoji: '💎' },
  { value: 'coca',        label: 'Coca',         emoji: '🤍' },
  { value: 'erva',        label: 'Erva',         emoji: '🍃' },
  { value: 'pecas',       label: 'Peças',        emoji: '🔩' },
  { value: 'mina_ilegal', label: 'Mina Ilegal',  emoji: '⛏️' },
  { value: 'stab_city',   label: 'Stab City',    emoji: '🔪' },
  { value: 'cacadores',   label: 'Caçadores',    emoji: '🏹' },
  { value: 'aviao',       label: 'Avião',        emoji: '✈️' },
  { value: 'eletrica',    label: 'Elétrica',     emoji: '⚡' },
  { value: 'outro',       label: 'Outro spot',   emoji: '❓' },
];

// Facções conhecidas — dropdown de inimigo no fecho de saída.
// Se for facção nova / pontual, escolhe "Outra" e regista-se em notas.
// Limite Discord StringSelect: 25 opções. Deixar espaço para "Outra".
const FACTIONS = [
  { value: 'los_vagos',    label: 'Los Vagos',     emoji: '🟡' },
  { value: 'ballas',       label: 'Ballas',        emoji: '🟣' },
  { value: 'families',     label: 'Families',      emoji: '🟢' },
  { value: 'aztecas',      label: 'Aztecas',       emoji: '🔵' },
  { value: 'marabunta',    label: 'Marabunta',     emoji: '🟤' },
  { value: 'triads',       label: 'Triads',        emoji: '🔴' },
  { value: 'lost_mc',      label: 'Lost MC',       emoji: '⚫' },
  { value: 'bloods',       label: 'Bloods',        emoji: '🩸' },
  { value: 'angels',       label: 'Angels of Death', emoji: '💀' },
  { value: 'policia',      label: 'Polícia',       emoji: '🚓' },
  { value: 'outra',        label: 'Outra facção',  emoji: '❓' },
  { value: 'desconhecido', label: 'Desconhecido',  emoji: '❔' },
];

const SAIDAS = {
  // Criação
  CREATE_TITLE: `${E.SAIDA} Nova Saída`,
  CREATE_PROMPT: 'Escolhe o tipo de movimento e o spot. O resto acerta-se na rua.',
  FACTIONS,
  SPOTS,
  ORG_ISSUED_WEAPONS,

  WIZARD_TITLE: `${E.FECHAR} Liquidação de Saída`,
  WIZARD_DESC: (id) => `**Saída #${id}** — fecha nome a nome.`,
  WIZARD_PENDING_HINT: (n) =>
    `Pendentes: **${n}**. Escolhe o próximo — ou carrega em Concluir para auto-liquidar os restantes como vivos sem kills.`,

  WIZARD_SELECT_PLACEHOLDER: (n) =>
    `Próximo nome (${n} pendente${n === 1 ? '' : 's'})`,
  WIZARD_BTN_FINISH_PENDING: 'Concluir (auto-liquida restantes)',
  WIZARD_BTN_FINISH_DONE: 'Finalizar e publicar',

  WIZARD_SUMMARY: (id, kills, deaths, survivors, net, profitable, channel) =>
    `${E.FECHAR} Saída **#${id}** fechada.\n` +
    `${E.KILL} ${kills} kills · ${E.MORTE} ${deaths} mortes · ${E.OK} ${survivors} vivos\n` +
    `${E.LUCRO} Líquido: **${(net || 0).toLocaleString('pt-PT')} €** (${profitable ? 'lucro' : 'prejuízo'})\n` +
    `${E.INFO} Resultados publicados em <#${channel}>.`,

  // Resultados
  RESUMO_TITLE: (id) => `${E.SAIDA} Saída #${id} — Resumo`,
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
    ORG_KILLS: 'Kills da firma (all-time)',
  },

  // Sessão interactiva
  SESSION: {
    TITLE: (id) => `${E.SAIDA} Sessão de Saída #${id}`,
    REGISTER_CHARACTERIZED: 'Caracterizado',
    REGISTER_WORKER: 'Trabalhador',
    CANCEL_REGISTRATION: 'Cancelar Registo',
    SLOTS_FULL: 'Slots de caracterizados cheios.',
    REGISTERED: (type) => `Registado como ${type}.`,
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
    DOWNS_LABEL: 'Downs',
    DIED_LABEL: 'Morreu? (S/N)',
    DIED_WITH_MAT_LABEL: 'Morreu com material da firma?',
    NOTES_LABEL: 'Notas',
    RESULT_LABEL: 'Resultado (win/loss/draw/sem_conflito)',
    ENEMY_LABEL: 'Inimigo · facção',
    CRAFT_LABEL: 'Valor craftado (€)',
    FLAGS_LABEL: 'Flags (fight,craft,dom)',
  },
};

// Tradução de resultado para label com emoji — usada em embeds.
const RESULT_LABEL = {
  win: `${E.VITORIA} Vitória`,
  loss: `${E.DERROTA} Derrota`,
  draw: `${E.EMPATE} Empate`,
  sem_conflito: `${E.INFO} Sem conflito`,
};

module.exports = { SAIDAS, RESULT_LABEL };
