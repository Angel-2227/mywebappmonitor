// ─────────────────────────────────────────────
//  CONFIGURACIÓN FIREBASE
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
let allGroups = [];
let currentFilter = "all";
let currentGroupFilter = null; // null = todos los grupos
let editingPageId = null;
let editingGroupId = null;
let selectedEmoji = "📁";
let currentFilesPageId = null;
let viewingFileId = null;

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
    loadGroups().then(() => loadPages());
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
  if (viewName === "files") populateFilesPageSelect();
};

// ─────────────────────────────────────────────
//  GRUPOS — CRUD
// ─────────────────────────────────────────────
async function loadGroups() {
  if (!currentUser) return;
  const snap = await getDocs(collection(db, "users", currentUser.uid, "groups"));
  allGroups = [];
  snap.forEach(d => allGroups.push({ id: d.id, ...d.data() }));
  renderGroupsNav();
  populateGroupSelect();
}

function renderGroupsNav() {
  const nav = document.getElementById("groups-nav");
  nav.innerHTML = "";
  allGroups.forEach(group => {
    const btn = document.createElement("button");
    btn.className = "group-nav-item" + (currentGroupFilter === group.id ? " active-group" : "");
    btn.dataset.group = group.id;
    btn.innerHTML = `
      <span class="group-nav-left">
        <span>${group.emoji || "📁"}</span>
        <span>${escHtml(group.name)}</span>
      </span>
      <span class="group-nav-actions">
        <button class="btn-group-action" onclick="editGroup('${group.id}'); event.stopPropagation();" title="Editar">✎</button>
        <button class="btn-group-action" onclick="deleteGroup('${group.id}'); event.stopPropagation();" title="Eliminar">✕</button>
      </span>
    `;
    btn.addEventListener("click", () => filterByGroup(group.id, btn));
    nav.appendChild(btn);
  });
}

function populateGroupSelect() {
  const sel = document.getElementById("page-group");
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Sin grupo</option>';
  allGroups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = (g.emoji || "📁") + " " + g.name;
    sel.appendChild(opt);
  });
  sel.value = currentVal || "";
}

window.filterByGroup = (groupId, btn) => {
  currentGroupFilter = groupId;
  // Quitar active-group de todos
  document.querySelectorAll(".group-nav-item, .active-group").forEach(b => b.classList.remove("active-group"));
  if (btn) btn.classList.add("active-group");
  // Actualizar título
  if (groupId === null) {
    document.getElementById("dashboard-title").textContent = "Mis páginas";
  } else {
    const g = allGroups.find(g => g.id === groupId);
    document.getElementById("dashboard-title").textContent = g ? (g.emoji + " " + g.name) : "Grupo";
  }
  renderPages();
};

window.openGroupModal = () => {
  editingGroupId = null;
  selectedEmoji = "📁";
  document.getElementById("modal-group-title").textContent = "Nuevo grupo";
  document.getElementById("group-id").value = "";
  document.getElementById("group-name").value = "";
  document.querySelectorAll(".emoji-opt").forEach(b => b.classList.remove("selected"));
  document.querySelector('.emoji-opt[data-emoji="📁"]').classList.add("selected");
  document.getElementById("modal-group").classList.remove("hidden");
};

window.closeGroupModal = () => {
  document.getElementById("modal-group").classList.add("hidden");
};

window.selectEmoji = (btn) => {
  document.querySelectorAll(".emoji-opt").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedEmoji = btn.dataset.emoji;
};

window.saveGroup = async () => {
  const name = document.getElementById("group-name").value.trim();
  if (!name) { showToast("El nombre del grupo es obligatorio", "error"); return; }
  const data = { name, emoji: selectedEmoji, updatedAt: new Date().toISOString() };
  try {
    if (editingGroupId) {
      await updateDoc(doc(db, "users", currentUser.uid, "groups", editingGroupId), data);
      showToast("Grupo actualizado");
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, "users", currentUser.uid, "groups"), data);
      showToast("Grupo creado");
    }
    closeGroupModal();
    await loadGroups();
    renderPages();
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

window.editGroup = (id) => {
  const group = allGroups.find(g => g.id === id);
  if (!group) return;
  editingGroupId = id;
  selectedEmoji = group.emoji || "📁";
  document.getElementById("modal-group-title").textContent = "Editar grupo";
  document.getElementById("group-id").value = id;
  document.getElementById("group-name").value = group.name || "";
  document.querySelectorAll(".emoji-opt").forEach(b => {
    b.classList.toggle("selected", b.dataset.emoji === selectedEmoji);
  });
  document.getElementById("modal-group").classList.remove("hidden");
};

