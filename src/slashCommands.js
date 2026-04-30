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
  new SlashCommandBuilder().setName('versao').setDescription('Estado do bot, versão e saúde dos dados'),

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

  // ── Staff diagnóstico ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('backfill-topicos')
    .setDescription('Cria tópicos em falta para bairristas sem canal individual (chefia)')
    .addBooleanOption(opt =>
      opt.setName('executar').setDescription('true=cria os canais · false/omit=só preview (default)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('cleanup-topicos')
    .setDescription('Arquiva tópicos de ex-bairristas (promovidos, saídos) — liberta slots na categoria (chefia)')
    .addBooleanOption(opt =>
      opt.setName('executar').setDescription('true=arquiva · false/omit=só preview (default)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('organize-topicos')
    .setDescription('Move órfãos, apaga log-bairristas duplicados e separadores — arruma categorias (chefia)')
    .addBooleanOption(opt =>
      opt.setName('executar').setDescription('true=aplica · false/omit=só preview (default)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('nova-categoria-topicos')
    .setDescription('Cria (ou reutiliza) categoria e move TODOS os tópicos para lá (chefia)')
    .addStringOption(opt =>
      opt.setName('nome').setDescription('Nome da categoria (default: BAIRRISTAS)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('dedup-topicos')
    .setDescription('Apaga canais duplicados por bairrista — mantém o mais antigo (chefia)')
    .addBooleanOption(opt =>
      opt.setName('executar').setDescription('true=aplica · false/omit=só preview (default)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('inactivos-bairristas')
    .setDescription('Lista bairristas com pouca ou nenhuma actividade — para avaliar kick (chefia)')
    .addIntegerOption(opt =>
      opt
        .setName('dias_sem_actividade')
        .setDescription('Dias sem actividade para considerar inactivo (default 30)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addIntegerOption(opt =>
      opt
        .setName('min_dias_entrada')
        .setDescription('Ignora bairristas que entraram há menos de N dias (default 14)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(365)
    ),

  new SlashCommandBuilder()
    .setName('sync-sheets')
    .setDescription('Diagnóstico e resync do Google Sheets (chefia)')
    .addStringOption(opt =>
      opt
        .setName('acao')
        .setDescription('status=ver estado · all=resync de todas · tab=resync de uma (default: status)')
        .setRequired(false)
        .addChoices(
          { name: 'status (ver última sync por tab)', value: 'status' },
          { name: 'all (resync de todas as tabs)', value: 'all' },
          { name: 'tab (resync de uma — preenche "tab")', value: 'tab' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('tab')
        .setDescription('Tab a resync (obrigatório se acao=tab)')
        .setRequired(false)
        .addChoices(
          { name: 'dashboard', value: 'dashboard' },
          { name: 'resumo', value: 'resumo' },
          { name: 'membros', value: 'membros' },
          { name: 'saidas', value: 'saidas' },
          { name: 'stock', value: 'stock' },
          { name: 'config', value: 'config' }
        )
    ),

  // ── Staff operacional ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Logs de auditoria')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Registos (default 20)').setRequired(false)),

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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

  // ── Metas semanais ──
  new SlashCommandBuilder()
    .setName('metas')
    .setDescription('Metas da semana')
    .addSubcommand(sc => sc.setName('listar').setDescription('Ver metas actuais'))
    .addSubcommand(sc =>
      sc
        .setName('criar')
        .setDescription('Criar meta (OG+)')
        .addStringOption(o =>
          o
            .setName('scope')
            .setDescription('Âmbito')
            .setRequired(true)
            .addChoices(
              { name: 'Org', value: 'org' },
              { name: 'Membro', value: 'member' },
              { name: 'Role', value: 'role' }
            )
        )
        .addStringOption(o =>
          o.setName('target').setDescription('Alvo (membro/role ou vazio para org)').setRequired(false)
        )
        .addStringOption(o =>
          o
            .setName('metric')
            .setDescription('Métrica')
            .setRequired(true)
            .addChoices(
              { name: 'Entregas (qty)', value: 'deliveries_qty' },
              { name: 'Entregas (€)', value: 'deliveries_value' },
              { name: 'Vendas (qty)', value: 'sales_qty' },
              { name: 'Vendas (€)', value: 'sales_value' },
              { name: 'Saídas', value: 'saidas_count' },
              { name: 'Kills', value: 'kills_count' }
            )
        )
        .addNumberOption(o => o.setName('valor').setDescription('Valor alvo').setRequired(true))
        .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false))
    ),

  // ── Qualidade dos dados ──
  new SlashCommandBuilder()
    .setName('qualidade-dados')
    .setDescription('Painel de qualidade dos dados (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Lifecycle do membro ──
  new SlashCommandBuilder()
    .setName('lifecycle')
    .setDescription('Gerir lifecycle de membros (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc =>
      sc
        .setName('ver')
        .setDescription('Ver estado')
        .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('mudar')
        .setDescription('Mudar estado')
        .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Novo estado')
            .setRequired(true)
            .addChoices(
              { name: 'Pendente', value: 'pending' },
              { name: 'Activo', value: 'active' },
              { name: 'Ausente', value: 'away' },
              { name: 'Em Avaliação', value: 'on_review' },
              { name: 'Promovido', value: 'promoted' },
              { name: 'Rebaixado', value: 'demoted' },
              { name: 'Removido', value: 'removed' },
              { name: 'Saiu do Discord', value: 'left_discord' }
            )
        )
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sc =>
      sc
        .setName('listar')
        .setDescription('Listar por estado')
        .addStringOption(o =>
          o
            .setName('estado')
            .setDescription('Estado')
            .setRequired(true)
            .addChoices(
              { name: 'Pendente', value: 'pending' },
              { name: 'Activo', value: 'active' },
              { name: 'Ausente', value: 'away' },
              { name: 'Em Avaliação', value: 'on_review' },
              { name: 'Promovido', value: 'promoted' },
              { name: 'Rebaixado', value: 'demoted' },
              { name: 'Removido', value: 'removed' },
              { name: 'Saiu do Discord', value: 'left_discord' }
            )
        )
    ),

  // ── Promoções / Rebaixamentos ──
  new SlashCommandBuilder()
    .setName('promover')
    .setDescription('Painel de promoções (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

  // ── Painel de pendências ──
  new SlashCommandBuilder()
    .setName('painel-pendencias')
    .setDescription('Cockpit de pendências da chefia (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Meu painel pessoal ──
  new SlashCommandBuilder().setName('meu-painel').setDescription('O teu centro de notificações pessoal'),

  // ── Relatórios ──
  new SlashCommandBuilder()
    .setName('relatorio')
    .setDescription('Relatório de actividade (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

  // ── Modo Manutenção ──
  new SlashCommandBuilder()
    .setName('manutencao')
    .setDescription('Modo manutenção (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('status').setDescription('Ver estado'))
    .addSubcommand(sc =>
      sc
        .setName('ativar')
        .setDescription('Activar')
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sc => sc.setName('desativar').setDescription('Desactivar')),

  // ── Incidentes ──
  new SlashCommandBuilder()
    .setName('incidentes')
    .setDescription('Gestão de incidentes (OG+)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
];

module.exports = { commands };
