import gulp from 'gulp';
import path from 'node:path';
import fs from 'node:fs';
import through2 from 'through2';
import chalk from 'chalk';
import plumber from 'gulp-plumber';
import sourcemaps from 'gulp-sourcemaps';
import gulpSass from 'gulp-sass';
import dartSass from 'sass';
import { createGulpEsbuild } from 'gulp-esbuild';
import { rimraf } from 'rimraf';
// Add at top with other imports
// Add this import
import fsExtra from 'fs-extra';
import dayjs from 'dayjs';

const sass = gulpSass(dartSass);

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
// Shared entry used for both full build and dev incremental rebuild
const ENTRY_FILE = `${SRC_DIR}/module/cth-toolkit.ts`;

const GLOBS = {
    styles: `${SRC_DIR}/**/*.scss`,
    scripts: [`${SRC_DIR}/**/*.ts`, `${SRC_DIR}/**/*.tsx`, `!${SRC_DIR}/**/*.d.ts`],
    // Exclude packs from gulp's stream copying; we will copy them via fs-extra
    assets: [
        `${SRC_DIR}/**/*`,
        `!${SRC_DIR}/**/*.ts`,
        `!${SRC_DIR}/**/*.tsx`,
        `!${SRC_DIR}/**/*.scss`,
        `!${SRC_DIR}/module.json`,
    ],
};

// Utilities for timing and logging
const nowIso = () => new Date().toISOString();
const toPosix = (p) => p.split(path.sep).join('/');
const relFromCwd = (p) => toPosix(path.relative(process.cwd(), p));
const startTimer = () =>
    through2.obj((file, _, cb) => {
        file._t0 = process.hrtime.bigint();
        file._origPath = file.history?.[0] || file.path;
        cb(null, file);
    });
const finishLogger = (kind) =>
    through2.obj((file, _, cb) => {
        // Skip .map files from logging
        if (file.path.endsWith('.map')) return cb(null, file);
        const t1 = process.hrtime.bigint();
        const t0 = file._t0 ?? t1;
        const ms = Number(t1 - t0) / 1e6;
        const time = chalk.gray(nowIso());
        const label = kind === 'build' ? chalk.green('build') : kind === 'copy' ? chalk.cyan('copy') : chalk.red(kind);
        const rel = relFromCwd(file._origPath || file.path);
        console.log(`${time} ${label} ${rel} ${chalk.yellow(ms.toFixed(1) + 'ms')}`);
        cb(null, file);
    });

// ---- Clean dist/ ----
export function clean(cb) {
    rimraf(DIST_DIR).then(() => cb(), cb);
}

// ---- Manifest (module.json) ----
export function manifest() {
    const version = `dev-${dayjs().format('YYYYMMDD-HHmmss')}`;
    return gulp
        .src(`${SRC_DIR}/module.json`, { base: SRC_DIR })
        .pipe(
            through2.obj((file, enc, cb) => {
                if (file.isBuffer()) {
                    const content = file.contents.toString(enc).replace('CI_COMMIT_TAG', version);
                    file.contents = Buffer.from(content, enc);
                }
                cb(null, file);
            }),
        )
        .pipe(gulp.dest(DIST_DIR))
        .pipe(finishLogger('manifest'));
}

// ---- SCSS Compilation ----
export function styles() {
    return gulp
        .src(GLOBS.styles, { since: gulp.lastRun(styles) })
        .pipe(startTimer())
        .pipe(plumber())
        .pipe(sourcemaps.init())
        .pipe(sass.sync({ quietDeps: true }).on('error', sass.logError))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(DIST_DIR))
        .pipe(finishLogger('build'));
}

// ---- TypeScript build with path rewriting ----
// const gulpEsbuild = createGulpEsbuild({ incremental: true });
const esbuildOnce = createGulpEsbuild({ incremental: false });
const esbuildWatch = createGulpEsbuild({ incremental: true });

function findTsconfig() {
    const candidates = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.base.json', 'tsconfig.build.json'];
    for (const f of candidates) if (fs.existsSync(f)) return path.resolve(f);
    return null;
}

const SRC_ABS = path.resolve(SRC_DIR);
const DIST_ABS = path.resolve(DIST_DIR);

