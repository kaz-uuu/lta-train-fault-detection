"""Model architecture: shared instance encoder + Attention-MIL pooling
   + dual independent Side I / Side II heads."""

import tensorflow as tf
from tensorflow.keras import layers, Model
import config as C


# ----------------------------------------------------------------------
# Focal loss (handles class imbalance)
# ----------------------------------------------------------------------
def binary_focal_loss(gamma=2.0, alpha=0.75):
    """alpha: weight given to the POSITIVE (fault) class."""
    def loss_fn(y_true, y_pred):
        y_true = tf.cast(y_true, tf.float32)
        eps = 1e-7
        y_pred = tf.clip_by_value(y_pred, eps, 1.0 - eps)
        pt = tf.where(tf.equal(y_true, 1.0), y_pred, 1.0 - y_pred)
        alpha_factor = tf.where(tf.equal(y_true, 1.0), alpha, 1.0 - alpha)
        loss = -alpha_factor * tf.pow(1.0 - pt, gamma) * tf.math.log(pt)
        return tf.reduce_mean(loss)
    return loss_fn


# ----------------------------------------------------------------------
# Shared per-axle-box instance encoder (Siamese-style, reused for
# every instance and for both sides -> physics is identical)
# ----------------------------------------------------------------------
def build_instance_encoder(raw_len, spatial_len, embed_dim=C.EMBED_DIM):
    raw_in = layers.Input(shape=(raw_len, 2), name="raw_instance")
    ang_in = layers.Input(shape=(spatial_len, 2), name="ang_instance")

    # --- raw time-domain branch (shock / transient content) ---
    x1 = layers.Conv1D(16, 7, strides=2, padding="same", activation="relu")(raw_in)
    x1 = layers.BatchNormalization()(x1)
    x1 = layers.Conv1D(32, 5, strides=2, padding="same", activation="relu")(x1)
    x1 = layers.BatchNormalization()(x1)
    x1 = layers.GlobalAveragePooling1D()(x1)
    x1 = layers.Dense(32, activation="relu")(x1)

    # --- angular (order-tracked / speed-invariant) branch: main signal ---
    x2 = layers.Conv1D(32, 15, strides=4, padding="same", activation="relu")(ang_in)
    x2 = layers.BatchNormalization()(x2)
    x2 = layers.Conv1D(64, 9, strides=4, padding="same", activation="relu")(x2)
    x2 = layers.BatchNormalization()(x2)
    x2 = layers.Conv1D(64, 5, strides=2, padding="same", activation="relu")(x2)
    x2 = layers.BatchNormalization()(x2)
    x2 = layers.GlobalAveragePooling1D()(x2)
    x2 = layers.Dense(64, activation="relu")(x2)

    x = layers.Concatenate()([x1, x2])
    x = layers.Dense(embed_dim, activation="relu")(x)

    return Model([raw_in, ang_in], x, name="instance_encoder")


# ----------------------------------------------------------------------
# Attention-based MIL pooling (Ilse et al. gated attention)
# ----------------------------------------------------------------------
class AttentionMILPooling(layers.Layer):
    def __init__(self, attn_dim=C.ATTN_DIM, **kwargs):
        super().__init__(**kwargs)
        self.attn_dim = attn_dim
        self.dense_v = layers.Dense(attn_dim, activation="tanh")
        self.dense_u = layers.Dense(attn_dim, activation="sigmoid")
        self.dense_w = layers.Dense(1)

    def call(self, x):
        # x: (batch, n_instances, embed_dim)
        v = self.dense_v(x)
        u = self.dense_u(x)
        attn_logits = self.dense_w(v * u)               # (batch, n, 1)
        attn_weights = tf.nn.softmax(attn_logits, axis=1)
        bag = tf.reduce_sum(attn_weights * x, axis=1)     # (batch, embed_dim)
        return bag, attn_weights


def encode_bag(raw_in, ang_in, encoder, n_instances, raw_len, spatial_len, embed_dim):
    """Apply shared instance encoder to every instance in the bag."""

    def merge_raw(x):
        return tf.reshape(x, [-1, raw_len, 2])

    def merge_ang(x):
        return tf.reshape(x, [-1, spatial_len, 2])

    def unmerge(x):
        return tf.reshape(x, [-1, n_instances, embed_dim])

    raw_merged = layers.Lambda(merge_raw)(raw_in)
    ang_merged = layers.Lambda(merge_ang)(ang_in)
    embed_flat = encoder([raw_merged, ang_merged])
    embed = layers.Lambda(unmerge)(embed_flat)
    return embed


# ----------------------------------------------------------------------
# Full model
# ----------------------------------------------------------------------
def build_model(raw_len=C.RAW_LEN, spatial_len=C.SPATIAL_LEN,
                 n_instances=C.N_INSTANCES_PER_SIDE,
                 embed_dim=C.EMBED_DIM, attn_dim=C.ATTN_DIM):

    raw1_in = layers.Input(shape=(n_instances, raw_len, 2), name="raw_side1")
    ang1_in = layers.Input(shape=(n_instances, spatial_len, 2), name="ang_side1")
    raw2_in = layers.Input(shape=(n_instances, raw_len, 2), name="raw_side2")
    ang2_in = layers.Input(shape=(n_instances, spatial_len, 2), name="ang_side2")

    encoder = build_instance_encoder(raw_len, spatial_len, embed_dim)

    embed1 = encode_bag(raw1_in, ang1_in, encoder, n_instances, raw_len, spatial_len, embed_dim)
    embed2 = encode_bag(raw2_in, ang2_in, encoder, n_instances, raw_len, spatial_len, embed_dim)

    mil1 = AttentionMILPooling(attn_dim, name="mil_side1")
    mil2 = AttentionMILPooling(attn_dim, name="mil_side2")

    bag1, attn1 = mil1(embed1)
    bag2, attn2 = mil2(embed2)

    diff = layers.Subtract()([bag1, bag2])   # cross-side contrast (Architecture-2 idea)

    side1_feat = layers.Concatenate()([bag1, diff])
    side2_feat = layers.Concatenate()([bag2, diff])

    h1 = layers.Dense(32, activation="relu")(side1_feat)
    side1_out = layers.Dense(1, activation="sigmoid", name="side1_out")(h1)

    h2 = layers.Dense(32, activation="relu")(side2_feat)
    side2_out = layers.Dense(1, activation="sigmoid", name="side2_out")(h2)

    model = Model(
        inputs=[raw1_in, ang1_in, raw2_in, ang2_in],
        outputs=[side1_out, side2_out],
        name="corrugation_mil_model",
    )

    # Secondary graph (for interpretability): expose attention weights
    attn_model = Model(
        inputs=[raw1_in, ang1_in, raw2_in, ang2_in],
        outputs=[attn1, attn2],
        name="attention_inspection_model",
    )

    return model, attn_model
