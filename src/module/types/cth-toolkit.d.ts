// src/module/types/cth-toolkit.d.ts
import type { CTHManager } from '#cth/module/lib/manager/manager';

declare global {
    var game: Game & {
        cth: CTHManager,
    };

    namespace ClientSettings {
        interface Values {
            'cth-toolkit': {
                [key: string]: unknown;
            };
        }
    }

    // Add namespace-specific overloads instead of generic ones.
    // This avoids the conflict with the "core" overloads in fvtt-types.
    interface ClientSettings {
        get(namespace: 'cth-toolkit', key: string): unknown;
        set(namespace: 'cth-toolkit', key: string, value: unknown): Promise<unknown>;
        register(namespace: 'cth-toolkit', key: string, data: any): void;
    }
}

export {};
