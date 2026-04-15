# Interaction Handlers

## Overview

All Discord interactions (slash commands, buttons, select menus, modals) are dispatched through `_dispatchInteraction()` in `src/index.js`. Each interaction type has its own section in the dispatcher.

## customId Conventions

Custom IDs follow the pattern: `domain::action[::params]`

| Domain | Examples |
|---|---|
| `onboard` | `onboard::pedir_tag`, `onboard::approve::123` |
| `morador` | `morador::registar_material`, `morador::historico` |
| `oficial` | `oficial::ver_saidas` |
| `chefia` | `chefia::criar_saida`, `chefia::ver_stock` |
| `chefe_mor` | `chefe_mor::listar_moradores` |
| `inv` | `inv::select_tipo_registo`, `inv::modal_entrega_morador` |
| `saida` | `saida::select_close`, `saida::modal_create` |
| `avail` | `avail::vote_select::123`, `avail::all::123::disponivel` |
| `radio` | `radio::random::principal`, `radio::set::principal` |
| `kill` | `kill::modal`, `cemetery::modal_kill` |

## Interaction Flow Diagrams

### Onboarding Flow
```
[Entrada panel] → "Pedir Tag" button (onboard::pedir_tag)
    │
    ▼
showModal (onboard::modal_tag)
    │
    ▼
handleTagModal → creates tag_request in DB
    │
    ▼
[Tags channel] → approval embed with Approve/Deny buttons
    │
    ├── handleApproveButton → creates member, assigns roles, creates channel
    └── handleDenyButton → marks request denied, notifies user
```

### Material Registration Flow
```
[Morador panel] → "Registar Material" button (morador::registar_material)
    │
    ▼
handleRegistarMaterialButton → shows tipo select (inv::select_tipo_registo)
    │
    ▼
handleTipoRegistoSelect → shows item select (inv::select_item_entrega/venda)
    │
    ▼
handleItemSelect → shows quantity modal (inv::modal_entrega_morador/venda_morador)
    │
    ▼
handleQuantityModal → recordDelivery() → DB write + audit + stock notify
```

### Saída Settlement Wizard
```
[Chefia panel] → "Fechar Saída" button (chefia::fechar_saida)
    │
    ▼
handleCloseSaidaButton → shows saída select (saida::select_close)
    │
    ▼
handleCloseSaidaSelect → shows close modal (saida::modal_close)
    │
    ▼
handleCloseSaidaModal → closes operation, starts settlement wizard
    │
    ▼
saidaWizard.handleSelectParticipant (saida::wz_select::*)
    │
    ▼
saidaWizard.handleSettleModal (saida::wz_modal::*)
    │
    ▼
saidaWizard.handleFinish (saida::wz_finish::*) → publishes results
```

## Handler Naming Conventions

- `handle[Action][Type]` — e.g. `handleRegistarMaterialButton`, `handleQuantityModal`
- Button handlers: `handle[Name]Button`
- Select handlers: `handle[Name]Select`
- Modal handlers: `handle[Name]Modal`
- Command handlers: `handle[Name]Command`

## Error Handling Patterns

All handlers follow this pattern:

```js
async function handleMyButton(interaction) {
  // 1. Permission check (if needed)
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, {
      content: MESSAGES.NO_PERMISSION('action'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }

  // 2. Defer for long operations
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 3. Business logic
  try {
    const result = await doSomething();
    return safeReply(interaction, { content: `✅ Done: ${result}` }, { dismissible: true });
  } catch (e) {
    warn(`[MY_HANDLER] ${e.message}`, e);
    return safeReply(interaction, {
      content: 'Erro interno. Tenta novamente.',
    }, { dismissible: true });
  }
}
```

## Rate Limiting Behavior

Rate limits are applied globally in `_dispatchInteraction()` before any handler runs:

- **Regular users**: 10 requests per 10 seconds per action
- **Admins** (Discord `Administrator` permission): 30 requests per 10 seconds

When rate limited, the user receives: `⏱️ Calma — tenta de novo em Xs.`

Rate limit state is in-memory and resets on bot restart.

## Reply Helpers

Always use these helpers instead of calling Discord API directly:

| Helper | Use case |
|---|---|
| `safeReply(interaction, payload, opts)` | Standard reply (handles replied/deferred state) |
| `safeUpdate(interaction, payload, opts)` | Replace message in-place (buttons/selects) |
| `safeShowModal(interaction, modal)` | Show modal + lock originating component |
| `lockMessageComponents(interaction)` | Disable all buttons/selects on a message |

`opts.dismissible: true` auto-deletes ephemeral messages after 10 seconds.
`opts.dismissible: false` keeps the message (needed for multi-step flows).
