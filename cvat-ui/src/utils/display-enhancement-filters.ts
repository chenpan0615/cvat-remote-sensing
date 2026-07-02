// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { BaseImageFilter, SerializedImageFilter } from 'cvat-core-wrapper';
import { ImageFilterAlias } from 'utils/image-processing';

function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function activePixel(alpha: number): boolean {
    return alpha !== 0;
}

function percentileValue(histogram: number[], target: number, defaultValue: number): number {
    let cumulative = 0;
    for (let value = 0; value < histogram.length; value++) {
        cumulative += histogram[value];
        if (cumulative >= target) {
            return value;
        }
    }

    return defaultValue;
}

export class MinMaxStretchFilter extends BaseImageFilter {
    public processImage(src: ImageData, frameNumber: number): ImageData {
        const result = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        const { data } = result;
        const minValues = [255, 255, 255];
        const maxValues = [0, 0, 0];

        for (let offset = 0; offset < data.length; offset += 4) {
            if (!activePixel(data[offset + 3])) continue;

            for (let channel = 0; channel < 3; channel++) {
                const value = data[offset + channel];
                if (value < minValues[channel]) minValues[channel] = value;
                if (value > maxValues[channel]) maxValues[channel] = value;
            }
        }

        const scales = maxValues.map((maxValue, channel) => {
            const range = maxValue - minValues[channel];
            return range > 0 ? 255 / range : 1;
        });

        for (let offset = 0; offset < data.length; offset += 4) {
            if (!activePixel(data[offset + 3])) continue;

            for (let channel = 0; channel < 3; channel++) {
                data[offset + channel] = clampByte((data[offset + channel] - minValues[channel]) * scales[channel]);
            }
        }

        this.currentProcessedImage = frameNumber;
        return result;
    }

    public toJSON(): SerializedImageFilter {
        return {
            alias: ImageFilterAlias.MIN_MAX_STRETCH,
            params: {},
        };
    }
}

export class PercentileStretchFilter extends BaseImageFilter {
    #clipFraction: number;

    constructor(clipFraction = 0.02) {
        super();
        this.#clipFraction = clipFraction;
    }

    public processImage(src: ImageData, frameNumber: number): ImageData {
        const result = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        const { data } = result;
        const histograms = [
            new Array<number>(256).fill(0),
            new Array<number>(256).fill(0),
            new Array<number>(256).fill(0),
        ];
        let total = 0;

        for (let offset = 0; offset < data.length; offset += 4) {
            if (!activePixel(data[offset + 3])) continue;

            for (let channel = 0; channel < 3; channel++) {
                histograms[channel][data[offset + channel]]++;
            }
            total++;
        }

        if (!total) {
            this.currentProcessedImage = frameNumber;
            return result;
        }

        const lowerTarget = Math.max(1, Math.floor(total * this.#clipFraction));
        const upperTarget = Math.min(total, Math.ceil(total * (1 - this.#clipFraction)));
        const lowerValues = histograms.map((histogram) => percentileValue(histogram, lowerTarget, 0));
        const upperValues = histograms.map((histogram) => percentileValue(histogram, upperTarget, 255));

        for (let offset = 0; offset < data.length; offset += 4) {
            if (!activePixel(data[offset + 3])) continue;

            for (let channel = 0; channel < 3; channel++) {
                const range = upperValues[channel] - lowerValues[channel];
                if (range > 0) {
                    data[offset + channel] = clampByte(
                        ((data[offset + channel] - lowerValues[channel]) * 255) / range,
                    );
                }
            }
        }

        this.currentProcessedImage = frameNumber;
        return result;
    }

    public toJSON(): SerializedImageFilter {
        return {
            alias: ImageFilterAlias.PERCENTILE_STRETCH_2,
            params: {
                clipFraction: this.#clipFraction,
            },
        };
    }
}

export class HistogramEqualizationFilter extends BaseImageFilter {
    public processImage(src: ImageData, frameNumber: number): ImageData {
        const result = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        const { data } = result;
        const histogram = new Array<number>(256).fill(0);
        let total = 0;

        for (let offset = 0; offset < data.length; offset += 4) {
            if (!activePixel(data[offset + 3])) continue;

            const luminance = clampByte(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
            histogram[luminance]++;
            total++;
        }

        if (!total) {
            this.currentProcessedImage = frameNumber;
            return result;
        }

        const cdf = new Array<number>(256).fill(0);
        let running = 0;
        let cdfMin = 0;
        for (let i = 0; i < histogram.length; i++) {
            running += histogram[i];
            cdf[i] = running;
            if (!cdfMin && running) cdfMin = running;
        }

        const denominator = total - cdfMin;
        if (denominator <= 0) {
            this.currentProcessedImage = frameNumber;
            return result;
        }

        const lookup = cdf.map((value) => clampByte(((value - cdfMin) / denominator) * 255));
        for (let offset = 0; offset < data.length; offset += 4) {
            if (!activePixel(data[offset + 3])) continue;

            const oldLuminance = clampByte(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
            const newLuminance = lookup[oldLuminance];
            if (oldLuminance > 0) {
                const ratio = newLuminance / oldLuminance;
                data[offset] = clampByte(data[offset] * ratio);
                data[offset + 1] = clampByte(data[offset + 1] * ratio);
                data[offset + 2] = clampByte(data[offset + 2] * ratio);
            } else {
                data[offset] = newLuminance;
                data[offset + 1] = newLuminance;
                data[offset + 2] = newLuminance;
            }
        }

        this.currentProcessedImage = frameNumber;
        return result;
    }

    public toJSON(): SerializedImageFilter {
        return {
            alias: ImageFilterAlias.HISTOGRAM_EQUALIZATION,
            params: {},
        };
    }
}
