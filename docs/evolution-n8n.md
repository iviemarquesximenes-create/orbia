# ORBIA — Integração Evolution API + n8n

## Canal escolhido

O ORBIA usa **Evolution API com orquestração pelo n8n**, conforme solicitado. Não implementa WhatsApp Cloud API/Meta. A chave Evolution deve permanecer nas credenciais do n8n/Evolution; nunca no frontend ou neste repositório.

O fluxo disponível é: **Evolution → workflow n8n externo → armazenamento privado no ORBIA → evento persistido → revisão humana**. Não há classificação automática, consulta por bot ou envio de mensagens nesta primeira versão. A integração está **pendente de configuração** no ambiente entregue.

## Recebimento implementado

Endpoint de evento: `POST /api/integrations/evolution/events` na origem do aplicativo. Requer HTTPS na implantação, corpo JSON de até 512 KiB e headers:

```text
Authorization: Bearer <segredo protegido N8N_ORBIA_WEBHOOK_SECRET>
X-Orbia-Integration-Id: <UUID da integração registrada no ORBIA>
X-Orbia-Delivery-Id: <identificador estável do evento>
Content-Type: application/json
```

O UUID de integração é obtido pelo cadastro em Configurações ou pela resposta de `POST /api/integrations`. O backend resolve o condomínio pelo registro interno dessa integração; ignora `tenant_id` do payload para autorização. O evento precisa usar a instância registrada. Um administrador/síndico pode habilitar a entrada somente depois de o segredo estar configurado no servidor. **Entrada habilitada não comprova que Evolution ou o workflow estejam conectados.**

Payload canônico:

```json
{
  "schema_version": 1,
  "delivery_id": "ID-ESTAVEL-ORIGINAL-DO-EVENTO",
  "event_type": "message.received",
  "occurred_at": "2026-11-19T12:00:00.000Z",
  "instance": "NOME-EXATO-DA-INSTANCIA-CADASTRADA",
  "chat_id": "IDENTIFICADOR-ORIGINAL-DO-CHAT",
  "is_group": true,
  "message_id": "ID-ORIGINAL-DA-MENSAGEM",
  "sender_id": "ID-ORIGINAL-DO-REMETENTE",
  "message_type": "text",
  "text": "Conteúdo autorizado para revisão",
  "has_media": false,
  "attachments": []
}
```

Os valores acima são exemplos de formato, não dados reais. Para `message.received`, mensagem, remetente e chat são obrigatórios. Data original e instância são obrigatórias para todos os eventos. Versão aceita: `1`. Tipos aceitos: `message.received`, `connection.updated` e `message.status`. Os dois últimos são armazenados como eventos; **não alteram automaticamente o estado de conexão nem comprovam entrega**.

### Envio seguro de imagens e contas

Crie no Supabase Storage um bucket **privado** chamado `orbia-private-documents` (ou configure `SUPABASE_STORAGE_BUCKET`) e configure `SUPABASE_SERVICE_ROLE_KEY` somente na Vercel/servidor. Essa chave nunca vai para o navegador nem para as credenciais do n8n.

Para cada mídia autorizada do grupo, o n8n baixa o arquivo da Evolution e envia os bytes ao endpoint:

```text
POST /api/integrations/evolution/media
Authorization: Bearer <segredo protegido N8N_ORBIA_WEBHOOK_SECRET>
X-Orbia-Integration-Id: <UUID da integração>
X-Orbia-Message-Id: <ID original da mensagem>
X-Orbia-File-Name: <nome original>
Content-Type: image/jpeg | image/png | image/webp | image/heic | image/heif | application/pdf
```

O endpoint aceita até 15 MiB por arquivo, valida a integração ativa, calcula um caminho opaco no tenant e grava no bucket privado. A resposta `201` contém `item.storage_path`, `item.file_name`, `item.mime_type` e `item.size_bytes`. O n8n deve encaminhar esses campos em `attachments` no evento `message.received`, sem enviar URL pública, base64 ou bytes no JSON:

```json
{
  "attachments": [{
    "storage_path": "UUID-DO-TENANT/whatsapp/SHA256",
    "file_name": "comprovante.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 204800
  }]
}
```

O backend valida que o caminho foi gerado para o tenant associado à integração e permite no máximo cinco anexos por mensagem. Pessoas com acesso à fila podem abrir o arquivo por URL assinada válida por cinco minutos. Mensagens e documentos do grupo — incluindo comprovantes de transferência de moradores e contas/comprovantes enviados pelo síndico — entram na fila de revisão humana. **O sistema não cria pagamento nem despesa automaticamente**; depois da conferência, o síndico registra o lançamento financeiro manualmente. A mídia fica na fila de revisão e ainda não é vinculada a um lançamento específico.

