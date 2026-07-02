# Change Detection Pair Archives

This utility prepares a CVAT image archive for two-temporal change-detection annotation.
It keeps CVAT's normal 2D task model unchanged:

- the selected main temporal image becomes the editable CVAT frame;
- the other temporal image is stored as a `related_images` context image;
- annotations are saved on the main frame and can be exported with the usual CVAT formats.

## Example

```bash
python utils/change_detection/prepare_cvat_pairs.py \
  --before-dir /data/cd/before \
  --after-dir /data/cd/after \
  --output /data/cd/cvat_change_detection.zip \
  --main after
```

Upload `cvat_change_detection.zip` as a normal image task. In the annotation page,
CVAT will show the after image as the editable frame and the before image as the
context image. The context-image panel includes A/B, swipe, and blend views.

Before and after images are matched by relative path without the file extension,
for example `before/tile_001.tif` matches `after/tile_001.png`. The utility checks
that matched images have the same pixel size unless `--skip-size-check` is used.
