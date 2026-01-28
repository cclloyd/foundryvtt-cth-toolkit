export class CTHMacros {
    static async createToken() {
        new game.cth.apps.ApplicationNewToken().render({ force: true });
    }

    static async tokenizeAllActors(compendium = undefined, moveToCompendium = false, deleteOriginals = false) {
        // Foundry VTT v13 + PF1 macro: tokenizeAllActors (non-player actors)
        //
        // Config
        const DELETE_ACTORS = deleteOriginals ?? false; // default false
        const MOVE_TO_COMPENDIUM = moveToCompendium ?? false; // default false
        const COMPENDIUM_KEY = compendium ?? 'world.heavy-rain-actors'; // used only if MOVE_TO_COMPENDIUM=true

        if (!canvas?.scene) return ui.notifications.error('No active scene.');

        const scene = canvas.scene;
        const gridSizePx = canvas.grid.size;

        // Spacing rules (in grid units)
        const GAP_BETWEEN_TOKENS = 0; // no gap between adjacent tokens
        const GAP_BETWEEN_LETTERS = 3; // gap between letter groups within a size group
        const GAP_BETWEEN_ROWS_SAME_SIZE = 3; // gap between wrapped rows within same size group
        const GAP_BETWEEN_SIZE_GROUPS = 6; // gap between size groups (each size starts a new block)

        // Token name display setting
        const DISPLAY_NAME_MODE = 30;

        // Helpers
        const normFolderPath = (folder) => {
            const names = [];
            let f = folder;
            while (f) {
                names.unshift((f.name ?? '').trim());
                f = f.parent;
            }
            return names.filter(Boolean).join('/');
        };

        const ensureFolderPath = async (type, path) => {
            if (!path) return null;

            const parts = String(path)
                .split('/')
                .map((p) => p.trim())
                .filter(Boolean);
            let parent = null;

            for (const part of parts) {
                const existing = game.folders?.find((f) => f.type === type && f.name === part && (parent ? f.folder?.id === parent.id : !f.folder));
                parent = existing ?? (await Folder.create({ name: part, type, folder: parent?.id ?? null }));
            }

            return parent;
        };

        const getPack = () => {
            const pack = game.packs.get(COMPENDIUM_KEY);
            if (!pack) throw new Error(`Compendium not found: ${COMPENDIUM_KEY}`);
            if (pack.documentName !== 'Actor') throw new Error(`Compendium ${COMPENDIUM_KEY} is not an Actor pack.`);
            return pack;
        };

        const clampFloorToGrid = (px) => Math.max(0, Math.floor(px / gridSizePx));

        // 1) Clear existing tokens in the scene
        const existingTokenIds = scene.tokens?.map((t) => t.id) ?? [];
        if (existingTokenIds.length) {
            await scene.deleteEmbeddedDocuments('Token', existingTokenIds);
        }

        // 2) Collect non-player actors
        const entries = game.actors
            .filter((a) => a && !a.hasPlayerOwner)
            .map((a) => {
                const pt = a.prototypeToken?.toObject?.() ?? {};
                const w = Number(pt.width ?? 1);
                const h = Number(pt.height ?? 1);
                const sizeKey = Math.max(w, h);
                return { actor: a, pt, w, h, sizeKey, name: (a.name ?? '').trim() };
            });

        // Sort: size asc, then name alpha (case-insensitive)
        entries.sort((A, B) => A.sizeKey - B.sizeKey || A.name.localeCompare(B.name, undefined, { sensitivity: 'base' }));

        // Group by sizeKey
        const bySize = new Map();
        for (const e of entries) {
            if (!bySize.has(e.sizeKey)) bySize.set(e.sizeKey, []);
            bySize.get(e.sizeKey).push(e);
        }

        if (!entries.length) return ui.notifications.warn('No non-player actors found.');

        // 3) Compute padded placement bounds (in grid units)
        const dims = scene.dimensions;
        const padFrac = Number(scene.padding ?? 0);
        const leftPadPx = (dims?.sceneWidth ?? scene.width ?? 0) * padFrac;
        const topPadPx = (dims?.sceneHeight ?? scene.height ?? 0) * padFrac;

        const startGX = clampFloorToGrid(leftPadPx);
        const startGY = clampFloorToGrid(topPadPx);

        const innerWidthPx = (dims?.sceneWidth ?? scene.width ?? 0) * (1 - 2 * padFrac);
        const innerHeightPx = (dims?.sceneHeight ?? scene.height ?? 0) * (1 - 2 * padFrac);

        const maxGX = Number.isFinite(innerWidthPx) ? Math.max(1, Math.floor(innerWidthPx / gridSizePx)) : Number.POSITIVE_INFINITY;
        const maxGY = Number.isFinite(innerHeightPx) ? Math.max(1, Math.floor(innerHeightPx / gridSizePx)) : Number.POSITIVE_INFINITY;

        // 4) Build tokens within padded bounds
        const tokenDatas = [];
        let curGX = startGX;
        let curGY = startGY;

        const wrapLimitGX = startGX + maxGX; // exclusive limit in grid units

        for (const [sizeKey, list] of [...bySize.entries()].sort((a, b) => a[0] - b[0])) {
            curGX = startGX;
            let rowMaxH = 0;
            let lastLetter = null;

            for (const { actor, pt, w, h, name } of list) {
                const firstLetter = (name[0] ?? '').toUpperCase();

                if (lastLetter !== null && firstLetter !== lastLetter) curGX += GAP_BETWEEN_LETTERS;
                lastLetter = firstLetter;

                // Wrap within the current size group block (respect padded right edge)
                if (Number.isFinite(wrapLimitGX) && curGX + w > wrapLimitGX) {
                    curGX = startGX;
                    curGY += rowMaxH + GAP_BETWEEN_ROWS_SAME_SIZE;
                    rowMaxH = 0;
                    lastLetter = null;
                }

                rowMaxH = Math.max(rowMaxH, h);

                // Stop if we exceed padded bottom edge (best-effort guard)
                if (Number.isFinite(maxGY) && curGY - startGY + rowMaxH > maxGY) break;

                const td = foundry.utils.deepClone(pt);

                // Detach token from actor entirely
                td.actorLink = false;
                td.actorId = null;
                delete td.actorData;

                // Force name display mode
                td.displayName = DISPLAY_NAME_MODE;

                // Position (grid-aligned, within padding bounds)
                td.x = curGX * gridSizePx;
                td.y = curGY * gridSizePx;

                // Ensure size + name
                td.width = w;
                td.height = h;
                td.name = name || td.name || actor.name || 'Token';

                tokenDatas.push(td);

                // Advance cursor with NO base gap
                curGX += w + GAP_BETWEEN_TOKENS;
            }

            // Next size group starts on a new row block (respect padded bounds)
            curGY += rowMaxH + GAP_BETWEEN_SIZE_GROUPS;
        }

        if (!tokenDatas.length) return ui.notifications.warn('No tokens to create within padded bounds.');

        await scene.createEmbeddedDocuments('Token', tokenDatas);

        // 5) Optional: move to compendium (with folder mirroring)
        if (MOVE_TO_COMPENDIUM) {
            const pack = getPack();
            await pack.getIndex();

            let copied = 0;

            for (const { actor } of entries) {
                const srcFolder = actor.folder ?? null;
                const folderPath = srcFolder ? normFolderPath(srcFolder) : '';
                const targetFolder = folderPath ? await ensureFolderPath('Actor', folderPath) : null;

                const data = actor.toObject();
                delete data._id;
                delete data.id;

                if (targetFolder) data.folder = targetFolder.id;

                await Actor.create(data, { pack: pack.collection });
                copied += 1;
            }

            ui.notifications.info(`Copied ${copied} actor(s) to compendium ${COMPENDIUM_KEY}.`);
        }

        // 6) Optional: delete originals (after compendium copy, if enabled)
        if (DELETE_ACTORS) {
            const actorIds = entries.map((e) => e.actor.id);
            await Actor.deleteDocuments(actorIds);
            ui.notifications.info(`Deleted ${actorIds.length} actor(s) from the world.`);
        }

        ui.notifications.info(
            `Cleared ${existingTokenIds.length} token(s); tokenized ${tokenDatas.length} actor(s)` +
                `${MOVE_TO_COMPENDIUM ? `; copied to ${COMPENDIUM_KEY}` : ''}` +
                `${DELETE_ACTORS ? '; deleted originals' : ''}.`,
        );
    }
}
