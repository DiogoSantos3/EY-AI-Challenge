# ScrumBot — AI-powered Scrum Master

An intelligent Scrum Master assistant that automates sprint planning, backlog generation, and team assignment using Claude AI. Built for the EY AI Challenge.

## Features

- **AI Chat** — conversational interface powered by Claude; ask anything about your project
- **Sprint Plan Generation** — one-click generation of a complete backlog (user stories, epics, story points, team assignments, risks)
- **Planning Dashboard** — interactive sprint board with inline editing, burndown chart, team workload chart, and priority breakdown
- **Three Built-in Projects** — Digital Loan Approval System · Smart Inventory & Replenishment System · Patient Appointment & Triage Assistant
- **PDF Upload** — upload your own project specification PDF
- **Plan Persistence** — generated plans are saved locally and reloaded on the dashboard

## Architecture

```
app.py                  Flask backend + AI API routes
templates/
  chat.html             Conversation + project selector
  dashboard.html        Sprint board + charts
static/
  css/styles.css        Dark UI design system
  js/chat.js            Real-time AI chat
  js/dashboard.js       Chart.js charts + inline editing
data/
  projects/             Pre-cached project text files
  plans/                Generated sprint plan JSON files
```

## Setup

### Prerequisites
- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Create and activate a virtual environment

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows:**
```powershell
python -m venv .venv
.venv\Scripts\activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Set your API key

```bash
cp .env.example .env
# then edit .env and paste your Anthropic API key
```

### 4. Start the server
```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

## Usage

1. Go to **Conversation** and select a project from the dropdown
2. Chat with ScrumBot about requirements, team composition, or risks
3. Click **⚡ Generate Sprint Plan** to create a full backlog in seconds
4. Click **View Planning Dashboard** to see the sprint board, charts, and insights
5. Edit sprints and tasks inline, then click **💾 Save Plan**

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python / Flask |
| AI | Anthropic Claude (claude-opus-4-6) |
| PDF parsing | pdfplumber |
| Frontend | Vanilla JS + Chart.js 4 |
| Styling | Custom CSS (dark design system) |

## Notes

- The three project PDFs are pre-cached in `data/projects/` so the app works immediately without pdfplumber for built-in projects
- Team member profiles in `Team Members.txt` are injected into the AI prompt so sprint assignments reflect real team skills
