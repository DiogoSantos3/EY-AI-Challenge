"""
ScrumBot – AI-powered Scrum Master
Flask backend with Anthropic Claude integration.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

# ── Optional: load .env file ─────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed; rely on real env vars

# ── Optional: Groq───────────────────────────────────────────────────
try:
    from groq import Groq

    _client = Groq(
        api_key=os.environ.get("GROQ_API_KEY", "")
    )

    HAS_GROQ = True
except ImportError:
    _client = None
    HAS_GROQ = False


# ── PDF text extraction (best-effort, multiple backends) ──────────────────────
def _extract_pdf(path: str) -> str:
    """Extract plain text from a PDF using available library."""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception:
        pass
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(path)
        return "\n".join(page.get_text() for page in doc)
    except Exception:
        pass
    return ""


# ── App & directory setup ─────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR   = BASE_DIR / "data"
PLANS_DIR  = DATA_DIR / "plans"
PROJ_DIR   = DATA_DIR / "projects"

for _d in (UPLOAD_DIR, DATA_DIR, PLANS_DIR, PROJ_DIR):
    _d.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf"}

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", "scrumbot-dev-key-change-in-prod"),
    UPLOAD_FOLDER=str(UPLOAD_DIR),
    MAX_CONTENT_LENGTH=20 * 1024 * 1024,
)

# ── Built-in project catalogue ────────────────────────────────────────────────
BUILT_IN_PROJECTS: dict[str, dict] = {
    "project1": {
        "name": "Digital Loan Approval System",
        "file": "Project1.pdf",
        "domain": "Fintech",
        "weeks": 12,
    },
    "project2": {
        "name": "Smart Inventory & Replenishment System",
        "file": "Project2.pdf",
        "domain": "Retail",
        "weeks": 20,
    },
    "project3": {
        "name": "Patient Appointment & Triage Assistant",
        "file": "Project3.pdf",
        "domain": "Healthcare",
        "weeks": 16,
    },
}

_proj_cache: dict[str, str] = {}


def get_project_text(pid: str) -> str:
    """Return the full text for a project, using cache → txt file → PDF extraction."""
    if pid in _proj_cache:
        return _proj_cache[pid]

    # 1) Pre-cached text file (fastest, no extra library needed)
    cached = PROJ_DIR / f"{pid}.txt"
    if cached.exists():
        text = cached.read_text(encoding="utf-8")
        _proj_cache[pid] = text
        return text

    # 2) Extract from built-in PDF
    if pid in BUILT_IN_PROJECTS:
        pdf = BASE_DIR / BUILT_IN_PROJECTS[pid]["file"]
        if pdf.exists():
            text = _extract_pdf(str(pdf))
            if text:
                cached.write_text(text, encoding="utf-8")
                _proj_cache[pid] = text
                return text

    # 3) Uploaded PDF
    uploaded = UPLOAD_DIR / f"{pid}.pdf"
    if uploaded.exists():
        text = _extract_pdf(str(uploaded))
        if text:
            cached.write_text(text, encoding="utf-8")
            _proj_cache[pid] = text
            return text

    return ""


# ── Team data ─────────────────────────────────────────────────────────────────
def _load_team() -> str:
    f = BASE_DIR / "Team Members.txt"
    return f.read_text(encoding="utf-8") if f.exists() else ""


TEAM_DATA = _load_team()

# ── AI system prompt ──────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """\
You are ScrumBot — an expert AI Scrum Master with 15+ years of agile coaching experience.

## Team Members Available
{team_data}

## Your Responsibilities
- Analyse project descriptions and extract all requirements
- Generate comprehensive product backlogs with well-formed user stories
- Plan realistic 2-week sprints using Fibonacci story-point estimation (1 2 3 5 8 13)
- Match tasks to team members based on their domain expertise and seniority
- Identify risks, blockers, and cross-story dependencies
- Answer Agile / Scrum methodology questions clearly and concisely

## Conventions
- User-story format: "As a [role], I want [feature] so that [benefit]"
- Typical team velocity: 20-30 story points per 2-week sprint
- Always surface the critical path and key dependencies

