"""Training-data contracts for the SHM preprocessing notebook (no model fitting)."""
import numpy as np
import pandas as pd


def validate_labels(table, train_names):
    if set(table.columns) != {'filename', 'damage'}:
        raise ValueError('Labels require exactly filename and damage columns.')
    if table.isna().any().any() or table['filename'].duplicated().any():
        raise ValueError('Missing labels or duplicate filenames are not allowed.')
    damage = pd.to_numeric(table['damage'], errors='coerce').to_numpy(dtype=float)
    if not np.isfinite(damage).all() or (damage <= 0).any():
        raise ValueError('Damage must be finite, numeric and strictly positive.')
    if set(table['filename']) != set(train_names):
        raise ValueError('Training recordings and label filenames do not match exactly.')
    return pd.Series(damage, index=table['filename'], name='damage')


def validate_signal(values, name='recording'):
    x = np.asarray(values, dtype=float)
    if x.ndim != 1 or len(x) < 3:
        raise ValueError(f'{name}: expected at least three single-channel samples.')
    if not np.isfinite(x).all():
        raise ValueError(f'{name}: missing/non-finite samples; no automatic interpolation.')
    if np.ptp(x) == 0:
        raise ValueError(f'{name}: constant signal; rainflow features are undefined.')
    return x


def assign_folds(targets, hashes, n_splits=4, seed=2026):
    """Balance target bands at recording level, keeping identical signals together.

    Exact duplicates with inconsistent targets require review rather than averaging.
    The source line/load/session is unknown; hashes only protect exact duplicates.
    """
    if not targets.index.is_unique or not hashes.index.is_unique:
        raise ValueError('Recording identifiers must be unique.')
    hashes = hashes.reindex(targets.index)
    if hashes.isna().any() or not np.isfinite(targets.to_numpy(dtype=float)).all():
        raise ValueError('Missing group identifiers or invalid targets.')
    table = pd.DataFrame({'damage': targets, 'group_id': hashes}).sort_index()
    if table.groupby('group_id')['damage'].nunique().gt(1).any():
        raise ValueError('Identical signals have conflicting targets; review labels.')
    groups = table.groupby('group_id', sort=True).agg(damage=('damage', 'first'), size=('damage', 'size'))
    if len(groups) < n_splits:
        raise ValueError('Too few independent recording groups for the requested folds.')
    groups['damage_band'] = pd.qcut(groups['damage'], 4, labels=False, duplicates='drop').fillna(0).astype(int)
    groups['fold'] = -1
    total = np.zeros(n_splits, dtype=int)
    rng = np.random.default_rng(seed)
    for _, members in groups.groupby('damage_band', sort=True):
        band_size = np.zeros(n_splits, dtype=int)
        for group_id in rng.permutation(members.index.to_numpy()):
            fold = min(range(n_splits), key=lambda f: (band_size[f], total[f], f))
            size = int(groups.loc[group_id, 'size'])
            groups.loc[group_id, 'fold'] = fold
            band_size[fold] += size
            total[fold] += size
    if (total == 0).any():
        raise ValueError('Fold allocation produced an empty fold.')
    for column in ['damage_band', 'fold']:
        table[column] = table['group_id'].map(groups[column]).astype('int64')
    return table.reindex(targets.index)


def training_tables(features, feature_columns, folds):
    """Explicit allowlist prevents target and split metadata entering X."""
    forbidden = {'filename', 'dataset', 'damage', 'log10_damage', 'damage_band', 'fold', 'group_id', 'number'}
    if not feature_columns or len(set(feature_columns)) != len(feature_columns) or forbidden.intersection(feature_columns):
        raise ValueError('Feature allowlist is empty, duplicated or contains metadata/targets.')
    if not features.index.is_unique or not features['dataset'].isin(['Train', 'Test']).all():
        raise ValueError('Invalid recording identifiers or split labels.')
    matrix = features[feature_columns].astype('float64')
    if not np.isfinite(matrix.to_numpy()).all():
        raise ValueError('Non-finite features cannot be exported for training.')
    train_ids = features.index[features['dataset'].eq('Train')]
    test_ids = features.index[features['dataset'].eq('Test')]
    if not len(train_ids) or not len(test_ids):
        raise ValueError('Both Train and Test partitions are required.')
    if not features.loc[test_ids, ['damage', 'log10_damage']].isna().all().all():
        raise ValueError('Test labels must remain unknown.')
    if set(folds.index) != set(train_ids) or not folds.index.is_unique:
        raise ValueError('Fold membership must cover Train only, exactly once.')
    if folds[['fold', 'damage_band', 'group_id']].isna().any().any():
        raise ValueError('Incomplete fold metadata.')
    if folds.groupby('group_id')['fold'].nunique().gt(1).any():
        raise ValueError('Duplicate group crosses validation folds.')
    y = features.loc[train_ids, ['damage', 'log10_damage']].astype(float)
    if not np.isfinite(y.to_numpy()).all() or y['damage'].le(0).any():
        raise ValueError('Training targets must be finite and positive.')
    if not np.allclose(y['log10_damage'], np.log10(y['damage'])):
        raise ValueError('Log targets disagree with damage.')
    return {
        'X_train.parquet': matrix.loc[train_ids].rename_axis('filename').reset_index(),
        'y_train.parquet': y.rename_axis('filename').reset_index(),
        'X_test.parquet': matrix.loc[test_ids].rename_axis('filename').reset_index(),
        'fold_manifest.parquet': folds.loc[train_ids].rename_axis('filename').reset_index(),
    }
