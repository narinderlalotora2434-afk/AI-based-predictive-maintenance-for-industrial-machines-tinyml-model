import os
os.environ['KERAS_HOME'] = os.path.abspath('.keras')
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# We import TensorFlow inside functions or guard it to prevent issues during loading if TF is not fully installed yet.
def build_lstm_model(input_shape):
    import tensorflow as tf
    from tensorflow.keras import layers, models
    
    # 2-layer LSTM, keeping it small and standard for easy TFLite conversion
    model = models.Sequential([
        layers.Input(shape=input_shape, name="input_1"),
        layers.LSTM(32, return_sequences=True, name="lstm_1"),
        layers.LSTM(32, return_sequences=False, name="lstm_2"),
        layers.Dropout(0.2, name="dropout_1"),
        layers.Dense(4, activation='softmax', name="dense_output")
    ])
    return model

def main():
    import tensorflow as tf
    
    x_file = "lstm_x.npy"
    y_file = "lstm_y.npy"
    lstm_sample_ids_file = "lstm_sample_ids.npy"
    train_ids_file = "train_ids.npy"
    test_ids_file = "test_ids.npy"
    model_file = "lstm_model.h5"
    scaler_file = "lstm_scaler.npz"
    cm_image = "lstm_confusion_matrix.png"
    
    print("Loading sequence datasets...")
    try:
        X = np.load(x_file)
        y_str = np.load(y_file)
        lstm_sample_ids = np.load(lstm_sample_ids_file)
        train_ids = np.load(train_ids_file)
        test_ids = np.load(test_ids_file)
    except FileNotFoundError:
        print("Error: Required dataset or split ID files not found. Please run preprocess_data.py first.")
        return
        
    print(f"Loaded X shape: {X.shape}, y shape: {y_str.shape}")
    
    # Filter dataset windows based on saved sequence-level split (prevents window leakage across train/test)
    train_mask = np.isin(lstm_sample_ids, train_ids)
    test_mask = np.isin(lstm_sample_ids, test_ids)
    
    X_train_raw = X[train_mask]
    X_test_raw = X[test_mask]
    y_train_str = y_str[train_mask]
    y_test_str = y_str[test_mask]
    
    # Normalize features per-sensor over the training sequence dimensions
    # Standardizing across time-steps and samples is critical for LSTM training stability
    mean = X_train_raw.mean(axis=(0, 1), keepdims=True)  # Shape: (1, 1, 3)
    std = X_train_raw.std(axis=(0, 1), keepdims=True)    # Shape: (1, 1, 3)
    
    # Prevent division by zero
    std[std == 0] = 1.0
    
    X_train = (X_train_raw - mean) / std
    X_test = (X_test_raw - mean) / std
    
    print(f"Saving normalization parameters to {scaler_file}...")
    np.savez(scaler_file, mean=mean, std=std)
    
    # Encode labels to integer indices
    classes = ['bearing_wear', 'healthy', 'misalignment', 'overheating']
    label_map = {cls: idx for idx, cls in enumerate(classes)}
    
    y_train = np.array([label_map[label] for label in y_train_str])
    y_test = np.array([label_map[label] for label in y_test_str])
    
    print(f"Training shapes: X: {X_train.shape}, y: {y_train.shape}")
    print(f"Testing shapes: X: {X_test.shape}, y: {y_test.shape}")
    
    # Build model
    model = build_lstm_model(input_shape=(X_train.shape[1], X_train.shape[2]))
    model.summary()
    
    # Compile
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Train with early stopping to prevent overfitting
    early_stopping = tf.keras.callbacks.EarlyStopping(
        monitor='val_loss', 
        patience=5, 
        restore_best_weights=True
    )
    
    print("\nTraining LSTM network...")
    history = model.fit(
        X_train, 
        y_train, 
        epochs=30, 
        batch_size=32, 
        validation_split=0.1, 
        callbacks=[early_stopping],
        verbose=1
    )
    
    # Evaluate model
    print("\nEvaluating model on test set...")
    y_pred_probs = model.predict(X_test)
    y_pred = np.argmax(y_pred_probs, axis=1)
    
    accuracy = accuracy_score(y_test, y_pred)
    
    print("\n" + "="*50)
    print("LSTM EVALUATION REPORT")
    print("="*50)
    print(f"Test Accuracy: {accuracy:.4%}\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred, target_names=classes))
    print("="*50)
    
    # Save Keras Model
    print(f"Saving trained LSTM model to {model_file}...")
    model.save(model_file)
    
    # Plot and save confusion matrix
    print("Plotting confusion matrix...")
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(8, 6))
    fig.patch.set_facecolor('#121212')
    ax.set_facecolor('#1E1E1E')
    
    cm = confusion_matrix(y_test, y_pred)
    
    sns.heatmap(
        cm, 
        annot=True, 
        fmt='d', 
        cmap='Oranges', 
        xticklabels=classes, 
        yticklabels=classes,
        ax=ax,
        cbar=True,
        annot_kws={"size": 12, "weight": "bold"}
    )
    
    plt.title('LSTM Sequence Classifier Confusion Matrix', color='#FFFFFF', fontsize=16, pad=20, fontweight='bold')
    plt.ylabel('True Class', color='#E0E0E0', fontsize=12, fontweight='bold')
    plt.xlabel('Predicted Class', color='#E0E0E0', fontsize=12, fontweight='bold')
    plt.xticks(rotation=45, color='#CCCCCC')
    plt.yticks(rotation=0, color='#CCCCCC')
    plt.tight_layout()
    
    print(f"Saving confusion matrix plot to {cm_image}...")
    plt.savefig(cm_image, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()
    
    print("LSTM training and baseline evaluation complete!")

if __name__ == "__main__":
    main()
