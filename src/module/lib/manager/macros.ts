export class CTHMacros {
    static async createToken() {
        new game.cth.apps.ApplicationNewToken().render({ force: true });
    }

    static async tokenizeAllActors(options: { deleteActors?: boolean; moveToCompendium?: boolean } = {}) {
        // Foundry VTT v13 + PF1 macro: tokenizeAllActors (non-player actors)
        //
        // What it does:
        // - Places tokens for every non-player actor on the current scene
        //   - Token is unlinked (actorLink=false)
        //   - Token is detached (no actorId, no actorData snapshot)
        // - Optionally moves those actors into a compendium (with folder matching/creation)
        // - Optionally deletes the original actors (after compendium move)
        //
        // Config
        const DELETE_ACTORS = options.deleteActors ?? false; // default false
        const MOVE_TO_COMPENDIUM = options.moveToCompendium ?? true; // default true
        const COMPENDIUM_KEY = 'world.heavy-rain-actors'; // default pack id

        if (!canvas?.scene) return ui.notifications.error('No active scene.');

        const scene = canvas.scene;
        const gridSizePx = canvas.grid.size;

        // Spacing rules (in grid units)
        const BASE_GAP = 1; // normal gap between tokens
        const LETTER_GAP = 2; // extra gap between first-letter groups
        const SIZE_ROW_GAP = 4; // gap between size rows

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

            return parent; // deepest folder
        };

        const getPack = () => {
            const pack = game.packs.get(COMPENDIUM_KEY);
            if (!pack) throw new Error(`Compendium not found: ${COMPENDIUM_KEY}`);
            if (pack.documentName !== 'Actor') throw new Error(`Compendium ${COMPENDIUM_KEY} is not an Actor pack.`);
            return pack;
        };

        // Collect non-player actors
        const entries = game.actors
            .filter((a) => a && !a.hasPlayerOwner)
            .map((a) => {
                const pt = a.prototypeToken?.toObject?.() ?? {};
                const w = Number(pt.width ?? 1);
                const h = Number(pt.height ?? 1);
                const sizeKey = Math.max(w, h);
                return { actor: a, pt, w, h, sizeKey, name: (a.name ?? '').trim() };
            });

        // Sort: size asc, then alphabetically
        entries.sort((A, B) => A.sizeKey - B.sizeKey || A.name.localeCompare(B.name, undefined, { sensitivity: 'base' }));

        // Group by sizeKey
        const bySize = new Map();
        for (const e of entries) {
            if (!bySize.has(e.sizeKey)) bySize.set(e.sizeKey, []);
            bySize.get(e.sizeKey).push(e);
        }

        // Scene bounds in grid units (best-effort)
        const sceneWidthPx = scene.dimensions?.sceneWidth ?? scene.width ?? 0;
        const maxGX = sceneWidthPx ? Math.floor(sceneWidthPx / gridSizePx) : Number.POSITIVE_INFINITY;

        // Build tokens
        const tokenDatas = [];
        let curGY = 0;

        for (const [sizeKey, list] of [...bySize.entries()].sort((a, b) => a[0] - b[0])) {
            let curGX = 0;
            let groupRowMaxH = 0;

            let lastLetter = null;

            for (const { actor, pt, w, h, name } of list) {
                const firstLetter = (name[0] ?? '').toUpperCase();
                if (lastLetter !== null && firstLetter !== lastLetter) curGX += LETTER_GAP;
                lastLetter = firstLetter;

                // Wrap within the size row if needed (best-effort)
                if (Number.isFinite(maxGX) && curGX + w > maxGX) {
                    curGX = 0;
                    curGY += groupRowMaxH + BASE_GAP;
                    groupRowMaxH = 0;
                    lastLetter = null;
                }

                groupRowMaxH = Math.max(groupRowMaxH, h);

                const td = foundry.utils.deepClone(pt);

                // Detach token from actor entirely
                td.actorLink = false;
                td.actorId = null;
                delete td.actorData;

                td.x = curGX * gridSizePx;
                td.y = curGY * gridSizePx;

                td.width = w;
                td.height = h;

                td.name = name || td.name || actor.name || 'Token';

                tokenDatas.push(td);

                curGX += w + BASE_GAP;
            }

            // Next size group starts on a new row with 4-grid gap
            curGY += groupRowMaxH + SIZE_ROW_GAP;
        }

        if (!tokenDatas.length) return ui.notifications.warn('No non-player actors found.');

        // Create tokens now (so tokenization is independent of later compendium/delete actions)
        await scene.createEmbeddedDocuments('Token', tokenDatas);

        // Optional: move to compendium (with folder mirroring)
        if (MOVE_TO_COMPENDIUM) {
            const pack = getPack();
            await pack.getIndex(); // warm index

            const createdIds = [];
            for (const { actor } of entries) {
                // Mirror the actor's folder path into the compendium folder tree
                const srcFolder = actor.folder ?? null;
                const folderPath = srcFolder ? normFolderPath(srcFolder) : '';
                const targetFolder = folderPath ? await ensureFolderPath('Actor', folderPath) : null;

                // Export Actor data, strip world-only ids, then import into pack
                const data = actor.toObject();
                delete data._id;
                delete data.id;

                if (targetFolder) data.folder = targetFolder.id;

                // If a doc with same name already exists in pack, you may end up with duplicates (intentional).
                const created = await Actor.create(data, { pack: pack.collection });
                createdIds.push(created.id);
            }

            ui.notifications.info(`Copied ${createdIds.length} actor(s) to compendium ${COMPENDIUM_KEY}.`);
        }

        // Optional: delete originals (after compendium copy)
        if (DELETE_ACTORS) {
            const actorIds = entries.map((e) => e.actor.id);
            await Actor.deleteDocuments(actorIds);
            ui.notifications.info(`Deleted ${actorIds.length} actor(s) from the world.`);
        }

        ui.notifications.info(
            `Tokenized ${tokenDatas.length} actor(s)` +
                `${MOVE_TO_COMPENDIUM ? `; copied to ${COMPENDIUM_KEY}` : ''}` +
                `${DELETE_ACTORS ? '; deleted originals' : ''}.`,
        );
    }
}
