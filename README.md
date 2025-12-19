# 🛡️ Plataforma SRE & Gestão de Incidentes (Incident Response Platform)

> Sistema completo de observabilidade, monitoramento de regras de negócio e orquestração de resposta a incidentes críticos com escalonamento automático.

![Status](https://img.shields.io/badge/Status-Concluído-success)
![Stack](https://img.shields.io/badge/Stack-Node.js%20|%20Python%20|%20React%20|%20PostgreSQL-blue)

## 📋 Sobre o Projeto

Este projeto foi desenvolvido para resolver o desafio de **monitoramento proativo** em ambientes críticos. Diferente de ferramentas que apenas mostram logs, esta plataforma gerencia o ciclo de vida completo do incidente: **Detecção → Notificação → Reconhecimento (ACK) → Resolução**.

O sistema implementa conceitos avançados de **SRE (Site Reliability Engineering)**, como SLAs rigorosos, cálculo de MTTR/MTTA e políticas de escalonamento hierárquico.

## 🚀 Arquitetura da Solução

O sistema opera em uma arquitetura híbrida para maximizar performance e confiabilidade:

* **Backend API (Node.js/Express):** Gerencia conexões stateless, autenticação, RBAC e serve o frontend.
* **Worker Service (Python):** Processo em background responsável pela "inteligência" do sistema. Executa regras SQL, processa filas de notificação e calcula métricas ETL.
* **Database (PostgreSQL):** Armazena regras, usuários, logs de auditoria e estados dos incidentes.
* **Frontend (React):** Dashboards interativos para Operadores e Administradores.

## ⚙️ Funcionalidades Principais

### 1. Monitoramento Inteligente (Runner Python)
O worker executa um loop de verificação contínua que:
* Valida regras SQL personalizadas contra o banco de dados.
* Detecta anomalias e abre incidentes automaticamente.
* Respeita janelas de manutenção e "Silenciamento de Regras".

### 2. Escalation Policies (SLA)
Implementação de lógica defensiva para garantir que nenhum incidente seja ignorado:
* **Notificação Multicanal:** E-mail (SMTP) e Push Notification (Firebase).
* **Auto-Escalation:** Se um operador não der ACK em **45 minutos**, o sistema eleva a prioridade e notifica a gerência automaticamente.
* **Controle de Plantão:** Verifica se o plantonista confirmou presença. Em caso de "No-Show", o sistema realoca o plantão para o próximo da fila.

### 3. Analytics & ETL
Processamento de dados históricos (Pandas) para geração de KPIs em tempo real:
* **MTTA (Mean Time To Acknowledge):** Tempo médio de reação da equipe.
* **MTTR (Mean Time To Resolve):** Tempo médio de solução.
* **Health Score:** Taxa de erros por regra e performance das queries.

### 4. Segurança & RBAC
* Sistema de permissões granulares (Role-Based Access Control).
* Capacidade de sobrepor permissões individuais acima das roles padrão.
* Logs de auditoria imutáveis para todas as ações críticas.

## 🛠️ Tecnologias Utilizadas

* **Back-end:** Node.js, Express, `pg` (Postgres Client).
* **Worker/Data:** Python 3, Pandas, Schedule, Psycopg2.
* **Front-end:** React.js, Recharts (Gráficos), Firebase Auth.
* **Infra:** PostgreSQL, Firebase Cloud Messaging (FCM).

## 📸 Screenshots

<img width="1904" height="875" alt="Captura de tela 2025-12-19 094033" src="https://github.com/user-attachments/assets/6c7b1dd2-84d0-49e1-9dc3-fe8175dd3b98" />
<img width="1897" height="909" alt="Captura de tela 2025-12-19 093904" src="https://github.com/user-attachments/assets/483a2634-2cb9-41c0-9b8b-4486b222d2c9" />

## 📦 Como Rodar Localmente

### Pré-requisitos
* Node.js v18+
* Python 3.10+
* PostgreSQL

### Passos
1.  Clone o repositório
2.  Configure o `.env` (use o `.env.example` como base)
3.  Instale as dependências:
    ```bash
    # Backend
    cd backend && npm install
    
    # Worker
    cd worker && pip install -r requirements.txt
    
    # Frontend
    cd frontend && npm install
    ```
4.  Inicie os serviços:
    * `npm start` (API)
    * `python runner.py` (Worker)
    * `npm run dev` (Frontend)

---
Desenvolvido por Laura Assis Monteiro 
