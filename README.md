# Meta Purchase Bridge

Aplicação Node/Express com painel simples, Supabase e envio de Purchase para Meta.

## Arquitetura
Painel → Supabase → backend → Meta.

Há dois modos:
- `APP_EVENTS`: envia para `/{APP_ID}/activities` como `CUSTOM_APP_EVENTS`, compra `fb_mobile_purchase`.
- `CAPI`: envia `Purchase` para `/{DATASET_ID}/events`, com identificadores normalizados e SHA-256.

## Implantação
1. Rode `schema.sql` no SQL Editor do Supabase.
2. Configure no Render as variáveis de `.env.example`.
3. Nunca publique token ou chave real no GitHub.
4. Faça deploy e abra `/health`.
5. Cadastre uma compradora de teste com valor pequeno e use **Enviar Purchase**.
6. Confira a resposta da API no painel e o evento na Meta.

## Segurança
Use uma chave Supabase apropriada somente no backend. Não coloque `META_ACCESS_TOKEN` em arquivos versionados.

## Observação importante
A compatibilidade de `APP_EVENTS` depende das configurações atuais do aplicativo Meta e dos parâmetros aceitos pela versão vigente da Graph API. Se esse modo for rejeitado pela Meta, use `CAPI` para o teste controlado.
