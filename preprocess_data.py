import pandas as pd
import numpy as np
import os

def extract_features(signal, fs=100):
    """
    Computes RMS, kurtosis, skewness, and FFT peak frequency/magnitude for a signal.
    """
    mean_val = np.mean(signal)
    std_val = np.std(signal)
    
    # Root Mean Square (RMS)
    rms = np.sqrt(np.mean(signal ** 2))
    
    # Skewness
    if std_val == 0:
        skewness = 0.0
    else:
        skewness = np.mean(((signal - mean_val) / std_val) ** 3)
        
    # Kurtosis (excess kurtosis, normal distribution = 0)
    if std_val == 0:
        kurtosis = 0.0
    else:
        kurtosis = np.mean(((signal - mean_val) / std_val) ** 4) - 3.0
        
    # Spectral Features (FFT peak frequency and magnitude)
    # Subtracting the mean (DC component) is crucial for accurate sensor FFT peaks
    signal_detrended = signal - mean_val
    n_points = len(signal)
    fft_vals = np.fft.rfft(signal_detrended)
    freqs = np.fft.rfftfreq(n_points, d=1/fs)
    mags = np.abs(fft_vals)
    
    peak_idx = np.argmax(mags)
    fft_peak_freq = freqs[peak_idx]
    fft_peak_mag = mags[peak_idx]
    
    return {
        'rms': rms,
        'skewness': skewness,
        'kurtosis': kurtosis,
        'fft_peak_freq': fft_peak_freq,
        'fft_peak_mag': fft_peak_mag
    }

from sklearn.model_selection import train_test_split

def main():
    raw_csv = "sensor_dataset.csv"
    features_csv = "features_dataset.csv"
    lstm_x_file = "lstm_x.npy"
    lstm_y_file = "lstm_y.npy"
    lstm_sample_ids_file = "lstm_sample_ids.npy"
    train_ids_file = "train_ids.npy"
    test_ids_file = "test_ids.npy"
    
    print(f"Loading raw dataset from {raw_csv}...")
    try:
        df = pd.read_csv(raw_csv)
    except FileNotFoundError:
        print(f"Error: {raw_csv} not found. Please run generate_data.py first.")
        return

    # --- SEQUENCE-LEVEL STRATIFIED 80/20 SPLIT BEFORE WINDOWING ---
    # Extract unique sample_ids and their sequence labels
    sample_labels_df = df[['sample_id', 'label']].drop_duplicates().sort_values(by='sample_id')
    unique_sample_ids = sample_labels_df['sample_id'].values
    unique_labels = sample_labels_df['label'].values

    print(f"Splitting {len(unique_sample_ids)} unique sequences 80/20 stratified by label...")
    train_sample_ids, test_sample_ids = train_test_split(
        unique_sample_ids, test_size=0.20, random_state=42, stratify=unique_labels
    )

    print(f"Saving sequence splits: {len(train_sample_ids)} train sequences, {len(test_sample_ids)} test sequences...")
    np.save(train_ids_file, train_sample_ids)
    np.save(test_ids_file, test_sample_ids)

    window_size = 200  # 2 seconds at 100 Hz
    overlap = 100      # 50% overlap
    step = window_size - overlap
    fs = 100           # Hz
    
    features_rows = []
    lstm_x_list = []
    lstm_y_list = []
    lstm_sample_ids_list = []
    
    print("Preprocessing data into sliding windows...")
    grouped = df.groupby('sample_id')
    
    for sample_id, group in grouped:
        # Sort group by timestamp to maintain sequential order
        group = group.sort_values(by='timestamp')
        label = group['label'].iloc[0]
        
        vib_raw = group['vibration'].values
        cur_raw = group['motor_current'].values
        temp_raw = group['temperature'].values
        
        n_points = len(group)
        
        # Slicing sliding windows
        for start_idx in range(0, n_points - window_size + 1, step):
            end_idx = start_idx + window_size
            window_id = start_idx // step
            
            vib_w = vib_raw[start_idx:end_idx]
            cur_w = cur_raw[start_idx:end_idx]
            temp_w = temp_raw[start_idx:end_idx]
            
            # --- 1. FEATURE EXTRACTION FOR CLASSICAL ML (Random Forest/XGBoost) ---
            v_features = extract_features(vib_w, fs)
            c_features = extract_features(cur_w, fs)
            t_features = extract_features(temp_w, fs)
            
            row = {
                'sample_id': sample_id,
                'window_id': window_id,
                
                'vibration_rms': v_features['rms'],
                'vibration_kurtosis': v_features['kurtosis'],
                'vibration_skewness': v_features['skewness'],
                'vibration_fft_peak_freq': v_features['fft_peak_freq'],
                'vibration_fft_peak_mag': v_features['fft_peak_mag'],
                
                'motor_current_rms': c_features['rms'],
                'motor_current_kurtosis': c_features['kurtosis'],
                'motor_current_skewness': c_features['skewness'],
                'motor_current_fft_peak_freq': c_features['fft_peak_freq'],
                'motor_current_fft_peak_mag': c_features['fft_peak_mag'],
                
                'temperature_rms': t_features['rms'],
                'temperature_kurtosis': t_features['kurtosis'],
                'temperature_skewness': t_features['skewness'],
                'temperature_fft_peak_freq': t_features['fft_peak_freq'],
                'temperature_fft_peak_mag': t_features['fft_peak_mag'],
                
                'label': label
            }
            features_rows.append(row)
            
            # --- 2. RAW WINDOWED SEQUENCE COLLECTION FOR DEEP LEARNING (LSTM) ---
            # Stacking signals as features for the LSTM window (shape: window_size, 3)
            window_sequence = np.column_stack([vib_w, cur_w, temp_w])
            lstm_x_list.append(window_sequence)
            lstm_y_list.append(label)
            lstm_sample_ids_list.append(sample_id)
            
    # Save Classical ML tabular features
    features_df = pd.DataFrame(features_rows)
    print(f"Saving extracted features to {features_csv} ({len(features_df)} rows)...")
    features_df.to_csv(features_csv, index=False)
    
    # Save LSTM inputs
    lstm_x = np.array(lstm_x_list)
    lstm_y = np.array(lstm_y_list)
    lstm_sample_ids = np.array(lstm_sample_ids_list)
    print(f"Saving LSTM inputs: lstm_x.npy shape: {lstm_x.shape}, lstm_y.npy shape: {lstm_y.shape}...")
    np.save(lstm_x_file, lstm_x)
    np.save(lstm_y_file, lstm_y)
    np.save(lstm_sample_ids_file, lstm_sample_ids)
    
    print("Preprocessing complete!")

if __name__ == "__main__":
    main()
