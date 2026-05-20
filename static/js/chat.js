/* ============================================================
   ScrumBot – Chat page
   ============================================================ */

const chatWindow   = document.getElementById("chatWindow");
const chatForm     = document.getElementById("chatForm");
const chatInput    = document.getElementById("chatMessage");
const sendBtn      = document.getElementById("sendBtn");
const generateBtn  = document.getElementById("generateBtn");
const projectSel   = document.getElementById("projectSelect");
const agentStatus  = document.getElementById("agentStatus");
const planReady    = document.getElementById("planReady");
const dashLink     = document.getElementById("dashLink");
const uploadForm   = document.getElementById("uploadForm");

let currentProjectId = null;
let chatHistory      = [];
let isLoading        = false;

/* ── Text helpers ────────────────────────────────────────────── */

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMarkdown(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g,     "<em>$1</em>")
    .replace(/`(.*?)`/g,       "<code>$1</code>")
    .replace(/\n/g,            "<br>");
}

/* ── Bubble helpers ──────────────────────────────────────────── */

function addMessage(role, text, isTyping) {
  const div = document.createElement("div");
  div.className = "bubble " + role + (isTyping ? " typing" : "");
  if (isTyping) div.id = "typing-indicator";

  const label = role === "user" ? "You" : "ScrumBot";

  if (isTyping) {
    div.innerHTML =
      '<div class="bubble-label">' + label + "</div>" +
      '<div class="typing-dots"><span></span><span></span><span></span></div>';
  } else {
    div.innerHTML =
      '<div class="bubble-label">' + label + "</div>" +
      '<div class="bubble-content">' + formatMarkdown(text) + "</div>";
  }

  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return div;
}

function removeTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

function setLoading(state) {
  isLoading          = state;
  sendBtn.disabled   = state;
  chatInput.disabled = state;
}

/* ── Initialise ──────────────────────────────────────────────── */

async function init() {
  await Promise.all([loadProjects(), checkStatus()]);
}

async function loadProjects() {
  try {
    const res  = await fetch("/api/projects");
    const data = await res.json();
    data.projects.forEach(function(p) {
      const opt        = document.createElement("option");
      opt.value        = p.id;
      opt.textContent  = p.name + (p.domain ? " (" + p.domain + ")" : "");
      opt.disabled     = !p.available;
      projectSel.appendChild(opt);
    });
  } catch (_) {}
}

async function checkStatus() {
  try {
    const res  = await fetch("/api/status");
    const data = await res.json();
    if (!data.has_api_key) {
      agentStatus.innerHTML =
        '<span class="status-dot err"></span>' +
        '<span class="status-warn"> GROQ_API_KEY not set — add to .env</span>';
    } else {
      agentStatus.innerHTML =
        '<span class="status-dot ok"></span>' +
        '<span class="status-ok"> AI ready</span>';
    }
  } catch (_) {
    agentStatus.innerHTML =
      '<span class="status-dot err"></span>' +
      '<span class="status-err"> Server not responding</span>';
  }
}

/* ── Project selection ───────────────────────────────────────── */

projectSel.addEventListener("change", async function(e) {
  currentProjectId     = e.target.value || null;
  generateBtn.disabled = !currentProjectId;
  chatHistory          = [];
  planReady.style.display = "none";

  if (!currentProjectId) return;

  var name = e.target.options[e.target.selectedIndex].text;
  addMessage("agent",
    "Project loaded: **" + name + "**\n\n" +
    "I'm ready to help! You can:\n" +
    "- Ask me about requirements, epics, or user stories\n" +
    "- Click **⚡ Generate Sprint Plan** for a complete backlog\n" +
    "- Use the quick prompts below\n" +
    "- Ask about team assignments, risks, or timeline"
  );

  try {
    const res  = await fetch("/api/plan/" + currentProjectId);
    const data = await res.json();
    if (data.plan) {
      planReady.style.display = "block";
      dashLink.href = "/dashboard?project=" + currentProjectId;
    }
  } catch (_) {}
});

/* ── Chat submit ─────────────────────────────────────────────── */