O backend guarda campos normalizados, com texto limitado a 4.000 caracteres. Não guarda payload bruto, base64 ou bytes na fila de revisão. `has_media` sem `attachments` continua sendo apenas um indicador; não realiza download/OCR/transcrição. Não importar histórico de conversas privadas indiscriminadamente.

## Respostas, duplicidade e permissões

- `202`: evento novo persistido; mensagem cria uma pendência de revisão.
- `200` com `duplicate: true`: mesmo identificador de entrega já persistido para a integração; não cria outra pendência.
- `400`: contrato, versão, instância ou origem inválidos.
- `401`: segredo ausente/incorreto quando o servidor está configurado.
- `403`: integração inexistente/inativa.
- `429`: limite de requisições atingido; respeitar `Retry-After`.
- `503`: segredo ainda não configurado ou capacidade temporariamente indisponível.
- `415`: tipo de arquivo não permitido no endpoint de mídia.
- `503 DOCUMENT_STORAGE_NOT_CONFIGURED`: bucket/credencial de armazenamento não configurados.

A chave durável é `(tenant_id, integration_id, delivery_id)`. **O n8n precisa conservar o mesmo delivery ID em cada retry**; trocar o ID elimina essa proteção. Retentar somente falhas transitórias, com backoff; não retentar erros de contrato ou credencial indefinidamente. A mensagem original fica vinculada à pendência. Não há ação financeira automática nem reconhecimento de identidade do remetente como usuário autorizado.

Apenas administrador, síndico e financeiro consultam/decidem a fila sensível. Confirmar uma revisão registra uma decisão de triagem, **não confirma pagamento bancário e não cria um lançamento de domínio**. Pedir esclarecimento muda o estado da triagem, mas não envia mensagem ao WhatsApp nesta versão.

## O que preparar no n8n

1. Conferir versão e modalidade da Evolution usada pela administradora. A documentação v2 descreve webhooks por instância e eventos como `MESSAGES_UPSERT` e `CONNECTION_UPDATE` [1].
2. Filtrar eventos de mensagens que pertençam a canais/grupos autorizados; excluir mensagens enviadas pelo próprio bot para prevenir loops.
3. Normalizar o payload da versão instalada para o contrato acima, preservando os IDs e a data reais. O formato bruto da Evolution depende da instalação e não é aceito diretamente pelo ORBIA.
4. Para cada mídia aprovada, enviar bytes ao endpoint `/media`; então incluir a resposta em `attachments` no evento JSON.
5. Enviar o evento pelo HTTP Request do n8n, mantendo o bearer secret em credencial protegida e o ID da integração na configuração do workflow.
6. Respeitar as respostas de erro, manter o delivery ID em retries e registrar falhas sem segredos/conteúdo privado desnecessário.

Não foi importado ou ativado nenhum workflow na instalação da usuária. Antes de conectar, são necessários o export/payload real do workflow, nome da instância, canais autorizados e um segredo ORBIA↔n8n por entrada protegida. O endpoint público do ORBIA depende da publicação; o Preview não é um destino de produção para o n8n.

## Saída e evolução futura

`N8N_ORBIA_OUTBOUND_URL` é um nome reservado para uma evolução futura. **Sua existência não habilita envios:** outbox, bot, comandos, aprovação vinculada a mensagem, retries distribuídos, confirmação de entrega, monitoramento, rotação e segredo individual por integração ainda não foram implementados. O status da API informa `outboundImplemented: false`.

O segredo bearer atual é global ao projeto. Para operação comercial, adotar credenciais isoladas/rotacionáveis por integração e, se compatível com o workflow, HMAC com timestamp/nonce. O limitador atual funciona por processo; múltiplas réplicas exigem limitação compartilhada. A política de retenção deve ser definida antes de receber conversas reais.

## Fontes consultadas

[1]: https://evolution-74046672.mintlify.app/v2/en/configuration/webhooks "Evolution API v2 — webhooks e eventos"
[2]: https://docs.evolutionfoundation.com.br/en/evo-nexus/integrations/evolution-api "Evolution Foundation — integração e credenciais"
[3]: https://github.com/evolution-foundation/evolution-api "Repositório oficial Evolution API"
