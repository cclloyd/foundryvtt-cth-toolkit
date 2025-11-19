import { baseClass, ns } from '#cth/module/lib/config';
import { getGridSize, getIconSize, localize, sleep, useNamespace } from '#cth/module/lib/util';

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
        actions: {
            setSize: this.prototype.setSize,
        },
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

        // Start having img follow mouse cursor here until placed
        const texture = await loadTexture(formData.img);
        const preview = new PIXI.Sprite(texture);
        preview.anchor.set(0.5);
        preview.alpha = 0.6;
        preview.height = gridSize * canvas!.grid!.size;
        preview.width = gridSize * canvas!.grid!.size;

        preview.position.set(-10000, -10000);
        // Use a top-level overlay layer so it renders above the scene
        canvas!.interface!.addChild(preview);
        const snapMode = gridSize % 2 ? CONST.GRID_SNAPPING_MODES.CENTER : CONST.GRID_SNAPPING_MODES.CORNER;
        const moveHandler = (e: any) => {
            const { x, y } = e.data.getLocalPosition(canvas!.stage);
            const snapped = canvas!.grid!.getSnappedPoint({ x, y }, { mode: snapMode });
            preview.position.set(snapped.x, snapped.y);
        };

        const cleanup = () => {
            canvas!.stage!.off('mousemove', moveHandler);
            if (preview.parent) preview.parent.removeChild(preview);
            preview.destroy({ children: true });
        };

        canvas!.stage!.on('mousemove', moveHandler);
        canvas!.stage!.once('rightdown', () => cleanup());
        canvas!.stage!.once('mousedown', async (event: any) => {
            const { x, y } = event.data.getLocalPosition(canvas!.stage);
            const snapped = canvas!.grid!.getSnappedPoint({ x, y }, { mode: snapMode });
            const sizePxLocal = gridSize * canvas!.grid!.size;

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
                x: snapped.x - sizePxLocal / 2,
                y: snapped.y - sizePxLocal / 2,
                actorLink: false,
            };

            if (formData.lantern) {
                tokenData.light = {
                    dim: 40,
                    bright: 20,
                    angle: 360,
                    color: '#000000',
                    alpha: 0.0,
                };
            }

            await canvas!.scene!.createEmbeddedDocuments('Token', [tokenData]);
            ui.notifications!.info(`Created token: ${formData.name}`);
            game.user!.setFlag(ns, 'dialog.newToken', formData);
            cleanup();
        });
    }

    setSize(event: JQuery.ClickEvent<HTMLElement, undefined, HTMLElement, HTMLElement>) {
        event.preventDefault();
        const $app = this.getRootHtml();
        const size = event.target.dataset.size!;
        $app.find(`[name="size"]`).val(size);
        $app.find(`.size-button.active`).removeClass('active');
        $app.find(`.size-button[data-size="${size}"]`).addClass('active');
    }

    getRootHtml() {
        return $(`#${(this.constructor as typeof ApplicationNewToken).DEFAULT_OPTIONS.id}`);
    }

    getBorderColor(disposition: any, opacity = 0.5) {
        switch (Number(disposition)) {
            case 1:
                return `rgba(0, 255, 0, ${opacity})`;
            case 0:
                return `rgba(255, 255, 255, ${opacity})`;
            case -1:
                return `rgba(255, 0, 0, ${opacity})`;
            case -2:
                return `rgba(255, 255, 0, ${opacity})`;
            default:
                return 'none';
        }
    }

    async _onRender(context: any, options: RenderOptions) {
        // Need to use _onRender instead of actions for non-click listeners
        await super._onRender(context, options);
        const $app = this.getRootHtml();

        const $disposition = $app.find('[name="disposition"]');
        const $img = $app.find('[name="img"]');
        const $preview = $app.find('.avatar img');

        // Handle image preview change
        $app.find('[name="img"]').on('change', (event: JQuery.ChangeEvent<HTMLInputElement>) => {
            $preview.attr('src', event.target.value);
            $preview.css(
                'filter',
                `drop-shadow(0 0 5px ${this.getBorderColor($disposition.val(), event.target.value === 'icons/svg/mystery-man.svg' ? 1 : 0.5)})`,
            );
        });

        // Handle disposition change
        $disposition.on('change', (event: JQuery.ChangeEvent<HTMLInputElement>) => {
            $preview.css('filter', `drop-shadow(0 0 5px ${this.getBorderColor(event.target.value, $img.val() === 'icons/svg/mystery-man.svg' ? 1 : 0.5)})`);
        });

        // Run certain events once on initial render
        $app.find(`.size-button[data-size="${$app.find(`[name="size"]`).val()}"]`).addClass('active');
        $preview.css('filter', `drop-shadow(0 0 5px ${this.getBorderColor($disposition.val(), $img.val() === 'icons/svg/mystery-man.svg' ? 1 : 0.5)})`);
    }
}
