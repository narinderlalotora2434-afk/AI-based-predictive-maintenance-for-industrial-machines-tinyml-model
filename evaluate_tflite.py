import numpy as np
import tensorflow as tf
import os

def get_file_size_kb(filepath):
    if os.path.exists(filepath):
        return os.path.getsize(filepath) / 1024.0
    return 0.0

def evaluate_tflite_model(tflite_path, X_data, y_true):
    if not os.path.exists(tflite_path):
        return 0.0, 0.0

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    is_int8_input = (input_details[0]['dtype'] == np.int8)
    is_int8_output = (output_details[0]['dtype'] == np.int8)

    input_scale, input_zero_point = input_details[0]['quantization']
    output_scale, output_zero_point = output_details[0]['quantization']

    predictions = []
    for i in range(len(X_data)):
        sample = X_data[i]
        if is_int8_input:
            if input_scale != 0:
                sample_quant = np.round(sample / input_scale + input_zero_point).clip(-128, 127).astype(np.int8)
            else:
                sample_quant = sample.astype(np.int8)
            input_data = np.expand_dims(sample_quant, axis=0)
        else:
            input_data = np.expand_dims(sample, axis=0).astype(np.float32)

        interpreter.set_tensor(input_details[0]['index'], input_data)
        interpreter.invoke()
        output_data = interpreter.get_tensor(output_details[0]['index'])

        if is_int8_output:
            output_float = (output_data[0].astype(np.float32) - output_zero_point) * output_scale
            predictions.append(np.argmax(output_float))
        else:
            predictions.append(np.argmax(output_data[0]))
        
    accuracy = np.mean(np.array(predictions) == y_true)
    size_kb = get_file_size_kb(tflite_path)
    return accuracy, size_kb

def main():
    lstm_h5_path = "lstm_model.h5"
    tflite_lstm_float = "lstm_model.tflite"
    tflite_lstm_dyn = "lstm_model_dyn.tflite"
    tflite_lstm_int8 = "lstm_model_int8.tflite"

    scaler_path = "lstm_scaler.npz"
    x_path = "lstm_x.npy"
    y_path = "lstm_y.npy"
    
    # Load dataset and test sequence split
    print("\nLoading LSTM dataset and sequence split IDs...")
    try:
        scaler = np.load(scaler_path)
        mean, std = scaler['mean'], scaler['std']
        
        X_lstm = np.load(x_path)
        y_str = np.load(y_path)
        lstm_sample_ids = np.load("lstm_sample_ids.npy")
        test_ids = np.load("test_ids.npy")
    except FileNotFoundError as e:
        print(f"Error loading required files: {e}. Please run preprocess_data.py first.")
        return

    test_mask = np.isin(lstm_sample_ids, test_ids)
    X_lstm_test = (X_lstm[test_mask] - mean) / std
    
    classes = ['bearing_wear', 'healthy', 'misalignment', 'overheating']
    label_map = {cls: idx for idx, cls in enumerate(classes)}
    y_test = np.array([label_map[lbl] for lbl in y_str[test_mask]])
    
    print(f"Evaluated Test set shape: {X_lstm_test.shape}")

    # 1. Evaluate Original Keras LSTM Model (.h5)
    print("\nEvaluating Keras LSTM baseline (.h5)...")
    keras_lstm = tf.keras.models.load_model(lstm_h5_path)
    keras_preds = keras_lstm.predict(X_lstm_test, verbose=0)
    keras_lstm_acc = np.mean(np.argmax(keras_preds, axis=1) == y_test)

    # 2. Evaluate LSTM TFLite Models (Float32, Dynamic Range, Full INT8)
    lstm_float_acc, lstm_float_size = evaluate_tflite_model(tflite_lstm_float, X_lstm_test, y_test)
    lstm_dyn_acc, lstm_dyn_size     = evaluate_tflite_model(tflite_lstm_dyn, X_lstm_test, y_test)
    if os.path.exists(tflite_lstm_int8) and os.path.getsize(tflite_lstm_int8) > 100:
        lstm_int8_acc, lstm_int8_size   = evaluate_tflite_model(tflite_lstm_int8, X_lstm_test, y_test)
    else:
        lstm_int8_acc, lstm_int8_size = 0.0, 0.0

    # PRINT EVALUATION REPORT
    print("\n" + "="*80)
    print("      LSTM TFLITE QUANTIZATION & ACCURACY EVALUATION REPORT")
    print("="*80)
    print(f"{'Model Variant':<30} | {'Quantization Type':<20} | {'Size (KB)':<10} | {'Test Accuracy':<12}")
    print("-"*80)
    print(f"{'Keras LSTM Baseline (.h5)':<30} | {'None (Float32)':<20} | {get_file_size_kb(lstm_h5_path):8.2f} KB | {keras_lstm_acc*100:11.2f}%")
    print(f"{'TFLite LSTM (Standard)':<30} | {'Float32':<20} | {lstm_float_size:8.2f} KB | {lstm_float_acc*100:11.2f}%")
    print(f"{'TFLite LSTM (Dynamic Range)':<30} | {'8-bit Dynamic':<20} | {lstm_dyn_size:8.2f} KB | {lstm_dyn_acc*100:11.2f}%")
    if os.path.exists(tflite_lstm_int8) and os.path.getsize(tflite_lstm_int8) > 100:
        print(f"{'TFLite LSTM (Full INT8)':<30} | {'Full INT8 Post-Quant':<20} | {lstm_int8_size:8.2f} KB | {lstm_int8_acc*100:11.2f}%")
    print("="*80)

if __name__ == "__main__":
    main()
