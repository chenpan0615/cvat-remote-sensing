# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import csv
import json
from collections import Counter
from pathlib import Path

import datumaro as dm
import numpy as np
from PIL import Image

from cvat.apps.dataset_manager.bindings import GetCVATDataExtractor
from cvat.apps.dataset_manager.util import make_zip_archive

from .registry import dm_env, exporter
from .transformations import EllipsesToMasks, RotatedBoxesToPolygons


DEFAULT_CLASS_VALUES = {
    "background": 0,
    "building": 1,
    "road": 2,
    "water": 3,
    "forest": 4,
    "cropland": 5,
    "greenhouse": 6,
    "color_steel_house": 7,
}

CLASS_VALUE_ALIASES = {
    "背景": "background",
    "建筑": "building",
    "建筑物": "building",
    "道路": "road",
    "路": "road",
    "水体": "water",
    "水": "water",
    "林地": "forest",
    "树林": "forest",
    "耕地": "cropland",
    "农田": "cropland",
    "温室": "greenhouse",
    "大棚": "greenhouse",
    "温室大棚": "greenhouse",
    "彩钢房": "color_steel_house",
}

DEFAULT_COLORS = {
    0: (0, 0, 0),
    1: (230, 25, 75),
    2: (120, 120, 120),
    3: (0, 130, 255),
    4: (34, 139, 34),
    5: (255, 215, 0),
    6: (0, 206, 209),
    7: (160, 32, 240),
}


def _normalize_label(name):
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def _safe_name(name):
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name).strip("._") or "item"


def _make_label_value_map(label_categories):
    label_values = {}
    used_values = set()
    next_value = 1

    for category in label_categories.items:
        raw_name = category.name
        normalized_name = _normalize_label(raw_name)
        canonical_name = CLASS_VALUE_ALIASES.get(raw_name, CLASS_VALUE_ALIASES.get(normalized_name))
        lookup_name = canonical_name or normalized_name

        if lookup_name in DEFAULT_CLASS_VALUES:
            value = DEFAULT_CLASS_VALUES[lookup_name]
        else:
            while next_value in used_values or next_value in DEFAULT_CLASS_VALUES.values():
                next_value += 1
            value = next_value

        label_values[raw_name] = value
        used_values.add(value)

    if 0 not in used_values:
        label_values = {"background": 0, **label_values}
        used_values.add(0)

    duplicate_values = [
        value for value, count in Counter(label_values.values()).items() if count > 1
    ]
    if duplicate_values:
        raise ValueError(f"Semantic PNG class values must be unique: {duplicate_values}")

    return label_values


def _dtype_for_values(label_values):
    return np.uint8 if max(label_values.values(), default=0) <= 255 else np.uint16


def _color_for_value(value):
    if value in DEFAULT_COLORS:
        return DEFAULT_COLORS[value]
    return (
        (37 * value + 53) % 256,
        (97 * value + 101) % 256,
        (173 * value + 151) % 256,
    )


def _colorize(mask):
    color = np.zeros((*mask.shape, 3), dtype=np.uint8)
    for value in np.unique(mask):
        color[mask == value] = _color_for_value(int(value))
    return Image.fromarray(color, mode="RGB")


def _mask_from_annotation(annotation):
    if annotation.type != dm.AnnotationType.mask:
        return None
    return np.asarray(annotation.image, dtype=bool)


def _read_media_image(item, size):
    if not isinstance(item.media, dm.Image):
        return None

    media = item.media_as(dm.Image)
    if not media.has_data:
        return None

    try:
        data = media.data
        if data is not None:
            data = np.asarray(data)
            if data.ndim == 3 and data.shape[2] == 4:
                data = data[:, :, [2, 1, 0, 3]]
                image = Image.fromarray(data, mode="RGBA").convert("RGB")
            elif data.ndim == 3 and data.shape[2] == 3:
                image = Image.fromarray(data[:, :, [2, 1, 0]], mode="RGB")
            else:
                image = Image.fromarray(data).convert("RGB")
            if image.size != (size[1], size[0]):
                image = image.resize((size[1], size[0]), Image.Resampling.BILINEAR)
            return image
    except Exception:
        return None

    return None


def _make_overlay(image, color_mask, mask, alpha=0.45):
    image_arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    color_arr = np.asarray(color_mask, dtype=np.float32)
    foreground = mask != 0
    image_arr[foreground] = image_arr[foreground] * (1.0 - alpha) + color_arr[foreground] * alpha
    return Image.fromarray(np.clip(image_arr, 0, 255).astype(np.uint8), mode="RGB")


