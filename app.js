/**
 * TinyML Predictive Maintenance Dashboard Logic
 * Real-time telemetry monitoring, anomaly notifications, and data logger
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // --- STATE MANAGEMENT ---
  const state = {
    isSerialConnected: false,
    serialPort: null,
    audioEnabled: true,
    alarmPreset: 'big_horn', // big_horn, siren, industrial_pulse, scada_chime
    activeFaultState: 'healthy', // healthy, bearing_wear, misalignment, overheating
    currentFilter: 'all',
    searchQuery: '',
    sampleCounter: 0,
    records: [],
    maxChartPoints: 30,
    chartData: {
      labels: [],
      vibX: [],
      vibY: [],
      temp: [],
      probs: [0.994, 0.002, 0.002, 0.002] // Healthy, Bearing Wear, Misalignment, Overheating
    }
  };

  // --- DOM ELEMENTS ---
  const el = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    btnConnectSerial: document.getElementById('btnConnectSerial'),
    faultSelector: document.getElementById('faultSelector'),
    alarmSoundSelector: document.getElementById('alarmSoundSelector'),
    btnAudioToggle: document.getElementById('btnAudioToggle'),
    audioIcon: document.getElementById('audioIcon'),
    btnExportCSV: document.getElementById('btnExportCSV'),
    btnClearLogs: document.getElementById('btnClearLogs'),
    
    // KPI Cards
    healthScore: document.getElementById('healthScore'),
    conditionChip: document.getElementById('conditionChip'),
    healthProgressBar: document.getElementById('healthProgressBar'),
    healthIconBadge: document.getElementById('healthIconBadge'),
    healthIcon: document.getElementById('healthIcon'),
    healthSubtext: document.getElementById('healthSubtext'),
    
    vibValue: document.getElementById('vibValue'),
    vibXVal: document.getElementById('vibXVal'),
    vibYVal: document.getElementById('vibYVal'),
    
    tempValue: document.getElementById('tempValue'),
    tempProgressBar: document.getElementById('tempProgressBar'),
    tempSubtext: document.getElementById('tempSubtext'),
    
    // Motor Current
    currentValue: document.getElementById('currentValue'),
    currentProgressBar: document.getElementById('currentProgressBar'),
    currentSubtext: document.getElementById('currentSubtext'),
    sensorModeText: document.getElementById('sensorModeText'),
    
    rulValue: document.getElementById('rulValue'),
    latencyValue: document.getElementById('latencyValue'),
    confidenceVal: document.getElementById('confidenceVal'),
    
    // Banner
    emergencyBanner: document.getElementById('emergencyBanner'),
    bannerTitle: document.getElementById('bannerTitle'),
    bannerMessage: document.getElementById('bannerMessage'),
    btnDismissBanner: document.getElementById('btnDismissBanner'),

    // Table & Filters
    logSearch: document.getElementById('logSearch'),
    logTableBody: document.getElementById('logTableBody'),
    emptyRow: document.getElementById('emptyRow'),
    toastContainer: document.getElementById('toastContainer'),

    // Counts
    countAll: document.getElementById('countAll'),
    countHealthy: document.getElementById('countHealthy'),
    countBearing: document.getElementById('countBearing'),
    countMisalign: document.getElementById('countMisalign'),
    countOverheat: document.getElementById('countOverheat'),
  };

  // --- INDUSTRIAL AUDIO SYNTHESIZER ---
  let audioCtx = null;
  let alarmIntervalTimer = null;
  let isSirenActive = false;

  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Unlock AudioContext on user interaction
  document.addEventListener('click', () => {
    initAudioContext();
  }, { once: false });

  /**
   * BIG INDUSTRIAL EMERGENCY HORN / KLAXON
   * Heavy 3-oscillator industrial air horn (Sub-bass 110Hz + 440Hz fundamental + 660Hz fifth)
   * Big, commanding, un-missable emergency master warning blast.
   */
  function playBigIndustrialHorn() {
    if (!state.audioEnabled) return;
    try {
      initAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const duration = 0.85; // 850ms blast

      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.45, now + 0.04);
      masterGain.gain.setValueAtTime(0.45, now + duration - 0.1);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      masterGain.connect(audioCtx.destination);

      // Oscillator 1: Sub-bass resonance (110Hz Low A)
      const oscLow = audioCtx.createOscillator();
      oscLow.type = 'sawtooth';
      oscLow.frequency.setValueAtTime(110, now);
      oscLow.connect(masterGain);
      oscLow.start(now);
      oscLow.stop(now + duration);

      // Oscillator 2: Core Horn Pitch (440Hz A4)
      const oscMid = audioCtx.createOscillator();
      oscMid.type = 'sawtooth';
      oscMid.frequency.setValueAtTime(440, now);
      oscMid.frequency.linearRampToValueAtTime(455, now + duration); // Pitch swell
      oscMid.connect(masterGain);
      oscMid.start(now);
      oscMid.stop(now + duration);

      // Oscillator 3: Harmonic Fifth (660Hz E5)
      const oscHigh = audioCtx.createOscillator();
      oscHigh.type = 'square';
      oscHigh.frequency.setValueAtTime(660, now);
      oscHigh.connect(masterGain);
      oscHigh.start(now);
      oscHigh.stop(now + duration);

    } catch (e) {
      console.warn("Big Horn Audio error:", e);
    }
  }

  /**
   * HEAVY FACTORY SIREN (Pulsing Wail)
   */
  function playHeavyFactorySiren() {
    if (!state.audioEnabled) return;
    try {
      initAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const duration = 0.7;

      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      masterGain.connect(audioCtx.destination);

      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(950, now + duration * 0.7);
      osc.frequency.linearRampToValueAtTime(500, now + duration);
      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  /**
   * ISO 7731 Dual-Pulse Beep
   */
  function playIndustrialPulseTone() {
    if (!state.audioEnabled) return;
    try {
      initAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      // Pulse 1: 523.25 Hz (C5)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.025);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.19);

      // Pulse 2: 659.25 Hz (E5)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.16);

      gain2.gain.setValueAtTime(0.001, now + 0.16);
      gain2.gain.linearRampToValueAtTime(0.25, now + 0.185);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.36);
    } catch (e) {}
  }

  /**
   * SCADA Harmonic Chime
   */
  function playScadaChime() {
    if (!state.audioEnabled) return;
    try {
      initAudioContext();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      [587.33, 880.00].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);

        gain.gain.setValueAtTime(0.001, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.2, now + i * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.42);
      });
    } catch (e) {}
  }

  function startAlarmSiren() {
    if (!state.audioEnabled || isSirenActive) return;
    isSirenActive = true;

    if (state.alarmPreset === 'big_horn') {
      playBigIndustrialHorn();
      alarmIntervalTimer = setInterval(() => {
        if (isSirenActive && state.audioEnabled) {
          playBigIndustrialHorn();
        }
      }, 1200); // Heavy 1.2s repeating horn blasts
    } else if (state.alarmPreset === 'siren') {
      playHeavyFactorySiren();
      alarmIntervalTimer = setInterval(() => {
        if (isSirenActive && state.audioEnabled) {
          playHeavyFactorySiren();
        }
      }, 950);
    } else if (state.alarmPreset === 'scada_chime') {
      playScadaChime();
      alarmIntervalTimer = setInterval(() => {
        if (isSirenActive && state.audioEnabled) {
          playScadaChime();
        }
      }, 1200);
    } else {
      // ISO Industrial Beep
      playIndustrialPulseTone();
      alarmIntervalTimer = setInterval(() => {
        if (isSirenActive && state.audioEnabled) {
          playIndustrialPulseTone();
        }
      }, 900);
    }
  }

  function stopAlarmSiren() {
    isSirenActive = false;
    if (alarmIntervalTimer) {
      clearInterval(alarmIntervalTimer);
      alarmIntervalTimer = null;
    }
  }

  function playAlertSound(type = 'warning') {
    if (!state.audioEnabled) return;
    if (state.alarmPreset === 'big_horn') {
      playBigIndustrialHorn();
    } else if (state.alarmPreset === 'siren') {
      playHeavyFactorySiren();
    } else if (state.alarmPreset === 'scada_chime') {
      playScadaChime();
    } else {
      playIndustrialPulseTone();
    }
  }

  // --- CHART INITIALIZATION ---
  const chartOptionsBase = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 } }
      }
    }
  };

  // 1. Vibration Chart
  const ctxVib = document.getElementById('vibChart').getContext('2d');
  const vibChart = new Chart(ctxVib, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Vib X (g)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Vib Y (g)',
          data: [],
          borderColor: '#a855f7',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3
        }
      ]
    },
    options: chartOptionsBase
  });

  // 2. Temperature Chart
  const ctxTemp = document.getElementById('tempChart').getContext('2d');
  const tempChart = new Chart(ctxTemp, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temp (°C)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderWidth: 2,
          pointRadius: 2,
          pointBackgroundColor: '#f59e0b',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Threshold',
          data: [],
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: chartOptionsBase
  });

  // 3. Probabilities Bar Chart
  const ctxProb = document.getElementById('probChart').getContext('2d');
  const probChart = new Chart(ctxProb, {
    type: 'bar',
    data: {
      labels: ['Healthy', 'Bearing Wear', 'Misalignment', 'Overheating'],
      datasets: [{
        data: [99.4, 0.2, 0.2, 0.2],
        backgroundColor: ['#10b981', '#f59e0b', '#a855f7', '#ef4444'],
        borderRadius: 6,
        barThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#9ca3af',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => v + '%'
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#f3f4f6', font: { family: 'Outfit', weight: '600', size: 12 } }
        }
      }
    }
  });

  // --- TELEMETRY GENERATOR & SIMULATOR ---
  function generateTelemetryPacket() {
    state.sampleCounter++;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

    let vibX, vibY, current, temp, predictedClass, confidence, probs;

    // Simulate based on selected fault state
    switch (state.activeFaultState) {
      case 'high_vibration':
        // Severe high vibration anomaly (MACHINE IS NOT GOOD)
        vibX = 2.85 + (Math.random() - 0.5) * 1.2;
        vibY = -3.45 + (Math.random() - 0.5) * 1.5;
        current = 6.45 + (Math.random() - 0.5) * 0.8;
        temp = 68.0 + (Math.random() - 0.5) * 3.0;
        predictedClass = 'bearing_wear';
        confidence = 99.2 + Math.random() * 0.7;
        probs = [0.1, 99.2, 0.4, 0.3];
        break;

      case 'bearing_wear':
        // High frequency vibration spikes
        vibX = 0.85 + (Math.random() - 0.5) * 0.4;
        vibY = -1.45 + (Math.random() - 0.5) * 0.5;
        current = 6.15 + (Math.random() - 0.5) * 0.6;
        temp = 54.0 + (Math.random() - 0.5) * 2.0;
        predictedClass = 'bearing_wear';
        confidence = 96.5 + Math.random() * 3.0;
        probs = [2.0, confidence, 1.0, 1.0];
        break;

      case 'misalignment':
        // Amplitude modulation on vibration
        vibX = 1.25 + Math.sin(state.sampleCounter * 0.5) * 0.6;
        vibY = -0.50 + Math.cos(state.sampleCounter * 0.5) * 0.6;
        current = 6.75 + (Math.random() - 0.5) * 0.8;
        temp = 48.5 + (Math.random() - 0.5) * 1.5;
        predictedClass = 'misalignment';
        confidence = 97.2 + Math.random() * 2.5;
        probs = [1.5, 0.5, confidence, 0.8];
        break;

      case 'overheating':
        // High temperature with thermal creep
        vibX = 0.42 + (Math.random() - 0.5) * 0.15;
        vibY = -1.02 + (Math.random() - 0.5) * 0.15;
        current = 8.65 + (Math.random() - 0.5) * 1.0;
        temp = 88.5 + (Math.random() - 0.5) * 4.0;
        predictedClass = 'overheating';
        confidence = 98.8 + Math.random() * 1.0;
        probs = [0.5, 0.3, 0.4, confidence];
        break;

      case 'healthy':
      default:
        // Baseline normal operating parameters
        vibX = 0.39 + (Math.random() - 0.5) * 0.08;
        vibY = -0.98 + (Math.random() - 0.5) * 0.08;
        current = 5.15 + (Math.random() - 0.5) * 0.3;
        temp = 41.5 + (Math.random() - 0.5) * 1.0;
        predictedClass = 'healthy';
        confidence = 99.4 + Math.random() * 0.5;
        probs = [confidence, 0.2, 0.2, 0.2];
        break;
    }

    return {
      timestamp: timeStr,
      windowId: state.sampleCounter,
      vibX: parseFloat(vibX.toFixed(3)),
      vibY: parseFloat(vibY.toFixed(3)),
      current: parseFloat(current.toFixed(2)),
      temp: parseFloat(temp.toFixed(1)),
      predictedClass,
      confidence: parseFloat(confidence.toFixed(1)),
      probs
    };
  }

  // --- TELEMETRY PROCESSING ---
  let previousCondition = 'healthy';

  function processTelemetry(packet) {
    if (!packet) return;

    // Resilient fallback & normalization for hardware serial streaming
    if (packet.vibX === undefined && packet.vib !== undefined) {
      packet.vibX = packet.vib;
    }
    if (packet.vibX === undefined) packet.vibX = 0.0;
    if (packet.vibY === undefined) packet.vibY = 0.0;
    if (packet.current === undefined) packet.current = 5.15;
    if (packet.temp === undefined) packet.temp = 25.0;
    if (packet.confidence === undefined) packet.confidence = 99.0;
    if (!packet.predictedClass) packet.predictedClass = 'healthy';

    if (packet.latencyMs !== undefined && el.latencyValue) {
      el.latencyValue.textContent = `${packet.latencyMs.toFixed(1)} ms TFLite`;
    }

    if (packet.sensorMode !== undefined && el.sensorModeText) {
      el.sensorModeText.textContent = packet.sensorMode === 'hardware' ? 'Mode: ESP32 Hardware' : 'Mode: ESP32 Sim';
    }

    if (!packet.timestamp) {
      const now = new Date();
      packet.timestamp = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    }
    if (packet.windowId === undefined) {
      state.sampleCounter++;
      packet.windowId = state.sampleCounter;
    }

    if (!Array.isArray(packet.probs) || packet.probs.length < 4) {
      packet.probs = [99.0, 0.3, 0.4, 0.3];
    }

    // 1. Update KPI UI Cards
    updateKPIs(packet);

    // 2. Update Charts
    updateCharts(packet);

    // 3. Add to Records Log
    addRecord(packet);

    // 4. Handle Anomaly Notifications & Sound Alerts
    if (packet.predictedClass !== previousCondition) {
      triggerConditionAlert(packet.predictedClass, previousCondition);
      previousCondition = packet.predictedClass;
    } else if (packet.predictedClass !== 'healthy' || state.activeFaultState !== 'healthy') {
      // Ensure continuous siren stays sounding while fault is active
      if (state.audioEnabled && !isSirenActive) {
        startAlarmSiren();
      }
    }
  }

  function updateKPIs(packet) {
    el.vibValue.textContent = `${Math.abs(packet.vibX).toFixed(2)} g`;
    el.vibXVal.textContent = `${packet.vibX > 0 ? '+' : ''}${packet.vibX} g`;
    el.vibYVal.textContent = `${packet.vibY > 0 ? '+' : ''}${packet.vibY} g`;

    el.tempValue.textContent = `${packet.temp} °C`;
    const tempPercent = Math.min(100, Math.max(0, (packet.temp / 100) * 100));
    el.tempProgressBar.style.width = `${tempPercent}%`;

    // Motor Current KPI update
    if (el.currentValue) {
      el.currentValue.textContent = `${packet.current.toFixed(2)} A`;
      const currentPercent = Math.min(100, Math.max(0, (packet.current / 10.0) * 100));
      el.currentProgressBar.style.width = `${currentPercent}%`;
      if (packet.current > 7.5) {
        el.currentSubtext.textContent = 'WARNING: High current draw / severe overload';
      } else if (packet.current > 6.0) {
        el.currentSubtext.textContent = 'Elevated current draw (load spike)';
      } else {
        el.currentSubtext.textContent = 'ACS712: Baseline normal load (5.0 - 6.5A)';
      }
    }

    el.confidenceVal.textContent = `${packet.confidence}%`;

    // Health Score calculation
    let healthScore = 99.4;
    let chipClass = 'healthy';
    let chipLabel = 'HEALTHY';
    let subtext = 'Operating within normal vibration & thermal limits';
    let rul = '420 hrs';

    if (state.activeFaultState === 'high_vibration' || Math.abs(packet.vibX) > 2.0 || Math.abs(packet.vibY) > 2.0) {
      healthScore = 22.5;
      chipClass = 'danger';
      chipLabel = 'HIGH VIB (NOT GOOD)';
      subtext = 'CRITICAL FAULT: High vibration amplitude exceeds 2.0g safety limit! Machine is UNHEALTHY!';
      rul = '18 hrs';
    } else if (packet.predictedClass === 'bearing_wear') {
      healthScore = 52.4;
      chipClass = 'warning';
      chipLabel = 'BEARING FAULT (BAD)';
      subtext = 'High frequency mechanical vibration spikes detected on X/Y axis';
      rul = '85 hrs';
    } else if (packet.predictedClass === 'misalignment') {
      healthScore = 61.8;
      chipClass = 'purple';
      chipLabel = 'MISALIGNMENT (BAD)';
      subtext = 'Harmonic rotational vibration imbalance detected';
      rul = '120 hrs';
    } else if (packet.predictedClass === 'overheating') {
      healthScore = 28.5;
      chipClass = 'danger';
      chipLabel = 'OVERHEATING (BAD)';
      subtext = 'Motor body temperature exceeded safety limit threshold (75°C)';
      rul = '12 hrs';
    }

    el.healthScore.textContent = `${healthScore.toFixed(1)}%`;
    el.healthProgressBar.style.width = `${healthScore}%`;
    el.healthSubtext.textContent = subtext;
    el.rulValue.textContent = rul;

    el.conditionChip.className = `status-chip ${chipClass}`;
    el.conditionChip.textContent = chipLabel;

    el.healthProgressBar.className = `progress-bar-fill ${chipClass === 'warning' ? 'temp' : chipClass}`;
  }

  function updateCharts(packet) {
    const labels = state.chartData.labels;
    labels.push(packet.timestamp);
    state.chartData.vibX.push(packet.vibX);
    state.chartData.vibY.push(packet.vibY);
    state.chartData.temp.push(packet.temp);

    if (labels.length > state.maxChartPoints) {
      labels.shift();
      state.chartData.vibX.shift();
      state.chartData.vibY.shift();
      state.chartData.temp.shift();
    }

    // Update Vibration chart
    vibChart.data.labels = labels;
    vibChart.data.datasets[0].data = state.chartData.vibX;
    vibChart.data.datasets[1].data = state.chartData.vibY;
    vibChart.update('none');

    // Update Temperature chart
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = state.chartData.temp;
    tempChart.data.datasets[1].data = Array(labels.length).fill(75.0); // 75C Threshold line
    tempChart.update('none');

    // Update Probability Bar chart
    probChart.data.datasets[0].data = packet.probs;
    probChart.update();
  }

  // --- RECORDS TABLE MANAGEMENT ---
  function addRecord(packet) {
    state.records.unshift(packet); // Add to beginning
    if (state.records.length > 200) state.records.pop(); // Cap at 200 items

    updateFilterCounts();
    renderTable();
  }

  function updateFilterCounts() {
    el.countAll.textContent = state.records.length;
    el.countHealthy.textContent = state.records.filter(r => r.predictedClass === 'healthy').length;
    el.countBearing.textContent = state.records.filter(r => r.predictedClass === 'bearing_wear').length;
    el.countMisalign.textContent = state.records.filter(r => r.predictedClass === 'misalignment').length;
    el.countOverheat.textContent = state.records.filter(r => r.predictedClass === 'overheating').length;
  }

  function renderTable() {
    const filtered = state.records.filter(record => {
      const matchFilter = state.currentFilter === 'all' || record.predictedClass === state.currentFilter;
      const matchSearch = state.searchQuery === '' || 
        record.predictedClass.toLowerCase().includes(state.searchQuery) ||
        record.timestamp.includes(state.searchQuery) ||
        String(record.temp).includes(state.searchQuery);
      return matchFilter && matchSearch;
    });

    if (filtered.length === 0) {
      el.logTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="8">No telemetry records match current filter.</td>
        </tr>
      `;
      return;
    }

    el.logTableBody.innerHTML = filtered.map(r => {
      let badgeClass = 'healthy';
      let label = 'Healthy';
      if (r.predictedClass === 'bearing_wear') { badgeClass = 'warning'; label = 'Bearing Wear'; }
      if (r.predictedClass === 'misalignment') { badgeClass = 'purple'; label = 'Misalignment'; }
      if (r.predictedClass === 'overheating') { badgeClass = 'danger'; label = 'Overheating'; }

      return `
        <tr>
          <td>${r.timestamp}</td>
          <td>#${r.windowId}</td>
          <td>${r.vibX > 0 ? '+' : ''}${r.vibX}</td>
          <td>${r.vibY > 0 ? '+' : ''}${r.vibY}</td>
          <td>${r.current !== undefined ? r.current.toFixed(2) : '5.15'} A</td>
          <td>${r.temp} °C</td>
          <td><strong>${label}</strong></td>
          <td>${r.confidence}%</td>
          <td><span class="status-chip ${badgeClass}">${label}</span></td>
        </tr>
      `;
    }).join('');
  }

  // --- NOTIFICATION TOAST SYSTEM ---
  function showToast(title, message, type = 'healthy') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const time = new Date().toLocaleTimeString();

    let icon = 'check-circle';
    if (type === 'warning') icon = 'alert-circle';
    if (type === 'purple') icon = 'alert-triangle';
    if (type === 'danger') icon = 'alert-octagon';

    toast.innerHTML = `
      <i data-lucide="${icon}" class="toast-icon"></i>
      <div>
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
        <div class="toast-time">${time}</div>
      </div>
    `;

    el.toastContainer.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  function triggerConditionAlert(newClass, oldClass) {
    if (state.activeFaultState === 'high_vibration') {
      el.emergencyBanner.classList.remove('hidden');
      el.bannerTitle.textContent = 'CRITICAL ALARM: SEVERE HIGH VIBRATION (MACHINE IS NOT GOOD)';
      el.bannerMessage.textContent = 'Vibration amplitude exceeded 2.0g. Machine condition is UNHEALTHY / BAD! Immediate mechanical inspection required.';
      showToast('CRITICAL HIGH VIBRATION', 'Extreme vibration detected! Machine state is UNHEALTHY (NOT GOOD).', 'danger');
      playAlertSound('danger');
      startAlarmSiren();
    } else if (newClass === 'overheating') {
      el.emergencyBanner.classList.remove('hidden');
      el.bannerTitle.textContent = 'CRITICAL ALARM: MOTOR OVERHEATING';
      el.bannerMessage.textContent = 'Temperature reached dangerous levels. Recommended immediate shutdown to prevent motor winding damage.';
      showToast('CRITICAL OVERHEATING', 'Motor surface temperature exceeded 85°C safety ceiling.', 'danger');
      playAlertSound('danger');
      startAlarmSiren();
    } else if (newClass === 'bearing_wear') {
      el.emergencyBanner.classList.remove('hidden');
      el.bannerTitle.textContent = 'BEARING FAULT DETECTED (MACHINE IS NOT GOOD)';
      el.bannerMessage.textContent = 'High-frequency mechanical vibration spikes detected on X/Y axis. Machine health degraded!';
      showToast('BEARING WEAR WARNING (NOT GOOD)', 'High-frequency vibration anomaly detected on X/Y accelerometer axis.', 'warning');
      playAlertSound('warning');
      startAlarmSiren();
    } else if (newClass === 'misalignment') {
      el.emergencyBanner.classList.remove('hidden');
      el.bannerTitle.textContent = 'SHAFT MISALIGNMENT FAULT (MACHINE IS NOT GOOD)';
      el.bannerMessage.textContent = 'Harmonic rotational vibration imbalance detected. Inspect coupling and shaft alignment!';
      showToast('SHAFT MISALIGNMENT ALERT (NOT GOOD)', 'Rotational harmonic imbalance detected in sequence window.', 'purple');
      playAlertSound('warning');
      startAlarmSiren();
    } else if (newClass === 'healthy') {
      el.emergencyBanner.classList.add('hidden');
      if (oldClass !== 'healthy') {
        showToast('SYSTEM RESTORED', 'Machine telemetry returned to optimal healthy status.', 'healthy');
      }
      stopAlarmSiren();
    }
  }

  // --- EVENT LISTENERS ---
  el.faultSelector.addEventListener('change', (e) => {
    state.activeFaultState = e.target.value;
    if (state.activeFaultState === 'healthy') {
      stopAlarmSiren();
    }
  });

  if (el.alarmSoundSelector) {
    el.alarmSoundSelector.addEventListener('change', (e) => {
      state.alarmPreset = e.target.value;
      if (isSirenActive) {
        stopAlarmSiren();
        startAlarmSiren();
      }
      playAlertSound();
    });
  }

  el.btnAudioToggle.addEventListener('click', () => {
    state.audioEnabled = !state.audioEnabled;
    el.audioIcon.setAttribute('data-lucide', state.audioEnabled ? 'volume-2' : 'volume-x');
    if (window.lucide) lucide.createIcons();
    if (!state.audioEnabled) {
      stopAlarmSiren();
    } else if (state.activeFaultState !== 'healthy') {
      startAlarmSiren();
    }
    showToast('Audio Notification', state.audioEnabled ? 'Alarm sound cues & siren enabled' : 'Alarm audio muted', 'healthy');
  });

  el.btnDismissBanner.addEventListener('click', () => {
    el.emergencyBanner.classList.add('hidden');
  });

  el.btnClearLogs.addEventListener('click', () => {
    state.records = [];
    updateFilterCounts();
    renderTable();
    showToast('Logs Cleared', 'Historical telemetry records cleared from local view.', 'healthy');
  });

  el.logSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });

  // Filter Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.currentFilter = e.target.getAttribute('data-filter');
      renderTable();
    });
  });

  // CSV Exporter
  el.btnExportCSV.addEventListener('click', () => {
    if (state.records.length === 0) {
      showToast('Export Error', 'No telemetry records available to export.', 'warning');
      return;
    }

    const headers = ['Timestamp', 'Window_ID', 'Vib_X_g', 'Vib_Y_g', 'Current_A', 'Temp_C', 'Predicted_Condition', 'Confidence_Pct'];
    const rows = state.records.map(r => [
      r.timestamp,
      r.windowId,
      r.vibX,
      r.vibY,
      r.current !== undefined ? r.current : 5.15,
      r.temp,
      r.predictedClass,
      r.confidence
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `predictive_maintenance_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV Export', `Exported ${state.records.length} telemetry records to CSV file.`, 'healthy');
  });

  // WebSerial Integration & Clean Disconnect Support
  let serialReader = null;

  async function disconnectSerial() {
    try {
      if (serialReader) {
        await serialReader.cancel();
        serialReader.releaseLock();
        serialReader = null;
      }
      if (state.serialPort) {
        await state.serialPort.close();
        state.serialPort = null;
      }
    } catch (err) {
      console.warn("Error closing serial port:", err);
    }
    state.isSerialConnected = false;
    el.statusDot.className = 'status-dot green pulsing';
    el.statusText.textContent = 'Simulated Live Stream';
    if (el.sensorModeText) el.sensorModeText.textContent = 'Mode: Simulation';
    el.btnConnectSerial.innerHTML = `<i data-lucide="usb"></i> Connect ESP32`;
    if (window.lucide) lucide.createIcons();
    showToast('ESP32 Disconnected', 'Switched back to simulated stream.', 'healthy');
  }

  el.btnConnectSerial.addEventListener('click', async () => {
    if (state.isSerialConnected) {
      await disconnectSerial();
      return;
    }

    if (!('serial' in navigator)) {
      showToast('WebSerial Not Supported', 'Use Chrome, Edge, or Opera to connect ESP32 over USB Serial.', 'warning');
      return;
    }

    try {
      state.serialPort = await navigator.serial.requestPort();
      await state.serialPort.open({ baudRate: 115200 });

      state.isSerialConnected = true;
      el.statusDot.className = 'status-dot green pulsing';
      el.statusText.textContent = 'ESP32 Connected (USB Serial @ 115200)';
      el.btnConnectSerial.innerHTML = `<i data-lucide="power"></i> Disconnect ESP32`;
      if (window.lucide) lucide.createIcons();

      showToast('ESP32 Serial Connected', 'Receiving live hardware telemetry over WebSerial.', 'healthy');
      readSerialStream();
    } catch (err) {
      console.warn("WebSerial connection cancelled or failed:", err);
    }
  });

  if ('serial' in navigator) {
    navigator.serial.addEventListener('disconnect', () => {
      console.warn("Physical serial device disconnected");
      if (state.isSerialConnected) {
        disconnectSerial();
      }
    });
  }

  async function readSerialStream() {
    try {
      const textDecoder = new TextDecoderStream();
      state.serialPort.readable.pipeTo(textDecoder.writable);
      serialReader = textDecoder.readable.getReader();

      let buffer = '';
      while (state.isSerialConnected) {
        const { value, done } = await serialReader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep last unfinished chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{')) {
            try {
              const json = JSON.parse(trimmed);
              if (json.info) {
                showToast('ESP32 Log', json.info, 'healthy');
              } else if (json.error) {
                showToast('ESP32 Error', json.error, 'danger');
              } else {
                processTelemetry(json);
              }
            } catch (e) {
              console.debug("Serial raw line:", line);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Serial stream error or disconnected:", err);
      if (state.isSerialConnected) {
        disconnectSerial();
      }
    }
  }

  // --- START REAL-TIME SIMULATION LOOP ---
  // Runs every 1 second (1000ms)
  setInterval(() => {
    if (!state.isSerialConnected) {
      const packet = generateTelemetryPacket();
      processTelemetry(packet);
    }
  }, 1000);

  // Initial welcome toast
  setTimeout(() => {
    showToast('TinyML System Online', 'Real-time telemetry & predictive maintenance dashboard active.', 'healthy');
  }, 500);
});
