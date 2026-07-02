// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { shallowEqual } from 'utils/redux';
import PropTypes from 'prop-types';
import notification from 'antd/lib/notification';
import Radio from 'antd/lib/radio';
import Slider from 'antd/lib/slider';
import Spin from 'antd/lib/spin';
import Text from 'antd/lib/typography/Text';
import { SettingOutlined } from '@ant-design/icons';

import CVATTooltop from 'components/common/cvat-tooltip';
import { CombinedState } from 'reducers';
import ContextImageSelector from './context-image-selector';

interface Props {
    offset: number[];
}

type ChangeDetectionViewMode = 'after' | 'side-by-side' | 'swipe' | 'overlay';

function CanvasWithImage({
    image,
    className,
}: {
    image: ImageBitmap;
    className?: string;
}): JSX.Element {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (ref.current) {
            const context = ref.current.getContext('2d');
            if (context) {
                ref.current.width = image.width;
                ref.current.height = image.height;
                context.clearRect(0, 0, image.width, image.height);
                context.drawImage(image, 0, 0);
            }
        }
    }, [image]);

    return <canvas ref={ref} className={className} />;
}

CanvasWithImage.defaultProps = {
    className: '',
};

function getSliderValue(value: number | [number, number]): number {
    return Array.isArray(value) ? value[0] : value;
}