chatForm.addEventListener("submit", async function(e) {
  e.preventDefault();
  var text = chatInput.value.trim();
  if (!text || isLoading) return;

  chatInput.value = "";
  addMessage("user", text);
  chatHistory.push({ role: "user", content: text });

  setLoading(true);
  addMessage("agent", "", true);

  try {
    const res = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        message:    text,
        project_id: currentProjectId,
        history:    chatHistory.slice(-14),
      }),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      addMessage("error", "⚠ " + data.error);
    } else {
      addMessage("agent", data.response);
      chatHistory.push({ role: "assistant", content: data.response });
    }
  } catch (_) {
    removeTyping();
    addMessage("error", "Connection error — is the Flask server running?");
  }

  setLoading(false);
  chatInput.focus();
});

/* ── Quick prompts ───────────────────────────────────────────── */

document.querySelectorAll(".chip").forEach(function(btn) {
  btn.addEventListener("click", function() {
    chatInput.value = btn.dataset.prompt;
    chatForm.dispatchEvent(new Event("submit"));
  });
});

/* ── Generate sprint plan ────────────────────────────────────── */

generateBtn.addEventListener("click", async function() {
  if (!currentProjectId || isLoading) return;

  var userMsg = "Generate a complete sprint plan for this project.";
  addMessage("user", userMsg);
  chatHistory.push({ role: "user", content: userMsg });

  setLoading(true);
  generateBtn.disabled    = true;
  generateBtn.textContent = "⏳ Generating…";
  addMessage("agent", "", true);

  try {
    var today = new Date().toISOString().split("T")[0];
    const res = await fetch("/api/generate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ project_id: currentProjectId, start_date: today }),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      addMessage("error", "⚠ " + data.error);
    } else {
      var plan      = data.plan;
      var epicsStr  = (plan.epics || []).map(function(ep) { return ep.title; }).join(", ") || "—";
      var msg =
        "✅ Sprint plan generated for **" + plan.project_name + "**!\n\n" +
        "📋 **" + (plan.backlog || []).length + " user stories** · " +
        "**" + (plan.sprints || []).length + " sprints** · " +
        "**" + (plan.total_story_points || "?") + " story points**\n\n" +
        "🗂 **Epics:** " + epicsStr + "\n\n" +
        "⚠️ **Risks:** " + (plan.risks || []).length + " identified · " +
        "**Recommendations:** " + (plan.recommendations || []).length + "\n\n" +
        "The full plan is saved — open the Planning Dashboard to view and edit it.";

      addMessage("agent", msg);
      chatHistory.push({ role: "assistant", content: msg });

      var cta = document.createElement("div");
      cta.className = "bubble cta-bubble";
      cta.innerHTML = '<a href="/dashboard?project=' + currentProjectId + '" class="dash-cta-btn">View Planning Dashboard →</a>';
      chatWindow.appendChild(cta);
      chatWindow.scrollTop = chatWindow.scrollHeight;

      planReady.style.display = "block";
      dashLink.href = "/dashboard?project=" + currentProjectId;
    }
  } catch (_) {
    removeTyping();
    addMessage("error", "Failed to generate plan — check your API key and server logs.");
  }

  setLoading(false);
  generateBtn.disabled    = !currentProjectId;
  generateBtn.textContent = "⚡ Generate Sprint Plan";
});

/* ── Upload PDF ──────────────────────────────────────────────── */

uploadForm.addEventListener("submit", async function(e) {
  e.preventDefault();
  var file = document.getElementById("project_pdf").files[0];
  if (!file) return;

  var fd = new FormData();
  fd.append("project_pdf", file);

  try {
    const res  = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (data.ok) {
      var opt        = document.createElement("option");
      opt.value      = data.project_id;
      opt.textContent = data.name;
      projectSel.appendChild(opt);
      projectSel.value = data.project_id;
      projectSel.dispatchEvent(new Event("change"));
    } else {
      addMessage("error", "⚠ " + (data.error || "Upload failed"));
    }
  } catch (_) {
    addMessage("error", "Upload error — check server connection.");
  }
});

/* ── Boot ────────────────────────────────────────────────────── */
init();
