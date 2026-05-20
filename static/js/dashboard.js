const sprintList = document.getElementById("sprintList");
const addSprintButton = document.getElementById("addSprint");

const defaultData = {
  sprints: [
    {
      id: "s1",
      name: "Sprint 01 - Foundation",
      start: "2026-05-27",
      end: "2026-06-10",
      goal: "Finalize onboarding flows and role model",
      status: "Planned",
      capacity: 5.5,
      velocity: 22,
      tasks: [
        {
          id: "t1",
          title: "Define role matrix and permissions",
          points: 5,
          assignee: "Ana",
          status: "In progress"
        },
        {
          id: "t2",
          title: "Wireframe onboarding wizard",
          points: 8,
          assignee: "Miguel",
          status: "Todo"
        },
        {
          id: "t3",
          title: "Audit trail event schema",
          points: 3,
          assignee: "Sofia",
          status: "Blocked"
        }
      ]
    },
    {
      id: "s2",
      name: "Sprint 02 - Automation",
      start: "2026-06-11",
      end: "2026-06-25",
      goal: "Automate approvals and notifications",
      status: "Draft",
      capacity: 5,
      velocity: 24,
      tasks: [
        {
          id: "t4",
          title: "Approval workflow engine",
          points: 8,
          assignee: "Rui",
          status: "Todo"
        },
        {
          id: "t5",
          title: "Notification templates",
          points: 5,
          assignee: "Ana",
          status: "Todo"
        }
      ]
    }
  ]
};

const loadData = () => {
  const stored = localStorage.getItem("scrum-planning-data");
  return stored ? JSON.parse(stored) : defaultData;
};

const saveData = (data) => {
  localStorage.setItem("scrum-planning-data", JSON.stringify(data));
};

let data = loadData();

const renderMetrics = () => {
  const totalVelocity = data.sprints.reduce((sum, sprint) => sum + Number(sprint.velocity || 0), 0);
  const avgVelocity = data.sprints.length ? Math.round(totalVelocity / data.sprints.length) : 0;
  const capacity = data.sprints.reduce((sum, sprint) => sum + Number(sprint.capacity || 0), 0);
  const riskCount = data.sprints.reduce(
    (sum, sprint) => sum + sprint.tasks.filter((task) => task.status === "Blocked").length,
    0
  );

  document.getElementById("velocityValue").textContent = `${avgVelocity} pts`;
  document.getElementById("capacityValue").textContent = `${capacity.toFixed(1)} FTE`;
  document.getElementById("riskValue").textContent = riskCount;
  document.getElementById("coverageValue").textContent = `${Math.min(90, avgVelocity * 3)}%`;
};

const renderCharts = () => {
  const burndown = document.getElementById("burndownCanvas").getContext("2d");
  const capacity = document.getElementById("capacityCanvas").getContext("2d");
  const totalPoints = data.sprints.reduce(
    (sum, sprint) => sum + sprint.tasks.reduce((tSum, task) => tSum + Number(task.points || 0), 0),
    0
  );

  burndown.clearRect(0, 0, 420, 200);
  burndown.strokeStyle = "#ffb347";
  burndown.lineWidth = 3;
  burndown.beginPath();
  burndown.moveTo(20, 20);
  burndown.lineTo(200, 140);
  burndown.lineTo(400, 170);
  burndown.stroke();
  burndown.fillStyle = "rgba(255, 179, 71, 0.2)";
  burndown.fillRect(20, 20, 380, 150);
  burndown.fillStyle = "#f8f5f2";
  burndown.fillText(`Total points: ${totalPoints}`, 24, 34);

  const assignees = {};
  data.sprints.forEach((sprint) => {
    sprint.tasks.forEach((task) => {
      assignees[task.assignee] = (assignees[task.assignee] || 0) + Number(task.points || 0);
    });
  });
  const names = Object.keys(assignees);
  const maxPoints = Math.max(...Object.values(assignees), 1);

  capacity.clearRect(0, 0, 420, 200);
  names.forEach((name, index) => {
    const value = assignees[name];
    const barHeight = Math.round((value / maxPoints) * 120);
    capacity.fillStyle = "#64ffda";
    capacity.fillRect(40 + index * 90, 160 - barHeight, 40, barHeight);
    capacity.fillStyle = "#f8f5f2";
    capacity.fillText(name, 32 + index * 90, 180);
    capacity.fillText(`${value} pts`, 32 + index * 90, 150 - barHeight);
  });
};