function ContextImage(props: Props): JSX.Element {
    const { offset } = props;
    const defaultFrameOffset = (offset[0] || 0);
    const defaultContextImageOffset = (offset[1] || 0);

    const {
        job,
        frame,
        frameData,
        relatedFiles,
    } = useSelector((state: CombinedState) => ({
        job: state.annotation.job.instance!,
        frame: state.annotation.player.frame.number,
        frameData: state.annotation.player.frame.data,
        relatedFiles: state.annotation.player.frame.relatedFiles,
    }), shallowEqual);
    const frameIndex = frame + defaultFrameOffset;

    const [contextImageData, setContextImageData] = useState<Record<string, ImageBitmap>>({});
    const [primaryImageData, setPrimaryImageData] = useState<ImageBitmap | null>(null);
    const [fetching, setFetching] = useState<boolean>(false);
    const [fetchingPrimary, setFetchingPrimary] = useState<boolean>(false);
    const [contextImageOffset, setContextImageOffset] = useState<number>(
        Math.min(defaultContextImageOffset, relatedFiles),
    );

    const [hasError, setHasError] = useState<boolean>(false);
    const [showSelector, setShowSelector] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<ChangeDetectionViewMode>('after');
    const [swipePosition, setSwipePosition] = useState<number>(50);
    const [overlayOpacity, setOverlayOpacity] = useState<number>(50);

    useEffect(() => {
        let unmounted = false;
        const promise = job.frames.contextImage(frameIndex);
        setFetching(true);
        promise.then((imageBitmaps: Record<string, ImageBitmap>) => {
            if (!unmounted) {
                setContextImageData(imageBitmaps);
            }
        }).catch((error: any) => {
            if (!unmounted) {
                setHasError(true);
                notification.error({
                    message: `Could not fetch context images. Frame: ${frameIndex}`,
                    description: error.toString(),
                });
            }
        }).finally(() => {
            if (!unmounted) {
                setFetching(false);
            }
        });

        return () => {
            setContextImageData({});
            unmounted = true;
        };
    }, [frameIndex]);

    useEffect(() => {
        let unmounted = false;

        if (viewMode === 'after' || !frameData) {
            setPrimaryImageData(null);
            setFetchingPrimary(false);
            return () => {
                unmounted = true;
            };
        }

        setFetchingPrimary(true);
        frameData.data().then(async ({
            imageData,
        }: {
            imageData: ImageBitmap | Blob;
        }) => {
            const image = imageData instanceof Blob ? await createImageBitmap(imageData) : imageData;
            if (!unmounted) {
                setPrimaryImageData(image);
            }
        }).catch((error: any) => {
            if (!unmounted) {
                notification.error({
                    message: `Could not fetch primary image. Frame: ${frameIndex}`,
                    description: error.toString(),
                });
            }
        }).finally(() => {
            if (!unmounted) {
                setFetchingPrimary(false);
            }
        });

        return () => {
            unmounted = true;
        };
    }, [frameData, frameIndex, viewMode]);

    const contextImageKeys = Object.keys(contextImageData).sort();
    const contextImageName = contextImageKeys[contextImageOffset];
    const contextImage = contextImageData[contextImageName];
    const contextImageNameLower = (contextImageName || '').toLowerCase();
    let contextRole: 'before' | 'after' | '' = '';
    if (contextImageNameLower.startsWith('before')) {
        contextRole = 'before';
    } else if (contextImageNameLower.startsWith('after')) {
        contextRole = 'after';
    }

    let primaryImageTitle = 'Frame';
    let contextImageTitle = 'Context';
    if (contextRole === 'before') {
        primaryImageTitle = 'After';
        contextImageTitle = 'Before';
    } else if (contextRole === 'after') {
        primaryImageTitle = 'Before';
        contextImageTitle = 'After';
    }

    const renderImageView = (): JSX.Element | null => {
        if (!contextImage) {
            return null;
        }

        if (viewMode === 'after') {
            return <CanvasWithImage image={contextImage} className='cvat-context-image-canvas' />;
        }

        if (!primaryImageData) {
            return fetchingPrimary ? <Spin size='small' /> : <Text> No primary image </Text>;
        }

        if (viewMode === 'side-by-side') {
            return (
                <div className='cvat-change-detection-side-by-side-view'>
                    <div>
                        <Text>{primaryImageTitle}</Text>
                        <CanvasWithImage image={primaryImageData} />
                    </div>
                    <div>
                        <Text>{contextImageTitle}</Text>
                        <CanvasWithImage image={contextImage} />
                    </div>
                </div>
            );
        }

        return (
            <div className='cvat-change-detection-layered-view'>
                <CanvasWithImage image={primaryImageData} className='cvat-change-detection-layered-image' />
                <div
                    className='cvat-change-detection-layered-image cvat-change-detection-after-layer'
                    style={{
                        clipPath: viewMode === 'swipe' ?
                            `inset(0 ${100 - swipePosition}% 0 0)` : undefined,
                        opacity: viewMode === 'overlay' ? overlayOpacity / 100 : undefined,
                    }}
                >
                    <CanvasWithImage image={contextImage} />
                </div>
                { viewMode === 'swipe' && (
                    <div
                        className='cvat-change-detection-swipe-line'
                        style={{ left: `${swipePosition}%` }}
                    />
                )}
            </div>
        );
    };

    return (
        <div className='cvat-context-image-wrapper'>
            <div className='cvat-context-image-header'>
                { relatedFiles > 1 && (
                    <SettingOutlined
                        className='cvat-context-image-setup-button'
                        onClick={() => {
                            setShowSelector(true);
                        }}
                    />
                )}
                <div className='cvat-context-image-title'>
                    <CVATTooltop title={contextImageName}>
                        <Text>{contextImageName}</Text>
                    </CVATTooltop>
                </div>
                <Radio.Group
                    className='cvat-change-detection-view-mode'
                    size='small'
                    value={viewMode}
                    onChange={(event: any) => {
                        setViewMode(event.target.value);
                    }}
                >
                    <Radio.Button value='after'>Context</Radio.Button>
                    <Radio.Button value='side-by-side'>A/B</Radio.Button>
                    <Radio.Button value='swipe'>Swipe</Radio.Button>
                    <Radio.Button value='overlay'>Blend</Radio.Button>
                </Radio.Group>
            </div>
            { (hasError ||
                (!fetching && contextImageOffset >= Object.keys(contextImageData).length)) && <Text> No data </Text>}
            { fetching && <Spin size='small' /> }
            {
                contextImageOffset < Object.keys(contextImageData).length &&
                renderImageView()
            }
            { viewMode === 'swipe' && primaryImageData && (
                <Slider
                    className='cvat-change-detection-slider'
                    value={swipePosition}
                    onChange={(value: number | [number, number]) => {
                        setSwipePosition(getSliderValue(value));
                    }}
                    min={0}
                    max={100}
                />
            )}
            { viewMode === 'overlay' && primaryImageData && (
                <Slider
                    className='cvat-change-detection-slider'
                    value={overlayOpacity}
                    onChange={(value: number | [number, number]) => {
                        setOverlayOpacity(getSliderValue(value));
                    }}
                    min={0}
                    max={100}
                />
            )}
            { showSelector && (
                <ContextImageSelector
                    images={contextImageData}
                    offset={contextImageOffset}
                    onChangeOffset={(newContextImageOffset: number) => {
                        setContextImageOffset(newContextImageOffset);
                    }}
                    onClose={() => {
                        setShowSelector(false);
                    }}
                />
            )}
        </div>
    );
}

ContextImage.PropType = {
    offset: PropTypes.arrayOf(PropTypes.number),
};

export default React.memo(ContextImage);
