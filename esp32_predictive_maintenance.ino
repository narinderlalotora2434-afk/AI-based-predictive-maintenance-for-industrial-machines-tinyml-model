/*
 * ESP32 Predictive Maintenance TinyML Inference Sketch
 * 
 * Uses TensorFlow Lite for Microcontrollers (TFLite Micro)
 * to classify machine health based on 3-channel sensor input sequences 
 * (200 timesteps x 3 features: Vibration, Motor Current, Temperature).
 * 
 * Classes:
 *   0: bearing_wear
 *   1: healthy
 *   2: misalignment
 *   3: overheating
 * 
 * Required Arduino Libraries (Install via Arduino Library Manager):
 *   1. TensorFlowLite_ESP32 (or EloquentTinyML)
 *   2. Adafruit MPU6050 (by Adafruit)
 *   3. Adafruit Unified Sensor (by Adafruit)
 *   4. OneWire (by Paul Stoffregen)
 *   5. DallasTemperature (by Miles Burton)
 * 
 * Arduino IDE Settings:
 *   - Board: "ESP32 Dev Module" (or your specific ESP32 board)
 *   - Partition Scheme: "Huge APP (3MB No OTA/1MB SPIFFS)" -> REQUIRED for TFLite Micro!
 *   - Upload Speed: 115200 or 921600
 */

#include <Arduino.h>
#include <Wire.h>
#include "model_data.h"

// TensorFlow Lite Micro headers
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"

// Set to 1 to compile with physical sensor library support (MPU6050, DS18B20, ACS712)
// If set to 1, the sketch automatically detects if sensors are wired; if not found, it falls back to simulation!
#define ENABLE_PHYSICAL_SENSORS 1

#if ENABLE_PHYSICAL_SENSORS
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#endif

// Hardware Pin Configurations (ESP32 Standard)
#define PIN_I2C_SDA     21  // MPU6050 I2C SDA
#define PIN_I2C_SCL     22  // MPU6050 I2C SCL
#define PIN_ONEWIRE     4   // DS18B20 1-Wire Data
#define PIN_CURRENT_ADC 34  // ACS712 Current Sensor ADC (ADC1_CH6 - Input only)

#if ENABLE_PHYSICAL_SENSORS
Adafruit_MPU6050 mpu;
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature tempSensor(&oneWire);
#endif

// Runtime Sensor Mode Flag (Auto-detected in setup, or toggled via Serial 'h'/'s')
bool g_hardware_sensors_active = false;

// Tensor arena memory allocation for ESP32 (128KB arena accommodates 2-layer sequence LSTM)
constexpr int kTensorArenaSize = 128 * 1024;
alignas(16) uint8_t tensor_arena[kTensorArenaSize];

// TFLite global pointers
const tflite::Model* model = nullptr;
tflite::MicroInterpreter* interpreter = nullptr;
TfLiteTensor* input = nullptr;
TfLiteTensor* output = nullptr;

// Time-series window buffer (200 timesteps, 3 sensor channels: Vibration, Motor Current, Temperature)
constexpr int TIME_STEPS = 200;
constexpr int NUM_CHANNELS = 3;
float raw_sensor_window[TIME_STEPS][NUM_CHANNELS];

// Sample packet counter for WebSerial stream
unsigned long g_window_id = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 2000);
  Serial.println("\n=======================================================");
  Serial.println("  ESP32 Predictive Maintenance TinyML Edge System");
  Serial.println("=======================================================");

#if ENABLE_PHYSICAL_SENSORS
  // 1. Initialize I2C and probe MPU6050
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(400000); // 400kHz fast I2C
  
  if (mpu.begin()) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    g_hardware_sensors_active = true;
    Serial.println("[Sensors] MPU6050 Accelerometer detected! ACTIVE: Hardware Sensors.");
    
    // Initialize DS18B20 temperature sensor
    tempSensor.begin();
    Serial.println("[Sensors] DS18B20 1-Wire temperature sensor initialized.");

    // Configure ADC for current sensor
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
  } else {
    g_hardware_sensors_active = false;
    Serial.println("[Sensors] MPU6050 not detected on I2C pins 21/22.");
    Serial.println("[Sensors] Automatically falling back to Onboard Telemetry Simulation.");
  }
#else
  g_hardware_sensors_active = false;
  Serial.println("[Sensors] Compiled in pure simulation mode (ENABLE_PHYSICAL_SENSORS=0).");
