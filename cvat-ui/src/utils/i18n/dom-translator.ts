// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { LanguageCode } from './language';
import zhCNTranslations from './zh-cn';

const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Map<string, string>>();
const translatedAttrs = ['title', 'placeholder', 'aria-label'];
const shortcutTailTranslationKeys = Object.keys(zhCNTranslations)
    .filter((key: string): boolean => key.includes(' ') && key.length >= 8)
    .sort((key1: string, key2: string): number => key2.length - key1.length);
let observer: MutationObserver | null = null;
let scheduled = false;
let activeLanguage: LanguageCode = 'zh-CN';

const lowerTermTranslations: Record<string, string> = {
    rectangle: '矩形',
    polygon: '多边形',
    polyline: '折线',
    points: '点',
    ellipse: '椭圆',
    cuboid: '立方体',
    mask: '掩膜',
    skeleton: '骨架',
    tag: '标记',
    shape: '形状',
    track: '轨迹',
    completed: '已完成',
    rejected: '已拒绝',
    new: '新建',
    'in progress': '进行中',
};
const shortcutTailWords = new Set([
    'ctrl',
    'shift',
    'alt',
    'cmd',
    'command',
    'meta',
    'space',
    'enter',
    'esc',
    'escape',
    'tab',
    'delete',
    'backspace',
    'left',
    'right',
    'up',
    'down',
    'arrow',
]);

function shouldSkipElement(element: Element): boolean {
    return !!element.closest([
        'script',
        'style',
        'code',
        'pre',
        'canvas',
        'svg',
        'textarea',
        '[data-cvat-no-i18n]',
        '.cvat-canvas-container',
    ].join(','));
}

function translateKnownTerm(value: string): string {
    const lowerValue = value.toLowerCase();
    return lowerTermTranslations[lowerValue] ?? zhCNTranslations[value] ?? value;
}

