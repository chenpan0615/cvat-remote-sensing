// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Button from 'antd/lib/button';
import { TranslationOutlined } from '@ant-design/icons';

import CVATTooltip from 'components/common/cvat-tooltip';
import {
    getCurrentLanguage,
    LANGUAGE_CHANGE_EVENT,
    LanguageCode,
    normalizeLanguage,
    setCurrentLanguage,
} from 'utils/i18n/language';

export default function LanguageSwitcher(): JSX.Element {
    const [language, setLanguage] = useState<LanguageCode>(getCurrentLanguage());

    useEffect(() => {
        const onLanguageChange = (event: Event): void => {
            setLanguage(normalizeLanguage((event as CustomEvent).detail?.language));
        };

        window.addEventListener(LANGUAGE_CHANGE_EVENT, onLanguageChange);
        return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, onLanguageChange);
    }, []);

    const nextLanguage = language === 'zh-CN' ? 'en' : 'zh-CN';
    const label = language === 'zh-CN' ? 'EN' : '中文';

    return (
        <CVATTooltip overlay={language === 'zh-CN' ? 'Switch to English' : '切换到中文'}>
            <Button
                icon={<TranslationOutlined />}
                size='large'
                className='cvat-language-switcher-button cvat-header-button'
                type='link'
                onClick={(event: React.MouseEvent): void => {
                    event.preventDefault();
                    setCurrentLanguage(nextLanguage);
                }}
            >
                {label}
            </Button>
        </CVATTooltip>
    );
}