#endif

  // 1. Load TFLite Model from byte array in model_data.h
  model = tflite::GetModel(g_model);
  if (model->version() != TFLITE_SCHEMA_VERSION) {
    Serial.printf("Model schema mismatch! Model version: %d, Supported version: %d\n",
                  model->version(), TFLITE_SCHEMA_VERSION);
    return;
  }

  // 2. Set up Operations Resolver (Loads all required TFLite operators)
  static tflite::AllOpsResolver resolver;

  // 3. Build Micro Interpreter
  static tflite::MicroInterpreter static_interpreter(
      model, resolver, tensor_arena, kTensorArenaSize);
  interpreter = &static_interpreter;

  // 4. Allocate Tensors
  TfLiteStatus allocate_status = interpreter->AllocateTensors();
  if (allocate_status != kTfLiteOk) {
    Serial.println("AllocateTensors() failed! Consider increasing kTensorArenaSize.");
    return;
  }

  // 5. Obtain Pointers to Input and Output Tensors
  input = interpreter->input(0);
  output = interpreter->output(0);

  Serial.println("TFLite Micro interpreter initialized successfully!");
  Serial.printf("Input tensor type: %d (1=Float32, 9=Int8)\n", input->type);
  Serial.printf("Input shape: [%d, %d, %d]\n", input->dims->data[0], input->dims->data[1], input->dims->data[2]);
  Serial.printf("Output tensor type: %d (1=Float32, 9=Int8)\n", output->type);
  Serial.printf("Output shape: [%d, %d]\n", output->dims->data[0], output->dims->data[1]);
}

void acquire_sensor_sample(int step) {
#if ENABLE_PHYSICAL_SENSORS
  if (g_hardware_sensors_active) {
    // 1. Real MPU6050 3-Axis Accelerometer Acquisition
    sensors_event_t a, g, temp_mpu;
    mpu.getEvent(&a, &g, &temp_mpu);
    
    // Total vibration magnitude in g (remove 1g gravity baseline)
    float vib_g = sqrt(a.acceleration.x * a.acceleration.x + 
                       a.acceleration.y * a.acceleration.y + 
                       a.acceleration.z * a.acceleration.z) / 9.80665f - 1.0f;

    // 2. Read ACS712 Current Sensor (8-sample oversampled average for clean ADC reading)
    int adc_sum = 0;
    for (int k = 0; k < 8; k++) {
      adc_sum += analogRead(PIN_CURRENT_ADC);
      delayMicroseconds(20);
    }
    float avg_adc = adc_sum / 8.0f;
    float voltage = (avg_adc / 4095.0f) * 3.3f;
    // ACS712 5A sensitivity: 185 mV/A, 1.65V mid-rail quiescent
    float current_amps = fabs((voltage - 1.65f) / 0.185f);
    if (current_amps < 0.05f) current_amps = 0.0f; // Zero-current deadband

    // 3. Read DS18B20 1-Wire Temperature Sensor
    tempSensor.requestTemperatures();
    float temp_c = tempSensor.getTempCByIndex(0);
    if (temp_c < -50.0f || temp_c > 150.0f) {
      temp_c = temp_mpu.temperature; // Fallback to MPU6050 internal thermometer
    }

    raw_sensor_window[step][0] = vib_g;
    raw_sensor_window[step][1] = current_amps;
    raw_sensor_window[step][2] = temp_c;
    return;
  }
#endif

  // Simulation: Healthy operating baseline
  // Channel 0: Vibration ~ 0.0 +/- 0.8g
  // Channel 1: Motor Current ~ 5.0 +/- 0.3A
  // Channel 2: Temperature ~ 42.0 +/- 1.5C
  raw_sensor_window[step][0] = 0.0f + (random(-80, 80) / 100.0f);
  raw_sensor_window[step][1] = 5.0f + (random(-30, 30) / 100.0f);
  raw_sensor_window[step][2] = 42.0f + (random(-15, 15) / 10.0f);
}

