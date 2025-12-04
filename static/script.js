

const state = {
  user: {
    name: null,
    email: null,
    emergencyContactName: null,
    emergencyContactNumber: null,
    emergencyContactAltNumber: null,
  },
  vehicle: {
    type: null,
    details: null,
    fuelCapacity: null,
    currentFuel: null,
    batteryCapacity: null,
    currentBattery: null,
    efficiency: null,
  },
};

function $(sel) {
  return document.querySelector(sel);
}
function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}

let energyChart = null,
  savingsChart = null,
  forecastChart = null,
  routeMap = null,
  routeLayer = null;
let stationMap = null,
  stationLayer = null,
  lastLocation = null;

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const DEFAULT_RADIUS = 5000;

function safeAddEvent(el, event, handler) {
  if (el) el.addEventListener(event, handler);
}

/* ===== Navigation & Sections ===== */
function goToSection(id) {
  $all(".nav-item").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.section === id)
  );
  $all(".section").forEach((s) => s.classList.toggle("visible", s.id === id));
  if (id === "routes")
    setTimeout(() => {
      if (routeMap && routeMap.invalidateSize) routeMap.invalidateSize();
      else initRouteMap();
    }, 300);
}

function initNavigation() {
  $all(".nav-item").forEach((btn) =>
    safeAddEvent(btn, "click", () => {
      const s = btn.dataset.section;
      if (s) goToSection(s);
    })
  );
  safeAddEvent($("#goToVehicleSetup"), "click", () => {
    const v = document.querySelector('.nav-item[data-section="vehicle"]');
    if (v) v.click();
  });
}

