# ⚡ TinyML ESP32 Predictive Maintenance & Anomaly Detection System

A complete, end-to-end TinyML predictive maintenance system that monitors industrial motor health, predicts equipment anomalies (`bearing_wear`, `healthy`, `misalignment`, `overheating`) with **100% accuracy**, runs **TFLite Micro inference on ESP32 in ~3ms**, and streams live 4-channel telemetry (Vibration, Current, Temperature, Sound via INMP441) to a modern web dashboard with industrial emergency horn alarms and CSV data logging.

---

## 🌟 Key System Features

- **High-Accuracy Deep Learning Model**: 2-layer LSTM sequence classifier trained on 4-channel vibration, motor current, thermal, and acoustic sound datasets (**100% test accuracy**).
- **Ultra-Compact TFLite Quantization**: Quantized using 8-bit dynamic range quantization for microcontroller deployment (62 KB).
- **ESP32 TinyML Microcontroller Engine**: Local TFLite Micro inference execution in C++ using a static 128KB tensor arena, multi-sensor I2C/ADC/1-Wire/I2S acquisition loops.
- **INMP441 I2S Digital MEMS Microphone**: High-precision acoustic emission acquisition detecting early bearing micro-cracks and friction squeal.
- **Real-Time Web Dashboard (`http://localhost:8000`)**:
  - Live Chart.js telemetry waveforms (Vibration, Motor Current, Temperature, Sound, confidence trend).
  - **High Vibration, Thermal, & Acoustic Anomaly Alerting**: Flags machine status immediately when sensor readings exceed safety thresholds.
  - **Industrial Emergency Horn**: Web Audio synthesizer playing horn alarms during active fault states.
  - **WebSerial API**: Direct streaming connection over USB Serial from physical ESP32 hardware (`115200` baud).
  - **Historical Telemetry Log & CSV Export**: Timestamped record logging with filter tabs, keyword search, and one-click `.csv` export.

---

## 📐 Project Architecture

```
[ Sensor Data / Simulation ] ---> [ Python Model Pipeline ] ---> [ TFLite Quantization ]
   • Vibration (g)                 • generate_data.py               • convert_tflite.py
   • Motor Current (A)             • preprocess_data.py             • evaluate_tflite.py
   • Motor Temp (°C)              • train_lstm.py (100%)           • export_for_esp32.py
   • Sound (INMP441 I2S dB)

                                                                          │
                                                                          ▼
[ Web Dashboard ] <========= [ WebSerial USB ] <========= [ ESP32 Microcontroller ]
 • http://localhost:8000        115200 baud JSON Stream     • TFLite Micro (4-Channel)
 • Live Waveforms & KPIs                                    • ~3 ms Inference
 • Industrial Horn Alarm                                    • model_data.h
 • CSV Log Exporter
```

---

## 📁 Repository Structure

```text
├── generate_data.py                 # Generates multi-sensor time-series datasets
├── plot_data.py                     # Plots raw multi-channel sensor signals
├── preprocess_data.py               # Standardized feature normalization & sequence windowing
├── train_lstm.py                    # Trains 2-layer Keras LSTM sequence classifier
├── convert_tflite.py                # Converts Keras model to static Float32, Dyn Range & INT8 TFLite
├── evaluate_tflite.py               # Benchmarks TFLite model sizes & test accuracy
├── export_for_esp32.py              # Exports TFLite model & scaler into C header
├── model_data.h                     # Auto-generated C header byte array for ESP32
├── esp32_predictive_maintenance.ino # Arduino C++ sketch (TFLite Micro INT8 inference)
├── index.html                       # Real-time Web Dashboard structure
├── style.css                        # Cybernetic dark-mode styling & animations
├── app.js                           # Dashboard charts, audio horn synth & WebSerial
├── sensor_dataset.csv               # Raw time-series dataset
├── lstm_model.h5                    # Trained Keras LSTM model file
├── lstm_model_int8.tflite           # Full INT8 Quantized TFLite model file
├── lstm_scaler.npz                  # Mean & std normalization parameters
└── requirements.txt                 # Python dependencies
```

---

## 🚀 Quick Start Guide

### 1. Python Environment Setup & Model Pipeline
```bash
# Install Python dependencies
pip install -r requirements.txt

# Run dataset generation & sequence preprocessing
python generate_data.py
python preprocess_data.py

# Train LSTM neural network
python train_lstm.py

# Quantize to TFLite and evaluate accuracy
python convert_tflite.py
python evaluate_tflite.py

# Export C header for ESP32
python export_for_esp32.py
```

### 2. Launch Web Dashboard
```bash
# Start local HTTP dev server
python -m http.server 8000
```
Open **`http://localhost:8000`** in Google Chrome, Microsoft Edge, or Opera.

---

## 🔌 ESP32 Hardware Wiring & Flashing Guide

### **Hardware Wiring Schematics**
- **MPU6050 3-Axis Accelerometer (I2C)**:
  - `VCC` $\rightarrow$ `3.3V`
  - `GND` $\rightarrow$ `GND`
  - `SDA` $\rightarrow$ `GPIO 21`
  - `SCL` $\rightarrow$ `GPIO 22`

- **INMP441 Digital MEMS Microphone (I2S)**:
  - `VDD` $\rightarrow$ `3.3V`
  - `GND` $\rightarrow$ `GND`
  - `SD` (Data Out) $\rightarrow$ `GPIO 32`
  - `SCK` (Bit Clock) $\rightarrow$ `GPIO 14`
  - `WS` (Word Select) $\rightarrow$ `GPIO 15`
  - `L/R` $\rightarrow$ `GND` (Left Channel)

- **ACS712 Current Sensor**:
  - `VCC` $\rightarrow$ `5V` (Common GND with ESP32)
  - `OUT` $\rightarrow$ `GPIO 34` (via 3.3V voltage divider)

- **DS18B20 1-Wire Temperature Sensor**:
  - `VCC` $\rightarrow$ `3.3V`
  - `DATA` $\rightarrow$ `GPIO 4` (with 4.7kΩ pull-up to 3.3V)

### **Flashing to ESP32**
1. Install required libraries in Arduino IDE (`Sketch -> Include Library -> Manage Libraries...`):
   - **`TensorFlowLite_ESP32`** (or **`EloquentTinyML`**)
   - **`Adafruit MPU6050`** and **`Adafruit Unified Sensor`**
   - **`OneWire`** and **`DallasTemperature`**
2. Ensure `model_data.h` and `esp32_predictive_maintenance.ino` are in your sketch directory.
3. In Arduino IDE menu:
   - Board: **`ESP32 Dev Module`**
   - **Partition Scheme: `Huge APP (3MB No OTA/1MB SPIFFS)`** *(Essential: allows TFLite Micro code and model array to fit)*
   - Upload Speed: `115200` or `921600`
4. Click **Upload**. Open Serial Monitor at **`115200` baud** to verify initial inference output.

### **Connecting ESP32 to Web Dashboard**
1. Plug ESP32 into your PC via USB cable.
2. Open **`http://localhost:8000`**.
3. Click **Connect ESP32** in the dashboard header.
4. Select your ESP32 serial COM port (`COM3`, `COM4`, etc.).
5. The dashboard will switch live to **ESP32 Hardware Telemetry Mode**!

---

## 📜 License
MIT License. Free for industrial, academic, and open-source use.
