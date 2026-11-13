import numpy as np
import os

def export_c_header():
    scaler_path = "lstm_scaler.npz"
    header_path = "model_data.h"

    tflite_path = "lstm_model_int8.tflite"
    if not os.path.exists(tflite_path) or os.path.getsize(tflite_path) == 0:
        tflite_path = "lstm_model_dyn.tflite"
    if not os.path.exists(tflite_path) or os.path.getsize(tflite_path) == 0:
        tflite_path = "lstm_model.tflite"
    if not os.path.exists(tflite_path) or os.path.getsize(tflite_path) == 0:
        print("Error: No valid TFLite model file found.")
        return

    if not os.path.exists(scaler_path):
        print(f"Error: {scaler_path} not found.")
        return

    # Read TFLite binary file
    with open(tflite_path, "rb") as f:
        model_bytes = f.read()

    # Read mean and std from scaler
    scaler = np.load(scaler_path)
    mean = scaler['mean'].flatten()
    std = scaler['std'].flatten()

    classes = ['bearing_wear', 'healthy', 'misalignment', 'overheating']

    # Generate C Header file
    with open(header_path, "w") as f:
        f.write("// Auto-generated header for ESP32 TinyML Predictive Maintenance\n")
        f.write("#ifndef MODEL_DATA_H\n")
        f.write("#define MODEL_DATA_H\n\n")
        
        f.write("#include <stdint.h>\n\n")
        
        # Model length and array
        f.write(f"const unsigned int g_model_len = {len(model_bytes)};\n")
        f.write("alignas(8) const unsigned char g_model[] = {\n  ")
        
        for i, b in enumerate(model_bytes):
            f.write(f"0x{b:02x}")
            if i < len(model_bytes) - 1:
                f.write(", ")
            if (i + 1) % 12 == 0:
                f.write("\n  ")
        f.write("\n};\n\n")

        # Scaler parameters
        f.write("// Feature Normalization Parameters\n")
        f.write(f"const float SCALER_MEAN[3] = {{{mean[0]:.6f}f, {mean[1]:.6f}f, {mean[2]:.6f}f}};\n")
        f.write(f"const float SCALER_STD[3] = {{{std[0]:.6f}f, {std[1]:.6f}f, {std[2]:.6f}f}};\n\n")

        # Label definitions
        f.write("// Target Class Labels\n")
        f.write("const char* CLASS_LABELS[4] = {\"bearing_wear\", \"healthy\", \"misalignment\", \"overheating\"};\n\n")

        f.write("#endif // MODEL_DATA_H\n")

    print(f"Successfully exported ESP32 C header: {header_path} from {tflite_path} ({len(model_bytes)} bytes model array)")

if __name__ == "__main__":
    export_c_header()
