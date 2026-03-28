const state = {
  students: [],
  bangladeshGeoJSON: null,
  availableThanas: new Set(),
  query: "",
  selectedStudentId: null,
  polygonIndex: new Map(),
};

const THANA_ALIAS_CANDIDATES = {
  "khulna sadar": ["Kotwali", "Dighalia", "Dumuria", "Phultala", "Rupsa"],
  "chattogram sadar": ["Hathazari", "Raozan", "Sitakunda", "Boalkhali", "Anwara", "Patiya"],
  "bogura sadar": ["Bogra S.", "Bogra"],
  "dhaka sadar": ["Savar", "Dhamrai", "Keraniganj", "Nawabganj", "Dohar"],
  "burichong": ["Burichang"],
  "moulvibazar sadar": ["Rajnagar", "Kamalganj", "Kulaura", "Sreemangal", "Barlekha"],
  "nilphamari sadar": ["Saidpur", "Jaldhaka", "Kishoreganj", "Domar", "Dimla"],
  "rajshahi sadar": ["Paba", "Godagari", "Puthia", "Tanore"],
  "monohorgonj": ["Monohargonj", "Laksam", "Nangalkot", "Chauddagram"],
  "titas": ["Daudkandi", "Homna", "Meghna", "Muradnagar"],
};

const DATA_VERSION = "20260329";

const map = L.map("map", {
  zoomControl: true,
}).setView([23.685, 90.3563], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const boundaryLayer = L.layerGroup().addTo(map);

const elements = {
  searchInput: document.getElementById("searchInput"),
  resultsList: document.getElementById("resultsList"),
  resultCount: document.getElementById("resultCount"),
  studentForm: document.getElementById("studentForm"),
  floatingFormPanel: document.getElementById("floatingFormPanel"),
  openAddStudentBtn: document.getElementById("openAddStudentBtn"),
  closeAddStudentBtn: document.getElementById("closeAddStudentBtn"),
  statusBadge: document.getElementById("statusBadge"),
};

let formAutoCloseTimer = null;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLoose(value) {
  return normalize(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(barisal|comilla|jessore)\b/g, (match) => ({
      barisal: "barishal",
      comilla: "cumilla",
      jessore: "jashore",
    }[match]))
    .replace(/\b(thana|upazila|sadar)\b/g, " ")
    .replace(/\bs\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeText(value, fallback = "N/A") {
  const text = String(value || "").trim();
  return text || fallback;
}

function flattenCoordinates(geometry) {
  if (!geometry || !geometry.coordinates) {
    return [];
  }

  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }

  const result = [];

  function walk(node) {
    if (!Array.isArray(node)) {
      return;
    }

    if (typeof node[0] === "number" && typeof node[1] === "number") {
      result.push(node);
      return;
    }

    node.forEach((child) => walk(child));
  }

  walk(geometry.coordinates);
  return result;
}

function centerFromGeometry(feature) {
  const points = flattenCoordinates(feature.geometry);

  if (!points.length) {
    return null;
  }

  const total = points.reduce(
    (acc, point) => {
      acc.lng += point[0];
      acc.lat += point[1];
      return acc;
    },
    { lng: 0, lat: 0 }
  );

  return [total.lat / points.length, total.lng / points.length];
}

function buildIndexes() {
  const polygonIndex = new Map();
  (state.bangladeshGeoJSON?.features || []).forEach((feature) => {
    const rawName = feature.properties?.NAME_4 || "";
    const key = normalizeLoose(rawName);
    if (key && !polygonIndex.has(key)) {
      polygonIndex.set(key, feature);
    }
  });

  state.polygonIndex = polygonIndex;
  state.availableThanas = new Set(state.polygonIndex.keys());
}

function resolvePolygonKey(studentThana) {
  const sourceKey = normalizeLoose(studentThana);
  if (state.polygonIndex.has(sourceKey)) {
    return sourceKey;
  }

  const aliases = THANA_ALIAS_CANDIDATES[sourceKey] || [];
  for (const candidate of aliases) {
    const candidateKey = normalizeLoose(candidate);
    if (state.polygonIndex.has(candidateKey)) {
      return candidateKey;
    }
  }

  return sourceKey;
}

function getMatches() {
  const query = normalize(state.query);

  // Required behavior: use filter() to find matches and map() to render list rows.
  return state.students.filter((student) => {
    if (!query) {
      return true;
    }

    const idMatch = normalize(student.id).includes(query);
    const nameMatch = normalize(student.name).includes(query);
    const thanaMatch = normalize(student.thana).includes(query);
    const addressMatch = normalize(student.addrress).includes(query);

    return idMatch || nameMatch || thanaMatch || addressMatch;
  });
}

function updateStatus(message) {
  elements.statusBadge.textContent = message;
}

function showAddStudentPanel() {
  if (!elements.floatingFormPanel) {
    return;
  }
  elements.floatingFormPanel.classList.add("show");
  elements.floatingFormPanel.setAttribute("aria-hidden", "false");
}

function hideAddStudentPanel() {
  if (!elements.floatingFormPanel) {
    return;
  }
  elements.floatingFormPanel.classList.remove("show");
  elements.floatingFormPanel.setAttribute("aria-hidden", "true");
}

function selectStudent(student) {
  state.selectedStudentId = student.id;
  renderResults();

  const resolvedKey = resolvePolygonKey(student.thana);
  const polygonFeature = state.polygonIndex.get(resolvedKey);

  if (!polygonFeature) {
    updateStatus(`No coordinates found for ${safeText(student.thana)}`);
    return;
  }

  markerLayer.clearLayers();
  boundaryLayer.clearLayers();

  const center = centerFromGeometry(polygonFeature);
  if (!center) {
    updateStatus(`Could not compute center for ${safeText(student.thana)}`);
    return;
  }

  const [lat, lng] = center;

  const marker = L.marker([lat, lng])
    .addTo(markerLayer)
    .bindPopup(
      `<strong>${safeText(student.name, "Unnamed Student")}</strong><br>${safeText(student.thana)}<br>${safeText(student.addrress)}`
    );

  const area = L.geoJSON(polygonFeature, {
    style: {
      color: "#145ee6",
      weight: 2,
      fillColor: "#69a1ff",
      fillOpacity: 0.2,
    },
  }).addTo(boundaryLayer);

  const bounds = area.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.15), {
      animate: true,
    });
  } else {
    map.flyTo([lat, lng], 11, {
      animate: true,
      duration: 1.1,
    });
  }

  marker.openPopup();
  updateStatus(`Focused: ${safeText(student.name, "Unnamed Student")} (${safeText(student.thana)})`);
}

