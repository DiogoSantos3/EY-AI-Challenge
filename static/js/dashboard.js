/* ============================================================
   ScrumBot – Planning Dashboard
   ============================================================ */

var currentPlan    = null;
var burndownChart  = null;
var workloadChart  = null;
var priorityChart  = null;

var CHART_COLORS = [
  "#ffb347","#64ffda","#ff6f61","#a78bfa",
  "#34d399","#f472b6","#60a5fa","#fbbf24",
  "#6ee7b7","#f87171","#818cf8","#fb923c"
];

/* ── Boot ────────────────────────────────────────────────────── */

async function init() {
  await loadProjects();
}

async function loadProjects() {
  try {
    const res  = await fetch("/api/projects");
    const data = await res.json();
    var select = document.getElementById("dashProjectSelect");

    data.projects.forEach(function(p) {
      var opt        = document.createElement("option");
      opt.value      = p.id;
      opt.textContent = p.name + (p.domain ? " (" + p.domain + ")" : "");
      select.appendChild(opt);
    });

    // Auto-load from URL param
    var params = new URLSearchParams(window.location.search);
    var pid    = params.get("project");
    if (pid) {
      select.value = pid;
      if (select.value === pid) {
        await loadPlan(pid);
      }
    }
  } catch (_) {}
}

/* ── Load plan ───────────────────────────────────────────────── */

async function loadPlan(pid) {
  var statusEl = document.getElementById("loadStatus");
  statusEl.textContent  = "Loading…";
  statusEl.className    = "load-status";

  try {
    const res  = await fetch("/api/plan/" + pid);
    const data = await res.json();

    if (data.plan) {
      currentPlan = data.plan;
      renderPlan(data.plan);
      statusEl.textContent = "✓ Loaded";
      statusEl.className   = "load-status ok";
    } else {
      statusEl.textContent = "No plan found — generate one from Conversation";
      statusEl.className   = "load-status warn";
    }
  } catch (_) {
    statusEl.textContent = "Error loading plan";
    statusEl.className   = "load-status err";
  }
}

/* ── Render ──────────────────────────────────────────────────── */

function renderPlan(plan) {
  document.getElementById("planTitle").textContent   = plan.project_name || "Sprint Board";
  document.getElementById("planSummary").textContent = plan.project_summary || "";
  renderMetrics(plan);
  renderCharts(plan);
  renderBoard(plan);
  renderInsights(plan);
}

/* Metrics */
function renderMetrics(plan) {
  var sprints = plan.sprints || [];
  var backlog = plan.backlog || [];

  var avgVelocity = sprints.length
    ? Math.round(sprints.reduce(function(s, sp) { return s + (sp.velocity || 0); }, 0) / sprints.length)
    : 0;

  var blocked = sprints.reduce(function(s, sp) {
    return s + (sp.tasks || []).filter(function(t) { return t.status === "Blocked"; }).length;
  }, 0);

  var assignees = new Set(backlog.map(function(s) { return s.assigned_to; }).filter(Boolean));

  document.getElementById("mVelocity").textContent = avgVelocity || "—";
  document.getElementById("mPoints").textContent   = plan.total_story_points || "—";
  document.getElementById("mSprints").textContent  = sprints.length || "—";
  document.getElementById("mBlocked").textContent  = blocked;
  document.getElementById("mTeam").textContent     = assignees.size || "—";
}

