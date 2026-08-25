const SUPABASE_URL       = "https://tjoxfstshsakaqaksjyw.supabase.co"; 
const SUPABASE_ANON_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqb3hmc3RzaHNha2FxYWtzanl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1OTc4ODgsImV4cCI6MjEwMTE3Mzg4OH0.z3O1Nt_VsXX5DR1HfTdj8_dhfCQsrLt_6MYYjmoSTEo";  
const DB_SCHEMA          = "sales_dashboard"; 


const REP_TARGET = 125; 

async function callRPC(fnName, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Profile": DB_SCHEMA,
      "Accept-Profile": DB_SCHEMA
    },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`RPC ${fnName} failed (${res.status}): ${errText}`);
  }
  return res.json();
}


const fmtInt = n => (n === null || n === undefined) ? "0" : Number(n).toLocaleString("en-IN");
function fmtRevenue(n) {
  n = Number(n) || 0;
  if (n >= 100000) return "₹" + (n / 100000).toFixed(2) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(2) + "K";
  return "₹" + n.toFixed(0);
}
const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let dailyChartInstance = null;
let monthlyChartInstance = null;


async function loadDashboard(dateStr) {
  const banner = document.getElementById("statusBanner");
  banner.className = "status-banner";
  banner.textContent = "Loading dashboard for " + dateStr + " …";

  try {
    const [dashboard, dailyTrend] = await Promise.all([
      callRPC("get_sales_dashboard", { report_date: dateStr }),
      callRPC("daily_summary", { report_date: dateStr }).catch(() => null)
    ]);

    const row = Array.isArray(dashboard) ? dashboard[0] : dashboard;
    renderKpis(row.kpi_metrices ? row.kpi_metrices[0] : {}, dateStr);
    renderLeaderboard(row.leaderboard || []);
    renderMonthlyChart(row.month_metrices || []);
    renderDailyChart(dailyTrend, dateStr);

    banner.textContent = "✓ Live data from Supabase for " + dateStr;
    banner.classList.add("ok");
  } catch (err) {
    console.warn("Falling back to demo data:", err.message);
    banner.textContent = "⚠ Couldn't reach Supabase (" + err.message + "). Showing demo data — fill in SUPABASE_URL / SUPABASE_ANON_KEY at the top of script.js to go live.";
    banner.classList.add("err");
    renderDemoData(dateStr);
  }
}


function renderKpis(kpi, dateStr) {
  kpi = kpi || {};
  document.getElementById("kpiTodaySales").textContent = fmtInt(kpi.today_sales);
  document.getElementById("kpiTodayRevenue").innerHTML = `${fmtRevenue(kpi.today_revenue)} <span style="opacity:.7">Revenue</span>`;

  const d = new Date(dateStr);
  document.getElementById("mtdLabel").textContent = monthNames[d.getMonth()].toUpperCase() + " MTD";
  document.getElementById("kpiMtdSales").textContent = fmtInt(kpi.mtd_sales);
  document.getElementById("kpiMtdRevenue").innerHTML = `${fmtRevenue(kpi.mtd_revenue)} <span style="color:var(--text-light)">Revenue</span>`;

  document.getElementById("kpiPrevSameSales").textContent = fmtInt(kpi.prev_month_same_day_sales);
  document.getElementById("kpiPrevSameRevenue").innerHTML = `${fmtRevenue(kpi.prev_month_same_day_revenue)} <span style="color:var(--text-light)">Revenue</span>`;

  document.getElementById("kpiPrevMonthSales").textContent = fmtInt(kpi.prev_month_sales);
  document.getElementById("kpiPrevMonthRevenue").innerHTML = `${fmtRevenue(kpi.prev_month_revenue)} <span style="color:var(--text-light)">Revenue</span>`;
}