function renderResults() {
  const matches = getMatches();
  elements.resultCount.textContent = String(matches.length);

  if (matches.length === 0) {
    elements.resultsList.innerHTML = "<li class='result-meta'>No students found.</li>";
    return;
  }

  // Uses map() for scalable rendering even with large student lists.
  elements.resultsList.innerHTML = matches
    .map((student) => {
      const isActive = student.id === state.selectedStudentId ? "active" : "";
      return `
        <li>
          <button class="result-item ${isActive}" data-student-id="${student.id}">
            <div class="result-name">${safeText(student.name, `Unnamed (${safeText(student.id)})`)}</div>
            <div class="result-meta">ID: ${safeText(student.id)}</div>
            <div class="result-meta">Thana: ${safeText(student.thana)}</div>
            <div class="result-meta">Addrress: ${safeText(student.addrress)}</div>
          </button>
        </li>
      `;
    })
    .join("");
}

function addStudent(newStudent, statusMessage) {
  state.students.push(newStudent);
  state.query = "";
  elements.searchInput.value = "";
  renderResults();
  updateStatus(statusMessage || `Student added: ${newStudent.name}`);
}

function bindEvents() {
  elements.openAddStudentBtn?.addEventListener("click", () => {
    if (formAutoCloseTimer) {
      clearTimeout(formAutoCloseTimer);
      formAutoCloseTimer = null;
    }
    showAddStudentPanel();
  });

  elements.closeAddStudentBtn?.addEventListener("click", () => {
    if (formAutoCloseTimer) {
      clearTimeout(formAutoCloseTimer);
      formAutoCloseTimer = null;
    }
    hideAddStudentPanel();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderResults();
  });

  elements.resultsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-student-id]");
    if (!button) {
      return;
    }

    const studentId = button.dataset.studentId;
    const student = state.students.find((item) => item.id === studentId);

    if (student) {
      selectStudent(student);
    }
  });

  elements.studentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newStudent = {
      id: String(formData.get("id") || "").trim(),
      name: String(formData.get("name") || "").trim(),
      thana: String(formData.get("thana") || "").trim(),
      addrress: String(formData.get("addrress") || "").trim(),
    };

    const hasMissingField = Object.values(newStudent).some((value) => !value);
    if (hasMissingField) {
      updateStatus("Please complete all add-student fields.");
      return;
    }

    if (state.students.some((student) => student.id === newStudent.id)) {
      updateStatus(`ID ${newStudent.id} already exists.`);
      return;
    }

    const statusMessage = !state.availableThanas.has(resolvePolygonKey(newStudent.thana))
      ? `Added ${newStudent.name}, but thana \"${newStudent.thana}\" was not found in bangladesh.geojson.`
      : undefined;

    addStudent(newStudent, statusMessage);
    event.currentTarget.reset();

    if (formAutoCloseTimer) {
      clearTimeout(formAutoCloseTimer);
    }
    formAutoCloseTimer = setTimeout(() => {
      hideAddStudentPanel();
      formAutoCloseTimer = null;
    }, 650);
  });
}

async function initialize() {
  try {
    const [studentsResponse, bangladeshResponse] = await Promise.all([
      fetch(`./students.json?v=${DATA_VERSION}`, { cache: "no-store" }),
      fetch(`./bangladesh.geojson?v=${DATA_VERSION}`, { cache: "no-store" }),
    ]);

    if (!studentsResponse.ok) {
      throw new Error(`students.json failed with ${studentsResponse.status}`);
    }

    if (!bangladeshResponse.ok) {
      throw new Error(`bangladesh.geojson failed with ${bangladeshResponse.status}`);
    }

    state.students = await studentsResponse.json();
    state.bangladeshGeoJSON = await bangladeshResponse.json();

    // Keep client state predictable even when source rows are incomplete.
    state.students = state.students.map((student) => ({
      id: String(student.id || "").trim(),
      name: String(student.name || "").trim(),
      thana: String(student.thana || "").trim(),
      addrress: String(student.addrress || student.address || student.contact || "").trim(),
    }));

    buildIndexes();

    bindEvents();
    renderResults();
    updateStatus("Ready");
  } catch (error) {
    console.error(error);
    updateStatus(`Failed to load data: ${error.message || "Unknown error"}`);
  }
}

initialize();