function createAliasRewriter() {
    const { baseUrl, paths } = loadTsPaths();
    const rules = [];
    for (const [alias, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets) || targets.length === 0) continue;
        const hasStar = alias.includes('*');
        // ^foo/*$ => captures the * (for `foo/bar`)
        const re = new RegExp(`^${alias.replace(/\*/g, '(.+)')}$`);
        rules.push({ alias, re, hasStar, targets });
    }

    return through2.obj(function (file, _, cb) {
        if (!file.isBuffer() || !file.path.endsWith('.js')) return cb(null, file);

        let code = String(file.contents);
        for (const rule of rules) {
            code = code.replace(/(['"`])([^'"`]+)\1/g, (m0, quote, modPath) => {
                for (const rule of rules) {
                    const m = modPath.match(rule.re);
                    if (!m) continue;
                    const captured = m[1] || '';
                    for (const targetPattern of rule.targets) {
                        let target = rule.hasStar ? targetPattern.replace(/\*/g, captured) : targetPattern;
                        target = toPosix(target.replace(/^[.][/\\]/, ''));
                        const targetSrcAbs = path.resolve(baseUrl, target);

                        let targetDistAbs;
                        if (targetSrcAbs.startsWith(SRC_ABS + path.sep) || targetSrcAbs === SRC_ABS) {
                            const relFromSrcRoot = path.relative(SRC_ABS, targetSrcAbs);
                            targetDistAbs = path.resolve(DIST_ABS, relFromSrcRoot);
                        } else {
                            const relFromBase = path.relative(baseUrl, targetSrcAbs);
                            targetDistAbs = path.resolve(DIST_ABS, relFromBase);
                        }
                        const fromDir = path.dirname(file.path);
                        let relToTarget = path.relative(fromDir, targetDistAbs);
                        relToTarget = toPosix(relToTarget);
                        if (!relToTarget.startsWith('.')) relToTarget = './' + relToTarget;
                        return `${quote}${relToTarget.replace(/\.js$/, '')}${quote}`;
                    }
                }
                return m0;
            });
        }
        file.contents = Buffer.from(code);
        cb(null, file);
    });
}

export function scripts() {
    const entryFile = ENTRY_FILE;

    return new Promise((resolve, reject) => {
        const stream = gulp
            .src(entryFile)
            .pipe(startTimer())
            .pipe(
                plumber({
                    errorHandler(err) {
                        console.error(err);
                        // End the stream so Gulp can continue, but still reject
                        this.emit('end');
                        reject(err);
                    },
                }),
            )
            .pipe(
                esbuildOnce({
                    tsconfig: findTsconfig() ?? undefined,
                    format: 'esm',
                    sourcemap: true,
                    bundle: true, // single bundle
                    outfile: 'module/cth-toolkit.js',
                    loader: { '.ts': 'ts', '.tsx': 'tsx' },
                    logLevel: 'silent',
                    legalComments: 'none',
                    jsx: 'preserve',
                    write: false,
                }),
            )
            .pipe(gulp.dest(DIST_DIR))
            .pipe(finishLogger('build'));

        // Ensure Gulp knows when we’re done
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.on('end', resolve);
    });
}

// Gulp-managed assets (excluding packs)
export function assets() {
    return gulp.src(GLOBS.assets, { base: SRC_DIR }).pipe(startTimer()).pipe(plumber()).pipe(gulp.dest(DIST_DIR)).pipe(finishLogger('copy'));
}

// Packs copy via fs-extra to preserve timestamps and avoid stream transforms
export async function copyPacksFs() {
    const srcPacks = path.join(SRC_DIR, 'packs');
    const distPacks = path.join(DIST_DIR, 'packs');

    await rimraf(distPacks);
    await fsExtra.copy(srcPacks, distPacks, {
        preserveTimestamps: true,
        recursive: true,
        // Skip lock/log files
        filter: (src) => {
            const rel = toPosix(path.relative(srcPacks, src));
            if (!rel || rel.startsWith('..')) return true;
            const base = path.posix.basename(rel);
            if (base === 'LOCK') return false;
            if (base.startsWith('LOG')) return false;
            return true;
        },
    });
    console.log(chalk.gray(nowIso()), chalk.cyan('copy'), relFromCwd(srcPacks), '->', relFromCwd(distPacks));
}

// Define missing watcher callbacks
function scriptsChanged() {
    // Fire-and-forget; errors are already handled by plumber in scripts()
    scripts().then(manifest);
}
function assetsChanged(_p) {
    // Copy changed assets (simple approach: recopy matching glob set)
    // Run manifest after assets are copied
    gulp.series(assets, manifest)(() => {});
}

// Compose build
export const build = gulp.parallel(styles, scripts, assets, manifest);

// One-shot build (clean + build) for CI/production
export const prod = gulp.series(clean, build);

// Dev: clean, build once, then watch
export function watchAll() {
    gulp.watch(GLOBS.styles, gulp.series(styles, manifest));
    gulp.watch(GLOBS.scripts)
        .on('change', () => scriptsChanged())
        .on('add', () => scriptsChanged());
    gulp.watch(GLOBS.assets)
        .on('change', (p) => assetsChanged(p))
        .on('add', (p) => assetsChanged(p));
    // On any change inside packs, re-copy via fs-extra
    gulp.watch(`${SRC_DIR}/packs/**/*`, gulp.series(copyPacksFs, manifest));
    // Watch module.json specifically
    gulp.watch(`${SRC_DIR}/module.json`, manifest);
}
export const dev = gulp.series(clean, build, watchAll);