/* Charts */
function renderCharts(plan) {
  var sprints = plan.sprints || [];
  var backlog = plan.backlog || [];

  Chart.defaults.color       = "#8b92a8";
  Chart.defaults.borderColor = "rgba(255,255,255,0.08)";

  /* Burndown */
  var total     = plan.total_story_points || 0;
  var burnLabels = ["Start"].concat(sprints.map(function(s, i) { return "S" + (i + 1); }));
  var burnActual = [total];
  var burnIdeal  = [total];
  var rem = total;
  var step = sprints.length > 0 ? total / sprints.length : 0;

  sprints.forEach(function(s, i) {
    rem -= (s.velocity || 24);
    burnActual.push(Math.max(0, rem));
    burnIdeal.push(Math.max(0, Math.round(total - step * (i + 1))));
  });

  if (burndownChart) burndownChart.destroy();
  burndownChart = new Chart(document.getElementById("burndownChart"), {
    type: "line",
    data: {
      labels: burnLabels,
      datasets: [
        {
          label: "Remaining",
          data: burnActual,
          borderColor: "#ffb347",
          backgroundColor: "rgba(255,179,71,0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: "#ffb347",
        },
        {
          label: "Ideal",
          data: burnIdeal,
          borderColor: "#64ffda",
          borderDash: [6, 4],
          pointRadius: 0,
          backgroundColor: "transparent",
          tension: 0,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "top", labels: { font: { size: 12 } } } },
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.06)" } },
        x: { grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });

  /* Team workload (horizontal bar) */
  var workload = {};
  backlog.forEach(function(s) {
    if (s.assigned_to) {
      workload[s.assigned_to] = (workload[s.assigned_to] || 0) + (s.story_points || 0);
    }
  });
  var wNames  = Object.keys(workload).sort(function(a, b) { return workload[b] - workload[a]; });
  var wValues = wNames.map(function(n) { return workload[n]; });

  if (workloadChart) workloadChart.destroy();
  workloadChart = new Chart(document.getElementById("workloadChart"), {
    type: "bar",
    data: {
      labels: wNames,
      datasets: [{
        label: "Story Points",
        data: wValues,
        backgroundColor: wNames.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length] + "bb"; }),
        borderColor:     wNames.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length]; }),
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { grid: { display: false } }
      }
    }
  });

  /* Priority doughnut */
  var counts = { High: 0, Medium: 0, Low: 0 };
  backlog.forEach(function(s) {
    if (counts[s.priority] !== undefined) counts[s.priority]++;
  });

  if (priorityChart) priorityChart.destroy();
  priorityChart = new Chart(document.getElementById("priorityChart"), {
    type: "doughnut",
    data: {
      labels: ["High", "Medium", "Low"],
      datasets: [{
        data: [counts.High, counts.Medium, counts.Low],
        backgroundColor: ["rgba(255,111,97,0.8)", "rgba(255,179,71,0.8)", "rgba(100,255,218,0.8)"],
        borderColor:     ["#ff6f61", "#ffb347", "#64ffda"],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      cutout: "62%",
      plugins: { legend: { position: "bottom", labels: { font: { size: 12 } } } }
    }
  });
}

/* Sprint board */
function renderBoard(plan) {
  var board = document.getElementById("sprintBoard");
  board.innerHTML = "";

  if (!plan.sprints || plan.sprints.length === 0) {
    board.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-icon">📋</div>' +
      '<p>No sprints in this plan yet.</p>' +
      '</div>';
    return;
  }

  plan.sprints.forEach(function(sprint) {
    var card = document.createElement("article");
    card.className = "sprint-card";

    var statusOpts = ["Draft","Planned","Active","Completed"].map(function(s) {
      return '<option' + (sprint.status === s ? ' selected' : '') + '>' + s + '</option>';
    }).join("");

    var taskRows = (sprint.tasks || []).map(function(task) {
      var statusOpts2 = ["Todo","In progress","Blocked","Done"].map(function(s) {
        return '<option' + (task.status === s ? ' selected' : '') + '>' + s + '</option>';
      }).join("");
      return (
        '<tr data-task-id="' + esc(task.id) + '">' +
        '<td><input type="text" data-task-field="title" value="' + esc(task.title) + '"></td>' +
        '<td><input type="number" data-task-field="points" value="' + (task.points || 1) + '" style="width:52px"></td>' +
        '<td><input type="text" data-task-field="assignee" value="' + esc(task.assignee || "") + '"></td>' +
        '<td><input type="text" data-task-field="type" value="' + esc(task.type || "") + '"></td>' +
        '<td><select data-task-field="status">' + statusOpts2 + '</select></td>' +
        '</tr>'
      );
    }).join("");

    card.innerHTML =
      '<div class="sprint-card-header">' +
        '<div class="sprint-card-header-left">' +
          '<input class="sprint-name-input" type="text" data-field="name" value="' + esc(sprint.name) + '">' +
          '<span class="sprint-dates">' + (sprint.start || "?") + ' → ' + (sprint.end || "?") + '</span>' +
        '</div>' +
        '<select data-field="status">' + statusOpts + '</select>' +
      '</div>' +

      '<div class="sprint-goal-row">' +
        '<label>Goal</label>' +
        '<input type="text" data-field="goal" value="' + esc(sprint.goal || "") + '">' +
      '</div>' +

      '<div class="sprint-meta-grid">' +
        '<div class="sprint-meta-item"><label>Start</label><input type="date" data-field="start" value="' + (sprint.start || "") + '"></div>' +
        '<div class="sprint-meta-item"><label>End</label><input type="date" data-field="end" value="' + (sprint.end || "") + '"></div>' +
        '<div class="sprint-meta-item"><label>Capacity (FTE)</label><input type="number" step="0.5" data-field="capacity" value="' + (sprint.capacity || 5) + '"></div>' +
        '<div class="sprint-meta-item"><label>Velocity (pts)</label><input type="number" data-field="velocity" value="' + (sprint.velocity || 24) + '"></div>' +
      '</div>' +

      '<table class="tasks-table">' +
        '<thead><tr><th>Task</th><th>Pts</th><th>Assignee</th><th>Type</th><th>Status</th></tr></thead>' +
        '<tbody>' + taskRows + '</tbody>' +
      '</table>' +

      '<div class="sprint-actions">' +
        '<button class="ghost-sm add-task-btn">+ Add Task</button>' +
      '</div>';

    /* Sprint field listeners */
    card.querySelectorAll("[data-field]").forEach(function(el) {
      el.addEventListener("change", function() {
        sprint[el.dataset.field] = el.value;
        renderMetrics(currentPlan);
        renderCharts(currentPlan);
      });
    });

    /* Task field listeners */
    card.querySelectorAll("[data-task-field]").forEach(function(el) {
      el.addEventListener("change", function() {
        var row = el.closest("tr");
        var tid = row.dataset.taskId;
        var task = (sprint.tasks || []).find(function(t) { return t.id === tid; });
        if (task) task[el.dataset.taskField] = el.value;
        renderMetrics(currentPlan);
      });
    });

    /* Add task */
    card.querySelector(".add-task-btn").addEventListener("click", function() {
      sprint.tasks = sprint.tasks || [];
      sprint.tasks.push({
        id:       "t" + Date.now(),
        title:    "New task",
        points:   2,
        assignee: "",
        type:     "Feature",
        status:   "Todo",
      });
      renderBoard(currentPlan);
    });

    board.appendChild(card);
  });
}

/* Insights */
function renderInsights(plan) {
  var panel    = document.getElementById("insightPanel");
  var riskEl   = document.getElementById("risksList");
  var recEl    = document.getElementById("recsList");

  if (!(plan.risks && plan.risks.length) && !(plan.recommendations && plan.recommendations.length)) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";

  if (plan.risks && plan.risks.length) {
    riskEl.innerHTML = "<h3>Risks</h3>" + plan.risks.map(function(r) {
      var lvl = (r.level || "medium").toLowerCase();
      return (
        '<div class="risk-item risk-' + lvl + '">' +
          '<span class="risk-badge">' + (r.level || "Medium") + '</span>' +
          '<div>' +
            '<p>' + escHtml(r.description || "") + '</p>' +
            '<p class="risk-mitigation">→ ' + escHtml(r.mitigation || "") + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  } else {
    riskEl.innerHTML = "";
  }

  if (plan.recommendations && plan.recommendations.length) {
    recEl.innerHTML =
      "<h3>Recommendations</h3><ul>" +
      plan.recommendations.map(function(r) { return "<li>" + escHtml(r) + "</li>"; }).join("") +
      "</ul>";
  } else {
    recEl.innerHTML = "";
  }
}

/* ── Actions ─────────────────────────────────────────────────── */

document.getElementById("loadPlanBtn").addEventListener("click", async function() {
  var pid = document.getElementById("dashProjectSelect").value;
  if (pid) await loadPlan(pid);
});

document.getElementById("addSprintBtn").addEventListener("click", function() {
  if (!currentPlan) return;
  currentPlan.sprints = currentPlan.sprints || [];
  var n = currentPlan.sprints.length + 1;
  currentPlan.sprints.push({
    id:       "sprint-" + Date.now(),
    name:     "Sprint " + n + " — New Sprint",
    start:    new Date().toISOString().split("T")[0],
    end:      "",
    goal:     "Define sprint goal",
    status:   "Draft",
    capacity: 5,
    velocity: 24,
    stories:  [],
    tasks:    [],
  });
  renderBoard(currentPlan);
  renderMetrics(currentPlan);
});

document.getElementById("savePlanBtn").addEventListener("click", async function() {
  var pid = document.getElementById("dashProjectSelect").value;
  if (!pid || !currentPlan) {
    alert("No plan loaded to save.");
    return;
  }
  try {
    await fetch("/api/plan/" + pid, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ plan: currentPlan }),
    });
    var statusEl = document.getElementById("loadStatus");
    statusEl.textContent = "✓ Saved";
    statusEl.className   = "load-status ok";
    setTimeout(function() { statusEl.textContent = ""; }, 2500);
  } catch (_) {
    alert("Save failed — check server connection.");
  }
});

/* ── Helpers ─────────────────────────────────────────────────── */

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ── Boot ────────────────────────────────────────────────────── */
init();
