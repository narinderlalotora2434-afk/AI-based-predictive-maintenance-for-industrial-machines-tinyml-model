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
    activeFaultState: 'healthy', // healthy, bearing_wear, misalignment, overheating, high_vibration
    currentFilter: 'all',
    searchQuery: '',
    sampleCounter: 0,
    records: [],
    maxChartPoints: 30,
    wasBreached: false,
    thresholds: {
      vibLimit: parseFloat(localStorage.getItem('pm_vibLimit')) || 2.50,
      tempLimit: parseFloat(localStorage.getItem('pm_tempLimit')) || 65.0,
      soundLimit: parseFloat(localStorage.getItem('pm_soundLimit')) || 80.0,
      currentLimit: parseFloat(localStorage.getItem('pm_currentLimit')) || 8.00,
      alarmMode: localStorage.getItem('pm_alarmMode') || 'single' // single, continuous, mute
    },
    lastPacket: {
      timestamp: '--:--:--',
      windowId: 0,
      vibX: 0.39,
      vibY: -0.98,
      current: 5.15,
      temp: 24.0,
      sound: 48.0,
      predictedClass: 'healthy',
      confidence: 99.4,
      probs: [99.4, 0.2, 0.2, 0.2]
    },
    chartData: {
      labels: [],
      vibX: [],
      vibY: [],
      temp: [],
      sound: [],
      probs: [0.994, 0.002, 0.002, 0.002]
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
    
    // Threshold & Parameter Inputs
    threshVib: document.getElementById('threshVib'),
    threshTemp: document.getElementById('threshTemp'),
    threshSound: document.getElementById('threshSound'),
    threshCurrent: document.getElementById('threshCurrent'),
    alarmModeSelect: document.getElementById('alarmModeSelect'),
    btnSilenceAlarm: document.getElementById('btnSilenceAlarm'),
    btnResetLimits: document.getElementById('btnResetLimits'),

    // Metric Cards for breached highlight
    cardHealth: document.getElementById('cardHealth'),
    cardVib: document.getElementById('cardVib'),
    cardTemp: document.getElementById('cardTemp'),
    cardCurrent: document.getElementById('cardCurrent'),
    cardSound: document.getElementById('cardSound'),
    
    // KPI Cards Content
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
    
    // Motor Current (ACS712)
    currentValue: document.getElementById('currentValue'),
    currentProgressBar: document.getElementById('currentProgressBar'),
    currentSubtext: document.getElementById('currentSubtext'),
    sensorModeText: document.getElementById('sensorModeText'),

    // Acoustic Sound (INMP441)
    soundValue: document.getElementById('soundValue'),
    soundProgressBar: document.getElementById('soundProgressBar'),
    soundSubtext: document.getElementById('soundSubtext'),
    
    rulValue: document.getElementById('rulValue'),
    latencyValue: document.getElementById('latencyValue'),
    confidenceVal: document.getElementById('confidenceVal'),
    
    // Emergency Alert Banner
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

  // Unlock AudioContext on first user interaction
  document.addEventListener('click', () => {
    initAudioContext();
  }, { once: false });

  /**
   * BIG INDUSTRIAL EMERGENCY HORN / KLAXON
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
      oscMid.frequency.linearRampToValueAtTime(455, now + duration);
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

  function startAlarmSiren() {
    if (!state.audioEnabled || isSirenActive) return;
    isSirenActive = true;

    playAlertSound();
    const intervalMs = state.alarmPreset === 'siren' ? 950 : 1200;
    alarmIntervalTimer = setInterval(() => {
      if (isSirenActive && state.audioEnabled) {
        playAlertSound();
      }
    }, intervalMs);
  }

  function stopAlarmSiren() {
    isSirenActive = false;
    if (alarmIntervalTimer) {
      clearInterval(alarmIntervalTimer);
      alarmIntervalTimer = null;
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

  // 3. Acoustic Sound Waveform Chart (INMP441)
  const ctxSound = document.getElementById('soundChart').getContext('2d');
  const soundChart = new Chart(ctxSound, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Sound (dB)',
          data: [],
          borderColor: '#c084fc',
          backgroundColor: 'rgba(192, 132, 252, 0.08)',
          borderWidth: 2,
          pointRadius: 2,
          pointBackgroundColor: '#c084fc',
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

  // 4. Probabilities Bar Chart
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

    let vibX, vibY, current, temp, sound, predictedClass, confidence, probs;

    // Simulate based on selected fault state
    switch (state.activeFaultState) {
      case 'high_vibration':
        vibX = 2.85 + (Math.random() - 0.5) * 1.2;
        vibY = -3.45 + (Math.random() - 0.5) * 1.5;
        current = 6.45 + (Math.random() - 0.5) * 0.8;
        temp = 68.0 + (Math.random() - 0.5) * 3.0;
        sound = 82.5 + (Math.random() - 0.5) * 3.5;
        predictedClass = 'bearing_wear';
        confidence = 99.2 + Math.random() * 0.7;
        probs = [0.1, 99.2, 0.4, 0.3];
        break;

      case 'bearing_wear':
        vibX = 0.85 + (Math.random() - 0.5) * 0.4;
        vibY = -1.45 + (Math.random() - 0.5) * 0.5;
        current = 6.15 + (Math.random() - 0.5) * 0.6;
        temp = 54.0 + (Math.random() - 0.5) * 2.0;
        sound = 84.5 + (Math.random() - 0.5) * 4.0;
        predictedClass = 'bearing_wear';
        confidence = 96.5 + Math.random() * 3.0;
        probs = [2.0, confidence, 1.0, 1.0];
        break;

      case 'misalignment':
        vibX = 1.25 + Math.sin(state.sampleCounter * 0.5) * 0.6;
        vibY = -0.50 + Math.cos(state.sampleCounter * 0.5) * 0.6;
        current = 6.75 + (Math.random() - 0.5) * 0.8;
        temp = 48.5 + (Math.random() - 0.5) * 1.5;
        sound = 68.2 + (Math.random() - 0.5) * 3.0;
        predictedClass = 'misalignment';
        confidence = 97.2 + Math.random() * 2.5;
        probs = [1.5, 0.5, confidence, 0.8];
        break;

      case 'overheating':
        vibX = 0.42 + (Math.random() - 0.5) * 0.15;
        vibY = -1.02 + (Math.random() - 0.5) * 0.15;
        current = 8.65 + (Math.random() - 0.5) * 1.0;
        temp = 88.5 + (Math.random() - 0.5) * 4.0;
        sound = 52.0 + (Math.random() - 0.5) * 2.0;
        predictedClass = 'overheating';
        confidence = 98.8 + Math.random() * 1.0;
        probs = [0.5, 0.3, 0.4, confidence];
        break;

      case 'healthy':
      default:
        vibX = 0.39 + (Math.random() - 0.5) * 0.08;
        vibY = -0.98 + (Math.random() - 0.5) * 0.08;
        current = 5.15 + (Math.random() - 0.5) * 0.3;
        temp = 41.5 + (Math.random() - 0.5) * 1.0;
        sound = 48.2 + (Math.random() - 0.5) * 1.5;
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
      sound: parseFloat(sound.toFixed(1)),
      predictedClass,
      confidence: parseFloat(confidence.toFixed(1)),
      probs
    };
  }

  // --- TELEMETRY PROCESSING ---
  function processTelemetry(packet) {
    if (!packet) return;

    // Resilient fallback & normalization for serial/simulation
    if (packet.vibX === undefined && packet.vib !== undefined) {
      packet.vibX = packet.vib;
    }
    if (packet.vibX === undefined) packet.vibX = 0.0;
    if (packet.vibY === undefined) packet.vibY = 0.0;
    if (packet.current === undefined) packet.current = 5.15;
    if (packet.temp === undefined) packet.temp = 24.0;
    if (packet.sound === undefined) packet.sound = 48.0;
    if (packet.confidence === undefined) packet.confidence = 99.0;
    if (!packet.predictedClass) packet.predictedClass = 'healthy';

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

    // ALWAYS STORE LAST PACKET FOR IMMEDIATE THRESHOLD RE-EVALUATION
    state.lastPacket = { ...packet };

    if (packet.latencyMs !== undefined && el.latencyValue) {
      el.latencyValue.textContent = `${packet.latencyMs.toFixed(1)} ms TFLite`;
    }

    if (packet.sensorMode !== undefined && el.sensorModeText) {
      const isHw = packet.sensorMode === 'hardware';
      el.sensorModeText.textContent = isHw ? 'Mode: Live Sensors' : 'Mode: Simulation';
      el.sensorModeText.style.color = isHw ? '#10b981' : '#06b6d4';
    }

    // 1. Evaluate User Threshold Breaches (Master Safety Rule)
    const currentVib = Math.max(Math.abs(packet.vibX), Math.abs(packet.vibY));
    const breaches = [];
    const isVibBreached = currentVib >= state.thresholds.vibLimit;
    const isTempBreached = packet.temp >= state.thresholds.tempLimit;
    const isSoundBreached = packet.sound >= state.thresholds.soundLimit;
    const isCurrentBreached = packet.current >= state.thresholds.currentLimit;

    if (isVibBreached) breaches.push(`Vib (${currentVib.toFixed(2)}g >= ${state.thresholds.vibLimit.toFixed(2)}g)`);
    if (isTempBreached) breaches.push(`Temp (${packet.temp.toFixed(1)}°C >= ${state.thresholds.tempLimit.toFixed(1)}°C)`);
    if (isSoundBreached) breaches.push(`Sound (${packet.sound.toFixed(1)}dB >= ${state.thresholds.soundLimit.toFixed(1)}dB)`);
    if (isCurrentBreached) breaches.push(`Current (${packet.current.toFixed(2)}A >= ${state.thresholds.currentLimit.toFixed(2)}A)`);

    const hasBreach = breaches.length > 0;

    // Visual card highlighting on threshold breach
    if (el.cardVib) el.cardVib.classList.toggle('breached', isVibBreached);
    if (el.cardTemp) el.cardTemp.classList.toggle('breached', isTempBreached);
    if (el.cardSound) el.cardSound.classList.toggle('breached', isSoundBreached);
    if (el.cardCurrent) el.cardCurrent.classList.toggle('breached', isCurrentBreached);

    // 2. Update KPI UI Cards (Driven strictly by user threshold breach status)
    updateKPIs(packet, hasBreach, breaches, { isVibBreached, isTempBreached, isSoundBreached, isCurrentBreached, currentVib });

    // 3. Update Charts
    updateCharts(packet, hasBreach);

    // 4. Add to Records Log
    addRecord(packet, hasBreach);

    // 5. Alarm Triggering Logic - Driven STRICTLY by User Thresholds
    if (!hasBreach) {
      // ALL sensor readings are within user limits -> SILENCE ALL ALARMS IMMEDIATELY
      stopAlarmSiren();
      el.emergencyBanner.classList.add('hidden');
      state.wasBreached = false;
    } else {
      // SENSOR HAS REACHED OR EXCEEDED MAXIMUM LIMIT -> TRIGGER ALARM
      el.emergencyBanner.classList.remove('hidden');
      el.bannerTitle.textContent = 'SAFETY LIMIT EXCEEDED: ' + breaches.join(' | ');
      el.bannerMessage.textContent = 'Live sensor reading reached maximum safety threshold! Immediate attention required.';

      if (state.thresholds.alarmMode === 'single') {
        // Trigger a single beep only once upon exceeding the limit
        if (!state.wasBreached) {
          playAlertSound('warning');
          showToast('LIMIT EXCEEDED', `Alarm triggered: ${breaches[0]}`, 'danger');
          state.wasBreached = true;
        }
        stopAlarmSiren();
      } else if (state.thresholds.alarmMode === 'continuous') {
        if (!isSirenActive && state.audioEnabled) {
          startAlarmSiren();
        }
        state.wasBreached = true;
      } else {
        // Mute
        stopAlarmSiren();
      }
    }
  }

  function updateKPIs(packet, hasBreach, breaches, details) {
    // Vibration KPI
    el.vibValue.textContent = `${details.currentVib.toFixed(2)} g`;
    el.vibXVal.textContent = `${packet.vibX > 0 ? '+' : ''}${packet.vibX} g`;
    el.vibYVal.textContent = `${packet.vibY > 0 ? '+' : ''}${packet.vibY} g`;

    // Temperature KPI
    el.tempValue.textContent = `${packet.temp.toFixed(1)} °C`;
    const tempPercent = Math.min(100, Math.max(0, (packet.temp / 100) * 100));
    el.tempProgressBar.style.width = `${tempPercent}%`;
    if (el.tempSubtext) {
      el.tempSubtext.textContent = details.isTempBreached
        ? `⚠️ EXCEEDS MAX LIMIT (${state.thresholds.tempLimit.toFixed(1)}°C)`
        : `Thermal baseline optimal (<${state.thresholds.tempLimit.toFixed(1)}°C)`;
    }

    // Motor Current KPI (ACS712)
    if (el.currentValue) {
      el.currentValue.textContent = `${packet.current.toFixed(2)} A`;
      const currentPercent = Math.min(100, Math.max(0, (packet.current / 10.0) * 100));
      el.currentProgressBar.style.width = `${currentPercent}%`;
      if (el.currentSubtext) {
        el.currentSubtext.textContent = details.isCurrentBreached
          ? `⚠️ EXCEEDS MAX LIMIT (${state.thresholds.currentLimit.toFixed(2)}A)`
          : `ACS712: Baseline normal load (<${state.thresholds.currentLimit.toFixed(2)}A)`;
      }
    }

    // Acoustic Sound KPI (INMP441)
    if (el.soundValue) {
      el.soundValue.textContent = `${packet.sound.toFixed(1)} dB`;
      const soundPercent = Math.min(100, Math.max(0, (packet.sound / 100.0) * 100));
      if (el.soundProgressBar) el.soundProgressBar.style.width = `${soundPercent}%`;
      if (el.soundSubtext) {
        el.soundSubtext.textContent = details.isSoundBreached
          ? `⚠️ EXCEEDS MAX LIMIT (${state.thresholds.soundLimit.toFixed(1)}dB)`
          : `INMP441: Acoustic noise nominal (<${state.thresholds.soundLimit.toFixed(1)}dB)`;
      }
    }

    el.confidenceVal.textContent = `${packet.confidence}%`;

    // Overall Health Index & Status Chip (STRICTLY determined by threshold breaches)
    if (!hasBreach) {
      el.healthScore.textContent = '99.4%';
      el.healthProgressBar.style.width = '99.4%';
      el.healthProgressBar.className = 'progress-bar-fill healthy';
      el.conditionChip.className = 'status-chip healthy';
      el.conditionChip.textContent = 'HEALTHY (NORMAL)';
      el.healthSubtext.textContent = 'All sensor readings within user-configured safety limits.';
      el.rulValue.textContent = '420 hrs';
      if (el.cardHealth) el.cardHealth.classList.remove('breached');
    } else {
      el.healthScore.textContent = '24.5%';
      el.healthProgressBar.style.width = '24.5%';
      el.healthProgressBar.className = 'progress-bar-fill danger';
      el.conditionChip.className = 'status-chip danger';
      el.conditionChip.textContent = 'CRITICAL LIMIT EXCEEDED';
      el.healthSubtext.textContent = `CRITICAL: Exceeded ${breaches.join(' | ')}`;
      el.rulValue.textContent = '12 hrs';
      if (el.cardHealth) el.cardHealth.classList.add('breached');
    }
  }

  function updateCharts(packet, hasBreach) {
    const labels = state.chartData.labels;
    labels.push(packet.timestamp);
    state.chartData.vibX.push(packet.vibX);
    state.chartData.vibY.push(packet.vibY);
    state.chartData.temp.push(packet.temp);
    state.chartData.sound.push(packet.sound);

    if (labels.length > state.maxChartPoints) {
      labels.shift();
      state.chartData.vibX.shift();
      state.chartData.vibY.shift();
      state.chartData.temp.shift();
      state.chartData.sound.shift();
    }

    // Update Vibration chart
    vibChart.data.labels = labels;
    vibChart.data.datasets[0].data = state.chartData.vibX;
    vibChart.data.datasets[1].data = state.chartData.vibY;
    vibChart.update('none');

    // Update Temperature chart
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = state.chartData.temp;
    tempChart.data.datasets[1].data = Array(labels.length).fill(state.thresholds.tempLimit);
    tempChart.update('none');

    // Update Acoustic Sound chart
    soundChart.data.labels = labels;
    soundChart.data.datasets[0].data = state.chartData.sound;
    soundChart.data.datasets[1].data = Array(labels.length).fill(state.thresholds.soundLimit);
    soundChart.update('none');

    // Update dynamic legend threshold numbers
    const tempLegendVal = document.getElementById('tempLegendVal');
    const soundLegendVal = document.getElementById('soundLegendVal');
    if (tempLegendVal) tempLegendVal.textContent = `${state.thresholds.tempLimit.toFixed(0)}°C`;
    if (soundLegendVal) soundLegendVal.textContent = `${state.thresholds.soundLimit.toFixed(0)}dB`;

    // Update Probability Bar chart
    if (!hasBreach && state.activeFaultState === 'healthy') {
      probChart.data.datasets[0].data = [99.4, 0.2, 0.2, 0.2];
    } else {
      probChart.data.datasets[0].data = packet.probs;
    }
    probChart.update();
  }

  // --- RECORDS TABLE MANAGEMENT ---
  function addRecord(packet, hasBreach) {
    const record = { ...packet };
    // If not in breach and active fault is healthy, ensure log displays healthy status
    if (!hasBreach && state.activeFaultState === 'healthy') {
      record.predictedClass = 'healthy';
      record.confidence = 99.4;
    } else if (hasBreach && record.predictedClass === 'healthy') {
      record.predictedClass = 'bearing_wear';
    }

    state.records.unshift(record);
    if (state.records.length > 200) state.records.pop();

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
          <td colspan="10">No telemetry records match current filter.</td>
        </tr>
      `;
      return;
    }

    el.logTableBody.innerHTML = filtered.map(r => {
      let badgeClass = 'healthy';
      let label = 'Healthy';
      if (r.predictedClass === 'bearing_wear') { badgeClass = 'warning'; label = 'Limit Exceeded / Fault'; }
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
          <td>${r.sound !== undefined ? r.sound.toFixed(1) : '48.0'} dB</td>
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

  // --- IMMEDIATE THRESHOLD RE-EVALUATION FUNCTION ---
  function evaluateThresholdsNow() {
    if (state.lastPacket) {
      processTelemetry(state.lastPacket);
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
    }
    showToast('Audio Notification', state.audioEnabled ? 'Alarm audio enabled' : 'Alarm audio muted', 'healthy');
  });

  el.btnDismissBanner.addEventListener('click', () => {
    el.emergencyBanner.classList.add('hidden');
    stopAlarmSiren();
  });

  // Populate Initial Threshold Inputs from state
  if (el.threshVib) el.threshVib.value = state.thresholds.vibLimit;
  if (el.threshTemp) el.threshTemp.value = state.thresholds.tempLimit;
  if (el.threshSound) el.threshSound.value = state.thresholds.soundLimit;
  if (el.threshCurrent) el.threshCurrent.value = state.thresholds.currentLimit;
  if (el.alarmModeSelect) el.alarmModeSelect.value = state.thresholds.alarmMode;

  // Real-Time Threshold Input Handlers (Instant Re-evaluation & LocalStorage sync)
  if (el.threshVib) {
    el.threshVib.addEventListener('input', (e) => {
      state.thresholds.vibLimit = parseFloat(e.target.value) || 2.50;
      localStorage.setItem('pm_vibLimit', state.thresholds.vibLimit);
      evaluateThresholdsNow();
    });
  }

  if (el.threshTemp) {
    el.threshTemp.addEventListener('input', (e) => {
      state.thresholds.tempLimit = parseFloat(e.target.value) || 65.0;
      localStorage.setItem('pm_tempLimit', state.thresholds.tempLimit);
      evaluateThresholdsNow();
    });
  }

  if (el.threshSound) {
    el.threshSound.addEventListener('input', (e) => {
      state.thresholds.soundLimit = parseFloat(e.target.value) || 80.0;
      localStorage.setItem('pm_soundLimit', state.thresholds.soundLimit);
      evaluateThresholdsNow();
    });
  }

  if (el.threshCurrent) {
    el.threshCurrent.addEventListener('input', (e) => {
      state.thresholds.currentLimit = parseFloat(e.target.value) || 8.00;
      localStorage.setItem('pm_currentLimit', state.thresholds.currentLimit);
      evaluateThresholdsNow();
    });
  }

  if (el.alarmModeSelect) {
    el.alarmModeSelect.addEventListener('change', (e) => {
      state.thresholds.alarmMode = e.target.value;
      localStorage.setItem('pm_alarmMode', state.thresholds.alarmMode);
      if (state.thresholds.alarmMode !== 'continuous') {
        stopAlarmSiren();
      }
      evaluateThresholdsNow();
      showToast('Beep Mode Updated', `Alarm set to: ${e.target.options[e.target.selectedIndex].text}`, 'healthy');
    });
  }

  if (el.btnSilenceAlarm) {
    el.btnSilenceAlarm.addEventListener('click', () => {
      stopAlarmSiren();
      state.thresholds.alarmMode = 'single';
      if (el.alarmModeSelect) el.alarmModeSelect.value = 'single';
      localStorage.setItem('pm_alarmMode', 'single');
      evaluateThresholdsNow();
      showToast('Alarm Silenced', 'Active siren stopped.', 'healthy');
    });
  }

  if (el.btnResetLimits) {
    el.btnResetLimits.addEventListener('click', () => {
      state.thresholds.vibLimit = 2.50;
      state.thresholds.tempLimit = 65.0;
      state.thresholds.soundLimit = 80.0;
      state.thresholds.currentLimit = 8.00;
      state.thresholds.alarmMode = 'single';

      localStorage.setItem('pm_vibLimit', 2.50);
      localStorage.setItem('pm_tempLimit', 65.0);
      localStorage.setItem('pm_soundLimit', 80.0);
      localStorage.setItem('pm_currentLimit', 8.00);
      localStorage.setItem('pm_alarmMode', 'single');

      if (el.threshVib) el.threshVib.value = 2.50;
      if (el.threshTemp) el.threshTemp.value = 65.0;
      if (el.threshSound) el.threshSound.value = 80.0;
      if (el.threshCurrent) el.threshCurrent.value = 8.00;
      if (el.alarmModeSelect) el.alarmModeSelect.value = 'single';

      stopAlarmSiren();
      evaluateThresholdsNow();
      showToast('Limits Reset', 'All thresholds reset to industrial defaults (Vib 2.5g, Temp 65°C, Sound 80dB, Current 8A).', 'healthy');
    });
  }

  // Click Mode Pill to toggle Hardware vs Simulation mode on ESP32
  const modePill = document.getElementById('sensorModePill');
  if (modePill) {
    modePill.style.cursor = 'pointer';
    modePill.title = 'Click to toggle Hardware / Simulation mode on ESP32';
    modePill.addEventListener('click', async () => {
      if (state.isSerialConnected && state.serialPort && state.serialPort.writable) {
        try {
          const writer = state.serialPort.writable.getWriter();
          await writer.write(new TextEncoder().encode("h\n"));
          writer.releaseLock();
          showToast('Mode Switch', 'Sent command to activate LIVE HARDWARE SENSORS.', 'healthy');
        } catch (e) {
          console.warn("Error sending mode switch:", e);
        }
      }
    });
  }

  el.btnClearLogs.addEventListener('click', () => {
    state.records = [];
    updateFilterCounts();
    renderTable();
    showToast('Logs Cleared', 'Historical telemetry records cleared.', 'healthy');
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

    const headers = ['Timestamp', 'Window_ID', 'Vib_X_g', 'Vib_Y_g', 'Current_A', 'Temp_C', 'Sound_dB', 'Condition', 'Confidence_Pct'];
    const rows = state.records.map(r => [
      r.timestamp,
      r.windowId,
      r.vibX,
      r.vibY,
      r.current !== undefined ? r.current.toFixed(2) : '5.15',
      r.temp,
      r.sound !== undefined ? r.sound.toFixed(1) : '48.0',
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

    showToast('CSV Export', `Exported ${state.records.length} telemetry records to CSV.`, 'healthy');
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

      // Command ESP32 to switch to Hardware Sensor Mode
      try {
        if (state.serialPort.writable) {
          const writer = state.serialPort.writable.getWriter();
          await writer.write(new TextEncoder().encode("h\n"));
          writer.releaseLock();
        }
      } catch (we) {
        console.debug("Serial write error:", we);
      }

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
  // Runs every 1 second when physical serial is not streaming
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
