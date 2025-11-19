import { ns } from '#cth/module/lib/config';
import { CTHApps } from '#cth/module/lib/manager/apps';
import { CTHMacros } from '#cth/module/lib/manager/macros';

export class CTHManager {
    static identifier = `module.${ns}`;
    initialized = false;
    macros = CTHMacros;
    apps = CTHApps;

    constructor() {}

    init() {
        this.initialized = true;
    }
}
