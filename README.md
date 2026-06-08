# context-extractor

CLI em Node.js + TypeScript que analisa um diretório de projeto, envia o contexto ao **Gemini via Vertex AI** e grava um arquivo JSON por prompt — pronto para alimentar um grafo de conhecimento no **Neo4j**.

---

## Pré-requisitos

| Requisito | Versão mínima |
|-----------|---------------|
| Node.js | 24 LTS |
| npm | 10+ |
| Conta GCP com Vertex AI ativo | — |
| Service account com papel `Vertex AI User` | — |

> **Nota:** o Node instalado localmente é v20? O código roda sem problema em v20, mas recomendamos v24 para produção. Use `nvm install 24 && nvm use 24` para trocar.

---

## Instalação

```bash
git clone https://github.com/carlosguttemberg/contextExtractor.git
cd contextExtractor
npm install
```

---

## Configuração

### 1. Variáveis de ambiente

Copie o arquivo de exemplo e edite com seus valores:

```bash
cp .env.example .env
```

Abra `.env` e preencha:

```env
# Caminho para o JSON da service account do Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json

# ID do projeto no GCP (obrigatório)
GCP_PROJECT_ID=meu-projeto-gcp

# Região do Vertex AI (padrão: us-central1)
GCP_LOCATION=us-central1

# Modelo Gemini (padrão: gemini-2.5-pro)
GEMINI_MODEL=gemini-2.5-pro

# Pastas (os padrões já funcionam para a estrutura do repo)
PROMPTS_DIR=./prompts
GRAPH_SCHEMA_DIR=./graph-schema
OUTPUT_DIR=./output
```

### 2. Service Account

1. No [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts), crie uma service account.
2. Conceda o papel **Vertex AI User** (`roles/aiplatform.user`).
3. Gere uma chave JSON e salve em `credentials/service-account.json`.

> O arquivo JSON e o `.env` já estão no `.gitignore` — nunca suba credenciais para o repositório.

### 3. Prompts

Crie arquivos `.md` na pasta `prompts/`. Eles são processados em ordem alfabética — use prefixo numérico para controlar a sequência:

```
prompts/
├── 01-arquitetura.md
├── 02-entidades.md
└── 03-dependencias.md
```

**Placeholders disponíveis nos templates:**

| Placeholder | Conteúdo injetado |
|-------------|-------------------|
| `{{PROJECT_TREE}}` | Árvore de arquivos do projeto |
| `{{PROJECT_FILES}}` | Conteúdo dos arquivos relevantes |
| `{{GRAPH_SCHEMA}}` | Schema do Neo4j (de `graph-schema/`) |

**Declarando o schema de saída** (opcional mas recomendado):

Inclua um bloco ` ```jsonschema ` no `.md` para que a saída seja validada automaticamente com AJV:

````markdown
Analise o projeto e retorne **somente** o JSON abaixo, sem markdown, sem explicações.

{{PROJECT_TREE}}

```jsonschema
{
  "type": "object",
  "required": ["nodes"],
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["label", "key", "properties"],
        "properties": {
          "label":      { "type": "string" },
          "key":        { "type": "string" },
          "properties": { "type": "object" }
        }
      }
    }
  }
}
```
````

### 4. Schema do Neo4j (opcional)

Cole o modelo do grafo de destino em `graph-schema/`. Qualquer formato é aceito (`.cypher`, `.md`, `.json`). O conteúdo é injetado nos prompts via `{{GRAPH_SCHEMA}}` e usado para validar labels e tipos de relacionamento nos arquivos Cypher gerados.

Exemplo mínimo em `graph-schema/neo4j.cypher`:

```cypher
// key: id for :Service
// key: id for :Dependency
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Service) REQUIRE n.id IS UNIQUE;
MERGE (:Service {id: "exemplo"});
MERGE (:Dependency {id: "exemplo"});
```

---

## Como usar

### Verificar autenticação

Antes de gastar API, confirme que as credenciais funcionam:

```bash
npm run dev -- src/auth/check.ts
```

Saída esperada:
```
Token gerado: ya29.c.c0... | expira em 3599 segundos
Autenticação OK.
```

### Dry-run (sem chamar o Gemini)

Monta os prompts com o contexto do projeto e imprime o tamanho — útil para auditar antes de gastar créditos:

```bash
npm run dev -- generate --project ./caminho/para/projeto --dry-run
```

### Extração completa

```bash
npm run dev -- generate --project ./caminho/para/projeto
```

Saídas gravadas em `output/`:
- `output/<id>.json` — JSON extraído por prompt
- `output/cypher/<id>.cypher` — comandos Cypher idempotentes para o Neo4j
- `output/_errors/<id>.txt` — erros de parsing/validação (não interrompem a execução)

### Opções do comando `generate`

| Flag | Descrição | Padrão |
|------|-----------|--------|
| `--project <dir>` | Diretório do projeto a analisar | obrigatório |
| `--prompts <dir>` | Diretório dos prompts (sobrescreve `PROMPTS_DIR`) | `.env` |
| `--output <dir>` | Diretório de saída (sobrescreve `OUTPUT_DIR`) | `.env` |
| `--force` | Regravar arquivos que já existem | `false` |
| `--dry-run` | Montar prompts sem chamar o Gemini | `false` |

### Ingestão no Neo4j (`--push`)

Após gerar os `.cypher`, execute-os contra o Neo4j:

```bash
# Adicione ao .env:
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=sua-senha