window.deleteGroup = async (id) => {
  if (!confirm("¿Eliminar este grupo? Las páginas del grupo no se eliminarán.")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "groups", id));
    // Quitar groupId de páginas que lo tengan
    const pagesInGroup = allPages.filter(p => p.groupId === id);
    await Promise.all(pagesInGroup.map(p =>
      updateDoc(doc(db, "users", currentUser.uid, "pages", p.id), { groupId: "" })
    ));
    if (currentGroupFilter === id) {
      currentGroupFilter = null;
      document.getElementById("dashboard-title").textContent = "Mis páginas";
    }
    showToast("Grupo eliminado");
    await loadGroups();
    await loadPages();
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
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

  let filtered = allPages;
  if (currentFilter !== "all") {
    filtered = filtered.filter(p => p.status === currentFilter);
  }
  if (currentGroupFilter !== null) {
    filtered = filtered.filter(p => p.groupId === currentGroupFilter);
  }

  const countEl = document.getElementById("pages-count");
  countEl.textContent = filtered.length + " página" + (filtered.length !== 1 ? "s" : "");

  grid.querySelectorAll(".page-card").forEach(c => c.remove());

  if (filtered.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  filtered.forEach(page => {
    const card = document.createElement("div");
    card.className = "page-card";
    card.dataset.id = page.id;

    const dotClass = page.status === "online" ? "dot-green"
      : page.status === "dev" ? "dot-amber" : "dot-gray";
    const statusLabel = page.status === "online" ? "en línea"
      : page.status === "dev" ? "dev" : "inactiva";

    const group = allGroups.find(g => g.id === page.groupId);
    const groupTag = group
      ? `<span class="tag tag-group">${group.emoji || "📁"} ${escHtml(group.name)}</span>`
      : "";

    // Preview: intentar iframe real; fallback a patrón
    const previewHtml = page.url ? `
      <div class="preview-iframe-wrap">
        <iframe src="${escHtml(page.url)}" loading="lazy" sandbox="allow-same-origin allow-scripts" title="preview"></iframe>
      </div>
    ` : `
      <div class="preview-pattern-fallback">
        <div class="pp-bar accent"></div>
        <div class="pp-bar"></div>
        <div class="pp-bar short"></div>
        <div class="pp-bar accent med"></div>
      </div>
    `;

    card.innerHTML = `
      <div class="card-preview" onclick="openInViewer('${escAttr(page.url)}', '${escAttr(page.name)}')">
        ${previewHtml}
        <div class="preview-overlay">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>
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
            ${groupTag}
          </div>
          <div class="card-actions">
            <button onclick="openInViewer('${escAttr(page.url)}', '${escAttr(page.name)}')" title="Ver en visor" class="btn-icon-sm">
              <svg width="14" height="14" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
            </button>
            <button onclick="goToFiles('${page.id}')" title="Archivos" class="btn-icon-sm">
              <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
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
  document.getElementById("page-group").value = "";
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
  document.getElementById("page-group").value = page.groupId || "";
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
    groupId: document.getElementById("page-group").value,
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
    // Eliminar también sus archivos
    const filesSnap = await getDocs(collection(db, "users", currentUser.uid, "pages", id, "files"));
    await Promise.all(filesSnap.docs.map(d => deleteDoc(d.ref)));
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
//  ARCHIVOS (almacenados en Firestore como texto)
// ─────────────────────────────────────────────
const FILE_ICONS = { html: "🌐", css: "🎨", js: "⚡", json: "📋", txt: "📄", other: "📎" };
const FILE_SIZE_LIMIT = 900000; // ~900KB (Firestore doc limit es 1MB)

function populateFilesPageSelect() {
  const sel = document.getElementById("files-page-select");
  const current = sel.value;
  sel.innerHTML = '<option value="">— Selecciona una página —</option>';
  allPages.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

window.goToFiles = (pageId) => {
  switchView("files", document.querySelector('[data-view="files"]'));
  populateFilesPageSelect();
  document.getElementById("files-page-select").value = pageId;
  loadFilesForPage(pageId);
};

window.loadFilesForPage = async (pageId) => {
  currentFilesPageId = pageId;
  const section = document.getElementById("files-section");
  const btn = document.getElementById("btn-upload-file");
  const countEl = document.getElementById("files-count");

  if (!pageId) {
    btn.style.display = "none";
    section.innerHTML = '<div class="empty-state"><p>Selecciona una página para ver o subir sus archivos.</p></div>';
    countEl.textContent = "";
    return;
  }

  btn.style.display = "";
  section.innerHTML = '<div class="empty-state"><p>Cargando...</p></div>';

  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "pages", pageId, "files"));
    if (snap.empty) {
      section.innerHTML = `
        <div class="file-upload-info">
          <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Los archivos se guardan en Firestore. Puedes subir HTML, CSS, JS, JSON y texto. Límite: ~900KB por archivo.
        </div>
        <div class="empty-state"><p>No hay archivos en esta página. Sube uno con el botón de arriba.</p></div>`;
      countEl.textContent = "0 archivos";
      return;
    }

    const files = [];
    snap.forEach(d => files.push({ id: d.id, ...d.data() }));
    countEl.textContent = files.length + " archivo" + (files.length !== 1 ? "s" : "");

    section.innerHTML = `
      <div class="file-upload-info">
        <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Los archivos se guardan en Firestore. Puedes subir HTML, CSS, JS, JSON y texto. Límite: ~900KB por archivo.
      </div>
      <div class="files-grid" id="files-grid"></div>`;

    const grid = document.getElementById("files-grid");
    files.forEach(file => {
      const card = document.createElement("div");
      card.className = "file-card";
      const icon = FILE_ICONS[file.type] || FILE_ICONS.other;
      const size = file.content ? Math.round(new Blob([file.content]).size / 1024) : 0;
      card.innerHTML = `
        <div class="file-icon">${icon}</div>
        <div class="file-card-name">${escHtml(file.name)}</div>
        <div class="file-card-size">${size} KB · ${file.type || "?"}</div>
        <div class="file-card-actions">
          <button class="btn-secondary btn-sm" onclick="openFileView('${file.id}')">Ver / editar</button>
          <button class="btn-icon-sm btn-danger" onclick="deleteFile('${file.id}')" title="Eliminar">
            <svg width="12" height="12" viewBox="0 0 16 16"><path d="M3 5h10M6 5V3h4v2M6 8v5M10 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (e) {
    section.innerHTML = `<div class="empty-state"><p>Error al cargar archivos: ${escHtml(e.message)}</p></div>`;
  }
};

window.openFileUploadModal = () => {
  document.getElementById("file-name").value = "";
  document.getElementById("file-type").value = "html";
  document.getElementById("file-content").value = "";
  document.getElementById("modal-file").classList.remove("hidden");
};

window.closeFileModal = () => {
  document.getElementById("modal-file").classList.add("hidden");
};

window.loadLocalFile = (input) => {
  const file = input.files[0];
  if (!file) return;
  // Auto-detectar tipo
  const ext = file.name.split(".").pop().toLowerCase();
  const typeMap = { html: "html", css: "css", js: "js", json: "json", txt: "txt" };
  document.getElementById("file-type").value = typeMap[ext] || "other";
  document.getElementById("file-name").value = file.name;

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("file-content").value = e.target.result;
  };
  reader.readAsText(file);
};

