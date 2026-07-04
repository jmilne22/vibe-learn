'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walkFiles(root, rel = '', out = []) {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        const child = path.join(rel, entry.name);
        if (entry.isDirectory()) walkFiles(root, child, out);
        else if (entry.isFile()) out.push(child);
    }
    return out;
}

/**
 * Merge a clean seed into the learner workspace without overwriting edits.
 * A file is updated only when it is missing or still matches the last seed
 * version. Modified learner files are preserved indefinitely.
 */
function syncWorkspaceSeed(seedDir, workspaceDir) {
    if (!fs.existsSync(seedDir)) throw new Error(`practice seed missing: ${seedDir}`);
    ensureDir(workspaceDir);
    const stateFile = path.join(workspaceDir, '.vibe-seed.json');
    let prior = {};
    try { prior = JSON.parse(fs.readFileSync(stateFile, 'utf8')).files || {}; } catch {}
    const next = {};

    for (const rel of walkFiles(seedDir)) {
        const source = path.join(seedDir, rel);
        const dest = path.join(workspaceDir, rel);
        const newHash = sha256(source);
        const exists = fs.existsSync(dest);
        const unchanged = exists && prior[rel] && sha256(dest) === prior[rel];

        if (!exists || unchanged) {
            ensureDir(path.dirname(dest));
            fs.copyFileSync(source, dest);
            next[rel] = newHash;
        } else if (prior[rel]) {
            next[rel] = prior[rel];
        }
    }

    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, files: next }, null, 2) + '\n');
}

module.exports = { ensureDir, syncWorkspaceSeed };