/* ===== Charge/Fuel Status Display ===== */
function updateChargeStatusDisplay() {
  const container = document.getElementById("chargeStatusContainer");
  if (!container) return;

  const type = state.vehicle.type;
  if (!type) {
    container.innerHTML =
      '<p class="muted">Complete your Vehicle Setup to see charge/fuel status.</p>';
    return;
  }

  let html = "";

  if (type === "ev") {
    const capacity = state.vehicle.batteryCapacity || 60;
    const current =
      state.vehicle.currentBattery !== null
        ? state.vehicle.currentBattery
        : capacity * 0.75;
    const percentage = Math.round((current / capacity) * 100);
    const efficiency = state.vehicle.efficiency || 6;
    const range = Math.round(current * efficiency);

    html = `
      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-weight: 500;">Battery Level</span>
          <span style="color: var(--text-primary); font-weight: 600; font-size: 1.1rem;">${percentage}%</span>
        </div>
        <div style="height: 24px; background: rgba(255,255,255,0.1); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--glass-border);">
          <div style="height: 100%; background: linear-gradient(90deg, #10b981, #34d399); width: ${percentage}%; transition: width 0.6s ease;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 0.75rem; font-size: 0.9rem; color: var(--text-muted);">
          <span>${current.toFixed(1)} kWh available</span>
          <span>${range} km range</span>
        </div>
      </div>
      <div style="background: rgba(99,102,241,0.1); border-left: 3px solid #6366f1; padding: 1rem; border-radius: var(--radius-md); margin-top: 1rem;">
        <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">
          <i class="fas fa-info-circle" style="color: var(--text-accent); margin-right: 0.5rem;"></i>
          Your battery is at <strong>${percentage}%</strong>. You can travel approximately <strong>${range} km</strong> with current charge.
        </p>
      </div>
    `;
  } else if (type === "petrol" || type === "cnc") {
    const capacity = state.vehicle.fuelCapacity || 50;
    const current =
      state.vehicle.currentFuel !== null
        ? state.vehicle.currentFuel
        : capacity * 0.75;
    const percentage = Math.round((current / capacity) * 100);
    const efficiency = state.vehicle.efficiency || 15;
    const range = Math.round(current * efficiency);
    const fuelType = type === "cnc" ? "CNG" : "Petrol";

    html = `
      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-weight: 500;">${fuelType} Tank Level</span>
          <span style="color: var(--text-primary); font-weight: 600; font-size: 1.1rem;">${percentage}%</span>
        </div>
        <div style="height: 24px; background: rgba(255,255,255,0.1); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--glass-border);">
          <div style="height: 100%; background: linear-gradient(90deg, #f59e0b, #fbbf24); width: ${percentage}%; transition: width 0.6s ease;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 0.75rem; font-size: 0.9rem; color: var(--text-muted);">
          <span>${current.toFixed(1)} L available</span>
          <span>${range} km range</span>
        </div>
      </div>
      <div style="background: rgba(245,158,11,0.1); border-left: 3px solid #f59e0b; padding: 1rem; border-radius: var(--radius-md); margin-top: 1rem;">
        <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">
          <i class="fas fa-info-circle" style="color: var(--text-accent); margin-right: 0.5rem;"></i>
          Your ${fuelType.toLowerCase()} tank is at <strong>${percentage}%</strong>. You can travel approximately <strong>${range} km</strong> with current fuel.
        </p>
      </div>
    `;
  } else if (type === "hybrid") {
    const batCap = state.vehicle.batteryCapacity || 20;
    const fuelCap = state.vehicle.fuelCapacity || 40;
    const batCur =
      state.vehicle.currentBattery !== null
        ? state.vehicle.currentBattery
        : batCap * 0.75;
    const fuelCur =
      state.vehicle.currentFuel !== null
        ? state.vehicle.currentFuel
        : fuelCap * 0.75;
    const batPercentage = Math.round((batCur / batCap) * 100);
    const fuelPercentage = Math.round((fuelCur / fuelCap) * 100);
    const batRange = Math.round(batCur * (state.vehicle.efficiency || 5));
    const fuelRange = Math.round(fuelCur * (state.vehicle.efficiency || 12));
    const totalRange = batRange + fuelRange;

    html = `
      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-weight: 500;">Battery Level</span>
          <span style="color: var(--text-primary); font-weight: 600; font-size: 1.1rem;">${batPercentage}%</span>
        </div>
        <div style="height: 24px; background: rgba(255,255,255,0.1); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--glass-border);">
          <div style="height: 100%; background: linear-gradient(90deg, #10b981, #34d399); width: ${batPercentage}%; transition: width 0.6s ease;"></div>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
          ${batCur.toFixed(1)} kWh available → ~${batRange} km
        </div>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-weight: 500;">Fuel Tank Level</span>
          <span style="color: var(--text-primary); font-weight: 600; font-size: 1.1rem;">${fuelPercentage}%</span>
        </div>
        <div style="height: 24px; background: rgba(255,255,255,0.1); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--glass-border);">
          <div style="height: 100%; background: linear-gradient(90deg, #f59e0b, #fbbf24); width: ${fuelPercentage}%; transition: width 0.6s ease;"></div>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
          ${fuelCur.toFixed(1)} L available → ~${fuelRange} km
        </div>
      </div>

      <div style="background: rgba(99,102,241,0.1); border-left: 3px solid #6366f1; padding: 1rem; border-radius: var(--radius-md);">
        <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">
          <i class="fas fa-info-circle" style="color: var(--text-accent); margin-right: 0.5rem;"></i>
          Combined, you can travel approximately <strong>${totalRange} km</strong> with current battery and fuel.
        </p>
      </div>
    `;
  } else {
    html =
      '<p class="muted">Vehicle type information is incomplete. Please update your vehicle setup.</p>';
  }

  container.innerHTML = html;
}

/* ===== Vehicle Setup Form ===== */
function initUserForm() {
  const form = $("#userForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.user.name = $("#name")?.value.trim() || null;
    state.user.email = $("#email")?.value.trim() || null;
    // primary family emergency contact NAME field was previously removed
    state.user.emergencyContactNumber =
      $("#emergencyContactNumber")?.value.trim() || null;
    // alternate emergency contact removed from form — do not read it here

    state.vehicle.type = $("#vehicleType")?.value || state.vehicle.type;
    state.vehicle.details = $("#vehicleDetails")?.value.trim() || null;

    // capacity/current/efficiency fields were removed; keep any stored values in state.vehicle
    updateVehicleUI();
    generateMockDashboard();
    generateMockBehavior();
    updateRemainingRange();
    updateChargeStatusDisplay();
    goToSection("dashboard");
    try {
      alert("Profile saved and dashboard personalized (simulated).");
    } catch (e) {}
  });
}

/* ===== Vehicle UI Updates ===== */
function getUnitForVehicleType(type) {
  if (!type) return "units";
  if (type === "ev") return "kWh";
  if (type === "petrol" || type === "hybrid") return "liters";
  if (type === "cnc") return "kg";
  return "units";
}

