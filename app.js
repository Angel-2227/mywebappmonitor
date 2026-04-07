// ─────────────────────────────────────────────
//  CONFIGURACIÓN FIREBASE
//  Reemplaza estos valores con los de tu proyecto
// ─────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrH0KyvxGzGjdJyN3tWIIRdvWDVi5ZCcU",
  authDomain: "mywebappmonitor.firebaseapp.com",
  projectId: "mywebappmonitor",
  storageBucket: "mywebappmonitor.firebasestorage.app",
  messagingSenderId: "962969259226",
  appId: "1:962969259226:web:adbf45e4e42962298329e3"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ─────────────────────────────────────────────
//  ESTADO GLOBAL
// ─────────────────────────────────────────────
let currentUser = null;
let allPages = [];
let currentFilter = "all";
let editingPageId = null;

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("user-name").textContent = user.displayName || user.email;
    const initials = (user.displayName || user.email || "U")
      .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("user-avatar").textContent = initials;
    loadPages();
    loadKeys();
  } else {
    currentUser = null;
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
});

document.getElementById("btn-login").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    showToast("Error al iniciar sesión: " + e.message, "error");
  }
});

window.logout = async () => {
  await signOut(auth);
};

// ─────────────────────────────────────────────
//  NAVEGACIÓN
// ─────────────────────────────────────────────
window.switchView = (viewName, btn) => {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.getElementById("view-" + viewName).classList.remove("hidden");
  if (btn) btn.classList.add("active");
  if (viewName === "viewer") populateViewerSelect();
};

// ─────────────────────────────────────────────
//  PÁGINAS — CRUD
// ─────────────────────────────────────────────
async function loadPages() {
  if (!currentUser) return;
  const snap = await getDocs(collection(db, "users", currentUser.uid, "pages"));
  allPages = [];
  snap.forEach(d => allPages.push({ id: d.id, ...d.data() }));
  renderPages();
}

