// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect } from 'react';
import ConfigProvider from 'antd/lib/config-provider';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

import {
    getCurrentLanguage,
    LANGUAGE_CHANGE_EVENT,
    LanguageCode,
    normalizeLanguage,
} from 'utils/i18n/language';
import { applyLanguage, startDomTranslator } from 'utils/i18n/dom-translator';

interface Props {
    children: React.ReactNode;
}

export default function LanguageProvider(props: Props): JSX.Element {
    const { children } = props;
    const language: LanguageCode = getCurrentLanguage();

    useEffect(() => {
        dayjs.locale(language === 'zh-CN' ? 'zh-cn' : 'en');
        const stopTranslator = startDomTranslator(language);

        const onLanguageChange = (event: Event): void => {
            const nextLanguage = normalizeLanguage((event as CustomEvent).detail?.language);
            dayjs.locale(nextLanguage === 'zh-CN' ? 'zh-cn' : 'en');
            applyLanguage(nextLanguage);
        };

        window.addEventListener(LANGUAGE_CHANGE_EVENT, onLanguageChange);
        return () => {
            window.removeEventListener(LANGUAGE_CHANGE_EVENT, onLanguageChange);
            stopTranslator();
        };
    }, []);

    return (
        <ConfigProvider locale={language === 'zh-CN' ? zhCN : undefined}>
            {children}
        </ConfigProvider>
    );
}
