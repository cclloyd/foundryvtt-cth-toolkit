import { modLogger } from '#cth/module/lib/logger';
import { preloadTemplates } from '#cth/module/lib/preloadTemplates';
import { CTHManager } from '#cth/module/lib/manager/manager';

export const initModule = () => {
    modLogger.log('Initializing Ready Check');

    // Preload Handlebars templates
    preloadTemplates().then();

    game.cth = new CTHManager();
};