function looksLikeShortcutTail(value: string): boolean {
    const tokens = value.toLowerCase().replace(/[+()[\]/"'.,-]/g, ' ').trim().split(/\s+/);
    return tokens.length > 0 && tokens.every((token: string): boolean => (
        shortcutTailWords.has(token) || /^[a-z0-9]$/.test(token) || /^f\d{1,2}$/.test(token)
    ));
}

function translateText(value: string): string | null {
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) return null;

    if (zhCNTranslations[normalized]) {
        return `${leading}${zhCNTranslations[normalized]}${trailing}`;
    }

    for (const key of shortcutTailTranslationKeys) {
        if (normalized.startsWith(`${key} `)) {
            const suffix = normalized.slice(key.length + 1);
            if (looksLikeShortcutTail(suffix)) {
                return `${leading}${zhCNTranslations[key]} ${suffix}${trailing}`;
            }
        }
    }

    const iconSuffixes = [
        'filter',
        'ordered-list',
        'search',
        'download',
        'upload',
        'plus',
        'delete',
        'edit',
        'setting',
        'settings',
    ];
    for (const suffix of iconSuffixes) {
        if (normalized.endsWith(` ${suffix}`)) {
            const textBeforeIcon = normalized.slice(0, -suffix.length - 1);
            if (zhCNTranslations[textBeforeIcon]) {
                return `${leading}${zhCNTranslations[textBeforeIcon]}${trailing}`;
            }
        }
    }

    const pressShortcut = normalized.match(/^Press (.+) to switch$/);
    if (pressShortcut) {
        return `${leading}按 ${pressShortcut[1]} 切换${trailing}`;
    }

    const pressToFinish = normalized.match(/^Press "(.+)" to finish$/);
    if (pressToFinish) {
        return `${leading}按 "${pressToFinish[1]}" 完成绘制${trailing}`;
    }

    const pressToDrawAgain = normalized.match(/^Press (.+) to draw again$/);
    if (pressToDrawAgain) {
        return `${leading}按 ${pressToDrawAgain[1]} 再次绘制${trailing}`;
    }

    const pressToPostpone = normalized.match(/^Press "(.+)" to postpone running the algorithm$/);
    if (pressToPostpone) {
        return `${leading}按 "${pressToPostpone[1]}" 暂缓运行算法${trailing}`;
    }

    const drawNewShape = normalized.match(
        /^Draw new (rectangle|polygon|polyline|points|ellipse|cuboid|mask|skeleton)$/,
    );
    if (drawNewShape) {
        return `${leading}绘制新${translateKnownTerm(drawNewShape[1])}${trailing}`;
    }

    const currentLayer = normalized.match(/^Open layer stack\. Current layer (.+)$/);
    if (currentLayer) {
        return `${leading}打开图层栈。当前图层 ${currentLayer[1]}${trailing}`;
    }

    const jobState = normalized.match(/^Job state will be switched to "(.+)"$/);
    if (jobState) {
        return `${leading}作业状态将切换为 "${translateKnownTerm(jobState[1])}"${trailing}`;
    }

    const undoRedoAction = normalized.match(/^(Undo|Redo): (.+)$/);
    if (undoRedoAction) {
        return `${leading}${zhCNTranslations[undoRedoAction[1]]}：${undoRedoAction[2]}${trailing}`;
    }

    const resourceWithID = normalized.match(/^(Project|Task|Job) #(.+)$/);
    if (resourceWithID) {
        return `${leading}${zhCNTranslations[resourceWithID[1]]} #${resourceWithID[2]}${trailing}`;
    }

    const frameNumber = normalized.match(/^Frame (.+)$/);
    if (frameNumber) {
        return `${leading}帧 ${frameNumber[1]}${trailing}`;
    }

    const waitingForModel = normalized.match(/^Waiting for a response from (.+)$/);
    if (waitingForModel) {
        return `${leading}正在等待 ${waitingForModel[1]} 响应${trailing}`;
    }

    const selectedObjects = normalized.match(/^(\d+) objects? selected$/);
    if (selectedObjects) {
        return `${leading}已选中 ${selectedObjects[1]} 个对象${trailing}`;
    }

    const resourceCount = normalized.match(/^(\d+) (projects?|tasks?|jobs?|frames?|objects?|issues?|comments?)$/);
    if (resourceCount) {
        const resource = resourceCount[2].replace(/s$/, '');
        const translated = zhCNTranslations[resource[0].toUpperCase() + resource.slice(1)];
        if (translated) {
            return `${leading}${resourceCount[1]} 个${translated}${trailing}`;
        }
    }

    return null;
}

function translateTextNode(node: Text, language: LanguageCode): void {
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;

    if (language === 'en') {
        const original = textOriginals.get(node);
        if (original !== undefined && node.nodeValue !== original) {
            node.replaceData(0, node.length, original);
        }
        return;
    }

    const current = node.nodeValue ?? '';
    const original = textOriginals.get(node) ?? current;
    const translated = translateText(original);
    if (translated !== null && translated !== current) {
        if (!textOriginals.has(node)) {
            textOriginals.set(node, original);
        }
        node.replaceData(0, node.length, translated);
    }
}

function getOriginalAttrMap(element: Element): Map<string, string> {
    let map = attrOriginals.get(element);
    if (!map) {
        map = new Map<string, string>();
        attrOriginals.set(element, map);
    }
    return map;
}

function translateElementAttrs(element: Element, language: LanguageCode): void {
    if (shouldSkipElement(element)) return;

    for (const attr of translatedAttrs) {
        const originalMap = attrOriginals.get(element);
        if (language === 'en') {
            const original = originalMap?.get(attr);
            if (original !== undefined) {
                element.setAttribute(attr, original);
            }
            continue;
        }

        const current = element.getAttribute(attr);
        if (!current) continue;

        const original = originalMap?.get(attr) ?? current;
        const translated = translateText(original);
        if (translated !== null && translated !== current) {
            getOriginalAttrMap(element).set(attr, original);
            element.setAttribute(attr, translated);
        }
    }
}

function translateSubtree(root: Node, language: LanguageCode): void {
    if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root as Text, language);
        return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
        return;
    }

    const rootElement = root.nodeType === Node.ELEMENT_NODE ? root as Element : null;
    if (rootElement) {
        translateElementAttrs(rootElement, language);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT + NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text, language);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            translateElementAttrs(node as Element, language);
        }
        node = walker.nextNode();
    }
}

function scheduleTranslation(): void {
    if (scheduled) return;

    scheduled = true;
    window.requestAnimationFrame(() => {
        scheduled = false;
        translateSubtree(document.body, activeLanguage);
    });
}

export function applyLanguage(language: LanguageCode): void {
    activeLanguage = language;
    document.documentElement.lang = language;
    translateSubtree(document.body, language);
}

export function startDomTranslator(language: LanguageCode): () => void {
    activeLanguage = language;
    applyLanguage(language);

    observer?.disconnect();
    observer = new MutationObserver(scheduleTranslation);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: translatedAttrs,
    });

    return () => {
        observer?.disconnect();
        observer = null;
    };
}
