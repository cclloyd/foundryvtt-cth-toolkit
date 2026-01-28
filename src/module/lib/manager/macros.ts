export class CTHMacros {
    static async createToken() {
        new game.cth.apps.ApplicationNewToken().render({ force: true });
    }

    static async tokenizeAllActors(compendium = undefined, moveToCompendium = true, deleteOriginals = false) {
        // -----------------------------
        // Config
        // -----------------------------
        const packId = compendium ?? 'world.heavy-rain-actors';
        const storeToCompendium = moveToCompendium ?? true;
        const deleteActors = deleteOriginals ?? false;

        const DISPLAY_NAME_MODE = 30;

        const EXTRA_PADDING_TILES = 2;

        const LETTER_GAP_TILES = 3;
        const ROW_GAP_TILES = 3;
        const SIZE_GROUP_GAP_TILES = 4;

        // -----------------------------
        // Preconditions
        // -----------------------------
        const scene = canvas?.scene;
        if (!scene) return ui.notifications.error('No active scene on canvas.');
        if (!canvas?.grid?.size) return ui.notifications.error('Canvas grid not ready.');
        const gridPx = canvas.grid.size;

        const actors = game.actors
            .filter(a => a && !a.hasPlayerOwner)
            .filter(a => !a.compendium);

        if (!actors.length) return ui.notifications.info('No non-player-owned actors found.');

        // -----------------------------
        // Helpers
        // -----------------------------
        function firstLetterKey(name) {
            const s = String(name ?? '').trim();
            if (!s) return '#';
            const c = s[0].toUpperCase();
            return (c >= 'A' && c <= 'Z') ? c : '#';
        }

        function groupKeyFromDims(wTiles, hTiles) {
            const m = Math.max(Number(wTiles || 1), Number(hTiles || 1));
            return m >= 5 ? 5 : Math.max(1, Math.floor(m));
        }

        async function getSizedTokenSource(actor) {
            if (typeof actor.getTokenDocument === 'function') {
                const td = await actor.getTokenDocument();
                return td?.toObject ? td.toObject() : td;
            }
            return actor.prototypeToken.toObject();
        }

        // -----------------------------
        // Build enriched list with effective token dims (PF1-applied)
        // -----------------------------
        const enriched = [];
        for (const actor of actors) {
            const tokenSrc = await getSizedTokenSource(actor);
            const wTiles = Number(tokenSrc?.width ?? 1);
            const hTiles = Number(tokenSrc?.height ?? 1);

            enriched.push({
                actor,
                name: actor.name ?? '',
                letter: firstLetterKey(actor.name),
                wTiles,
                hTiles,
                sizeKey: groupKeyFromDims(wTiles, hTiles),
                tokenSrc
            });
        }

        const sizeKeys = Array.from(new Set(enriched.map(e => e.sizeKey))).sort((a, b) => a - b);
        const groupsBySize = new Map(sizeKeys.map(k => [k, []]));
        for (const e of enriched) groupsBySize.get(e.sizeKey).push(e);

        for (const arr of groupsBySize.values()) {
            arr.sort((a, b) => {
                const an = a.name.toLowerCase();
                const bn = b.name.toLowerCase();
                if (an < bn) return -1;
                if (an > bn) return 1;
                return a.actor.id.localeCompare(b.actor.id);
            });
        }

        // -----------------------------
        // Placement bounds
        // -----------------------------
        const pad = Number(scene.padding ?? 0);
        const minX = Math.round(scene.width * pad + EXTRA_PADDING_TILES * gridPx);
        const minY = Math.round(scene.height * pad + EXTRA_PADDING_TILES * gridPx);
        const maxX = Math.round(scene.width * (1 - pad) - EXTRA_PADDING_TILES * gridPx);
        const maxY = Math.round(scene.height * (1 - pad) - EXTRA_PADDING_TILES * gridPx);

        if (minX >= maxX || minY >= maxY) {
            return ui.notifications.error('Scene padding + extra padding leaves no usable placement area.');
        }

        // -----------------------------
        // Layout tokens
        // -----------------------------
        const tokenCreates = [];
        let yCursorPx = minY;

        for (const sizeKeyVal of sizeKeys) {
            const group = groupsBySize.get(sizeKeyVal) ?? [];
            if (!group.length) continue;

            let xCursorPx = minX;
            let rowMaxHTiles = 0;
            let prevLetter = null;

            const flushRowAndAdvance = () => {
                yCursorPx += (rowMaxHTiles * gridPx) + (ROW_GAP_TILES * gridPx);
                xCursorPx = minX;
                rowMaxHTiles = 0;
                prevLetter = null;
            };

            for (const item of group) {
                const wPx = item.wTiles * gridPx;
                const hPx = item.hTiles * gridPx;

                if (xCursorPx !== minX && prevLetter !== null && item.letter !== prevLetter) {
                    xCursorPx += LETTER_GAP_TILES * gridPx;
                }

                if (xCursorPx + wPx > maxX) {
                    flushRowAndAdvance();
                    if (minX + wPx > maxX) {
                        return ui.notifications.error(
                            `Token "${item.name}" (${item.wTiles}x${item.hTiles}) cannot fit within padded scene bounds.`
                        );
                    }
                }

                if (yCursorPx + hPx > maxY) {
                    return ui.notifications.error(
                        `Ran out of vertical space while placing tokens (stopped at "${item.name}"). Consider a larger scene.`
                    );
                }

                const td = foundry.utils.deepClone(item.tokenSrc);
                td.x = xCursorPx;
                td.y = yCursorPx;
                td.actorId = item.actor.id;
                td.actorLink = false;
                td.delta = {};
                td.displayName = DISPLAY_NAME_MODE;

                tokenCreates.push(td);

                xCursorPx += wPx;
                rowMaxHTiles = Math.max(rowMaxHTiles, item.hTiles);
                prevLetter = item.letter;
            }

            yCursorPx += (rowMaxHTiles * gridPx);
            yCursorPx += SIZE_GROUP_GAP_TILES * gridPx;
        }

        // -----------------------------
        // 1) Place all tokens first
        // -----------------------------
        await scene.createEmbeddedDocuments('Token', tokenCreates);

        // -----------------------------
        // 2) Compendium work (nested folders)
        // -----------------------------
        let pack = null;
        if (storeToCompendium) {
            pack = game.packs.get(packId);
            if (!pack) return ui.notifications.error(`Compendium pack not found: ${packId}`);
            if (pack.documentName !== 'Actor') return ui.notifications.error(`Compendium ${packId} is not an Actor compendium.`);
            if (pack.locked) return ui.notifications.error(`Compendium ${packId} is locked.`);
        }

        // Cache keyed by (parentId, name) -> folderId
        const folderCache = new Map();
        const ck = (parentId, name) => `${parentId ?? 'root'}::${name}`;

        // IMPORTANT: seed cache from existing compendium folders
        // NOTE: Compendium folders live on the pack (pack.folders), not reliably in game.folders.
        const existingPackFolders = pack?.folders?.contents ?? [];
        for (const f of existingPackFolders) {
            if (f.type !== 'Actor') continue;

            const parentId =
                (typeof f.folder === 'string' ? f.folder : (f.folder?.id ?? null)) ??
                (f.parent?.id ?? null) ??
                null;

            folderCache.set(ck(parentId, f.name), f.id);
        }

        async function ensureCompendiumFolderChain(actorFolder) {
            if (!actorFolder) return null;

            // Build chain root->leaf from WORLD folders (walk by parent id, not cur.parent)
            const chain = [];
            let cur = actorFolder;
            while (cur) {
                chain.push(cur);

                const parentId =
                    (typeof cur.folder === 'string' ? cur.folder : (cur.folder?.id ?? null)) ??
                    null;

                cur = parentId ? game.folders.get(parentId) : null;
            }
            chain.reverse();

            let parentId = null;

            for (const src of chain) {
                const key = ck(parentId, src.name);
                let folderId = folderCache.get(key);

                if (!folderId) {
                    const created = await Folder.createDocuments(
                        [{
                            name: src.name,
                            type: 'Actor',
                            folder: parentId,
                            pack: pack.collection,
                            sorting: src.sorting ?? 'a',
                            sort: src.sort ?? 0,
                            color: src.color ?? null
                        }],
                        { pack: pack.collection, render: false }
                    );

                    const newFolder = created?.[0];
                    if (!newFolder?.id) throw new Error(`Failed to create compendium folder "${src.name}".`);

                    folderId = newFolder.id;
                    folderCache.set(key, folderId);
                }

                parentId = folderId;
            }

            return parentId;
        }

        for (const a of actors) {
            const folderId = await ensureCompendiumFolderChain(a.folder);

            const data = a.toObject();
            data.folder = folderId;
            console.log('Adding actor to compendium:', data.id, data.name)
            await pack.documentClass.create(data, { pack: pack.collection });
        }

        // -----------------------------
        // 3) Optionally delete actors
        // -----------------------------
        if (deleteActors) {
            await Actor.deleteDocuments(actors.map(a => a.id));
        }
        console.log('Done.');
        ui.notifications.info(
            `Done: placed ${tokenCreates.length} tokens, copied ${actors.length} actors to ${packId}` +
            (deleteActors ? `, deleted ${actors.length} actors` : '')
        );
    }
}