function renderLeaderboard(rows) {
  const tbody = document.getElementById("leaderboardBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#7f86ad;padding:24px;">No data for this date</td></tr>`;
    return;
  }
  const sorted = [...rows].sort((a, b) => (b.mtd_sales || 0) - (a.mtd_sales || 0));
  tbody.innerHTML = sorted.map((r, i) => {
    const arpu = r.mtd_sales ? Math.round((r.mtd_revenue || 0) / r.mtd_sales) : 0;
    const pct = Math.min(100, Math.round(((r.mtd_sales || 0) / REP_TARGET) * 100));
    return `
      <tr>
        <td>${i + 1}</td>
        <td>
          <div class="rep-name">${r.sales_rep || "—"}</div>
          <div class="rep-sub">₹${((r.tdy_revenue || 0) / 1000).toFixed(1)}K</div>
        </td>
        <td>${fmtInt(r.tdy_sales)}</td>
        <td class="mtd-rev">₹${((r.mtd_revenue || 0) / 1000).toFixed(1)}K</td>
        <td>₹${arpu}</td>
        <td>
          <span class="target-pct">${pct}%</span><span class="target-cap">${REP_TARGET}</span>
          <div class="target-bar"><div class="target-fill" style="width:${pct}%"></div></div>
        </td>
        <td>${fmtInt(r.mtd_sales)}</td>
      </tr>`;
  }).join("");
}

function renderDailyChart(rows, dateStr) {
  let labels, data;
  if (rows && rows.length) {
    labels = rows.map(r => new Date(r.date).getDate());
    data = rows.map(r => r.sales);
  } else {
    const d = new Date(dateStr);
    const dayOfMonth = d.getDate();
    labels = Array.from({ length: dayOfMonth }, (_, i) => i + 1);
    data = labels.map(() => Math.floor(Math.random() * 40) + 20);
  }
  drawBarChart("dailyChart", labels, data);
}

function renderMonthlyChart(rows) {
  const sorted = [...rows].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const last8 = sorted.slice(-8);
  const labels = last8.map(r => monthNames[r.month - 1] + " " + String(r.year).slice(-2));
  const data = last8.map(r => r.no_of_sales);
  drawLineChart("monthlyChart", labels, data);
}

function drawLineChart(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [{
        data,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.12)",
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: "#2563eb",
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#9aa0bd", font: { size: 10 } } },
        y: { grid: { color: "#f0f1f6" }, ticks: { color: "#9aa0bd", font: { size: 10 } } }
      }
    }
  };
  if (monthlyChartInstance) monthlyChartInstance.destroy();
  monthlyChartInstance = new Chart(ctx, cfg);
}

function drawBarChart(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const cfg = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: "#2563eb",
        borderRadius: 4,
        maxBarThickness: 28
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#9aa0bd", font: { size: 10 } } },
        y: { grid: { color: "#f0f1f6" }, ticks: { color: "#9aa0bd", font: { size: 10 } } }
      }
    }
  };
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(ctx, cfg);
}

function renderDemoData(dateStr) {
  renderKpis({
    today_sales: 33, today_revenue: 30800,
    mtd_sales: 658, mtd_revenue: 574690,
    prev_month_same_day_sales: 536, prev_month_same_day_revenue: 459440,
    prev_month_sales: 964, prev_month_revenue: 818900
  }, dateStr);

  renderLeaderboard([
    { sales_rep: "Faizan",   tdy_sales: 10, tdy_revenue: 9500,  mtd_sales: 155, mtd_revenue: 143300 },
    { sales_rep: "Talha",    tdy_sales: 4,  tdy_revenue: 5000,  mtd_sales: 121, mtd_revenue: 103700 },
    { sales_rep: "Bhageshri",tdy_sales: 4,  tdy_revenue: 2500,  mtd_sales: 119, mtd_revenue: 94000 },
    { sales_rep: "Nidhi",    tdy_sales: 5,  tdy_revenue: 4200,  mtd_sales: 85,  mtd_revenue: 78800 },
    { sales_rep: "Sanika",   tdy_sales: 5,  tdy_revenue: 5700,  mtd_sales: 95,  mtd_revenue: 83300 },
    { sales_rep: "Prabhat",  tdy_sales: 3,  tdy_revenue: 2800,  mtd_sales: 64,  mtd_revenue: 62600 },
    { sales_rep: "Farooq",   tdy_sales: 2,  tdy_revenue: 1100,  mtd_sales: 9,   mtd_revenue: 9000 }
  ]);

  renderDailyChart(null, dateStr);
  renderMonthlyChart([
    { year: 2025, month: 11, no_of_sales: 120 },
    { year: 2025, month: 12, no_of_sales: 260 },
    { year: 2026, month: 1,  no_of_sales: 340 },
    { year: 2026, month: 2,  no_of_sales: 420 },
    { year: 2026, month: 3,  no_of_sales: 520 },
    { year: 2026, month: 4,  no_of_sales: 700 },
    { year: 2026, month: 5,  no_of_sales: 950 },
    { year: 2026, month: 6,  no_of_sales: 820 }
  ]);
}

function downloadCsv() {
  const rows = [...document.querySelectorAll("#leaderboardBody tr")];
  let csv = "#,Sales Rep,#Day,MTD Rev,ARPU,Target %,#PV Month\n";
  rows.forEach(tr => {
    const cells = [...tr.children].map(td => `"${td.innerText.replace(/\n/g, " ").trim()}"`);
    if (cells.length) csv += cells.join(",") + "\n";
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `voyx-leaderboard-${document.getElementById("reportDate").value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


document.getElementById("downloadCsvBtn").addEventListener("click", downloadCsv);
document.getElementById("logoutLink").addEventListener("click", (e) => {
  e.preventDefault();
  alert("Wire this up to supabase.auth.signOut() once the login RPC/session is connected.");
});

const dateInput = document.getElementById("reportDate");
dateInput.value = "2026-05-17"; // matches the report_date used in your SQL samples
dateInput.addEventListener("change", () => loadDashboard(dateInput.value));

loadDashboard(dateInput.value);