# Local setup: the whole platform on one machine

This guide takes a new machine to a working AIR platform: six backend services in
Docker, the local models in Ollama, and this console in a browser. Follow it top to
bottom. It needs about 30 minutes, most of it downloads.

The steps were run as written on 2026-11-16 (macOS, Intel, Docker Desktop 29).

- [1. What you need](#1-what-you-need)
- [2. Get the code](#2-get-the-code)
- [3. Start everything](#3-start-everything)
- [4. Add a cloud model key (recommended)](#4-add-a-cloud-model-key-recommended)
- [5. How the services are wired together](#5-how-the-services-are-wired-together)
- [6. Check it works](#6-check-it-works)
- [7. Day-to-day commands](#7-day-to-day-commands)
- [8. Development keys](#8-development-keys)
- [9. Working on one service](#9-working-on-one-service)
- [10. Troubleshooting](#10-troubleshooting)

## 1. What you need

| Tool | Needed for | Notes |
| --- | --- | --- |
| Git, `make`, `curl` | Everything | Already on macOS and most Linux distributions. On Windows use WSL 2 |
| Docker Desktop (or Docker Engine + Compose v2) | Running every service | Give it at least 6 GB of memory. It must be **running** before you start |
| [Ollama](https://ollama.com) | The local models | Runs on the host, not in Docker. Needs about 3 GB of disk for the two models |
| A Gemini API key | Cloud answers, order lookups and changes | Optional but recommended. See [step 4](#4-add-a-cloud-model-key-recommended) |

Only needed if you will change a service or run its tests on the host:

| Tool | For |
| --- | --- |
| Python 3.12 (as `python3.12`) | air-orchestrator-service, air-classifier-service, air-model-gateway, air-rag-service |
| Node.js 22 LTS | air-tools-gateway (needs 22) and this console (20.9 or later) |
| Go 1.25 | air-infrastructure-service |

Pull the two local models once:

```bash
ollama pull llama3.2:3b          # the local chat model
ollama pull nomic-embed-text     # the embedding model the document search uses
```

## 2. Get the code

All seven repositories must sit **side by side in one folder**. The services find each
other by relative path (`../air-model-gateway`), and so does this console's tooling.
Clone this one, and let it clone the other six beside itself:

```bash
mkdir air && cd air
git clone https://github.com/bookbee/air-web-console.git
cd air-web-console
make platform-clone      # the six sibling repositories, next to this one
```

`make platform-clone` uses the same host and organisation this repository was cloned
from, takes the `develop` branch (every repository's working branch), and skips a
repository that is already there. To clone over SSH or from a fork:
`AIR_GIT_BASE=git@github.com:<org> make platform-clone`.

## 3. Start everything

From this repository:

```bash
cd air-web-console
make platform-doctor     # checks Docker, Ollama, the models and the seven checkouts
make platform-up         # builds and starts the six backends, in order
```

For each repository, `make platform-up` creates the `.env` file if there is none
(from that repository's `.env.example`, plus this console's local wiring: see
[step 5](#5-how-the-services-are-wired-together)), then runs its `make up`. An `.env`
that already exists is never touched. The order:

| Order | Repository | Port | Why this position |
| --- | --- | --- | --- |
| 1 | air-infrastructure-service | 8080 | Creates the shared Docker network `air-net`, and Redis, Postgres and MongoDB. Everything below joins that network and fails loudly without it |
| 2 | air-model-gateway | 8083 | Every model call goes through it |
| 3 | air-classifier-service | 8082 | Uses the gateway and Redis |
| 4 | air-rag-service | 8087 | Uses the gateway to embed its documents at start-up |
| 5 | air-tools-gateway | 8084 | Uses Redis |
| 6 | air-orchestrator-service | 8081 | Calls all of the above |

The first run builds six images and takes several minutes. Later runs take seconds.

Then start the console, in whichever way suits you:

```bash
make up      # in Docker: nothing else to install. http://127.0.0.1:3000
# or
make dev     # on the host with hot reload (needs Node.js). http://127.0.0.1:3000
```

<details>
<summary>The same steps by hand, without <code>make platform-up</code></summary>

```bash
cd ../air-infrastructure-service && make env && make up && make doctor
cd ../air-model-gateway          && cp -n .env.example .env && make up
cd ../air-classifier-service     && make env && cat ../air-web-console/env/local/air-classifier-service.env >> .env && make up
cd ../air-rag-service            && make env && make up
cd ../air-tools-gateway          && make up
cd ../air-orchestrator-service   && make env && cat ../air-web-console/env/local/air-orchestrator-service.env >> .env && make up
cd ../air-web-console            && make env && make up
```

</details>

## 4. Add a cloud model key (recommended)

Without a cloud key the platform still runs, on the local model only:

| | Local model only | With a cloud key |
| --- | --- | --- |
| Chat answers | Yes, slower and simpler | Yes |
| Document search with sources | Yes | Yes |
| Classifier | Tiers 0 to 2 | All four tiers |
| Order lookups and cancellations in chat | **No**: the planner needs the `cloud` class | Yes |

To add one, edit `air-model-gateway/.env` and restart the gateway. Gemini is first in
every cloud chain, so one Gemini key is enough ([get one](https://aistudio.google.com/apikey)):

```bash
# air-model-gateway/.env
AIR_MODEL_GATEWAY_PROVIDERS__GEMINI_API_KEY=<your key>
```

```bash
cd ../air-model-gateway && make up
curl -s localhost:8083/v1/ready      # "gemini": true
```

Cloud calls cost money: a chat turn is typically a fraction of a US cent. Outside
local development the gateway enforces a daily budget per service
(`daily_budget_usd` in its `deploy/policy/policy.<env>.yaml`).
**Never commit a `.env` file.** Every repository ignores them.

## 5. How the services are wired together

Each service's `.env.example` is deliberately minimal: the orchestrator ships with the
classifier, document search, order lookups and the planner **switched off**, so that a
single checkout doesn't report itself degraded against services that aren't running.

This console holds the settings that switch them on for local development, in
[`env/local/`](../../env/local/README.md): one small file per service that needs any,
with a comment on every line. They contain published development keys only.

| When | What happens |
| --- | --- |
| `make platform-up` on a fresh setup | Each missing `.env` is created and the service's block from `env/local/` is appended. Nothing more to do |
| You already had `.env` files | They are left alone. Run `make platform-env` once to append the blocks, then `make platform-up` to restart the services |
| A service's settings changed upstream | Delete the block from its `.env` and run `make platform-env` again |

`make platform-doctor` shows the result under "Integration": each of the orchestrator's
optional services should be `configured`.

Skipped [step 4](#4-add-a-cloud-model-key-recommended)? Change these two lines at the
end of `air-orchestrator-service/.env`, then `make up` in that repository:

```bash
AIR_ORCHESTRATOR_SERVICE__MODEL_GATEWAY__MODEL_CLASS=local
AIR_ORCHESTRATOR_SERVICE__PLANNER__ENABLED=false
```

## 6. Check it works

```bash
make platform-doctor
```

Every line should be green. Then, in the browser at http://127.0.0.1:3000:

1. **System** tab: run the health, readiness and capabilities probes for each service.
2. **Orchestrator** tab → Customer `cust_1001` → send "Where are my recent orders?".
   The answer lists orders 55120, 48213 and 61007.
3. Same tab → "What is your return policy?". The answer cites *Returns and refunds*.
4. **Tools Gateway**, **RAG** and **Model Gateway** tabs → *Run all* under the
   scenarios: every contract check for that service.

Or from a terminal:

```bash
# One model call through the gateway
curl -s localhost:8083/v1/generate -H 'X-API-Key: air-client-dev' \
  -H 'Content-Type: application/json' \
  -d '{"model":"local","messages":[{"role":"user","content":"Say hi"}]}'

# One anonymous chat turn through the orchestrator
curl -s localhost:8081/v1/chat -H 'X-API-Key: airo_local_customer_key' \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is your return policy?"}'
```

Chatting **as a known customer** (order lookups, cancellations) needs a signed customer
token, which the console creates for you. Use the Orchestrator tab's Customer picker
rather than `curl` for those. See "Chatting as a customer" in the [README](../../README.md).

## 7. Day-to-day commands

From this repository:

| Command | Does |
| --- | --- |
| `make platform-status` | Health and readiness of every service |
| `make platform-doctor` | The same, plus tools, models and checkouts |
| `make platform-clone` | Clone any sibling repository that is missing |
| `make platform-env` | Create missing `.env` files and wire the services together |
| `make platform-up` | Start (or rebuild after a code change) every backend |
| `make platform-down` | Stop every backend. Data volumes are kept |
| `make up` / `make down` / `make logs` | The console container |

In any service repository: `make help` lists every target; `make logs` tails that
service; `make up` rebuilds and restarts it after a change. **A service reads `.env`
once at start-up**, so restart it after editing.

After a restart, the order data resets: the tools gateway's fixture orders live in
memory. Orchestrator conversations are in memory too and are lost on restart.

## 8. Development keys

These are published development values. They work only against the development salts
in each repository's `.env.example`, and must never be used outside a laptop.

| Service | Header | Key | Notes |
| --- | --- | --- | --- |
| air-orchestrator-service | `X-API-Key` | `airo_local_customer_key` | Customer channel, `POST /v1/chat` |
| air-orchestrator-service | `X-API-Key` | `airo_local_business_key` | Business channel, `POST /v1/query` |
| air-classifier-service | `X-API-Key` | `airc_local_dev_key` | |
| air-rag-service | `X-API-Key` | `airr_local_dev_key` | Tenant `brightcart` |
| air-tools-gateway | `X-API-Key` | `airtg_read_local_dev` / `airtg_exec_local_dev` | Tenant `brightcart`: read key and execute key |
| air-tools-gateway | `X-API-Key` | `airtg_read_othershop_dev` / `airtg_exec_othershop_dev` | Tenant `othershop`, for isolation tests |
| air-model-gateway | `X-API-Key` | `air-client-dev` | The console's identity. Each service has its own: `air-orchestrator-service-dev`, `air-classifier-dev`, `air-rag-service-dev` |
| air-infrastructure-service | `X-API-Key` | `air-platform-dev` | |
| air-web-console | `Authorization: Bearer` | `air-web-console-dev-gateway-token` | The browser's token to the console's own server |
| Redis, Postgres, MongoDB | password | `localdevpass` | User `air` (Postgres, MongoDB) |

Development customers (tenant `brightcart`): `cust_1001` and `cust_1002` are offered
by the console's Customer picker; `cust_1003` has seven orders covering every status.

## 9. Working on one service

You don't need the whole platform to work on one service. Each service's tests run
with everything else mocked, and each one starts alone:

```bash
cd ../air-classifier-service
make dev        # virtual environment and tools (Python services)
make check      # lint, type-check, tests: no other service needed
make run        # on the host with reload, same port as the container
```

Stop the container first (`make down`) if you want the host process on the same port.
A service running on the host reaches the others on `localhost`, and the Docker
containers reach a host service through `host.docker.internal`.

What each service needs to do something useful:

| Service | Alone it gives you | Add this for more |
| --- | --- | --- |
| air-model-gateway | Local model calls (needs Ollama) | A cloud key |
| air-classifier-service | Tiers 0 and 1 | The gateway and its token for Tiers 2 and 3 |
| air-rag-service | Health only: it can't embed | The gateway (required) |
| air-tools-gateway | Everything: fixture data, in-memory store | Redis for more than one replica |
| air-orchestrator-service | Health only | The gateway (required); the others are optional |
| air-infrastructure-service | Everything (it is the stack) | |

## 10. Troubleshooting

Start with `make platform-doctor`: it names the fix for most of these.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `network air-net not found` when starting a service | air-infrastructure-service isn't up; it owns that network | `cd ../air-infrastructure-service && make up` |
| air-infrastructure-service `/v1/ready` shows every store `"down"`, and its API answers 401 to every key | It was started without a `.env`, so it has no tokens and looks for the stores on `localhost` (bug IN-001) | `make env && make up` in that repo |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running | Start it, wait for the whale icon to settle |
| Gateway `/v1/ready` shows `"ollama": false` | Ollama isn't running, or the models aren't pulled | Start Ollama; `ollama pull llama3.2:3b nomic-embed-text` |
| air-rag-service is `ready: false`, or answers with no citations | The gateway couldn't embed when the service started, so the index is empty | Fix the gateway, then `cd ../air-rag-service && make up`. `curl -s localhost:8087/v1/ready` shows `document_count` (29 when seeded) |
| Chat answers but never looks up an order | The planner is off, there is no cloud key, or you are chatting anonymously | Step 4; `make platform-env` and restart the orchestrator; pick a customer in the console |
| Chat answers "I couldn't find order …" for an order that exists | The order belongs to another customer. This is the isolation working | Use that customer in the picker |
| Classifier answers always come from `t1_classifier`, with no intent | The gateway token isn't set in the classifier's `.env` | `make platform-env`, then `make up` in air-classifier-service |
| Classifier trace shows `t2_local_llm` as `tier_failed` | The local model is too slow on a machine with no GPU. The ladder steps over it to Tier 3 | Expected on such hardware. Not an error |
| A cancel that worked earlier now says the order is already cancelled | The fixture data changed; it resets on restart | `docker restart air-tools-gateway-air-tools-gateway-1` |
| `make up` in a service says "could not probe" right after starting | The check ran before the process was listening | `make status` a few seconds later |
| `make gateway-check` reports 43/45 | Two scenarios need a working Anthropic key | Expected without one; the report names them |
| Port already in use | Another process holds the port | `lsof -nP -iTCP:<port> -sTCP:LISTEN` |
| `make up-observability` in air-infrastructure-service fails on port 3000 | Grafana and this console both use 3000 | Stop the console first, or run it on another port: `make dev PORT=3001` |
| `npx: command not found` on `make check` here | Node.js isn't installed on the host | Install Node.js 22, or run the checks in a container: see [04-testing.md](04-testing.md) |
| A change to `.env` has no effect | The service reads it once at start-up | `make up` again in that repo |
| A setting seems to be ignored | The classifier and orchestrator ignore unknown top-level keys silently | Check the spelling against `.env.example`; then `/v1/capabilities` |
