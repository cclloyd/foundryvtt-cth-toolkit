import { initModule } from '#cth/module/hooks/init';
import { ready } from '#cth/module/hooks/ready';

// Initialize module
Hooks.once('init', initModule);
// Hooks.once('i18nInit', initLocalization);
Hooks.once('ready', ready);
