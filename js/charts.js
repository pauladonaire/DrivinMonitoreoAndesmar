/* ============================================================
   charts.js — Gráficos Chart.js (solo donut en resumen operativo)
   ============================================================ */

const CHART_TOOLTIP = {
  backgroundColor: '#1E2733',
  borderColor:     '#01feff',
  borderWidth:     1,
  titleColor:      '#ffffff',
  bodyColor:       '#a0b4c8',
};

/**
 * Renderiza el donut de motivos de rechazo (compacto, leyenda abajo).
 */
function renderCharts() {
  renderDonutChart();
}

function renderDonutChart() {
  const ctx = document.getElementById('chartDona');
  if (!ctx) return;

  if (APP_STATE.charts.dona) {
    APP_STATE.charts.dona.destroy();
    APP_STATE.charts.dona = null;
  }

  // Contar rechazadas por motivo
  const rechazadas = APP_STATE.filteredOrders.filter(o => o.status === 'rejected');
  const motivoMap  = {};
  rechazadas.forEach(o => {
    const key = o.reason || 'Sin motivo';
    motivoMap[key] = (motivoMap[key] || 0) + 1;
  });

  const sorted = Object.entries(motivoMap).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const data   = sorted.map(([, v]) => v);
  const total  = data.reduce((s, v) => s + v, 0);

  const palette = [
    '#991b1b','#7c3aed','#1d4ed8','#065f46','#92400e',
    '#4c1d95','#1e3a8a','#713f12','#134e4a','#7f1d1d',
  ];

  if (total === 0) {
    APP_STATE.charts.dona = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Sin rechazadas'],
        datasets: [{ data: [1], backgroundColor: ['#2a3547'], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { display: false },
          tooltip: { enabled: false },
        }
      }
    });
    return;
  }

  APP_STATE.charts.dona = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, i) => palette[i % palette.length]),
        borderColor:     '#1E2733',
        borderWidth:     2,
        hoverOffset:     6,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:     '#a0b4c8',
            font:      { family: 'Inter', size: 10 },
            padding:   8,
            boxWidth:  10,
            boxHeight: 10,
            // Truncar etiquetas largas
            generateLabels(chart) {
              const orig = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              return orig.map(item => {
                const t = item.text || '';
                return { ...item, text: t.length > 22 ? t.slice(0, 20) + '…' : t };
              });
            },
          },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            label: ctx => {
              const val = ctx.raw;
              const p   = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${val} (${p}%)`;
            }
          }
        }
      }
    }
  });
}