window.saveFile = async () => {
  if (!currentFilesPageId) { showToast("Selecciona una página primero", "error"); return; }
  const name = document.getElementById("file-name").value.trim();
  const content = document.getElementById("file-content").value;
  const type = document.getElementById("file-type").value;

  if (!name) { showToast("El nombre del archivo es obligatorio", "error"); return; }
  if (!content) { showToast("El contenido no puede estar vacío", "error"); return; }

  const sizeBytes = new Blob([content]).size;
  if (sizeBytes > FILE_SIZE_LIMIT) {
    showToast(`El archivo pesa ${Math.round(sizeBytes/1024)}KB. El límite es 900KB.`, "error");
    return;
  }

  try {
    await addDoc(collection(db, "users", currentUser.uid, "pages", currentFilesPageId, "files"), {
      name, type, content,
      sizeKb: Math.round(sizeBytes / 1024),
      createdAt: new Date().toISOString()
    });
    showToast("Archivo guardado");
    closeFileModal();
    loadFilesForPage(currentFilesPageId);
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

window.openFileView = async (fileId) => {
  if (!currentFilesPageId) return;
  viewingFileId = fileId;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "pages", currentFilesPageId, "files", fileId));
    const data = snap.data();
    document.getElementById("file-view-name").textContent = data.name;
    document.getElementById("file-view-content").value = data.content || "";
    document.getElementById("modal-file-view").classList.remove("hidden");
  } catch (e) {
    showToast("Error al abrir archivo: " + e.message, "error");
  }
};

window.closeFileViewModal = () => {
  document.getElementById("modal-file-view").classList.add("hidden");
  viewingFileId = null;
};

window.updateFileContent = async () => {
  if (!currentFilesPageId || !viewingFileId) return;
  const content = document.getElementById("file-view-content").value;
  const sizeBytes = new Blob([content]).size;
  if (sizeBytes > FILE_SIZE_LIMIT) {
    showToast(`El archivo pesa ${Math.round(sizeBytes/1024)}KB. El límite es 900KB.`, "error");
    return;
  }
  try {
    await updateDoc(doc(db, "users", currentUser.uid, "pages", currentFilesPageId, "files", viewingFileId), {
      content,
      sizeKb: Math.round(sizeBytes / 1024),
      updatedAt: new Date().toISOString()
    });
    showToast("Archivo actualizado");
    closeFileViewModal();
    loadFilesForPage(currentFilesPageId);
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

window.downloadFile = () => {
  const name = document.getElementById("file-view-name").textContent;
  const content = document.getElementById("file-view-content").value;
  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.deleteFile = async (fileId) => {
  if (!confirm("¿Eliminar este archivo?")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "pages", currentFilesPageId, "files", fileId));
    showToast("Archivo eliminado");
    loadFilesForPage(currentFilesPageId);
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
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

function escAttr(str) {
  return (str || "").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}