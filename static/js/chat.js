const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const chatMessage = document.getElementById("chatMessage");

const addMessage = (role, text) => {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = `
    <div class="bubble-title">${role === "user" ? "You" : "Scrum Agent"}</div>
    <p>${text}</p>
  `;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
};

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatMessage.value.trim();
  if (!text) return;
  addMessage("user", text);
  chatMessage.value = "";
  setTimeout(() => {
    addMessage("agent", "Understood. I will turn that into stories, tasks, and sprint suggestions.");
  }, 500);
});
