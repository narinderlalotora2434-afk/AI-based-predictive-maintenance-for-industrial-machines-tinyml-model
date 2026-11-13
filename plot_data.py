import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

def main():
    csv_file = "sensor_dataset.csv"
    output_image = "sensor_signals_comparison.png"
    
    print(f"Loading dataset from {csv_file}...")
    try:
        df = pd.read_csv(csv_file)
    except FileNotFoundError:
        print(f"Error: {csv_file} not found. Please run generate_data.py first.")
        return

    print("Selecting representative samples...")
    classes = ['healthy', 'bearing_wear', 'misalignment', 'overheating']
    representative_samples = {}
    
    for label in classes:
        # Get all sample IDs for this class
        sample_ids = df[df['label'] == label]['sample_id'].unique()
        if len(sample_ids) == 0:
            print(f"Error: No data found for class '{label}'.")
            return
        # Select the first sample ID of each class
        representative_samples[label] = sample_ids[0]

    # Set up the plotting style for a premium, clean dark theme
    plt.style.use('dark_background')
    
    fig, axes = plt.subplots(3, 4, figsize=(20, 12), sharex='row')
    fig.patch.set_facecolor('#121212')  # Sleek dark background
    
    # Custom vibrant color palette for each sensor
    sensor_colors = {
        'vibration': '#00F5FF',      # Electric Cyan
        'motor_current': '#FF3366',  # Bright Magenta
        'temperature': '#FFA500'     # Warning Orange
    }
    
    sensors = ['vibration', 'motor_current', 'temperature']
    sensor_units = {
        'vibration': 'Acceleration (G)',
        'motor_current': 'Current (A)',
        'temperature': 'Temperature (°C)'
    }
    
    # Plotting loop
    for col_idx, label in enumerate(classes):
        sample_id = representative_samples[label]
        sample_data = df[df['sample_id'] == sample_id].sort_values(by='timestamp')
        
        for row_idx, sensor in enumerate(sensors):
            ax = axes[row_idx, col_idx]
            ax.set_facecolor('#1E1E1E')  # Dark gray plot card
            
            # Plot the signal line
            ax.plot(
                sample_data['timestamp'], 
                sample_data[sensor], 
                color=sensor_colors[sensor], 
                linewidth=1.2, 
                alpha=0.9,
                label=sensor.replace('_', ' ').title()
            )
            
            # Enhancing plot appearance
            ax.grid(True, linestyle='--', color='#333333', alpha=0.7)
            ax.tick_params(colors='#CCCCCC', labelsize=10)
            
            # Format axis labels
            if col_idx == 0:
                ax.set_ylabel(sensor_units[sensor], color='#E0E0E0', fontsize=12, fontweight='bold')
            if row_idx == 2:
                ax.set_xlabel('Time (s)', color='#E0E0E0', fontsize=11)
            
            # Set titles on top row subplots
            if row_idx == 0:
                # Capitalize class name and add sample ID context
                title_str = f"{label.replace('_', ' ').upper()}\n(Sample #{sample_id})"
                ax.set_title(title_str, color='#FFFFFF', fontsize=14, fontweight='bold', pad=15)
                
            # Add subtle envelope or highlight for fault indicators
            if label == 'bearing_wear' and sensor == 'vibration':
                # Annotate that there are high frequency impacts
                ax.text(0.5, 3.5, "High freq impacts (drift)", color='#FFD700', fontsize=9, 
                        bbox=dict(facecolor='#121212', alpha=0.7, boxstyle='round,pad=0.3'))
            elif label == 'misalignment' and sensor == 'vibration':
                # Annotate misalignment harmonic growth
                ax.text(0.5, 3.0, "Harmonics growth", color='#FFD700', fontsize=9,
                        bbox=dict(facecolor='#121212', alpha=0.7, boxstyle='round,pad=0.3'))
            elif label == 'overheating' and sensor == 'temperature':
                # Annotate sharp temperature rise
                ax.text(0.5, 85, "Severe drift (+60°C)", color='#FFD700', fontsize=9,
                        bbox=dict(facecolor='#121212', alpha=0.7, boxstyle='round,pad=0.3'))

    # Master title
    fig.suptitle('Sensor Signatures and Fault Drift Comparison', 
                 color='#FFFFFF', fontsize=22, fontweight='bold', y=0.98)
    
    # Adjust layout to prevent overlap
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    
    # Save the output image
    print(f"Saving comparison plot to {output_image}...")
    plt.savefig(output_image, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()
    
    print("Plotting complete! You can open the image file to verify.")

if __name__ == "__main__":
    main()
