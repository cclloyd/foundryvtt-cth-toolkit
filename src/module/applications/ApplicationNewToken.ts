import { baseClass, ns } from '#cth/module/lib/config';
import { localize, useNamespace } from '#cth/module/lib/util';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
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
        } as unknown as Promise<RenderContext>;
    }

    static async #onSubmit(event: Event, form: any, rawFormData: FormDataExtended) {
        event.preventDefault();
        const formData = rawFormData.object as Record<string, string>;
    }
}