function updateVehicleUI() {
  const label = $("#selectedVehicleType");
  const unitEl = $("#energyUnit");
  const summary = $("#personalizationSummary");
  const type = state.vehicle.type;
  const names = {
    petrol: "Petrol",
    ev: "Electric (EV)",
    hybrid: "Hybrid",
    cnc: "CNC / CNG",
    other: "Other",
  };
  if (label)
    label.textContent = type
      ? `${names[type] || type} Vehicle`
      : "Not selected";
  if (unitEl) unitEl.textContent = getUnitForVehicleType(type);
  if (summary) {
    if (!type) {
      summary.innerHTML = "<li>No vehicle selected yet.</li>";
      return;
    }
    const tipsMap = {
      ev: [
        "We prioritize EV charging stations.",
        "Route optimizer focuses on regenerative braking.",
        "Track battery health and off-peak charging windows.",
      ],
      petrol: [
        "We show nearby petrol pumps with price trends.",
        "AI tips focus on smooth acceleration.",
      ],
      hybrid: [
        "Combines combustion & electric insights.",
        "Route optimizer balances battery and fuel efficiency.",
      ],
      cnc: ["We surface CNC / CNG friendly stations."],
      other: ["Generic energy efficiency models."],
    };
    const tips = tipsMap[type] || tipsMap.other;
    summary.innerHTML = tips.map((t) => `<li>${t}</li>`).join("");
  }
}

/* ===== Remaining Range Calculation ===== */
function updateRemainingRange() {
  const rangeEl = $("#remainingRange");
  const detailsEl = $("#remainingDetails");
  if (!rangeEl || !detailsEl) return;

  const type = state.vehicle.type;
  const efficiency = state.vehicle.efficiency || 0;

  // Try to fetch from backend API; fallback to client-side calculation
  const payload = {
    vehicle_type: type,
    fuel_capacity: state.vehicle.fuelCapacity,
    current_fuel: state.vehicle.currentFuel,
    battery_capacity: state.vehicle.batteryCapacity,
    current_battery: state.vehicle.currentBattery,
    efficiency: efficiency,
  };

  // Optional: fetch from backend
  fetch("/api/vehicle/remaining-range", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.range_km !== undefined) {
        rangeEl.textContent = `${data.range_km} km`;
        detailsEl.textContent = data.details || "--";
      } else {
        computeRangeClientSide(type, efficiency);
      }
    })
    .catch(() => {
      // Fallback: compute on client side
      computeRangeClientSide(type, efficiency);
    });
}

function computeRangeClientSide(type, efficiency) {
  const rangeEl = $("#remainingRange");
  const detailsEl = $("#remainingDetails");
  if (!rangeEl || !detailsEl) return;

  if (type === "ev") {
    const capacity = state.vehicle.batteryCapacity || 60;
    const current =
      state.vehicle.currentBattery !== null
        ? state.vehicle.currentBattery
        : capacity * 0.75;
    const range = Math.round(current * (efficiency || 6));
    rangeEl.textContent = `${range} km`;
    detailsEl.textContent = `${current.toFixed(1)} kWh available`;
  } else if (type === "petrol" || type === "cnc") {
    const capacity = state.vehicle.fuelCapacity || 50;
    const current =
      state.vehicle.currentFuel !== null
        ? state.vehicle.currentFuel
        : capacity * 0.75;
    const range = Math.round(current * (efficiency || 15));
    rangeEl.textContent = `${range} km`;
    detailsEl.textContent = `${current.toFixed(1)} L available`;
  } else if (type === "hybrid") {
    const batCap = state.vehicle.batteryCapacity || 20;
    const fuelCap = state.vehicle.fuelCapacity || 40;
    const batCur =
      state.vehicle.currentBattery !== null
        ? state.vehicle.currentBattery
        : batCap * 0.75;
    const fuelCur =
      state.vehicle.currentFuel !== null
        ? state.vehicle.currentFuel
        : fuelCap * 0.75;
    const batRange = Math.round(batCur * (efficiency || 5));
    const fuelRange = Math.round(fuelCur * (efficiency || 12));
    const totalRange = batRange + fuelRange;
    rangeEl.textContent = `${totalRange} km`;
    detailsEl.textContent = `${batCur.toFixed(1)} kWh + ${fuelCur.toFixed(
      1
    )} L`;
  } else {
    rangeEl.textContent = "-- km";
    detailsEl.textContent = "--";
  }
}

