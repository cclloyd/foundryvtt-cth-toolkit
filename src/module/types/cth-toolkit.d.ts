// src/module/types/cth-toolkit.d.ts
import type { CTHManager } from '#cth/module/lib/manager/manager';

export type ns = 'cth-toolkit';

declare global {
    var game: Game & {
        cth: CTHManager;
    };

    interface FlagConfig {
        [key in ns]: {
            dialog: Record<string, any>;
        };
    }

    namespace ClientSettings {
        interface Values {
            [key in ns]: {
                [key: string]: unknown;
            };
        }
    }

    interface ClientSettings {
        get(namespace: ns, key: string): unknown;
        set(namespace: ns, key: string, value: unknown): Promise<unknown>;
        register(namespace: ns, key: string, data: any): void;
    }

    interface User {
        getFlag(scope: ns, key: string): unknown;
        setFlag(scope: ns, key: string, value: unknown): Promise<unknown>;
        unsetFlag(scope: ns, key: string): Promise<unknown>;
    }

    // Optional if other documents will use your flags
    interface Document {
        getFlag(scope: ns, key: string): unknown;
        setFlag(scope: ns, key: string, value: unknown): Promise<unknown>;
        unsetFlag(scope: ns, key: string): Promise<unknown>;
    }
}

export {};
