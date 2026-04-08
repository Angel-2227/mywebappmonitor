// ─────────────────────────────────────────────
//  ASISTENTE IA — ai.js
//
//  Usa un Cloudflare Worker como proxy para la Anthropic API,
//  evitando exponer la API key en el frontend.
//
//  ⚠️  CONFIGURA ESTA URL con la de tu Worker de Cloudflare:
// ─────────────────────────────────────────────
const AI_PROXY_URL = "https://anthropic-webappmonitor-proxy.mwp.workers.dev/";
//  ^^ Reemplaza esto con la URL real de tu Worker ^^

// Estado del módulo IA
let aiHistory = [];           // [{role, content}] historial de la conversación
let aiPageContext = null;     // { pageId, pageName, files: [{name, content, type}] }
let aiLoading = false;

// ─── Inicialización ───────────────────────────
// Se llama desde switchView cuando se navega a la vista "ai"
window.aiInit = function() {
  populateAiPageSelect();
};

function populateAiPageSelect() {
  const sel = document.getElementById("ai-page-select");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Sin contexto de página —</option>';
  // allPages viene del scope global de app.js
  if (typeof allPages !== "undefined") {
    allPages.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      // Indicador visual de si tiene archivos
      if (p._fileCount > 0) {
        opt.textContent = p.name + " 📂";
      }
      sel.appendChild(opt);
    });
  }
  sel.value = current || "";
}

// ─── Selección de página ──────────────────────
window.aiSelectPage = async function(pageId) {
  if (!pageId) {
    aiClearContext();
    return;
  }

  const contextBar   = document.getElementById("ai-context-bar");
  const contextLabel = document.getElementById("ai-context-label");
  const contextCount = document.getElementById("ai-context-count");

  contextBar.classList.remove("hidden");
  contextLabel.textContent = "Cargando archivos...";
  contextCount.textContent = "";

  try {
    const { getDocs, collection, getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const db = getFirestore();
    const uid = currentUser?.uid;
    if (!uid) throw new Error("No autenticado");

    const page = allPages.find(p => p.id === pageId);
    const snap = await getDocs(collection(db, "users", uid, "pages", pageId, "files"));

    const files = [];
    snap.forEach(d => {
      const data = d.data();
      files.push({
        name: data.folder ? data.folder + "/" + data.name : data.name,
        type: data.type || "other",
        content: data.content || ""
      });
    });

    aiPageContext = { pageId, pageName: page?.name || "Página", files };

    const label = page ? page.name : "Página";
    contextLabel.textContent = label;
    contextCount.textContent = `· ${files.length} archivo${files.length !== 1 ? "s" : ""}`;

    // Reiniciar historial al cambiar de página
    aiHistory = [];
    renderAiMessages();

  } catch (e) {
    contextBar.classList.add("hidden");
    aiPageContext = null;
    showToast("Error al cargar archivos: " + e.message, "error");
  }
};

// ─── Limpiar contexto ─────────────────────────
window.aiClearContext = function() {
  aiPageContext = null;
  document.getElementById("ai-context-bar").classList.add("hidden");
  document.getElementById("ai-page-select").value = "";
};

// ─── Nueva conversación ───────────────────────
window.aiClearChat = function() {
  aiHistory = [];
  renderAiMessages();
};

// ─── Chips de sugerencia ──────────────────────
window.aiUseSuggestion = function(btn) {
  const input = document.getElementById("ai-input");
  input.value = btn.textContent;
  aiAutoResize(input);
  input.focus();
};

// ─── Manejo del teclado ───────────────────────
window.aiHandleKey = function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    aiSend();
  }
};

// ─── Auto-resize del textarea ─────────────────
window.aiAutoResize = function(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
};