/* ===== Mock Dashboards & Charts ===== */
function generateRandomSeries(len, base, variance) {
  const out = [];
  let v = base;
  for (let i = 0; i < len; i++) {
    v = Math.max(0, v + (Math.random() - 0.5) * variance);
    out.push(Number(v.toFixed(1)));
  }
  return out;
}

function generateMockDashboard() {
  const type = state.vehicle.type || "ev";
  const unit = getUnitForVehicleType(type);
  const monthlyConsumption = (Math.random() * 120 + 80).toFixed(1);
  const co2 = (Math.random() * 180 + 90).toFixed(0);
  const savings = (Math.random() * 1200 + 300).toFixed(0);
  const efficiency = (Math.random() * 35 + 60).toFixed(0);
  if ($("#monthlyConsumption"))
    $("#monthlyConsumption").textContent = monthlyConsumption;
  if ($("#co2Emissions")) $("#co2Emissions").textContent = co2;
  if ($("#savings")) $("#savings").textContent = `₹${savings}`;
  if ($("#efficiencyScore")) $("#efficiencyScore").textContent = efficiency;
  if ($("#energyUnit")) $("#energyUnit").textContent = unit;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const energyData = generateRandomSeries(
    months.length,
    type === "ev" ? 210 : 45,
    type === "ev" ? 40 : 8
  );
  const efficiencyData = generateRandomSeries(months.length, 72, 10);
  const savingsData = generateRandomSeries(months.length, 800, 250);

  const energyCtx = document.getElementById("energyChart");
  if (energyCtx && typeof Chart !== "undefined") {
    if (energyChart) energyChart.destroy();
    energyChart = new Chart(energyCtx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: `Energy (${unit})`,
            data: energyData,
            borderColor: "#6366f1",
            backgroundColor: "rgba(99,102,241,0.15)",
            tension: 0.4,
            fill: true,
          },
          {
            label: "Efficiency Score",
            data: efficiencyData,
            borderColor: "#0ea5e9",
            backgroundColor: "rgba(14,165,233,0.12)",
            tension: 0.4,
            fill: false,
            yAxisID: "y1",
          },
        ],
      },
      options: { responsive: true },
    });
  }

  const savingsCtx = document.getElementById("savingsChart");
  if (savingsCtx && typeof Chart !== "undefined") {
    if (savingsChart) savingsChart.destroy();
    savingsChart = new Chart(savingsCtx, {
      type: "bar",
      data: {
        labels: months,
        datasets: [
          {
            label: "Savings (₹)",
            data: savingsData,
            backgroundColor: "rgba(99,102,241,0.65)",
            borderRadius: 8,
          },
        ],
      },
      options: { responsive: true },
    });
  }

  generateForecastChart();
  updateRemainingRange();
}

function generateForecastChart() {
  const type = state.vehicle.type || "ev";
  const unit = getUnitForVehicleType(type);
  const months = ["Next 1", "Next 2", "Next 3", "Next 4", "Next 5", "Next 6"];
  const priceBase =
    type === "petrol" ? 100 : type === "ev" ? 9 : type === "cnc" ? 70 : 50;
  const priceData = generateRandomSeries(months.length, priceBase, 5);
  const consumptionData = generateRandomSeries(
    months.length,
    type === "ev" ? 220 : 50,
    20
  );
  const ctx = document.getElementById("forecastChart");
  if (ctx && typeof Chart !== "undefined") {
    if (forecastChart) forecastChart.destroy();
    forecastChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: `Price Forecast (per ${unit})`,
            data: priceData,
            borderColor: "#0ea5e9",
            backgroundColor: "rgba(14,165,233,0.15)",
            fill: true,
          },
          {
            label: `Consumption Forecast (${unit}/month)`,
            data: consumptionData,
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.15)",
            fill: true,
          },
        ],
      },
      options: { responsive: true },
    });
  }
}