void run_inference() {
  g_window_id++;

  // 1. Normalize and load features into model input buffer
  // Automatically supports both Float32 and INT8 quantized input tensors
  int idx = 0;
  bool is_int8_in = (input->type == kTfLiteInt8);

  for (int t = 0; t < TIME_STEPS; t++) {
    for (int c = 0; c < NUM_CHANNELS; c++) {
      float normalized_val = (raw_sensor_window[t][c] - SCALER_MEAN[c]) / SCALER_STD[c];
      
      if (is_int8_in) {
        float scale = (input->params.scale > 0.0f) ? input->params.scale : 1.0f;
        int int8_val = static_cast<int>(round(normalized_val / scale) + input->params.zero_point);
        if (int8_val < -128) int8_val = -128;
        if (int8_val > 127) int8_val = 127;
        input->data.int8[idx++] = static_cast<int8_t>(int8_val);
      } else {
        input->data.f[idx++] = normalized_val;
      }
    }
  }

  // 2. Benchmark Inference Latency
  unsigned long start_time = micros();
  TfLiteStatus invoke_status = interpreter->Invoke();
  unsigned long duration = micros() - start_time;
  float latency_ms = duration / 1000.0f;

  if (invoke_status != kTfLiteOk) {
    Serial.println("{\"error\":\"Inference invoke failed!\"}");
    return;
  }

  // 3. Extract Output Probabilities (Supports both Float32 and INT8)
  bool is_int8_out = (output->type == kTfLiteInt8);
  float max_prob = -1.0f;
  int predicted_class = -1;
  float raw_probs[4];

  for (int i = 0; i < 4; i++) {
    float float_prob = 0.0f;
    if (is_int8_out) {
      float scale = (output->params.scale > 0.0f) ? output->params.scale : 1.0f;
      float_prob = (output->data.int8[i] - output->params.zero_point) * scale;
    } else {
      float_prob = output->data.f[i];
    }
    
    // Safety clamp
    if (float_prob < 0.0f) float_prob = 0.0f;
    if (float_prob > 1.0f) float_prob = 1.0f;
    
    raw_probs[i] = float_prob;

    if (float_prob > max_prob) {
      max_prob = float_prob;
      predicted_class = i;
    }
  }

  // Fallback if argmax fails
  if (predicted_class < 0) predicted_class = 1; // Default to healthy

  // 4. Map probabilities to Dashboard probChart display order:
  // Model CLASS_LABELS order: [0: bearing_wear, 1: healthy, 2: misalignment, 3: overheating]
  // Dashboard Bar Chart order: [Healthy, Bearing Wear, Misalignment, Overheating]
  float prob_healthy      = raw_probs[1] * 100.0f;
  float prob_bearing_wear = raw_probs[0] * 100.0f;
  float prob_misalignment = raw_probs[2] * 100.0f;
  float prob_overheating  = raw_probs[3] * 100.0f;

  // 5. Send JSON Telemetry Packet over Serial (115200 baud) for WebSerial Dashboard
  float last_vib_x   = raw_sensor_window[TIME_STEPS - 1][0];
  float last_vib_y   = raw_sensor_window[TIME_STEPS - 1][0] * 0.75f; // Estimated Y orthogonal vibration
  float last_current = raw_sensor_window[TIME_STEPS - 1][1];
  float last_temp    = raw_sensor_window[TIME_STEPS - 1][2];

  Serial.printf("{\"windowId\":%lu,\"vibX\":%.3f,\"vibY\":%.3f,\"current\":%.3f,\"temp\":%.1f,\"latencyMs\":%.2f,\"sensorMode\":\"%s\",\"predictedClass\":\"%s\",\"confidence\":%.1f,\"probs\":[%.2f,%.2f,%.2f,%.2f]}\n",
                g_window_id,
                last_vib_x, last_vib_y, last_current, last_temp,
                latency_ms,
                g_hardware_sensors_active ? "hardware" : "simulation",
                CLASS_LABELS[predicted_class],
                max_prob * 100.0f,
                prob_healthy, prob_bearing_wear, prob_misalignment, prob_overheating);
}

void loop() {
  // Check for incoming serial commands from WebSerial or terminal
  while (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd == 'h' || cmd == 'H') {
      g_hardware_sensors_active = true;
      Serial.println("{\"info\":\"Switched to HARDWARE SENSORS mode\"}");
    } else if (cmd == 's' || cmd == 'S') {
      g_hardware_sensors_active = false;
      Serial.println("{\"info\":\"Switched to SIMULATION mode\"}");
    } else if (cmd == '?') {
      Serial.printf("{\"info\":\"ESP32 TinyML Status: Mode=%s, FreeHeap=%u bytes, WindowsProcessed=%lu\"}\n",
                    g_hardware_sensors_active ? "hardware" : "simulation",
                    ESP.getFreeHeap(),
                    g_window_id);
    }
  }

  // Collect 200 time-step sensor window
  for (int t = 0; t < TIME_STEPS; t++) {
    acquire_sensor_sample(t);
  }

  // Execute inference on collected window
  run_inference();

  // Sampling rate delay between inference windows (1.5 seconds)
  delay(1500);
}
