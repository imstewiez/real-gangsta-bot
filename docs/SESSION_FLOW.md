# Sessão de Saída — Fluxo guiado

Canonical em `src/saidas/saidaSession.js` + `src/saidas/saidaIndividualResult.js`
+ `src/saidas/saidaEngine.js` + `src/saidas/saidaHandlers.js`.

## Filosofia

A sessão é **o centro operacional vivo**. O painel Chefia não tem botões
de sub-passos — toda a gestão da saída está no painel público da sessão.

## Ciclo de vida

```
┌─ A. CRIAR (staff OG+) ─────────────────────────────────────┐
│  Painel Chefia → [Nova Sessão]                            │
│  → select tipo → modal (spot/data/líder/notas)            │
│  → saidaEngine.createSaida()                              │
│  → publishSessionEmbed() no SAIDA_SESSION_CHANNEL_ID      │
│  → evento saida.opened                                     │
└────────────────────────────────────────────────────────────┘
                         ↓
┌─ B. PAINEL VIVO (persistente, cor azul) ──────────────────┐
│  Row 1 — self-service                                     │
│    [Caracterizado (n/12)] [Trabalhador (n)] [Cancelar]   │
│  Row 2 — staff actions                                    │
│    [Staff: Fornecer Arma/Material] [Staff: Fechar Sessão]│
│                                                            │
│  Cada inscrição/cancelamento faz refreshSessionEmbed()    │
│  A lista de inscritos mostra status de arma:              │
│    🔫 própria   📦 org   ⏳ sem arma definida             │
└────────────────────────────────────────────────────────────┘
                         ↓
┌─ C. FECHAR (staff) ───────────────────────────────────────┐
│  Botão do painel → select saída → modal (resultado,       │
│  kills/craft, casa de armazenamento, notas)               │
│  → saidaEngine.closeSaida() transita para `concluida`     │
│  → evento saida.closed                                    │
│  → publica resultados ricos (3 embeds)                    │
└────────────────────────────────────────────────────────────┘
                         ↓
┌─ D. RESULTADO INDIVIDUAL (participante, cor laranja) ─────┐
│  Painel edita-se: botões anteriores desaparecem, surgem:  │
│    [Preencher o meu Resultado]                            │
│    [Staff: Confirmar Devoluções de Arma]                  │
│                                                            │
│  Cada participante clica → modal:                         │
│    · Sobrevivi? (S/N)                                     │
│    · Kills                                                │
│    · Devolvi arma? (ignorado se morri)                   │
│    · Notas                                                │
│  Regra crítica: died=true → weapon_return_status =        │
│    confirmed_not_returned (automático, perdeu)            │
│  Regra crítica: declarou devolução →                      │
│    weapon_return_status = declared_returned               │
│    (fica pendente de confirmação OG+)                     │
│  Evento: saida.individual_result                          │
└────────────────────────────────────────────────────────────┘
                         ↓
┌─ E. CONFIRMAÇÃO DEVOLUÇÃO (staff OG+) ────────────────────┐
│  Staff clica [Staff: Confirmar Devoluções de Arma]        │
│  → ephemeral cockpit com lista de pendências              │
│  → select participante → [✅ Confirmar] [⛔ Rejeitar]     │
│    [⏱️ Inconclusivo]                                       │
│  → UPDATE weapon_return_status                            │
│  → evento weapon.return_confirmed / _rejected / _inconc.  │
│  → routing publica em SAIDAS_EVENTS                       │
│  → sheets projections invalida tabs saidas/membros        │
└────────────────────────────────────────────────────────────┘
```

## Estados de `weapon_return_status`

| Estado                     | Significado                                   |
|----------------------------|-----------------------------------------------|
| `none`                     | Ainda não há declaração                       |
| `not_applicable`           | Trabalhador OU arma própria (sem arma casa)   |
| `declared_returned`        | Participante declarou, pendente OG+           |
| `confirmed_returned`       | OG+ confirmou devolução                       |
| `confirmed_not_returned`   | OG+ rejeitou · OU morreu · OU declarou não    |
| `inconclusive`             | OG+ marcou para rever mais tarde              |

Esta granularidade é usada para calcular disciplina + material_return_rate
correctos.

## Schema

Migration #22 adiciona em `operation_participants`:
- `individual_result_submitted BOOLEAN DEFAULT FALSE`
- `individual_result_at TIMESTAMPTZ`
- `weapon_return_status TEXT` (6 valores possíveis)
- `weapon_return_confirmed_by TEXT`
- `weapon_return_confirmed_at TIMESTAMPTZ`

## CustomIds canónicos

```
saida::session_caracterizado::<saidaId>   # Inscrição como caracterizado
saida::session_trabalhador::<saidaId>     # Inscrição como trabalhador
saida::session_cancel::<saidaId>          # Cancelar inscrição
saida::session_weapon_modal::<saidaId>::<type>  # Modal da inscrição

saida::submit_result::<saidaId>           # Botão — abrir modal
saida::submit_result_modal::<saidaId>     # Modal — submeter

saida::weapon_queue::<saidaId>            # Staff — abrir queue
saida::weapon_confirm_pick::<saidaId>     # Staff — escolher participante
saida::weapon_decide::<saidaId>::<memberId>::<decision>  # Decisão

session::close::<saidaId>                 # Staff — fechar sessão
session::add_participant::<saidaId>       # Staff — adicionar manual
session::issue_material::<saidaId>        # Staff — fornecer material
session::register_material::<saidaId>     # Staff — registar material
```

## Eventos emitidos

| Evento                        | Quando                                     | Tabs Sheets         |
|-------------------------------|--------------------------------------------|---------------------|
| `saida.opened`                | Ao criar saída                             | saidas, resumo, dashboard |
| `saida.started`               | `startSaida()`                             | saidas              |
| `saida.closed`                | Ao fechar                                  | saidas, resumo, dashboard, membros |
| `saida.participant_added`     | Inscrição self-service ou staff           | saidas              |
| `saida.material_issued`       | Staff fornece material nominal             | saidas, stock       |
| `saida.individual_result`     | Participante submete                       | saidas, membros     |
| `weapon.return_confirmed`     | OG+ confirma devolução                     | saidas, membros, dashboard |
| `weapon.return_rejected`      | OG+ rejeita                                | saidas, membros, dashboard |
| `weapon.return_inconclusive`  | OG+ marca inconclusivo                     | saidas, membros     |

---

**Firma RedWood**