/* ===== Station Map & Overpass ===== */
function initStationMap() {
  const el = document.getElementById("stationMap");
  if (!el) return;
  if (stationMap) return;
  if (typeof L === "undefined") {
    console.warn("Leaflet not loaded");
    return;
  }
  stationMap = L.map("stationMap", { attributionControl: false }).setView(
    [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    12
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(stationMap);
  stationLayer = L.layerGroup().addTo(stationMap);
}

function buildOverpassQuery(lat, lng, radius, vehicleType) {
  const filters = [];
  if (vehicleType === "ev") filters.push("[amenity=charging_station]");
  else if (vehicleType === "petrol") filters.push("[amenity=fuel]");
  else if (vehicleType === "hybrid") {
    filters.push("[amenity=charging_station]");
    filters.push("[amenity=fuel]");
  } else if (vehicleType === "cnc") filters.push("[amenity=fuel]");
  else {
    filters.push("[amenity=charging_station]");
    filters.push("[amenity=fuel]");
  }

  const parts = [];
  filters.forEach((f) => {
    parts.push(`node(around:${radius},${lat},${lng})${f};`);
    parts.push(`way(around:${radius},${lat},${lng})${f};`);
    parts.push(`relation(around:${radius},${lat},${lng})${f};`);
  });

  return `[out:json][timeout:25];(${parts.join("\n")});out center;`;
}

async function queryOverpass(lat, lng, radius, vehicleType) {
  const q = buildOverpassQuery(lat, lng, radius, vehicleType);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: q,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error("Overpass request failed");
  const data = await res.json();
  return data.elements || [];
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clearStationResults() {
  const list = $("#stationList");
  if (list)
    list.innerHTML =
      '<p class="muted">Click "Find Stations" to discover nearby stations.</p>';
  if (stationLayer) stationLayer.clearLayers();
}

function renderStations(elements, userLat, userLng) {
  const list = $("#stationList");
  if (!list) return;
  if (stationLayer) stationLayer.clearLayers();

  const items = elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const tags = el.tags || {};
      const name = tags.name || tags.operator || "Unnamed station";
      const type = tags.amenity || "station";
      const price = tags["fuel:price"] || tags["charging:price"] || null;
      const dist =
        lat && userLat ? haversineDistance(userLat, userLng, lat, lon) : null;
      return { lat, lon, name, type, price, dist };
    })
    .filter((i) => i.lat && i.lon);

  items.sort((a, b) => (a.dist ?? 99999) - (b.dist ?? 99999));

  if (!items.length) {
    list.innerHTML =
      '<p class="muted">No nearby stations found (OpenStreetMap data).</p>';
    return;
  }

  list.innerHTML = items
    .map((s) => {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
      return `<div class="alert-item">
      <div><strong>${s.name}</strong><br/><span class="muted">${
        s.dist !== null ? s.dist.toFixed(1) + " km • " : ""
      }${s.type}${s.price ? " • ₹" + s.price : ""}</span></div>
      <div style="text-align:right"><a href="${mapsUrl}" target="_blank" rel="noopener" class="secondary-btn" style="font-size:0.75rem;padding:0.25rem 0.6rem;text-decoration:none;"><i class="fas fa-directions" style="margin-right:0.25rem;"></i>Directions</a></div>
    </div>`;
    })
    .join("");

  items.forEach((s) => {
    const marker = L.marker([s.lat, s.lon]).bindPopup(
      `<strong>${s.name}</strong><br/><span class="muted">${s.type}</span>`
    );
    marker.addTo(stationLayer);
  });

  const group = L.featureGroup(items.map((s) => L.marker([s.lat, s.lon])));
  if (items.length === 1) stationMap.setView([items[0].lat, items[0].lon], 14);
  else stationMap.fitBounds(group.getBounds().pad(0.2));
}

async function getAndShowNearbyStations(useCurrentLocation = true) {
  initStationMap();
  clearStationResults();
  let lat = DEFAULT_CENTER.lat,
    lng = DEFAULT_CENTER.lng;

  if (useCurrentLocation && lastLocation) {
    lat = lastLocation.lat;
    lng = lastLocation.lng;
  } else if (useCurrentLocation && navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      lastLocation = { lat, lng };
      stationMap.setView([lat, lng], 13);
      if (stationLayer) {
        L.circle([lat, lng], {
          radius: 50,
          color: "#10b981",
          fillOpacity: 0.2,
        }).addTo(stationLayer);
      }
    } catch (e) {
      console.warn("Geolocation failed, using default center", e);
    }
  }

  let vehicleType = state.vehicle.type || null;
  const vtSelect = $("#vehicleType");
  if (!vehicleType && vtSelect) vehicleType = vtSelect.value || null;

  try {
    const elements = await queryOverpass(lat, lng, DEFAULT_RADIUS, vehicleType);
    renderStations(elements, lat, lng);
  } catch (err) {
    console.error("Failed to load stations:", err);
    const list = $("#stationList");
    if (list)
      list.innerHTML =
        '<p class="muted">Could not load nearby stations. Try again later.</p>';
  }
}

