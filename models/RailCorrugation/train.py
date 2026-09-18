"""Train the corrugation detection model on the labeled Train/ dataset."""

import os
import argparse
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split

import config as C
from preprocessing import preprocess_file
from model import build_model, binary_focal_loss


def load_dataset(train_dir, labels_csv):
    labels_df = pd.read_csv(labels_csv)
    # Expect columns like: filename, label   -- adjust names if different
    fname_col = labels_df.columns[0]
    label_col = labels_df.columns[1]

    raw1_list, ang1_list, raw2_list, ang2_list = [], [], [], []
    y1_list, y2_list, label3_list = [], [], []

    for _, row in labels_df.iterrows():
        fname = str(row[fname_col])
        label = str(row[label_col]).strip()

        filepath = os.path.join(train_dir, fname)
        if not os.path.exists(filepath):
            print(f"WARNING: missing file {filepath}, skipping")
            continue

        raw1, ang1, raw2, ang2 = preprocess_file(filepath)

        raw1_list.append(raw1)
        ang1_list.append(ang1)
        raw2_list.append(raw2)
        ang2_list.append(ang2)

        y1 = 1.0 if label.lower().replace("_", " ") == C.LABEL_SIDE1.lower() else 0.0
        y2 = 1.0 if label.lower().replace("_", " ") == C.LABEL_SIDE2.lower() else 0.0

        y1_list.append(y1)
        y2_list.append(y2)
        label3_list.append(label)

        print(f"Processed {fname} -> label={label}")

    X_raw1 = np.stack(raw1_list)
    X_ang1 = np.stack(ang1_list)
    X_raw2 = np.stack(raw2_list)
    X_ang2 = np.stack(ang2_list)
    y1 = np.array(y1_list, dtype=np.float32)
    y2 = np.array(y2_list, dtype=np.float32)
    label3 = np.array(label3_list)

    return X_raw1, X_ang1, X_raw2, X_ang2, y1, y2, label3


def main(args):
    print("Loading & preprocessing training data (this can take a while)...")
    X_raw1, X_ang1, X_raw2, X_ang2, y1, y2, label3 = load_dataset(
        args.train_dir, args.labels_csv
    )
    print(f"Total files loaded: {len(y1)}")

    # Stratified train/val split by the original 3-class label
    idx = np.arange(len(y1))
    idx_train, idx_val = train_test_split(
        idx, test_size=C.VAL_SPLIT, random_state=C.SEED, stratify=label3
    )

    def gather(X, idxs):
        return X[idxs]

    Xtr = [gather(X_raw1, idx_train), gather(X_ang1, idx_train),
           gather(X_raw2, idx_train), gather(X_ang2, idx_train)]
    ytr = [y1[idx_train], y2[idx_train]]

    Xval = [gather(X_raw1, idx_val), gather(X_ang1, idx_val),
            gather(X_raw2, idx_val), gather(X_ang2, idx_val)]
    yval = [y1[idx_val], y2[idx_val]]

    n_pos1 = y1.sum()
    n_pos2 = y2.sum()
    n_total = len(y1)
    alpha1 = 1.0 - (n_pos1 / n_total)   # upweight minority (fault) class
    alpha2 = 1.0 - (n_pos2 / n_total)
    print(f"alpha_side1={alpha1:.3f}  alpha_side2={alpha2:.3f}")

    model, attn_model = build_model()
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=C.LR),
        loss={
            "side1_out": binary_focal_loss(gamma=2.0, alpha=alpha1),
            "side2_out": binary_focal_loss(gamma=2.0, alpha=alpha2),
        },
        metrics={
            "side1_out": [tf.keras.metrics.AUC(name="auc"),
                          tf.keras.metrics.Precision(name="prec"),
                          tf.keras.metrics.Recall(name="rec")],
            "side2_out": [tf.keras.metrics.AUC(name="auc"),
                          tf.keras.metrics.Precision(name="prec"),
                          tf.keras.metrics.Recall(name="rec")],
        },
    )
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=20, restore_best_weights=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=8, min_lr=1e-6
        ),
        tf.keras.callbacks.ModelCheckpoint(
            args.weights_out, save_best_only=True, save_weights_only=True,
            monitor="val_loss"
        ),
    ]

    model.fit(
        Xtr, ytr,
        validation_data=(Xval, yval),
        batch_size=C.BATCH_SIZE,
        epochs=C.EPOCHS,
        callbacks=callbacks,
        verbose=2,
    )

    model.save_weights(args.weights_out)
    print(f"Saved weights to {args.weights_out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--train_dir", type=str, default="Train")
    parser.add_argument("--labels_csv", type=str, default="Train_Labels.csv")
    parser.add_argument("--weights_out", type=str, default="corrugation_model.weights.h5")
    args = parser.parse_args()
    main(args)
