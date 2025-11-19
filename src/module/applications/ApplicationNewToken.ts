import { baseClass, ns } from '#cth/module/lib/config';
import { getGridSize, getIconSize, localize, useNamespace } from '#cth/module/lib/util';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
type RenderOptions = foundry.applications.api.ApplicationV2.RenderOptions;
type DefaultOptions = foundry.applications.api.ApplicationV2.DefaultOptions;
type RenderContext = foundry.applications.api.ApplicationV2.RenderContext;

export class ApplicationNewToken extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options?: RenderOptions, config?: any) {
        // @ts-ignore
        super(options);
    }

    static PARTS = {
        root: {
            template: `modules/${ns}/templates/dialogs/newToken.hbs`,
            scrollable: [''],
        },
    };

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        id: useNamespace('newToken'),
        tag: 'form',
        form: {
            handler: this.#onSubmit,
            closeOnSubmit: true,
        },
        window: {
            icon: 'fas fa-user-plus',
            title: 'New Unlinked Token',
            contentClasses: [baseClass],
            resizable: false,
            minimizable: true,
        },
        actions: {},
    } as DefaultOptions;

    get title() {
        return `${localize(this.options.window.title)}`;
    }

    async _prepareContext(options: RenderOptions) {
        return {
            ns: ns,
            formData: game.user!.getFlag(ns, 'dialog.newToken'),
        } as unknown as Promise<RenderContext>;
    }

    static async #onSubmit(event: Event, form: any, rawFormData: FormDataExtended) {
        event.preventDefault();
        const formData = rawFormData.object as Record<string, string>;
        const gridSize = getGridSize(formData.size);
        const iconSize = getIconSize(formData.size);

        ui.notifications!.info('Click on the canvas to place the token.');

        canvas!.stage!.once('mousedown', async (event: any) => {
            const { x, y } = event.data.getLocalPosition(canvas!.stage);
            const snapped = canvas!.grid!.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
            const sizePx = gridSize * canvas!.grid!.size;
            // Basic Token Data
            const tokenData: any = {
                name: formData.name,
                texture: {
                    src: formData.img,
                    scaleX: iconSize,
                    scaleY: iconSize,
                },
                disposition: formData.disposition,
                displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
                width: gridSize,
                height: gridSize,
                x: snapped.x - sizePx / 2,
                y: snapped.y - sizePx / 2,
                actorLink: false,
            };

            // Add Light Data if requested
            if (formData.lantern) {
                tokenData.light = {
                    dim: 60,
                    bright: 30,
                    angle: 360,
                    color: '#000000',
                    alpha: 0.0,
                };
            }

            // Create the Token
            await canvas!.scene!.createEmbeddedDocuments('Token', [tokenData]);
            ui.notifications!.info(`Created token: ${formData.name}`);

            game.user!.setFlag(ns, 'dialog.newToken', formData);
        });
    }
}
