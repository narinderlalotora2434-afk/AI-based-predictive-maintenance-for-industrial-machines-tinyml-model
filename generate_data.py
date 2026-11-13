import numpy as np
import pandas as pd
import os

def generate_sequence(sequence_id, label, fs=100, duration=10, seed=None):
    """
    Generates a 10-second multi-sensor sequence sampled at fs (Hz)
    for a given machine state label, simulating gradual fault drifts and noise.
    """
    if seed is not None:
        np.random.seed(seed)
    
    n_points = fs * duration
    t = np.linspace(0, duration, n_points, endpoint=False)
    
    # Base frequencies
    f_rot = 30.0  # Shaft rotation frequency: 30 Hz (1800 RPM)
    f_grid = 50.0 # Grid power frequency: 50 Hz
    
    # Drift factor: gradual linear progression from 0 (start) to 1 (end of 10s)
    drift = t / duration
    
    # --- VIBRATION SENSOR (G) ---
    # Baseline vibration: 1x and 2x shaft harmonics + noise
    vib_base = 0.5 * np.sin(2 * np.pi * f_rot * t) + 0.2 * np.sin(2 * np.pi * 2 * f_rot * t)
    vib_noise = np.random.normal(0, 0.1, n_points)
    
    # --- MOTOR CURRENT SENSOR (Amperes) ---
    # Baseline current: base DC load of 5.0A + minor AC ripple + noise
    cur_base = 5.0 + 0.2 * np.sin(2 * np.pi * f_grid * t)
    cur_noise = np.random.normal(0, 0.05, n_points)
    
    # --- TEMPERATURE SENSOR (°C) ---
    # Baseline temperature: transient heating curves starting at 40°C and stabilizing near 42°C
    temp_base = 40.0 + 2.0 * (1 - np.exp(-t / 2.0))
    temp_noise = np.random.normal(0, 0.08, n_points)
    
    # Inject fault conditions
    if label == 'healthy':
        vibration = vib_base + vib_noise
        current = cur_base + cur_noise
        temperature = temp_base + temp_noise
        
    elif label == 'bearing_wear':
        # Bearing wear: periodic high-frequency impacting shocks at 85 Hz
        # Shock amplitude increases over time (from 0.1G to 5.0G) - doubled maximum amplitude
        f_bearing = 85.0
        impacts = np.zeros(n_points)
        # Impacts occur at a rate of ~8.5 Hz (every 11-12 samples)
        impact_indices = np.arange(0, n_points, int(fs / 8.5))
        for idx in impact_indices:
            window = min(n_points - idx, 10)
            t_impact = np.arange(window) / fs
            # Decaying sinusoid shock model
            impacts[idx:idx+window] += np.sin(2 * np.pi * f_bearing * t_impact) * np.exp(-t_impact / 0.01)
        
        drift_impacts = impacts * (0.1 + 4.9 * drift)
        
        # Friction results in current load and temperature increase (increased drift strength)
        current_drift = 0.6 * drift
        temp_drift = 8.0 * drift
        
        vibration = vib_base + drift_impacts + vib_noise
        current = cur_base + current_drift + cur_noise
        temperature = temp_base + temp_drift + temp_noise
        
    elif label == 'misalignment':
        # Misalignment: elevated 1x and 2x vibration amplitudes drifting up over time (nearly doubled amplitude)
        vib_drift_1x = 2.5 * drift * np.sin(2 * np.pi * f_rot * t)
        vib_drift_2x = 2.5 * drift * np.sin(2 * np.pi * 2 * f_rot * t)
        
        # Motor works harder due to misalignment binding, current drifts up by 1.5A
        current_drift = 1.5 * drift
        # Higher temperature rise (up to +15°C)
        temp_drift = 15.0 * drift
        
        vibration = vib_base + vib_drift_1x + vib_drift_2x + vib_noise
        current = cur_base + current_drift + cur_noise
        temperature = temp_base + temp_drift + temp_noise
        
    elif label == 'overheating':
        # Overheating: vibration and current are normal, but temperature drifts severely
        # Temp drifts up to 100°C (+60°C drift over the course of 10s)
        vibration = vib_base + vib_noise
        current = cur_base + cur_noise
        temp_drift = 60.0 * drift
        temperature = temp_base + temp_drift + temp_noise
        
    else:
        raise ValueError(f"Unknown label: {label}")
        
    return pd.DataFrame({
        'timestamp': np.round(t, 2),
        'sample_id': sequence_id,
        'vibration': vibration,
        'motor_current': current,
        'temperature': temperature,
        'label': label
    })

def main():
    print("Generating synthetic predictive maintenance dataset...")
    
    classes = ['healthy', 'bearing_wear', 'misalignment', 'overheating']
    samples_per_class = 50
    sampling_rate = 100 # Hz
    duration = 10       # seconds
    
    all_sequences = []
    global_sample_id = 0
    
    # We set a base seed to keep the generation deterministic
    base_seed = 42
    
    for label in classes:
        print(f"Generating {samples_per_class} samples for class: '{label}'...")
        for i in range(samples_per_class):
            # Unique seed for each sequence to have realistic variation
            seq_seed = base_seed + global_sample_id
            seq_df = generate_sequence(global_sample_id, label, fs=sampling_rate, duration=duration, seed=seq_seed)
            all_sequences.append(seq_df)
            global_sample_id += 1
            
    # Concatenate all sequences into a single DataFrame
    dataset = pd.concat(all_sequences, ignore_index=True)
    
    # Save to CSV
    output_filename = "sensor_dataset.csv"
    print(f"Saving dataset to {output_filename} ({len(dataset)} total rows)...")
    dataset.to_csv(output_filename, index=False)
    print("Dataset generation complete!")

if __name__ == "__main__":
    main()