function setupStationControls() {
  initStationMap();
  clearStationResults();
  safeAddEvent($("#useMyLocation"), "click", async () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      lastLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      stationMap.setView([lastLocation.lat, lastLocation.lng], 13);
      if (stationLayer) {
        stationLayer.clearLayers();
        L.marker([lastLocation.lat, lastLocation.lng], { title: "You" }).addTo(
          stationLayer
        );
      }
    } catch (e) {
      alert(
        "Unable to read your location. Make sure location permission is allowed."
      );
    }
  });
  safeAddEvent($("#centerDefault"), "click", () => {
    if (stationMap)
      stationMap.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
    if (stationLayer) stationLayer.clearLayers();
  });
  safeAddEvent($("#findStations"), "click", (e) => {
    e.preventDefault();
    getAndShowNearbyStations(true);
  });
}

/* ===== Route Map ===== */
function initRouteMap() {
  const el = document.getElementById("routeMap");
  if (!el) return;
  if (routeMap) return;
  if (typeof L === "undefined") return;
  try {
    routeMap = L.map("routeMap", { zoomControl: true }).setView(
      [12.9716, 77.5946],
      12
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(routeMap);
    routeLayer = L.layerGroup().addTo(routeMap);
    setTimeout(() => routeMap.invalidateSize(), 100);
  } catch (e) {
    console.error("initRouteMap:", e);
  }
}

function initRoutes() {
  const form = $("#routeForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const start = $("#startLocation")?.value.trim();
    const end = $("#endLocation")?.value.trim();
    if (!start || !end) return;
    const type = state.vehicle.type || "ev";
    const unit = getUnitForVehicleType(type);
    const resultEl = $("#routeResults");
    if (!resultEl) return;
    const baseDistance = Math.random() * 35 + 10;
    const routes = [
      {
        name: "Shortest Distance",
        distance: baseDistance.toFixed(1),
        time: Math.round((baseDistance / 35) * 60 + 10),
        energy: Number(
          (baseDistance * (type === "ev" ? 0.19 : 0.11)).toFixed(2)
        ),
      },
      {
        name: "Energy-Efficient",
        distance: (baseDistance * 1.08).toFixed(1),
        time: Math.round(((baseDistance * 1.08) / 30) * 60 + 5),
        energy: Number(
          (baseDistance * 1.08 * (type === "ev" ? 0.19 : 0.11) * 0.92).toFixed(
            2
          )
        ),
      },
      {
        name: "Traffic-Aware",
        distance: (baseDistance * 1.15).toFixed(1),
        time: Math.round(((baseDistance * 1.15) / 28) * 60),
        energy: Number(
          (baseDistance * 1.15 * (type === "ev" ? 0.19 : 0.11) * 0.97).toFixed(
            2
          )
        ),
      },
    ];
    resultEl.innerHTML =
      `<p class="muted">From <strong>${start}</strong> to <strong>${end}</strong> (simulated):</p>` +
      routes
        .map(
          (r) => `
      <div class="alert-item">
        <div><strong>${r.name}</strong><br/><span class="muted">${
            r.distance
          } km • ~${r.time} min • ~${r.energy} ${unit}</span></div>
        <div class="alert-pill">${
          r.name === "Energy-Efficient" ? "Recommended" : "Alternative"
        }</div>
      </div>
    `
        )
        .join("");
    initRouteMap();
    setTimeout(() => {
      if (!routeMap || typeof L === "undefined") return;
      routeLayer.clearLayers();
      const baseLat = 12.9716 + (Math.random() - 0.5) * 0.08;
      const baseLng = 77.5946 + (Math.random() - 0.5) * 0.08;
      const startLatLng = [baseLat, baseLng];
      const endLatLng = [
        baseLat + (Math.random() - 0.5) * 0.2,
        baseLng + (Math.random() - 0.5) * 0.2,
      ];
      const startMarker = L.circleMarker(startLatLng, {
        radius: 8,
        color: "#10b981",
        fillColor: "#10b981",
        fillOpacity: 1,
      }).bindPopup(`<strong>📍 Start</strong><br/>${start}`);
      const endMarker = L.circleMarker(endLatLng, {
        radius: 8,
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 1,
      }).bindPopup(`<strong>🏁 Destination</strong><br/>${end}`);
      const mid = [
        (startLatLng[0] + endLatLng[0]) / 2 + (Math.random() - 0.5) * 0.05,
        (startLatLng[1] + endLatLng[1]) / 2 + (Math.random() - 0.5) * 0.05,
      ];
      const poly = L.polyline([startLatLng, mid, endLatLng], {
        color: "#6366f1",
        weight: 4,
        opacity: 0.9,
      });
      routeLayer.addLayer(startMarker);
      routeLayer.addLayer(endMarker);
      routeLayer.addLayer(poly);
      routeMap.fitBounds(L.latLngBounds(startLatLng, endLatLng), {
        padding: [50, 50],
        maxZoom: 14,
      });
      startMarker.openPopup();
    }, 300);
  });
}