const updateField = (sprintId, field, value) => {
  const sprint = data.sprints.find((item) => item.id === sprintId);
  if (!sprint) return;
  sprint[field] = value;
  saveData(data);
  renderMetrics();
  renderCharts();
};

const updateTask = (sprintId, taskId, field, value) => {
  const sprint = data.sprints.find((item) => item.id === sprintId);
  if (!sprint) return;
  const task = sprint.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task[field] = value;
  saveData(data);
  renderMetrics();
  renderCharts();
};

const addTask = (sprintId) => {
  const sprint = data.sprints.find((item) => item.id === sprintId);
  if (!sprint) return;
  const newTask = {
    id: `t${Date.now()}`,
    title: "New task",
    points: 1,
    assignee: "Unassigned",
    status: "Todo"
  };
  sprint.tasks.push(newTask);
  saveData(data);
  render();
};

const addSprint = () => {
  const sprint = {
    id: `s${Date.now()}`,
    name: "New sprint",
    start: "2026-06-30",
    end: "2026-07-14",
    goal: "Define the sprint goal",
    status: "Draft",
    capacity: 5,
    velocity: 20,
    tasks: []
  };
  data.sprints.unshift(sprint);
  saveData(data);
  render();
};

const render = () => {
  sprintList.innerHTML = "";
  data.sprints.forEach((sprint) => {
    const card = document.createElement("article");
    card.className = "sprint-card";
    card.innerHTML = `
      <header>
        <input data-field="name" value="${sprint.name}">
        <select data-field="status">
          <option${sprint.status === "Draft" ? " selected" : ""}>Draft</option>
          <option${sprint.status === "Planned" ? " selected" : ""}>Planned</option>
          <option${sprint.status === "Active" ? " selected" : ""}>Active</option>
          <option${sprint.status === "Completed" ? " selected" : ""}>Completed</option>
        </select>
      </header>
      <div class="sprint-meta">
        <div>
          <label>Start</label>
          <input data-field="start" type="date" value="${sprint.start}">
        </div>
        <div>
          <label>End</label>
          <input data-field="end" type="date" value="${sprint.end}">
        </div>
        <div>
          <label>Capacity</label>
          <input data-field="capacity" type="number" step="0.1" value="${sprint.capacity}">
        </div>
        <div>
          <label>Velocity</label>
          <input data-field="velocity" type="number" step="1" value="${sprint.velocity}">
        </div>
      </div>
      <div>
        <label>Goal</label>
        <input data-field="goal" value="${sprint.goal}">
      </div>
      <table class="tasks-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Pts</th>
            <th>Assignee</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${sprint.tasks
            .map(
              (task) => `
            <tr>
              <td><input data-task-field="title" data-task-id="${task.id}" value="${task.title}"></td>
              <td><input data-task-field="points" data-task-id="${task.id}" type="number" step="1" value="${task.points}"></td>
              <td><input data-task-field="assignee" data-task-id="${task.id}" value="${task.assignee}"></td>
              <td>
                <select data-task-field="status" data-task-id="${task.id}">
                  <option${task.status === "Todo" ? " selected" : ""}>Todo</option>
                  <option${task.status === "In progress" ? " selected" : ""}>In progress</option>
                  <option${task.status === "Blocked" ? " selected" : ""}>Blocked</option>
                  <option${task.status === "Done" ? " selected" : ""}>Done</option>
                </select>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <div class="task-actions">
        <button class="ghost" data-add-task="${sprint.id}">Add task</button>
      </div>
    `;

    card.querySelectorAll("input[data-field], select[data-field]").forEach((input) => {
      input.addEventListener("change", (event) => {
        updateField(sprint.id, event.target.dataset.field, event.target.value);
      });
    });

    card.querySelectorAll("input[data-task-field], select[data-task-field]").forEach((input) => {
      input.addEventListener("change", (event) => {
        updateTask(sprint.id, event.target.dataset.taskId, event.target.dataset.taskField, event.target.value);
      });
    });

    card.querySelector("button[data-add-task]").addEventListener("click", () => addTask(sprint.id));
    sprintList.appendChild(card);
  });

  renderMetrics();
  renderCharts();
};

addSprintButton.addEventListener("click", addSprint);
render();
