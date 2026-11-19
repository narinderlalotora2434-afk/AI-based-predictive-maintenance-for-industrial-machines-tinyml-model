import os
os.environ['KERAS_HOME'] = os.path.abspath('.keras')
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
import tensorflow as tf
import numpy as np

def export_native_cpp():
    h5_path = "lstm_model.h5"
    scaler_path = "lstm_scaler.npz"
    header_path = "model_data.h"

    if not os.path.exists(h5_path):
        print(f"Error: {h5_path} not found.")
        return

    model = tf.keras.models.load_model(h5_path)
    scaler = np.load(scaler_path)
    mean = scaler['mean'].flatten()
    std = scaler['std'].flatten()

    w1, u1, b1 = model.layers[0].get_weights()
    w2, u2, b2 = model.layers[1].get_weights()
    wd, bd = model.layers[3].get_weights()

    def format_array_float(arr, name):
        flat = arr.flatten()
        lines = [f"// Shape: {arr.shape}, total: {len(flat)}"]
        lines.append(f"const float {name}[{len(flat)}] PROGMEM = {{")
        for i in range(0, len(flat), 8):
            chunk = flat[i:i+8]
            chunk_str = ", ".join(f"{v:.7f}f" for v in chunk)
            if i + 8 < len(flat):
                chunk_str += ","
            lines.append(f"  {chunk_str}")
        lines.append("};\n")
        return "\n".join(lines)

    with open(header_path, "w") as f:
        f.write("// Auto-generated Native C++ Neural Network for ESP32 TinyML\n")
        f.write("// Self-contained forward pass: ZERO external TensorFlow libraries required!\n")
        f.write("// Fully compatible with ESP32 Arduino Core 2.x and 3.x (GCC 12/13 / C++17)\n")
        f.write("#ifndef MODEL_DATA_H\n")
        f.write("#define MODEL_DATA_H\n\n")
        f.write("#include <Arduino.h>\n")
        f.write("#include <math.h>\n\n")

        # Scaler
        f.write("// Feature Normalization Parameters\n")
        f.write(f"const int NUM_CHANNELS_MODEL = {len(mean)};\n")
        means_str = ", ".join(f"{m:.6f}f" for m in mean)
        stds_str = ", ".join(f"{s:.6f}f" for s in std)
        f.write(f"const float SCALER_MEAN[{len(mean)}] = {{{means_str}}};\n")
        f.write(f"const float SCALER_STD[{len(mean)}] = {{{stds_str}}};\n\n")

        # Labels
        f.write("// Target Class Labels\n")
        f.write("const char* CLASS_LABELS[4] = {\"bearing_wear\", \"healthy\", \"misalignment\", \"overheating\"};\n\n")

        # Layer 1 Weights
        f.write("// === LSTM LAYER 1 (32 units, 4 inputs) ===\n")
        f.write(format_array_float(w1, "W1_KERNEL"))
        f.write(format_array_float(u1, "U1_RECURRENT"))
        f.write(format_array_float(b1, "B1_BIAS"))

        # Layer 2 Weights
        f.write("// === LSTM LAYER 2 (32 units, 32 inputs) ===\n")
        f.write(format_array_float(w2, "W2_KERNEL"))
        f.write(format_array_float(u2, "U2_RECURRENT"))
        f.write(format_array_float(b2, "B2_BIAS"))

        # Dense Weights
        f.write("// === DENSE LAYER (4 classes, 32 inputs) ===\n")
        f.write(format_array_float(wd, "WD_DENSE"))
        f.write(format_array_float(bd, "BD_DENSE"))

        # Activation functions and forward pass implementation
        f.write(r"""
// Fast inlined sigmoid activation
inline float fast_sigmoid(float x) {
  return 1.0f / (1.0f + expf(-x));
}

// Native LSTM Forward Inference Engine
// Inputs: raw_sensor_window[200][4] (Vibration, Current, Temp, Sound)
// Outputs: out_probs[4], predicted_class, confidence_pct
inline void predict_machine_health(const float window[200][4], float out_probs[4], int& predicted_class, float& confidence_pct) {
  // Layer 1 memory states
  float h1[32] = {0.0f};
  float c1[32] = {0.0f};
  
  // Layer 2 memory states
  float h2[32] = {0.0f};
  float c2[32] = {0.0f};

  // Temp vectors for gates
  float z1[128];
  float z2[128];

  // Process 200 time-steps sequentially through LSTM Layer 1 and Layer 2
  for (int t = 0; t < 200; t++) {
    // 1. Normalize input features for step t
    float x_norm[4];
    for (int c = 0; c < 4; c++) {
      x_norm[c] = (window[t][c] - SCALER_MEAN[c]) / SCALER_STD[c];
    }

    // --- LSTM LAYER 1 FORWARD PASS ---
    // z1 = x_norm * W1 + h1_prev * U1 + B1
    for (int g = 0; g < 128; g++) {
      float sum = B1_BIAS[g];
      for (int c = 0; c < 4; c++) {
        sum += x_norm[c] * W1_KERNEL[c * 128 + g];
      }
      for (int u = 0; u < 32; u++) {
        sum += h1[u] * U1_RECURRENT[u * 128 + g];
      }
      z1[g] = sum;
    }

    // Gate activations (i, f, c_tilde, o)
    for (int u = 0; u < 32; u++) {
      float in_gate  = fast_sigmoid(z1[u]);
      float forget   = fast_sigmoid(z1[32 + u]);
      float c_tilde  = tanhf(z1[64 + u]);
      float out_gate = fast_sigmoid(z1[96 + u]);

      c1[u] = forget * c1[u] + in_gate * c_tilde;
      h1[u] = out_gate * tanhf(c1[u]);
    }

    // --- LSTM LAYER 2 FORWARD PASS ---
    // Input to Layer 2 is h1 from Layer 1
    for (int g = 0; g < 128; g++) {
      float sum = B2_BIAS[g];
      for (int u = 0; u < 32; u++) {
        sum += h1[u] * W2_KERNEL[u * 128 + g];
      }
      for (int u = 0; u < 32; u++) {
        sum += h2[u] * U2_RECURRENT[u * 128 + g];
      }
      z2[g] = sum;
    }

    // Gate activations for Layer 2
    for (int u = 0; u < 32; u++) {
      float in_gate  = fast_sigmoid(z2[u]);
      float forget   = fast_sigmoid(z2[32 + u]);
      float c_tilde  = tanhf(z2[64 + u]);
      float out_gate = fast_sigmoid(z2[96 + u]);

      c2[u] = forget * c2[u] + in_gate * c_tilde;
      h2[u] = out_gate * tanhf(c2[u]);
    }
  }

  // --- DENSE OUTPUT LAYER ---
  float logits[4];
  float max_logit = -1e9f;
  for (int k = 0; k < 4; k++) {
    float sum = BD_DENSE[k];
    for (int u = 0; u < 32; u++) {
      sum += h2[u] * WD_DENSE[u * 4 + k];
    }
    logits[k] = sum;
    if (sum > max_logit) max_logit = sum;
  }

  // Softmax
  float sum_exp = 0.0f;
  for (int k = 0; k < 4; k++) {
    out_probs[k] = expf(logits[k] - max_logit);
    sum_exp += out_probs[k];
  }

  predicted_class = 0;
  float max_prob = -1.0f;
  for (int k = 0; k < 4; k++) {
    out_probs[k] /= sum_exp;
    if (out_probs[k] > max_prob) {
      max_prob = out_probs[k];
      predicted_class = k;
    }
  }

  confidence_pct = max_prob * 100.0f;
}

#endif // MODEL_DATA_H
""")

    print(f"Successfully generated native C++ TinyML header: {header_path}")

if __name__ == "__main__":
    export_native_cpp()