function renderPages() {
  const grid = document.getElementById("pages-grid");
  const empty = document.getElementById("empty-state");
  const filtered = currentFilter === "all"
    ? allPages
    : allPages.filter(p => p.status === currentFilter);

  if (filtered.length === 0) {
    empty.classList.remove("hidden");
    // Quitar tarjetas anteriores
    grid.querySelectorAll(".page-card").forEach(c => c.remove());
    return;
  }
  empty.classList.add("hidden");
  grid.querySelectorAll(".page-card").forEach(c => c.remove());

  filtered.forEach(page => {
    const card = document.createElement("div");
    card.className = "page-card";
    card.dataset.id = page.id;

    const dotClass = page.status === "online" ? "dot-green"
      : page.status === "dev" ? "dot-amber" : "dot-gray";
    const statusLabel = page.status === "online" ? "en línea"
      : page.status === "dev" ? "dev" : "inactiva";

    card.innerHTML = `
      <div class="card-preview" onclick="openInViewer('${page.url}', '${page.name}')">
        <div class="preview-pattern">
          <div class="pp-bar accent"></div>
          <div class="pp-bar"></div>
          <div class="pp-bar short"></div>
          <div class="pp-bar accent med"></div>
        </div>
        <span class="status-badge ${dotClass}">${statusLabel}</span>
      </div>
      <div class="card-info">
        <div class="card-name">${escHtml(page.name)}</div>
        <div class="card-url">${escHtml(page.url)}</div>
        ${page.notes ? `<div class="card-notes">${escHtml(page.notes)}</div>` : ""}
        <div class="card-meta">
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <span class="tag">${escHtml(page.provider || "")}</span>
            ${page.account && page.account !== "principal" ? `<span class="tag tag-alt">${escHtml(page.account)}</span>` : ""}
          </div>
          <div class="card-actions">
            <button onclick="openInViewer('${page.url}', '${page.name}')" title="Ver en visor" class="btn-icon-sm">
              <svg width="14" height="14" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
            </button>
            <button onclick="editPage('${page.id}')" title="Editar" class="btn-icon-sm">
              <svg width="14" height="14" viewBox="0 0 16 16"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
            </button>
            <button onclick="deletePage('${page.id}')" title="Eliminar" class="btn-icon-sm btn-danger">
              <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 5h10M6 5V3h4v2M6 8v5M10 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

window.filterPages = (filter, btn) => {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderPages();
};

window.openModal = () => {
  editingPageId = null;
  document.getElementById("modal-page-title").textContent = "Nueva página";
  document.getElementById("page-id").value = "";
  document.getElementById("page-name").value = "";
  document.getElementById("page-url").value = "";
  document.getElementById("page-provider").value = "Cloudflare";
  document.getElementById("page-status").value = "online";
  document.getElementById("page-account").value = "principal";
  document.getElementById("page-notes").value = "";
  document.getElementById("modal-page").classList.remove("hidden");
};

window.closeModal = () => {
  document.getElementById("modal-page").classList.add("hidden");
};

window.editPage = (id) => {
  const page = allPages.find(p => p.id === id);
  if (!page) return;
  editingPageId = id;
  document.getElementById("modal-page-title").textContent = "Editar página";
  document.getElementById("page-id").value = id;
  document.getElementById("page-name").value = page.name || "";
  document.getElementById("page-url").value = page.url || "";
  document.getElementById("page-provider").value = page.provider || "Cloudflare";
  document.getElementById("page-status").value = page.status || "online";
  document.getElementById("page-account").value = page.account || "principal";
  document.getElementById("page-notes").value = page.notes || "";
  document.getElementById("modal-page").classList.remove("hidden");
};

window.savePage = async () => {
  const name = document.getElementById("page-name").value.trim();
  const url = document.getElementById("page-url").value.trim();
  if (!name || !url) { showToast("Nombre y URL son obligatorios", "error"); return; }

  const data = {
    name,
    url,
    provider: document.getElementById("page-provider").value,
    status: document.getElementById("page-status").value,
    account: document.getElementById("page-account").value,
    notes: document.getElementById("page-notes").value.trim(),
    updatedAt: new Date().toISOString()
  };

  try {
    if (editingPageId) {
      await updateDoc(doc(db, "users", currentUser.uid, "pages", editingPageId), data);
      showToast("Página actualizada");
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, "users", currentUser.uid, "pages"), data);
      showToast("Página guardada");
    }
    closeModal();
    loadPages();
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

window.deletePage = async (id) => {
  if (!confirm("¿Eliminar esta página del panel?")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "pages", id));
    showToast("Página eliminada");
    loadPages();
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

// ─────────────────────────────────────────────
//  VISOR
// ─────────────────────────────────────────────
function populateViewerSelect() {
  const sel = document.getElementById("viewer-select");
  sel.innerHTML = '<option value="">— Elige una página —</option>';
  allPages.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.url;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

window.loadInViewer = (url) => {
  const iframe = document.getElementById("viewer-iframe");
  const placeholder = document.getElementById("iframe-placeholder");
  const extlink = document.getElementById("viewer-extlink");
  if (!url) {
    iframe.classList.add("hidden");
    placeholder.classList.remove("hidden");
    extlink.href = "#";
    return;
  }
  iframe.src = url;
  iframe.classList.remove("hidden");
  placeholder.classList.add("hidden");
  extlink.href = url;
};

window.openInViewer = (url, name) => {
  switchView("viewer", document.querySelector('[data-view="viewer"]'));
  populateViewerSelect();
  document.getElementById("viewer-select").value = url;
  loadInViewer(url);
};

// ─────────────────────────────────────────────
//  API KEYS — cifrado simple con WebCrypto
// ─────────────────────────────────────────────
async function deriveKey(uid) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey("raw", enc.encode(uid), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("mypages-salt-v1"), iterations: 100000, hash: "SHA-256" },
    raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptValue(uid, plaintext) {
  const key = await deriveKey(uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.byteLength + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptValue(uid, ciphertext) {
  const key = await deriveKey(uid);
  const bytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(dec);
}

async function loadKeys() {
  if (!currentUser) return;
  const snap = await getDocs(collection(db, "users", currentUser.uid, "keys"));
  const list = document.getElementById("keys-list");
  list.innerHTML = "";
  if (snap.empty) {
    list.innerHTML = '<div class="empty-state"><p>No hay API Keys guardadas.</p></div>';
    return;
  }
  snap.forEach(d => {
    const data = d.data();
    const item = document.createElement("div");
    item.className = "key-item";
    item.innerHTML = `
      <div class="key-item-info">
        <span class="key-item-name">${escHtml(data.name)}</span>
        ${data.project ? `<span class="tag">${escHtml(data.project)}</span>` : ""}
      </div>
      <div class="key-item-actions">
        <button class="btn-secondary btn-sm" onclick="revealKey('${d.id}', this)">Mostrar</button>
        <button class="btn-icon-sm btn-danger" onclick="deleteKey('${d.id}')">
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 5h10M6 5V3h4v2M6 8v5M10 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
        </button>
      </div>
      <div class="key-revealed hidden" id="key-val-${d.id}">Cargando...</div>
    `;
    list.appendChild(item);
  });
}

window.revealKey = async (id, btn) => {
  const valDiv = document.getElementById("key-val-" + id);
  if (!valDiv.classList.contains("hidden")) {
    valDiv.classList.add("hidden");
    btn.textContent = "Mostrar";
    return;
  }
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "keys", id));
    const plain = await decryptValue(currentUser.uid, snap.data().value);
    valDiv.textContent = plain;
    valDiv.classList.remove("hidden");
    btn.textContent = "Ocultar";
  } catch (e) {
    valDiv.textContent = "Error al descifrar";
    valDiv.classList.remove("hidden");
  }
};

window.deleteKey = async (id) => {
  if (!confirm("¿Eliminar esta API Key?")) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "keys", id));
  showToast("Key eliminada");
  loadKeys();
};

window.openKeyModal = () => {
  document.getElementById("key-name").value = "";
  document.getElementById("key-value").value = "";
  document.getElementById("key-project").value = "";
  document.getElementById("modal-key").classList.remove("hidden");
};
window.closeKeyModal = () => {
  document.getElementById("modal-key").classList.add("hidden");
};

window.saveKey = async () => {
  const name = document.getElementById("key-name").value.trim();
  const value = document.getElementById("key-value").value.trim();
  if (!name || !value) { showToast("Nombre y valor son obligatorios", "error"); return; }
  try {
    const encrypted = await encryptValue(currentUser.uid, value);
    await addDoc(collection(db, "users", currentUser.uid, "keys"), {
      name,
      value: encrypted,
      project: document.getElementById("key-project").value.trim(),
      createdAt: new Date().toISOString()
    });
    showToast("Key guardada de forma segura");
    closeKeyModal();
    loadKeys();
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

window.toggleKeyVisibility = () => {
  const input = document.getElementById("key-value");
  input.type = input.type === "password" ? "text" : "password";
};

// ─────────────────────────────────────────────
//  UTILIDADES
// ─────────────────────────────────────────────
window.closeModalOutside = (e, id) => {
  if (e.target.id === id) document.getElementById(id).classList.add("hidden");
};

function escHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}