## JSON Sprint-Plan Schema
When asked to generate a sprint plan respond with **only** valid JSON matching this schema
(no prose, no markdown fences - raw JSON only):

{{
  "project_name": "string",
  "project_summary": "2-3 sentence summary",
  "total_story_points": 0,
  "recommended_sprints": 0,
  "team_capacity": 0.0,
  "epics": [
    {{"id": "EP-01", "title": "string", "description": "string"}}
  ],
  "backlog": [
    {{
      "id": "US-001",
      "title": "string",
      "story": "As a ..., I want ..., so that ...",
      "story_points": 5,
      "priority": "High",
      "epic": "EP-01",
      "acceptance_criteria": ["string"],
      "assigned_to": "First name only",
      "type": "Feature|Backend|Frontend|Infrastructure|Compliance|Design|Research",
      "sprint": "sprint-1"
    }}
  ],
  "sprints": [
    {{
      "id": "sprint-1",
      "name": "Sprint 1 - Title",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "goal": "string",
      "capacity": 5.5,
      "velocity": 24,
      "stories": ["US-001"],
      "tasks": [
        {{
          "id": "t1",
          "title": "string",
          "points": 3,
          "assignee": "First name only",
          "status": "Todo",
          "type": "string"
        }}
      ]
    }}
  ],
  "risks": [
    {{"level": "High|Medium|Low", "description": "string", "mitigation": "string"}}
  ],
  "recommendations": ["string"]
}}"""


def _build_system(project_text: str = "") -> str:
    base = _SYSTEM_PROMPT.format(team_data=TEAM_DATA)
    if project_text:
        base += f"\n\n## Current Project Description\n{project_text[:8000]}"
    return base


# ── JSON extraction helper ─────────────────────────────────────────────────────
def _extract_json(text: str) -> dict | None:
    for pat in (r"```json\s*([\s\S]+?)\s*```", r"```\s*([\s\S]+?)\s*```"):
        m = re.search(pat, text)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]+\}", text)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# =============================================================================
#  Routes - Pages
# =============================================================================

@app.route("/")
def chat():
    return render_template("chat.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


# =============================================================================
#  Routes - API
# =============================================================================

@app.route("/api/status")
def api_status():
    return jsonify({
        "ok": True,
        "has_groq": HAS_GROQ,
"has_api_key": bool(os.environ.get("GROQ_API_KEY")),
    })


@app.route("/api/projects")
def api_projects():
    result = []
    for pid, info in BUILT_IN_PROJECTS.items():
        pdf_ok = (BASE_DIR / info["file"]).exists()
        txt_ok = (PROJ_DIR / f"{pid}.txt").exists()
        result.append({
            "id": pid,
            "name": info["name"],
            "domain": info.get("domain", ""),
            "weeks": info.get("weeks", 0),
            "available": pdf_ok or txt_ok,
        })
    for f in UPLOAD_DIR.glob("*.pdf"):
        pid = f.stem
        if pid not in BUILT_IN_PROJECTS:
            result.append({"id": pid, "name": pid, "available": True, "uploaded": True})
    return jsonify({"projects": result})


@app.route("/api/team")
def api_team():
    role_keywords = {
        "Product Manager": "Product Manager",
        "Business Analyst": "Business Analyst",
        "Backend Developer": "Backend Developer",
        "Frontend Developer": "Frontend Developer",
        "Data Scientist": "Data Scientist",
        "Machine Learning": "ML Engineer",
        "Data Engineer": "Data Engineer",
        "UX/UI": "UX/UI Designer",
        "DevOps": "DevOps Engineer",
        "Compliance": "Compliance Specialist",
        "Security": "Security Engineer",
        "Healthcare Specialist": "Healthcare Specialist",
    }
    members = []
    for block in TEAM_DATA.strip().split("\n\n"):
        lines = [ln.strip() for ln in block.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        name = lines[0]
        desc = " ".join(lines[1:])
        role = next((v for k, v in role_keywords.items() if k in desc), "Specialist")
        members.append({"name": name, "role": role, "description": desc})
    return jsonify({"members": members})


@app.route("/api/chat", methods=["POST"])
def api_chat():
    if not HAS_GROQ:
        return jsonify({"error": "groq package not installed - run: pip install groq"}), 503
    if not os.environ.get("GROQ_API_KEY"):
        return jsonify({"error": "GROQ_API_KEY not set - create a .env file with your key"}), 503

    body    = request.json or {}
    message = body.get("message", "").strip()
    pid     = body.get("project_id", "")
    history = body.get("history", [])

    if not message:
        return jsonify({"error": "message is required"}), 400

    system   = _build_system(get_project_text(pid) if pid else "")
    messages = [{"role": m["role"], "content": m["content"]} for m in history[-14:]]
    messages.append({"role": "user", "content": message})

    try:
        resp = _client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {
            "role": "system",
            "content": system
        },
        *messages
    ],
    temperature=0.7,
    max_tokens=4096,
)
        return jsonify({
    "response": resp.choices[0].message.content
})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route("/api/generate", methods=["POST"])
def api_generate():
    if not HAS_GROQ:
        return jsonify({
            "error": "groq package not installed - run: pip install groq"
        }), 503

    if not os.environ.get("GROQ_API_KEY"):
        return jsonify({
            "error": "GROQ_API_KEY not set - create a .env file with your key"
        }), 503

    body = request.json or {}
    pid = body.get("project_id", "")
    start_date = body.get("start_date", "2026-06-02")

    project_text = get_project_text(pid)

    if not project_text:
        return jsonify({
            "error": "No project description found - upload a PDF or select a built-in project"
        }), 400

    project_name = BUILT_IN_PROJECTS.get(pid, {}).get("name", pid)

    prompt = (
        f"Generate a complete Scrum sprint plan for the following project.\n\n"
        f"Project: {project_name}\n"
        f"Sprint start date: {start_date}\n"
        f"Sprint duration: 2 weeks\n\n"
        f"PROJECT DESCRIPTION:\n{project_text[:9000]}\n\n"
        "Instructions:\n"
        "- Create user stories that cover ALL stated requirements\n"
        "- Assign each story to the most suitable team member (use first names only)\n"
        "- Group stories into 2-week sprints respecting a velocity of ~24 pts\n"
        "- Include epics, full acceptance criteria, identified risks, and strategic recommendations\n"
        "- Output raw JSON only - no prose, no markdown fences"
    )

    try:
        system = _build_system()

        resp = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": system
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=4096,
            response_format={"type": "json_object"},
        )

        raw = resp.choices[0].message.content

        plan = _extract_json(raw)

        if not plan:
            return jsonify({
                "error": "Could not parse JSON from AI response",
                "raw": raw[:800],
            }), 500

        (PLANS_DIR / f"{pid}.json").write_text(
            json.dumps(plan, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )

        return jsonify({"plan": plan})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
        
@app.route("/api/plan/<pid>", methods=["GET"])
def api_get_plan(pid: str):
    f = PLANS_DIR / f"{pid}.json"
    if f.exists():
        return jsonify({"plan": json.loads(f.read_text(encoding="utf-8"))})
    return jsonify({"plan": None})


@app.route("/api/plan/<pid>", methods=["PUT"])
def api_save_plan(pid: str):
    plan = (request.json or {}).get("plan")
    if not plan:
        return jsonify({"error": "plan payload required"}), 400
    (PLANS_DIR / f"{pid}.json").write_text(
        json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return jsonify({"ok": True})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    f = request.files.get("project_pdf")
    if not f or not f.filename:
        return jsonify({"error": "No file provided"}), 400
    if not _allowed(f.filename):
        return jsonify({"error": "Only PDF files are accepted"}), 400

    filename = secure_filename(f.filename)
    pid      = filename.rsplit(".", 1)[0]
    dest     = UPLOAD_DIR / filename
    f.save(str(dest))

    text = _extract_pdf(str(dest))
    if text:
        (PROJ_DIR / f"{pid}.txt").write_text(text, encoding="utf-8")
        _proj_cache[pid] = text

    return jsonify({
        "project_id": pid,
        "name": pid.replace("-", " ").replace("_", " ").title(),
        "preview": text[:400] if text else "(could not extract text - install pdfplumber)",
        "ok": True,
    })


# =============================================================================
if __name__ == "__main__":
    app.run(debug=True, port=5000)
