// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

export type LanguageCode = 'en' | 'zh-CN';

export const LANGUAGE_STORAGE_KEY = 'cvatLanguage';
export const LANGUAGE_CHANGE_EVENT = 'cvat:language-change';

export function normalizeLanguage(language: string | null): LanguageCode {
    return language === 'en' ? 'en' : 'zh-CN';
}

export function getCurrentLanguage(): LanguageCode {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function setCurrentLanguage(language: LanguageCode): void {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language } }));
}
