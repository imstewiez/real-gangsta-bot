'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// ══════════════════════════════════════════════════════════════════════════════
// Slash commands — 10 comandos, todos de 1 palavra, sem prefixo.
//
// Painéis são a via principal. Slash commands existem como atalhos rápidos
// e acções operacionais. Toda a manutenção técnica (sync, reconcile, perms,
// precario, backfill) corre em jobs automáticos — fora da UX do utilizador.
// ══════════════════════════════════════════════════════════════════════════════

const commands = [
  // ── User-facing ────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Stock actual (geral ou de um item)')
    .addStringOption(opt =>
      opt.setName('item').setDescription('Item específico (por casa)').setRequired(false).setAutocomplete(true)
    ),

  new SlashCommandBuilder().setName('catalogo').setDescription('Catálogo de materiais com preços'),

  new SlashCommandBuilder()
    .setName('ficha')
    .setDescription('Ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Quem consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('movimento')
    .setDescription('Movimento no bairro — o teu cockpit pessoal (material, PvP, progressão)'),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Rankings da firma')
    .addStringOption(opt =>
      opt
        .setName('periodo')
        .setDescription('Período')
        .setRequired(false)
        .addChoices(
          { name: 'Semanal', value: 'week' },
          { name: 'Mensal', value: 'month' },
          { name: 'Histórico', value: 'alltime' }
        )
    ),

  new SlashCommandBuilder()
    .setName('saidas')
    .setDescription('As tuas últimas saídas')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID de uma saída específica').setRequired(false)),

  new SlashCommandBuilder().setName('kill').setDescription('Registar uma kill'),

  new SlashCommandBuilder().setName('meu-pedido').setDescription('Ver o estado do teu pedido de tag'),

  // ── Entregas / Vendas rápidas com autocomplete por nome do item ──
  // User escreve o nome parcial → Discord filtra em tempo real.
  new SlashCommandBuilder()
    .setName('entrega')
    .setDescription('Registar entrega rápida de 1 item (com pesquisa por nome)')
    .addStringOption(opt =>
      opt
        .setName('item')
        .setDescription('Nome do item (escreve para pesquisar)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Unidades').setRequired(true).setMinValue(1))
    .addStringOption(opt => opt.setName('nota').setDescription('Nota (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('venda')
    .setDescription('Registar venda rápida de 1 item (com pesquisa por nome)')
    .addStringOption(opt =>
      opt
        .setName('item')
        .setDescription('Nome do item (escreve para pesquisar)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Unidades').setRequired(true).setMinValue(1))
    .addIntegerOption(opt =>
      opt
        .setName('preco')
        .setDescription('Preço custom por unidade em € (opcional — default = catálogo)')
        .setRequired(false)
        .setMinValue(0)
    )
    .addStringOption(opt => opt.setName('nota').setDescription('Nota (opcional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Mover material entre casas')
    .addStringOption(opt => opt.setName('item').setDescription('Item').setRequired(true).setAutocomplete(true))
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Unidades').setRequired(true).setMinValue(1))
    .addStringOption(opt =>
      opt
        .setName('de')
        .setDescription('Origem')
        .setRequired(true)
        .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' })
    )
    .addStringOption(opt =>
      opt
        .setName('para')
        .setDescription('Destino')
        .setRequired(true)
        .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' })
    )
    .addStringOption(opt => opt.setName('nota').setDescription('Nota').setRequired(false)),

  // ── Admin: catálogo de itens ──
  new SlashCommandBuilder()
    .setName('gerir-itens')
    .setDescription('Administrar catálogo de itens (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc.setName('listar').setDescription('Listar itens'))
    .addSubcommand(sc =>
      sc
        .setName('criar')
        .setDescription('Criar novo item')
        .addStringOption(o => o.setName('nome').setDescription('Nome').setRequired(true))
        .addStringOption(o =>
          o
            .setName('categoria')
            .setDescription('Categoria')
            .setRequired(true)
            .addChoices(
              { name: 'Drogas', value: 'drogas' },
              { name: 'Armas', value: 'armas' },
              { name: 'Munições', value: 'munições' },
              { name: 'Equipamento', value: 'equipamento' },
              { name: 'Veículos', value: 'veículos' },
              { name: 'Outros', value: 'outros' }
            )
        )
        .addStringOption(o => o.setName('unidade').setDescription('Unidade').setRequired(true))
        .addNumberOption(o => o.setName('preco_estimado').setDescription('Preço estimado').setRequired(true))
        .addBooleanOption(o => o.setName('encomendavel').setDescription('Pode ser encomendado').setRequired(false))
        .addBooleanOption(o => o.setName('conta_stock').setDescription('Conta para stock').setRequired(false))
        .addBooleanOption(o => o.setName('conta_rankings').setDescription('Conta para rankings').setRequired(false))
        .addNumberOption(o => o.setName('preco_compra').setDescription('Preço compra').setRequired(false))
        .addNumberOption(o => o.setName('stock_alvo').setDescription('Stock alvo').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('editar')
        .setDescription('Editar item')
        .addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addNumberOption(o => o.setName('preco_estimado').setDescription('Preço estimado').setRequired(false))
        .addBooleanOption(o => o.setName('encomendavel').setDescription('Pode ser encomendado').setRequired(false))
        .addBooleanOption(o => o.setName('conta_stock').setDescription('Conta para stock').setRequired(false))
        .addBooleanOption(o => o.setName('conta_rankings').setDescription('Conta para rankings').setRequired(false))
        .addNumberOption(o => o.setName('preco_compra').setDescription('Preço compra').setRequired(false))
        .addNumberOption(o => o.setName('stock_alvo').setDescription('Stock alvo').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('historico')
        .setDescription('Histórico de preços')
        .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
    ),

  // ── Promoções / Rebaixamentos ──
  new SlashCommandBuilder()
    .setName('promover')
    .setDescription('Painel de promoções (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc.setName('proximos').setDescription('Quem está próximo de promoção'))
    .addSubcommand(sc =>
      sc
        .setName('promover')
        .setDescription('Promover manualmente')
        .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
        .addStringOption(o =>
          o
            .setName('cargo')
            .setDescription('Novo cargo')
            .setRequired(true)
            .addChoices(
              { name: 'Young Blood', value: 'young_blood' },
              { name: 'Bairrista', value: 'bairrista' },
              { name: 'Official', value: 'official' },
              { name: 'OG', value: 'og' }
            )
        )
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('rebaixar')
        .setDescription('Rebaixar')
        .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
        .addStringOption(o =>
          o
            .setName('cargo')
            .setDescription('Novo cargo')
            .setRequired(true)
            .addChoices(
              { name: 'Young Blood', value: 'young_blood' },
              { name: 'Bairrista', value: 'bairrista' },
              { name: 'Official', value: 'official' },
              { name: 'OG', value: 'og' }
            )
        )
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    ),

  // ── Meu painel pessoal ──
  new SlashCommandBuilder().setName('meu-painel').setDescription('O teu centro de notificações pessoal'),

  // ── Relatórios ──
  new SlashCommandBuilder()
    .setName('relatorio')
    .setDescription('Relatório de actividade (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o
        .setName('periodo')
        .setDescription('Período')
        .setRequired(false)
        .addChoices(
          { name: 'Hoje', value: 'day' },
          { name: 'Esta semana', value: 'week' },
          { name: 'Este mês', value: 'month' }
        )
    ),

  // ── Incidentes ──
  new SlashCommandBuilder()
    .setName('incidentes')
    .setDescription('Gestão de incidentes (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc
        .setName('listar')
        .setDescription('Listar')
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Filtrar')
            .setRequired(false)
            .addChoices(
              { name: 'Aberto', value: 'open' },
              { name: 'Em análise', value: 'analysing' },
              { name: 'Resolvido', value: 'resolved' },
              { name: 'Ignorado', value: 'ignored' }
            )
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('criar')
        .setDescription('Criar')
        .addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true))
        .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false))
        .addStringOption(o =>
          o
            .setName('severidade')
            .setDescription('Severidade')
            .setRequired(false)
            .addChoices(
              { name: 'Baixa', value: 'low' },
              { name: 'Média', value: 'medium' },
              { name: 'Alta', value: 'high' },
              { name: 'Crítica', value: 'critical' }
            )
        )
        .addStringOption(o => o.setName('fonte').setDescription('Fonte').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('resolver')
        .setDescription('Resolver/actualizar')
        .addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Novo estado')
            .setRequired(true)
            .addChoices(
              { name: 'Aberto', value: 'open' },
              { name: 'Em análise', value: 'analysing' },
              { name: 'Resolvido', value: 'resolved' },
              { name: 'Ignorado', value: 'ignored' }
            )
        )
    ),

  // ── Catálogo melhorado ──
  new SlashCommandBuilder()
    .setName('catalogo-melhorado')
    .setDescription('Catálogo interativo com filtros')
    .addStringOption(o =>
      o
        .setName('categoria')
        .setDescription('Filtrar categoria')
        .setRequired(false)
        .addChoices(
          { name: 'Drogas', value: 'drogas' },
          { name: 'Armas', value: 'armas' },
          { name: 'Munições', value: 'munições' },
          { name: 'Equipamento', value: 'equipamento' },
          { name: 'Veículos', value: 'veículos' },
          { name: 'Outros', value: 'outros' }
        )
    )
    .addStringOption(o => o.setName('pesquisa').setDescription('Pesquisar por nome').setRequired(false)),

  // ── Stock melhorado ──
  new SlashCommandBuilder()
    .setName('stock-melhorado')
    .setDescription('Stock com detalhes')
    .addStringOption(o => o.setName('item').setDescription('Item específico').setRequired(false).setAutocomplete(true)),

  // ── Ajuda / Documentação ──
  new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Centro de ajuda')
    .addStringOption(o =>
      o
        .setName('topico')
        .setDescription('Tópico')
        .setRequired(false)
        .addChoices(
          { name: 'Como entregar', value: 'entregar' },
          { name: 'Como vender', value: 'vender' },
          { name: 'Como encomendar', value: 'encomendar' },
          { name: 'Saídas', value: 'saidas' },
          { name: 'Prémios', value: 'premios' },
          { name: 'Disponibilidade', value: 'disponibilidade' },
          { name: 'Cargos', value: 'cargos' }
        )
    ),

  // ── Tutorial progressivo ──
  new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('Tutorial para novos membros')
    .addIntegerOption(o =>
      o.setName('passo').setDescription('Passo (1-8)').setRequired(false).setMinValue(1).setMaxValue(8)
    ),

  // ── Simular permissões ──
  new SlashCommandBuilder()
    .setName('simular-permissoes')
    .setDescription('Simular permissões de um cargo (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o
        .setName('cargo')
        .setDescription('Cargo')
        .setRequired(true)
        .addChoices(
          { name: 'Young Blood', value: 'young_blood' },
          { name: 'Bairrista', value: 'bairrista' },
          { name: 'Official', value: 'official' },
          { name: 'Patrão di Zona', value: 'patrao_di_zona' },
          { name: 'OG', value: 'og' }
        )
    ),

  // ── Tarefas ──
  new SlashCommandBuilder()
    .setName('tarefas')
    .setDescription('Gestão de tarefas')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc
        .setName('listar')
        .setDescription('Listar tarefas')
        .addUserOption(o => o.setName('membro').setDescription('Filtrar').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('criar')
        .setDescription('Criar tarefa (OG+)')
        .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
        .addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true))
        .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false))
        .addStringOption(o =>
          o
            .setName('tipo')
            .setDescription('Tipo')
            .setRequired(false)
            .addChoices(
              { name: 'Entregar', value: 'deliver' },
              { name: 'Saídas', value: 'participate_saidas' },
              { name: 'Encomenda', value: 'manage_order' },
              { name: 'Arma', value: 'return_weapon' },
              { name: 'Pendência', value: 'resolve_pending' },
              { name: 'Outro', value: 'custom' }
            )
        )
        .addStringOption(o => o.setName('prazo').setDescription('Prazo (ISO)').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('atualizar')
        .setDescription('Actualizar estado')
        .addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Estado')
            .setRequired(true)
            .addChoices(
              { name: 'Pendente', value: 'pending' },
              { name: 'Em progresso', value: 'in_progress' },
              { name: 'Concluída', value: 'completed' },
              { name: 'Falhada', value: 'failed' }
            )
        )
    ),

  // ── Reputação ──
  new SlashCommandBuilder()
    .setName('reputacao')
    .setDescription('Ver reputação interna de um membro (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true)),

  // ── Ausências ──
  new SlashCommandBuilder()
    .setName('ausencias')
    .setDescription('Gestão de ausências')
    .addSubcommand(sc =>
      sc
        .setName('listar')
        .setDescription('Listar')
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Filtrar')
            .setRequired(false)
            .addChoices(
              { name: 'Pendente', value: 'pending' },
              { name: 'Aprovada', value: 'approved' },
              { name: 'Rejeitada', value: 'rejected' }
            )
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('submeter')
        .setDescription('Submeter ausência')
        .addStringOption(o => o.setName('inicio').setDescription('Data início (YYYY-MM-DD)').setRequired(true))
        .addStringOption(o => o.setName('fim').setDescription('Data fim (YYYY-MM-DD)').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('aprovar')
        .setDescription('Aprovar/rejeitar (OG+)')
        .addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Decisão')
            .setRequired(true)
            .addChoices({ name: 'Aprovar', value: 'approved' }, { name: 'Rejeitar', value: 'rejected' })
        )
    ),

  // ── Exportar ──
  new SlashCommandBuilder()
    .setName('exportar')
    .setDescription('Exportar dados (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o
        .setName('tipo')
        .setDescription('Tipo')
        .setRequired(true)
        .addChoices(
          { name: 'Entregas', value: 'entregas' },
          { name: 'Vendas', value: 'vendas' },
          { name: 'Saídas', value: 'saidas' }
        )
    )
    .addStringOption(o => o.setName('inicio').setDescription('Data início (ISO)').setRequired(true))
    .addStringOption(o => o.setName('fim').setDescription('Data fim (ISO)').setRequired(false)),

  // ── Meu resumo ──
  new SlashCommandBuilder().setName('meu-resumo').setDescription('O teu resumo semanal e pendentes'),

  // ── Primeira utilização ──
  new SlashCommandBuilder().setName('primeira-vez').setDescription('Guia de primeira utilização'),
];

module.exports = { commands };