npm run dev -- push
```

Com `--dry-run` para visualizar os statements sem gravar:

```bash
npm run dev -- push --dry-run
```

---

## Build para produção

```bash
npm run build       # compila TypeScript → dist/
npm start -- generate --project ./meu-projeto
```

---

## Estrutura do projeto

```
contextExtractor/
├── .env.example              # template de variáveis de ambiente
├── prompts/                  # prompts .md (um por aspecto do projeto)
├── graph-schema/             # schema do Neo4j injetado nos prompts
├── output/                   # saídas geradas (gitignore)
│   ├── <id>.json
│   ├── cypher/<id>.cypher
│   └── _errors/<id>.txt
└── src/
    ├── index.ts              # CLI: generate | push
    ├── config.ts             # validação de env com zod
    ├── auth/gemini-auth.ts   # service account → access token
    ├── gemini/client.ts      # chamada ao Gemini com retry/backoff
    ├── project/
    │   ├── scanner.ts        # varredura de arquivos do projeto
    │   └── context.ts        # montagem do contexto com budget de tokens
    ├── prompts/loader.ts     # leitura dos .md e extração de schema
    ├── graph/
    │   ├── schema-loader.ts  # lê graph-schema/ → texto
    │   ├── validate.ts       # validação JSON + AJV
    │   ├── cypher.ts         # geração de Cypher MERGE idempotente
    │   └── ingest.ts         # execução dos .cypher no Neo4j
    └── pipeline/generate.ts  # orquestração do fluxo completo
```

---

## Variáveis de ambiente completas

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `GOOGLE_APPLICATION_CREDENTIALS` | sim | — | Caminho do JSON da service account |
| `GCP_PROJECT_ID` | sim | — | ID do projeto no GCP |
| `GCP_LOCATION` | não | `us-central1` | Região do Vertex AI |
| `GEMINI_MODEL` | não | `gemini-2.5-pro` | Modelo Gemini a usar |
| `PROMPTS_DIR` | não | `./prompts` | Pasta dos prompts `.md` |
| `GRAPH_SCHEMA_DIR` | não | `./graph-schema` | Pasta do schema do Neo4j |
| `OUTPUT_DIR` | não | `./output` | Pasta de saída |
| `CONTEXT_BUDGET_CHARS` | não | `400000` | Limite de caracteres do contexto |
| `GEMINI_TIMEOUT_MS` | não | `120000` | Timeout por chamada (ms) |
| `NEO4J_URI` | só com `push` | — | URI do Neo4j (ex.: `bolt://localhost:7687`) |
| `NEO4J_USER` | só com `push` | — | Usuário do Neo4j |
| `NEO4J_PASSWORD` | só com `push` | — | Senha do Neo4j |