/* ===== Alerts, Emergency, Feedback ===== */
function initAlerts() {
  const list = $("#alertsList"),
    btn = $("#generateAlert");
  if (!list || !btn) return;
  const priceAlerts = [
    "Petrol price likely to rise by 2% tomorrow.",
    "Off-peak EV charging window starts in 30 minutes.",
  ];
  const batteryAlerts = [
    "Battery level projected to reach 15% before destination.",
  ];
  const abnormalAlerts = [
    "Abnormal fuel consumption detected compared to last month.",
  ];
  let counter = 1;
  safeAddEvent(btn, "click", () => {
    const pool = priceAlerts.concat(batteryAlerts).concat(abnormalAlerts);
    const msg = pool[Math.floor(Math.random() * pool.length)];
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const item = document.createElement("div");
    item.className = "alert-item";
    item.innerHTML = `<div><strong>Alert #${counter++}</strong><br/><span class="muted">${msg}</span></div><div style="text-align:right"><div class="alert-pill">${time}</div></div>`;
    list.prepend(item);
  });
}

function initEmergency() {
  const form = $("#emergencyForm"),
    result = $("#emergencyResult");
  if (!form || !result) return;

  $all(".quick-emergency button[data-emergency]").forEach((btn) =>
    safeAddEvent(btn, "click", () => {
      const kind = btn.dataset.emergency;
      const location =
        $("#emergencyLocation")?.value.trim() ||
        "your current GPS location (simulated)";

      if (kind === "accident") {
        // Fetch emergency contacts from backend
        fetch("/api/emergency-contacts", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
          .then((res) => res.json())
          .then((contacts) => {
            // Find primary and alternate contacts
            const primaryContact =
              contacts.find((c) => c.is_primary) || contacts[0];
            const alternateContact =
              contacts.find((c) => !c.is_primary) || contacts[1];

            let html = `<p class="muted">Accident reported near <strong>${location}</strong> (simulated).</p>`;

            // Step 1: Call 112
            html += `
            <div class="alert-item">
              <div>
                <strong>Step 1 — Call official emergency helpline</strong>
                <br/><span class="muted">Call 112 for immediate police, ambulance, and fire support.</span>
              </div>
              <div style="text-align:right">
                <a class="primary-btn" href="tel:112" style="font-size:0.75rem;padding:0.5rem 1rem;text-decoration:none;">
                  <i class="fas fa-phone" style="margin-right:0.25rem;"></i>Call 112
                </a>
              </div>
            </div>
          `;

            // Step 2: Contact Primary Emergency Contact
            if (primaryContact) {
              html += `
              <div class="alert-item">
                <div>
                  <strong>Step 2 — Contact your primary emergency contact</strong>
                  <br/><span class="muted">${primaryContact.contact_name} (${
                primaryContact.relationship || "Family"
              })</span>
                </div>
                <div style="text-align:right">
                  <a class="primary-btn" href="tel:${
                    primaryContact.phone
                  }" style="font-size:0.75rem;padding:0.5rem 1rem;text-decoration:none;">
                    <i class="fas fa-phone" style="margin-right:0.25rem;"></i>${
                      primaryContact.phone
                    }
                  </a>
                </div>
              </div>
            `;
            }

            // Step 3: Contact Alternate Emergency Contact
            if (
              alternateContact &&
              alternateContact.id !== primaryContact?.id
            ) {
              html += `
              <div class="alert-item">
                <div>
                  <strong>Step 3 — Contact your alternate emergency contact</strong>
                  <br/><span class="muted">${alternateContact.contact_name} (${
                alternateContact.relationship || "Family"
              })</span>
                </div>
                <div style="text-align:right">
                  <a class="primary-btn" href="tel:${
                    alternateContact.phone
                  }" style="font-size:0.75rem;padding:0.5rem 1rem;text-decoration:none;">
                    <i class="fas fa-phone" style="margin-right:0.25rem;"></i>${
                      alternateContact.phone
                    }
                  </a>
                </div>
              </div>
            `;
            }

            result.innerHTML = html;
          })
          .catch((err) => {
            console.error("Error fetching emergency contacts:", err);
            // Fallback if contacts fetch fails
            result.innerHTML = `<p class="muted">Accident reported near <strong>${location}</strong> (simulated).</p>
            <div class="alert-item">
              <div>
                <strong>Step 1 — Call official emergency helpline</strong>
                <br/><span class="muted">Call 112 for immediate help.</span>
              </div>
              <div style="text-align:right">
                <a class="primary-btn" href="tel:112">Call 112</a>
              </div>
            </div>`;
          });
      } else {
        result.innerHTML = `<p class="muted">Help suggestions for <strong>${location}</strong> (simulated).</p>`;
      }
    })
  );

  safeAddEvent(form, "submit", (e) => {
    e.preventDefault();
    const location = $("#emergencyLocation")?.value.trim();
    if (!location) return;
    $(
      "#emergencyResult"
    ).innerHTML = `<p class="muted">Request sent for <strong>${location}</strong> (simulated).</p>`;
  });
}

function initFeedback() {
  const form = $("#feedbackForm"),
    status = $("#feedbackStatus");
  if (!form || !status) return;
  safeAddEvent(form, "submit", (e) => {
    e.preventDefault();
    const rating = $("#feedbackRating")?.value;
    if (!rating) {
      status.textContent = "Please select a rating.";
      return;
    }
    status.textContent =
      "Thank you! Your feedback has been recorded (simulated).";
    $("#feedbackText") && ($("#feedbackText").value = "");
  });
}

function generateMockBehavior() {
  const snapshot = $("#behaviorSnapshot");
  if (!snapshot) return;
  const avgSpeed = Math.round(Math.random() * 40 + 30);
  const harshBraking = Math.round(Math.random() * 8);
  const idleTime = Math.round(Math.random() * 18 + 5);
  const accel = ["Smooth", "Moderate", "Aggressive"][
    Math.floor(Math.random() * 3)
  ];
  snapshot.innerHTML = `<li>Average speed: ${avgSpeed} km/h</li><li>Harsh braking events: ${harshBraking} per 100 km</li><li>Idle time: ${idleTime} min per day</li><li>Acceleration style: ${accel}</li>`;
}

function setupRouteMapObserver() {
  const routesSection = document.getElementById("routes");
  if (!routesSection) return;
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          initRouteMap();
          setTimeout(() => {
            if (routeMap && routeMap.invalidateSize) routeMap.invalidateSize();
          }, 200);
        }
      });
    },
    { threshold: 0.1 }
  );
  obs.observe(routesSection);
}

/* ===== Initialize on DOM Ready ===== */
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initUserForm();
  initStationMap();
  setupStationControls();
  initRoutes();
  initAlerts();
  initEmergency();
  initFeedback();
  setupRouteMapObserver();
  generateMockDashboard();
  generateMockBehavior();
  updateVehicleUI();
  updateRemainingRange();
  updateChargeStatusDisplay();

  // If page is opened with a hash (e.g. /app#vehicle), navigate there.
  // Fallback to "vehicle" if hash missing or invalid.
  const targetFromHash = (window.location.hash || "").replace(/^#/, "");
  const defaultTarget = "vehicle";
  const target = targetFromHash || defaultTarget;

  if (typeof goToSection === "function") {
    if (target && document.getElementById(target)) goToSection(target);
    else goToSection(defaultTarget);
  }

  // Keep in sync if hash changes while app is open (e.g. link navigation)
  window.addEventListener("hashchange", () => {
    const h = (window.location.hash || "").replace(/^#/, "");
    if (h && typeof goToSection === "function" && document.getElementById(h)) {
      goToSection(h);
    }
  });
});