import { ns } from '#cth/module/lib/config';
import { modLogger } from '#cth/module/lib/logger';

export class CTHManager {
    static identifier = `module.${ns}`;
    initialized = false;

    constructor() {}

    init() {
        this.initialized = true;
    }
}
