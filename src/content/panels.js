'use strict';
/**
 * Copy dos painéis — títulos, descrições e labels.
 *
 * Tom: temático, rua, firma. Linguagem aforística e directa. Cada painel
 * fala pelo seu papel — portão avalia, casa mede, secretaria controla,
 * comando decide, mando aperta a zona.
 *
 * Regras:
 *   - Título uppercase com pipe (ex.: `🩸 O PORTÃO | FIRMA REDWOOD`).
 *   - Abertura aforística: frase dupla, contraste "a rua X, a Firma Y".
 *   - 3-4 bullets, cada um com emoji + bold key + em-dash + acção.
 *   - Fecho em itálico, imperativo curto, corta o ar.
 *   - Assinatura `— Firma RedWood`.
 */

const E = require('./emojis');

const PANELS = {
  // ═══════════════════════════════════════════════════════════════════════
  // ENTRADA — O PORTÃO
  // ═══════════════════════════════════════════════════════════════════════
  ENTRADA: {
    TITLE: `${E.SANGUE} O PORTÃO | FIRMA REDWOOD`,
    DESCRIPTION:
      'A rua ensina, mas a Firma cobra. Se estás aqui, é porque queres fazer o teu nome. O nosso sangue não se mistura com qualquer um — **prova o que vales**.\n' +
      '\n' +
      `${E.LEIS} **Lê as Leis da Casa** — o código fala antes de ti.\n` +
      `${E.TAG} **Dar a Cara** — pede a tua tag. Diz ao que vens, a chefia decide.\n` +
      '🍼 **Sangue Novo** — aprovado, entras como YB. O suor é que dita o resto.\n' +
      '\n' +
      '_Ajoelha perante o código. Levanta-te com o Bairro._\n' +
      '\n' +
      '— Firma RedWood',
    BUTTON: {
      REGISTRAR: 'Dar a Cara',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // BAIRRISTA — A CASA
  // ═══════════════════════════════════════════════════════════════════════
  BAIRRISTA: {
    TITLE: `${E.CASA} Painel do Bairro | Firma RedWood`,
    DESCRIPTION:
      'A Firma não paga conversa. Paga **peso**. Aqui mede-se o que trazes, o que vendes, o que entregas — e quem mete respeito à volta.\n' +
      '\n' +
      `${E.ENTREGA} **Registar Material** — cada quilo conta. Sem registo, não existe.\n` +
      `${E.FIRMA} **Movimento no Bairro** — o teu peso ao vivo. Sem máscaras.\n` +
      `${E.MEDAL_1} **Ranking** — quem rende mais, sobe mais.\n` +
      `${E.ENCOMENDA} **Encomendas** — o que pediste à firma.\n` +
      '\n' +
      '_Peso é o que conta. O resto é conversa._\n' +
      '\n' +
      '— Firma RedWood',
    BUTTONS: {
      ENTREGA: 'Registar Material',
      MOVIMENTO: 'Movimento no Bairro',
      RANKING: 'Ranking',
      ENCOMENDAS: 'Encomendas',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OFICIAL — A SECRETARIA
  // ═══════════════════════════════════════════════════════════════════════
  OFICIAL: {
    TITLE: `${E.VITORIA} A SECRETARIA | FIRMA REDWOOD`,
    DESCRIPTION:
      'Aqui abre-se a rua, aqui fecha-se a conta. Oficial é quem põe o nome em cima — saídas, registos, linha do bairro. **Se decides, responsabilizas-te.**\n' +
      '\n' +
      `${E.SAIDA} **Sessões** — abrir, consultar, fechar saídas.\n` +
      `${E.TOPO} **Estatísticas** — kills, spots, rankings da firma.\n` +
      `${E.ENTREGA} **Material** — registar entregas ou vendas.\n` +
      `${E.FIRMA} **O teu Movimento** — o teu peso no bairro.\n` +
      `${E.MEDAL_1} **Ranking** — quem rende mais.\n` +
      '\n' +
      '_Puxar a rua é peso. Leva-o com mão firme._\n' +
      '\n' +
      '— Firma RedWood',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CHEFIA — O COMANDO
  // ═══════════════════════════════════════════════════════════════════════
  CHEFIA: {
    TITLE: `${E.LIDER} O COMANDO | FIRMA REDWOOD`,
    DESCRIPTION:
      'Aqui não se pergunta — **decide-se**. Daqui abre-se a rua, fecha-se a rua, aperta-se a casa. Chefia vê tudo. Chefia cobra tudo.\n' +
      '\n' +
      `${E.SAIDA} **Sessões** — abrir, acompanhar, fechar.\n` +
      `${E.STOCK} **Stock** — ver, ajustar, governar o material.\n` +
      `${E.RADIO} **Gestão** — rádio, stickys, canais da firma.\n` +
      `${E.TOPO} **Dados** — topos, logs, auditoria.\n` +
      '\n' +
      '_Tudo fica registado. Nada se esquece._\n' +
      '\n' +
      '— Firma RedWood',
    BUTTONS: {
      CRIAR_SAIDA: 'Nova Sessão',
      VER_SAIDAS: 'Sessões Activas',
      VER_STOCK: 'Ver Stock',
      AJUSTAR_STOCK: 'Ajustar Stock',
      GERIR_MATERIAIS: 'Gerir Materiais',
      STICKYS: 'Stickys',
      TOPS: 'Topo',
      LOGS: 'Logs',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PATRÃO DI ZONA — MANDO DA ZONA
  // ═══════════════════════════════════════════════════════════════════════
  PATRAO_DI_ZONA: {
    TITLE: `${E.LIDER} Painel do Patrão di Zona | Firma RedWood`,
    DESCRIPTION:
      'A zona é tua. Vês quem puxa, vês quem some, vês quem pede puxão. Patrão conhece o bairro pelo cheiro — sabe quando dar **colher**, quando dar **tapa**.\n' +
      '\n' +
      `${E.PARTICIPANTE} **Listar Bairristas** — quem anda activo.\n` +
      `${E.ENTREGA} **Entregas** — quem trás mais pedra.\n` +
      `${E.VENDA} **Vendas** — quem roda mais na rua.\n` +
      `${E.TOPO} **Topo da Zona** — os que fazem nome contigo.\n` +
      '\n' +
      '_O bairro é teu. Fá-lo pesar._\n' +
      '\n' +
      '— Firma RedWood',
    BUTTONS: {
      LISTAR: 'Listar Bairristas',
      ENTREGAS: 'Entregas da Zona',
      VENDAS: 'Vendas da Zona',
      TOPOS: 'Topo da Zona',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Canal individual do bairrista (welcome após onboarding)
  // ═══════════════════════════════════════════════════════════════════════
  BAIRRISTA_CHANNEL: {
    WELCOME_TITLE: `${E.SANGUE} ESTA ZONA É TUA`,
    WELCOME_DESCRIPTION: name =>
      `A Firma leu-te, **${name}**. Agora começa.\n` +
      'Este canal é teu — aqui produzes, aqui o bairro vê-te trabalhar.\n' +
      '\n' +
      '**Regista o que trazes. Consulta o teu peso. Sobe.**\n' +
      'Quem não mexe, desaparece.\n' +
      '\n' +
      '— Firma RedWood',
  },
};

module.exports = PANELS;
