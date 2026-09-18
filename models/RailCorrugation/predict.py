"""Run inference on Test/ files and produce rail_predictions.csv."""

import os
import re
import argparse
import numpy as np
import pandas as pd

import config as C
from preprocessing import preprocess_file
from model import build_model


def natural_key(fname):
    """Sort Test1, Test2, ..., Test10 in numeric order."""
    m = re.search(r"(\d+)", fname)
    return int(m.group(1)) if m else fname


def decide_label(p1, p2, threshold=C.DEFAULT_THRESHOLD):
    if p1 >= threshold and p2 >= threshold:
        # Ambiguous / both flagged -> tie-break by higher probability
        return C.LABEL_SIDE1 if p1 >= p2 else C.LABEL_SIDE2
    elif p1 >= threshold:
        return C.LABEL_SIDE1
    elif p2 >= threshold:
        return C.LABEL_SIDE2
    else:
        return C.LABEL_NORMAL


def main(args):
    model, _ = build_model()
    model.load_weights(args.weights_path)
    print(f"Loaded weights from {args.weights_path}")

    files = [f for f in os.listdir(args.test_dir) if f.lower().endswith(".csv")]
    files = sorted(files, key=natural_key)

    results = []
    for fname in files:
        filepath = os.path.join(args.test_dir, fname)
        raw1, ang1, raw2, ang2 = preprocess_file(filepath)

        # add batch dimension
        raw1_b = raw1[None, ...]
        ang1_b = ang1[None, ...]
        raw2_b = raw2[None, ...]
        ang2_b = ang2[None, ...]

        p1, p2 = model.predict([raw1_b, ang1_b, raw2_b, ang2_b], verbose=0)
        p1 = float(p1[0, 0])
        p2 = float(p2[0, 0])

        label = decide_label(p1, p2, threshold=args.threshold)

        results.append({
            "filename": fname,
            "prediction": label,
            "side1_prob": round(p1, 4),
            "side2_prob": round(p2, 4),
        })
        print(f"{fname}: side1={p1:.3f} side2={p2:.3f} -> {label}")

    out_df = pd.DataFrame(results)
    out_df.to_csv(args.output_csv, index=False)
    print(f"Saved predictions to {args.output_csv}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_dir", type=str, default="Test")
    parser.add_argument("--weights_path", type=str, default="corrugation_model.weights.h5")
    parser.add_argument("--output_csv", type=str, default="rail_predictions.csv")
    parser.add_argument("--threshold", type=float, default=C.DEFAULT_THRESHOLD)
    args = parser.parse_args()
    main(args)
