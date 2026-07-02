// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Checkbox, { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { Row, Col } from 'antd/lib/grid';
import Text from 'antd/lib/typography/Text';

import { enableImageFilter, disableImageFilter } from 'actions/settings-actions';
import { CombinedState } from 'reducers';
import {
    HistogramEqualizationFilter,
    MinMaxStretchFilter,
    PercentileStretchFilter,
} from 'utils/display-enhancement-filters';
import { ImageFilterAlias, hasFilter } from 'utils/image-processing';

export default function DisplayEnhancementFilters(): JSX.Element {
    const dispatch = useDispatch();
    const filters = useSelector((state: CombinedState) => state.settings.imageFilters);
    const histogramFilter = hasFilter(filters, ImageFilterAlias.HISTOGRAM_EQUALIZATION);
    const minMaxFilter = hasFilter(filters, ImageFilterAlias.MIN_MAX_STRETCH);
    const percentileStretch2Filter = hasFilter(filters, ImageFilterAlias.PERCENTILE_STRETCH_2);

    const switchHistogramFilter = useCallback((event: CheckboxChangeEvent): void => {
        if (event.target.checked) {
            if (!histogramFilter) {
                dispatch(enableImageFilter({
                    modifier: new HistogramEqualizationFilter(),
                    alias: ImageFilterAlias.HISTOGRAM_EQUALIZATION,
                }));
            }
        } else {
            dispatch(disableImageFilter(ImageFilterAlias.HISTOGRAM_EQUALIZATION));
        }
    }, [histogramFilter]);

    const switchMinMaxFilter = useCallback((event: CheckboxChangeEvent): void => {
        if (event.target.checked) {
            if (!minMaxFilter) {
                dispatch(disableImageFilter(ImageFilterAlias.PERCENTILE_STRETCH_2));
                dispatch(enableImageFilter({
                    modifier: new MinMaxStretchFilter(),
                    alias: ImageFilterAlias.MIN_MAX_STRETCH,
                }));
            }
        } else {
            dispatch(disableImageFilter(ImageFilterAlias.MIN_MAX_STRETCH));
        }
    }, [minMaxFilter]);

    const switchPercentileStretch2Filter = useCallback((event: CheckboxChangeEvent): void => {
        if (event.target.checked) {
            if (!percentileStretch2Filter) {
                dispatch(disableImageFilter(ImageFilterAlias.MIN_MAX_STRETCH));
                dispatch(enableImageFilter({
                    modifier: new PercentileStretchFilter(),
                    alias: ImageFilterAlias.PERCENTILE_STRETCH_2,
                }));
            }
        } else {
            dispatch(disableImageFilter(ImageFilterAlias.PERCENTILE_STRETCH_2));
        }
    }, [percentileStretch2Filter]);

    return (
        <div className='cvat-image-setups-display-enhancements'>
            <Row justify='space-around'>
                <Col span={24}>
                    <Row className='cvat-image-setups-histogram-equalization' align='middle'>
                        <Col span={6}>
                            <Text className='cvat-text-color'> Histogram </Text>
                        </Col>
                        <Col span={12}>
                            <Checkbox
                                checked={!!histogramFilter}
                                onChange={switchHistogramFilter}
                            >
                                <Text className='cvat-text-color'> Equalization </Text>
                            </Checkbox>
                        </Col>
                    </Row>
                    <Row className='cvat-image-setups-min-max-stretch' align='middle'>
                        <Col span={6}>
                            <Text className='cvat-text-color'> Stretch </Text>
                        </Col>
                        <Col span={12}>
                            <Checkbox
                                checked={!!minMaxFilter}
                                onChange={switchMinMaxFilter}
                            >
                                <Text className='cvat-text-color'> Min-max </Text>
                            </Checkbox>
                        </Col>
                    </Row>
                    <Row className='cvat-image-setups-percentile-stretch-2' align='middle'>
                        <Col span={6}>
                            <Text className='cvat-text-color'> Stretch </Text>
                        </Col>
                        <Col span={12}>
                            <Checkbox
                                checked={!!percentileStretch2Filter}
                                onChange={switchPercentileStretch2Filter}
                            >
                                <Text className='cvat-text-color'> 2% linear </Text>
                            </Checkbox>
                        </Col>
                    </Row>
                </Col>
            </Row>
        </div>
    );
}
