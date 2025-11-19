import { ns, shortNS } from '#cth/module/lib/config';

export const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export const enableDebug = () => {
    CONFIG.debug.hooks = true;
};

export const useNamespace = (key: string, short = true) => {
    if (short) return `${shortNS}-${key}`;
    return `${ns}-${key}`;
};

export const localize = (key: string) => {
    if (!game.i18n) return key;
    return game.i18n.localize(key);
};

// export type KEKeys = Extract<keyof ClientSettings.Values[typeof ns], string>;
// export type KEKeys = 'customCompendium' | 'syntaxThemeLight' | 'syntaxThemeDark';

// export const getSetting = <K extends KEKeys & keyof KEModuleSettings>(key: K): KEModuleSettings[K] => {
//     // @ts-ignore
//     return game.settings!.get(ns, key) as KEModuleSettings[K];
// };
//
// export const setSetting = (key: KEKeys, value: unknown) => {
//     // @ts-ignore
//     return game.settings!.set(ns, key, value);
// };

export const getGridSize = (sizeEnum: string | number) => {
    switch (Number(sizeEnum)) {
        case 4:
            return 1;
        case 5:
            return 2;
        case 6:
            return 3;
        case 7:
            return 4;
        case 8:
            return 6;
        default:
            return 1;
    }
};

export const getIconSize = (sizeEnum: string | number) => {
    switch (Number(sizeEnum)) {
        case 0:
            return 0.25;
        case 1:
            return 0.4;
        case 2:
            return 0.55;
        case 3:
            return 0.75;
        default:
            return 1;
    }
};