// ─── Construir system prompt con contexto ─────
function buildSystemPrompt() {
  let base = `Eres un asistente experto en desarrollo web (HTML, CSS, JavaScript, Firebase/Firestore).
El usuario está trabajando en su propia aplicación web y te consulta para obtener ayuda con su código.

Responde siempre en español, de forma clara y práctica.
Cuando des código, usa bloques de código con el lenguaje apropiado (\`\`\`js, \`\`\`css, \`\`\`html, etc).
Sé directo: si el usuario pide código corregido, dáselo. Si pide sugerencias, lístalelas claramente.
Si ves un bug, señálalo con precisión (línea o función aproximada).`;

  if (aiPageContext && aiPageContext.files.length > 0) {
    base += `\n\nEl usuario te ha dado acceso a los archivos del proyecto "${aiPageContext.pageName}". Aquí están:\n\n`;

    aiPageContext.files.forEach(f => {
      const lang = f.type === "js" ? "javascript"
        : f.type === "css" ? "css"
        : f.type === "html" ? "html"
        : f.type === "json" ? "json"
        : "text";

      const maxChars = 12000;
      const content = f.content.length > maxChars
        ? f.content.slice(0, maxChars) + "\n\n... [archivo truncado, muestra los primeros 12000 caracteres]"
        : f.content;

      base += `### ${f.name}\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
    });

    base += `Usa estos archivos como contexto para responder preguntas sobre el código del proyecto.`;
  } else {
    base += `\n\nEl usuario no ha seleccionado ninguna página con archivos todavía. Responde consultas generales de desarrollo web.`;
  }

  return base;
}

// ─── Enviar mensaje ───────────────────────────
window.aiSend = async function() {
  if (aiLoading) return;

  const input = document.getElementById("ai-input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  aiAutoResize(input);

  aiHistory.push({ role: "user", content: text });
  appendMessage("user", text);

  const typingEl = appendTyping();
  setAiLoading(true);

  try {
    const response = await fetch(AI_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: buildSystemPrompt(),
        messages: aiHistory
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    const assistantText = data.content?.[0]?.text || "(Sin respuesta)";

    aiHistory.push({ role: "assistant", content: assistantText });

    typingEl.remove();
    appendMessage("assistant", assistantText);

  } catch (e) {
    typingEl.remove();
    appendMessage("assistant", `⚠️ Error al contactar la IA: ${e.message}\n\nAsegúrate de que el Worker de Cloudflare está desplegado y de que \`AI_PROXY_URL\` en ai.js apunta a tu Worker.`);
  } finally {
    setAiLoading(false);
  }
};

// ─── Renderizar historial completo ─────────────
function renderAiMessages() {
  const container = document.getElementById("ai-messages");
  container.innerHTML = "";

  if (aiHistory.length === 0) {
    container.innerHTML = `
      <div class="ai-welcome">
        <div class="ai-welcome-icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="var(--purple)" stroke-width="1.5" fill="var(--purple-light)"/>
            <path d="M10 19C10 19 12 22 16 22C20 22 22 19 22 19" stroke="var(--purple)" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="12" cy="14" r="1.5" fill="var(--purple)"/>
            <circle cx="20" cy="14" r="1.5" fill="var(--purple)"/>
          </svg>
        </div>
        <h3>Hola, soy tu asistente de código</h3>
        <p>Selecciona una página del menú de arriba para darme acceso a sus archivos, luego pregúntame lo que necesites: cómo cambiar algo, dónde buscar un bug, sugerencias de mejora, o pídeme código corregido.</p>
        <div class="ai-suggestions">
          <button class="ai-suggestion-chip" onclick="aiUseSuggestion(this)">¿Cómo agrego dark mode?</button>
          <button class="ai-suggestion-chip" onclick="aiUseSuggestion(this)">Revisa si hay bugs en el código</button>
          <button class="ai-suggestion-chip" onclick="aiUseSuggestion(this)">¿Cómo optimizo el rendimiento?</button>
          <button class="ai-suggestion-chip" onclick="aiUseSuggestion(this)">Sugiere mejoras de UX</button>
        </div>
      </div>
    `;
    return;
  }

  aiHistory.forEach(msg => appendMessage(msg.role, msg.content));
}

// ─── Agregar burbuja de mensaje al DOM ─────────
function appendMessage(role, text) {
  const container = document.getElementById("ai-messages");

  const welcome = container.querySelector(".ai-welcome");
  if (welcome) welcome.remove();

  const el = document.createElement("div");
  el.className = `ai-msg ${role}`;

  const initials = role === "assistant" ? "IA" : getUserInitials();
  el.innerHTML = `
    <div class="ai-msg-avatar">${initials}</div>
    <div class="ai-msg-bubble">${formatAiText(text)}</div>
  `;

  container.appendChild(el);

  el.querySelectorAll("pre").forEach(pre => {
    const wrap = document.createElement("div");
    wrap.className = "ai-code-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.className = "ai-code-copy";
    btn.textContent = "Copiar";
    btn.onclick = () => {
      navigator.clipboard.writeText(pre.textContent);
      btn.textContent = "✓";
      setTimeout(() => btn.textContent = "Copiar", 1800);
    };
    wrap.appendChild(btn);
  });

  container.scrollTop = container.scrollHeight;
  return el;
}

// ─── Typing indicator ─────────────────────────
function appendTyping() {
  const container = document.getElementById("ai-messages");
  const el = document.createElement("div");
  el.className = "ai-msg assistant";
  el.innerHTML = `
    <div class="ai-msg-avatar">IA</div>
    <div class="ai-typing">
      <div class="ai-typing-dot"></div>
      <div class="ai-typing-dot"></div>
      <div class="ai-typing-dot"></div>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

// ─── Estado de carga ──────────────────────────
function setAiLoading(loading) {
  aiLoading = loading;
  const btn = document.getElementById("ai-send-btn");
  const input = document.getElementById("ai-input");
  if (btn) btn.disabled = loading;
  if (input) input.disabled = loading;
}

// ─── Formateo de markdown básico ───────────────
function formatAiText(text) {
  let html = text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<pre><code class="lang-${lang || 'text'}">${escaped.trim()}</code></pre>`;
    })
    .replace(/`([^`\n]+)`/g, (_, code) => {
      const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<code>${escaped}</code>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .split(/\n\n+/).map(block => {
      if (block.startsWith("<li>") || block.includes("</pre>") || block.includes("<strong>")) return block;
      return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
    }).join("\n");

  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, match => `<ul>${match}</ul>`);

  return html;
}

// ─── Utilidades ───────────────────────────────
function getUserInitials() {
  if (typeof currentUser === "undefined" || !currentUser) return "Yo";
  return (currentUser.displayName || currentUser.email || "Yo")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}