def _make_output_name(item, used_names):
    subset = item.subset or "default"
    stem = _safe_name(Path(item.id).name)
    candidate = f"{stem}.png"
    index = 2

    while (subset, candidate) in used_names:
        candidate = f"{stem}_{index}.png"
        index += 1

    used_names.add((subset, candidate))
    return subset, candidate


@exporter(name="Semantic PNG Masks", ext="ZIP", version="1.0")
def _export(dst_file, temp_dir, instance_data, save_images=False):
    temp_dir = Path(temp_dir)
    masks_dir = temp_dir / "masks"
    visualizations_dir = temp_dir / "visualizations"
    overlays_dir = temp_dir / "overlays"
    masks_dir.mkdir(parents=True, exist_ok=True)
    visualizations_dir.mkdir(parents=True, exist_ok=True)
    if save_images:
        overlays_dir.mkdir(parents=True, exist_ok=True)

    with GetCVATDataExtractor(instance_data, include_images=save_images) as extractor:
        dataset = dm.StreamDataset.from_extractors(extractor, env=dm_env)
        dataset.transform(RotatedBoxesToPolygons)
        dataset.transform("polygons_to_masks")
        dataset.transform("boxes_to_masks")
        dataset.transform(EllipsesToMasks)

        label_categories = dataset.categories()[dm.AnnotationType.label]
        label_values = _make_label_value_map(label_categories)
        label_names = {
            index: category.name for index, category in enumerate(label_categories.items)
        }
        mask_dtype = _dtype_for_values(label_values)

        used_names = set()
        manifest_rows = []
        pixel_counts = Counter()

        for item in dataset:
            if not isinstance(item.media, dm.Image):
                continue

            height, width = item.media_as(dm.Image).size
            mask = np.zeros((height, width), dtype=mask_dtype)

            annotations = sorted(
                item.annotations,
                key=lambda ann: (getattr(ann, "z_order", 0), getattr(ann, "id", 0)),
            )
            for annotation in annotations:
                annotation_mask = _mask_from_annotation(annotation)
                if annotation_mask is None or annotation.label is None:
                    continue

                label_name = label_names[annotation.label]
                value = label_values[label_name]
                if annotation_mask.shape != mask.shape:
                    raise ValueError(
                        f"Mask shape mismatch for {item.id}: "
                        f"{annotation_mask.shape} != {mask.shape}"
                    )
                mask[annotation_mask] = value

            subset, output_name = _make_output_name(item, used_names)
            mask_path = masks_dir / subset / output_name
            visualization_path = visualizations_dir / subset / output_name
            overlay_path = overlays_dir / subset / output_name
            mask_path.parent.mkdir(parents=True, exist_ok=True)
            visualization_path.parent.mkdir(parents=True, exist_ok=True)

            Image.fromarray(mask).save(mask_path)
            color_mask = _colorize(mask)
            color_mask.save(visualization_path)

            overlay_relpath = ""
            if save_images:
                image = _read_media_image(item, mask.shape)
                if image is not None:
                    overlay_path.parent.mkdir(parents=True, exist_ok=True)
                    _make_overlay(image, color_mask, mask).save(overlay_path)
                    overlay_relpath = str(overlay_path.relative_to(temp_dir))

            values, counts = np.unique(mask, return_counts=True)
            for value, count in zip(values, counts):
                pixel_counts[int(value)] += int(count)

            manifest_rows.append(
                {
                    "subset": subset,
                    "item_id": item.id,
                    "mask": str(mask_path.relative_to(temp_dir)),
                    "visualization": str(visualization_path.relative_to(temp_dir)),
                    "overlay": overlay_relpath,
                    "annotations": len(item.annotations),
                }
            )

    (temp_dir / "category_values.json").write_text(
        json.dumps(label_values, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (temp_dir / "summary.json").write_text(
        json.dumps(
            {
                "images": len(manifest_rows),
                "class_values": label_values,
                "pixel_counts": dict(sorted(pixel_counts.items())),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    with (temp_dir / "samples.csv").open("w", newline="", encoding="utf-8-sig") as manifest:
        fieldnames = ["subset", "item_id", "mask", "visualization", "overlay", "annotations"]
        writer = csv.DictWriter(manifest, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(manifest_rows)

    make_zip_archive(str(temp_dir), dst_file)
