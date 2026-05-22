# Pipeline Orchestrator
### A Content-Based Priority Message Routing System

> **B.Tech Capstone Project** — Department of Computer Science & Engineering, SRM University-AP, May 2026

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Apache Kafka](https://img.shields.io/badge/Apache%20Kafka-7.5.0-231F20?style=flat-square&logo=apachekafka)](https://kafka.apache.org/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.x-FF6600?style=flat-square&logo=rabbitmq)](https://www.rabbitmq.com/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

---

## 📄 Project Documents

| Document | Link |
|---|---|
| 📘 Full Capstone Report | [View Report (PDF)](./docs/Capstone_Report_final.pdf) |
| 📊 Presentation Slides | [View Slides (PDF)](./docs/capstone_PPT.pdf) |
| 📝 Publication | *Pipeline Orchestrator: A Content-Based Priority Message Routing System* — **Computer Standards & Interfaces, Elsevier** (Impact Factor: 3.1, Under Revision) |

---

## 📖 Overview

Modern event-driven systems route all messages through a single FIFO queue, treating a fraud alert with the same urgency as a routine analytics report. In real-time financial systems, payment fraud and IoT monitoring platforms, this design flaw causes critical events to queue behind low-priority traffic — with measurable operational consequences.

**Pipeline Orchestrator** is a lightweight, domain-agnostic middleware layer that sits between **Apache Kafka** and **RabbitMQ**. It reads each incoming message, evaluates it against a configurable ruleset, and routes it to the appropriate priority lane — all in **under 1 millisecond**, with zero message loss and zero downtime for rule updates.

---

## ✨ Key Features

- **Content-Based Routing** — Each message is evaluated against up to 50 configurable rules using four operators: `equals`, `greaterThan`, `lessThan`, `contains`
- **Sub-millisecond Latency** — Redis-backed rule cache reduces per-message evaluation to a single in-memory read; avg. latency 0.01–0.04 ms
- **Priority Queue Separation** — Urgent messages are processed up to **86.9% faster** than batch traffic via RabbitMQ's native `x-max-priority` scheduler
- **Zero-Downtime Rule Management** — Create, update, or delete routing rules at runtime via REST API or dashboard without restarting the service
- **Fault Tolerant** — Dead-letter queue, Kafka offset-based replay, and exponential backoff retry ensure no message is silently dropped
- **Horizontally Scalable** — Stateless orchestrator design allows instances to scale in parallel with Kafka partition count
- **Domain-Agnostic** — Works for financial services, healthcare telemetry, IoT sensors, logistics — only the ruleset changes

---

## 🏗️ Architecture

```
Event Producers
      │
      ▼
 Apache Kafka  ◄──────────────────────────────────────┐
 (Ingestion)                                           │ Offset Replay on Failure
      │
      ▼
 Orchestrator Service (Node.js)
  ├── Rule Engine
  │     ├── Redis Cache (sub-ms rule lookup)
  │     └── MongoDB (persistent rule store / fallback)
  └── Publisher (with retry + exponential backoff)
      │
      ├──► urgent.queue    (priority: 10)  → Urgent Consumer
      ├──► batch.queue     (priority: 1)   → Batch Consumer
      └──► dead.letter.queue              → DLQ Consumer / Inspection
                │
                ▼
           MongoDB (RoutingHistory — full audit trail)
                │
                ▼
           REST API (Express)
                │
                ▼
          React Dashboard (live monitoring, rule CRUD)
```

The architecture is organised into four independent layers — **Ingestion → Orchestration → Routing → Persistence & Monitoring** — each of which can be scaled or replaced without affecting the others.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.x on Node.js 22 LTS |
| Message Ingestion | Apache Kafka (Confluent Platform 7.5.0) via KafkaJS |
| Priority Routing | RabbitMQ 3.x via amqplib |
| Rule Cache | Redis 7 |
| Persistence | MongoDB 7 + Mongoose ODM |
| Dashboard | React 18 + Recharts |
| API | Express 5 (REST) |
| Testing | Jest + ts-jest |
| CI/CD | GitHub Actions |
| Infrastructure | Docker + Docker Compose |

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Node.js 22 LTS
- npm or yarn

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/pipeline-orchestrator.git
cd pipeline-orchestrator
```

### 2. Start infrastructure services

```bash
docker-compose up -d
```

This starts Kafka, ZooKeeper, RabbitMQ, MongoDB, and Redis in containers.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env with your local configuration if needed
```

### 5. Run the orchestrator

```bash
npm run start:orchestrator
```

### 6. Start the dashboard

```bash
npm run start:dashboard
```

Open [http://localhost:3000](http://localhost:3000) to view the live dashboard.

### 7. Produce test messages

```bash
npm run produce:bulk -- --count 10000 --urgent-ratio 0.2
```

---

## ⚙️ Rule Configuration

Rules are defined as JSON documents and can be managed at runtime through the dashboard or REST API. No service restart required.

**Rule schema:**

```json
{
  "field": "type",
  "operator": "equals",
  "value": "fraud",
  "targetQueue": "urgent.queue",
  "priority": 1,
  "description": "Route all fraud events to urgent queue"
}
```

**Supported operators:** `equals` · `greaterThan` · `lessThan` · `contains`

**Runtime rule management via REST API:**

```
POST   /api/rules          → Create a new rule
GET    /api/rules          → List all active rules
PUT    /api/rules/:id      → Update a rule
DELETE /api/rules/:id      → Delete a rule
```

Every write invalidates the Redis cache, so the next message is evaluated against the updated ruleset immediately.

---

## 📊 Results Summary

Evaluated across **10 benchmark runs** and **135,000 messages** on a single development machine.

| Metric | Result |
|---|---|
| Routing Accuracy (refined ruleset) | **100%** across 105,000 messages |
| End-to-End Latency (avg) | **0.01 – 0.04 ms** |
| p99 Latency | **< 1 ms** in all configurations |
| Peak Throughput (2 orchestrators) | **4,055 msg/sec** |
| Urgent vs Batch Speed Advantage | **Up to 86.9% faster** |
| Dead-Letter Messages | **0** across all runs |

**Smart System vs. Naïve FIFO Baseline:**

| Metric | Smart System | Naïve FIFO |
|---|---|---|
| Priority Routing Accuracy | 100% | 0% |
| Avg Latency | < 1 ms | < 1 ms |
| Dead-Letter Support | ✅ | ❌ |
| Fault Tolerant | ✅ | ❌ |
| Horizontal Scaling | ✅ | ❌ |
| Runtime Rule Updates | ✅ | ❌ |

---

## 📁 Project Structure

```
pipeline-orchestrator/
├── src/
│   ├── orchestrator/       # Kafka consumer + publisher
│   ├── rule-engine/        # Rule evaluation logic
│   ├── consumers/          # Urgent & batch consumers
│   ├── api/                # Express REST API
│   └── config/             # Queue topology, env config
├── dashboard/              # React frontend
├── scripts/                # Bulk producer, benchmark tools
├── tests/                  # Jest unit tests
├── docs/                   # Report and presentation PDFs
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🧪 Running Tests

```bash
npm test
```

Unit tests cover the Rule Engine across all operators and routing conditions, including edge cases for malformed messages.

---

## 🔭 Future Work

- **Composite Rule Conditions** — Support AND/OR logic across multiple fields in a single rule
- **ML-Powered DLQ Auto-Correction** — Classify failure types and auto-correct malformed messages, republishing to Kafka for autonomous recovery
- **Heuristic Rule Reordering** — Auto-promote frequently matched rules to reduce average evaluation cost
- **Kubernetes Deployment** — Elastic horizontal scaling via Horizontal Pod Autoscaler driven by Kafka consumer lag metrics
- **Non-Financial Domain Validation** — Validate domain-agnosticism against healthcare telemetry and IoT sensor streams

---

## 👥 Team

| Name | Roll Number |
|---|---|
| Thanuja Sekuri | AP22110010830 |
| Parvendan R | AP22110010838 |
| Ashvanth S | AP22110010865 |
| Christo Tonio | AP22110010873 |

**Guide:** Dr. Sravan S S, Department of Computer Science & Engineering, SRM University-AP

---


---

<p align="center">
  Department of Computer Science & Engineering · SRM University-AP · May 2026
</p>
