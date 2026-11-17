# Retenção de Frota

CRM interno de entregadores em Next.js e Supabase.

## Rodar localmente

Execute `npm ci` e `npm run dev`. Abra http://127.0.0.1:3000 para o login ou /demo para testar com dados fictícios.

## Ligar o Supabase

1. Aplique os arquivos de `supabase/migrations` na ordem de seus nomes ao projeto dedicado, pelo SQL Editor ou pela CLI autenticada.
2. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com a chave pública do projeto. Reinicie o Next.js.
3. Crie o usuário de teste em **Authentication → Users**. Use o UUID da conta para cadastrar o perfil no SQL Editor. Exemplo a adaptar:

```sql
insert into public.colaboradores (id, nome, papel)
select id, 'Nome do supervisor', 'supervisor'
from auth.users
where email = 'email-do-supervisor@example.com';
```

Para o perfil da equipe, use o papel `colaborador`. Sem perfil cadastrado, a conta autenticada não acessa a carteira.

## Sincronizar a semana

O arquivo `integracoes/SheetsSupabase.gs` lê as 26 colunas da aba **Colar Power BI** e pede confirmação antes de enviar o lote. Configure `RETENCAO_SUPABASE_URL` e `RETENCAO_SUPABASE_SECRET` nas propriedades de um Apps Script com editores autorizados. Use a chave secreta Supabase nesse script. A chave pública é a única chave usada no front.

Uma importação cria casos de Alta, Média e Reativação, atualiza a evolução dos casos existentes e preserva os contatos e as atribuições. Monitoramento só entra na evolução de um caso existente. Reenvios atualizam a mesma semana.

## Testar e publicar

### Ativar a central de lotes em um banco já existente

Execute **somente** `supabase/migrations/20261118000800_lotes_novidades.sql` no SQL Editor do projeto Retenção de Frota. Não execute novamente as migrações antigas. Esse arquivo roda em uma transação; não apaga casos, contatos ou evoluções. Precisa das migrações base 001 a 005 já instaladas.

Após executar com sucesso, atualize o site ou clique em **Verificar novamente** na central. Sem essa migração, as novas telas mostram a ativação pendente e os atendimentos existentes continuam disponíveis.

- **Distribuir casos:** prioridade atual ou de entrada, última semana, praça e responsável. Por padrão, só casos sem responsável. Selecione entre páginas ou os primeiros 50 do recorte, escolha o destinatário e revise antes de confirmar. Casos com outro responsável são transferências explícitas.
- **Histórico de lotes:** título, destinatário, quantidade, semanas, autor e data. O lote conserva o registro original mesmo após futuras transferências; abrir o lote exibe apenas casos que o usuário ainda pode acessar.
- **Novidades:** um aviso por lote e um aviso consolidado por colaborador/semana. Reimportar dados idênticos não gera novos avisos. Uma correção real na mesma semana reabre o aviso. A aplicação consulta novidades a cada 45 segundos enquanto visível e ao retornar à janela.
- **Novos para mim:** casos ativos atribuídos após esta atualização que o destinatário ainda não abriu. Ler uma notificação não marca os casos como vistos. Atendimentos existentes não são anunciados retroativamente como lotes novos.
- Os avisos ficam dentro do sistema; não há envio de e-mail, WhatsApp ou notificação do navegador.

Validação local do banco: `npm run test:lotes` executa as migrações em PostgreSQL embarcado, com dados fictícios, e verifica permissões, conflitos de atribuição, notificações, leitura e transferências. Não conecta ao Supabase de produção.

### Publicação

1. Entre como supervisor, confira o Dashboard e atribua casos em **Distribuição**.
2. Entre como colaborador e confira que a carteira mostra seus casos. Abra um cartão e registre um contato ou mova sua etapa.
3. Importe o repositório `ruandalsom-jpg/retencao` no Vercel e configure as duas variáveis públicas do arquivo `.env.example`.
4. Repita os testes com usuários separados no ambiente publicado antes de usar dados reais.
