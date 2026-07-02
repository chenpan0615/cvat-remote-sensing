#!/usr/bin/env python3
# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath

from PIL import Image


IMAGE_EXTENSIONS = {".bmp", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


def is_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def image_key(path: Path, root: Path) -> str:
    return path.relative_to(root).with_suffix("").as_posix()


def collect_images(root: Path) -> dict[str, Path]:
    images: dict[str, Path] = {}
    duplicates: dict[str, list[Path]] = {}

    for path in sorted(root.rglob("*")):
        if not is_image(path):
            continue

        key = image_key(path, root)
        if key in images:
            duplicates.setdefault(key, [images[key]]).append(path)
        else:
            images[key] = path

    if duplicates:
        details = "\n".join(
            f"  {key}: {', '.join(str(path.relative_to(root)) for path in paths)}"
            for key, paths in duplicates.items()
        )
        raise ValueError(f"Duplicate image keys after removing extensions:\n{details}")

    return images


def image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def context_dir_name(primary_name: str) -> str:
    return primary_name.replace(".", "_")


def zip_path(path: PurePosixPath) -> str:
    return path.as_posix()


def add_file(archive: zipfile.ZipFile, source: Path, target: PurePosixPath) -> None:
    archive.write(source, zip_path(target))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a CVAT image archive for change-detection annotation. "
            "The main temporal image is stored as the frame; the other temporal image is stored "
            "under related_images so CVAT can display it as a contextual image."
        ),
    )
    parser.add_argument("--before-dir", type=Path, required=True, help="Directory with earlier images.")
    parser.add_argument("--after-dir", type=Path, required=True, help="Directory with later images.")
    parser.add_argument("--output", type=Path, required=True, help="Output .zip file.")
    parser.add_argument(
        "--main",
        choices=("after", "before"),
        default="after",
        help="Temporal image used as the editable CVAT frame. Default: after.",
    )
    parser.add_argument(
        "--skip-size-check",
        action="store_true",
        help="Do not verify that each before/after pair has the same pixel size.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate pairs and print the planned archive layout without writing the zip.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    before_dir = args.before_dir.resolve()
    after_dir = args.after_dir.resolve()
    output = args.output.resolve()

    if not before_dir.is_dir():
        raise ValueError(f"before-dir is not a directory: {before_dir}")
    if not after_dir.is_dir():
        raise ValueError(f"after-dir is not a directory: {after_dir}")

    before_images = collect_images(before_dir)
    after_images = collect_images(after_dir)
    keys = sorted(set(before_images) & set(after_images))
    if not keys:
        raise ValueError("No matched before/after images found.")

    missing_before = sorted(set(after_images) - set(before_images))
    missing_after = sorted(set(before_images) - set(after_images))
    if missing_before or missing_after:
        print(
            json.dumps(
                {
                    "warning": "Unmatched images were skipped.",
                    "missing_before": missing_before,
                    "missing_after": missing_after,
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )

    if not args.skip_size_check:
        bad_sizes = []
        for key in keys:
            before_size = image_size(before_images[key])
            after_size = image_size(after_images[key])
            if before_size != after_size:
                bad_sizes.append(
                    {
                        "key": key,
                        "before_size": before_size,
                        "after_size": after_size,
                    }
                )

        if bad_sizes:
            raise ValueError(
                "Before/after image sizes must match for shared-label annotation:\n"
                + json.dumps(bad_sizes, ensure_ascii=False, indent=2)
            )

    if args.main == "after":
        primary_images = after_images
        related_images = before_images
        related_prefix = "before"
    else:
        primary_images = before_images
        related_images = after_images
        related_prefix = "after"

    archive_plan: list[dict[str, str]] = []
    for key in keys:
        primary = primary_images[key]
        related = related_images[key]
        primary_rel = PurePosixPath(primary.relative_to(after_dir if args.main == "after" else before_dir).as_posix())
        related_name = f"{related_prefix}_{related.name}"
        related_rel = (
            primary_rel.parent
            / "related_images"
            / context_dir_name(primary_rel.name)
            / related_name
        )
        archive_plan.append(
            {
                "primary": zip_path(primary_rel),
                "related": zip_path(related_rel),
                "primary_source": str(primary),
                "related_source": str(related),
            }
        )

    if args.dry_run:
        print(json.dumps({"pairs": archive_plan}, ensure_ascii=False, indent=2))
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in archive_plan:
            add_file(archive, Path(item["primary_source"]), PurePosixPath(item["primary"]))
            add_file(archive, Path(item["related_source"]), PurePosixPath(item["related"]))

    print(
        json.dumps(
            {
                "output": str(output),
                "main": args.main,
                "pairs": len(archive_plan),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
