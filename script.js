// --- DOM Elements ---
const terminalInput = document.getElementById('terminal-input');
const terminalOutput = document.getElementById('terminal-output');
const terminalBody = document.getElementById('terminal-body');
const nodesContainer = document.getElementById('nodes-container');
const svgCanvas = document.getElementById('git-graph-svg');
const visualPanel = document.getElementById('visual-panel');
const canvasContainer = document.getElementById('canvas-container');
const mainContent = document.getElementById('main-content');
const terminalPanel = document.getElementById('terminal-panel');
const resizer = document.getElementById('resizer');
const toggleLayoutBtn = document.getElementById('toggle-layout');
const projectSelect = document.getElementById('project-select');
const terminalPrompt = document.getElementById('terminal-prompt');
const toastElement = document.getElementById('toast');
const customControls = document.getElementById('custom-controls');
const btnCommit = document.getElementById('btn-commit');
const btnBranch = document.getElementById('btn-branch');
const btnCheckout = document.getElementById('btn-checkout');
const btnMerge = document.getElementById('btn-merge');
const modalElement = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalInput = document.getElementById('modal-input');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const contextMenu = document.getElementById('context-menu');
const menuCommit = document.getElementById('menu-commit');
const menuBranch = document.getElementById('menu-branch');
const menuCheckout = document.getElementById('menu-checkout');
const menuCtxMerge = document.getElementById('menu-merge');

let contextMenuTarget = null;
let activeModalCallback = null;

function showModal(title, message, isConfirm, defaultValue, callback) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    if (isConfirm) {
        modalInput.classList.add('hidden');
        modalInput.value = '';
    } else {
        modalInput.classList.remove('hidden');
        modalInput.value = defaultValue || '';
    }
    
    modalElement.classList.remove('hidden');
    if (!isConfirm) setTimeout(() => modalInput.focus(), 50);
    
    activeModalCallback = callback;
}

function closeModal() {
    modalElement.classList.add('hidden');
    activeModalCallback = null;
}

modalCancel.onclick = () => {
    if (activeModalCallback) {
        const cb = activeModalCallback;
        closeModal();
        cb(null);
    } else {
        closeModal();
    }
};

modalConfirm.onclick = () => {
    if (activeModalCallback) {
        const val = modalInput.classList.contains('hidden') ? true : modalInput.value.trim();
        const cb = activeModalCallback;
        closeModal();
        cb(val);
    } else {
        closeModal();
    }
};

modalInput.onkeydown = (e) => {
    if (e.key === 'Enter') modalConfirm.click();
    if (e.key === 'Escape') modalCancel.click();
};

window.addEventListener('keydown', (e) => {
    if (!modalElement.classList.contains('hidden') && e.key === 'Escape') {
        modalCancel.click();
    }
});

// --- Application State ---
let isDragging = false;
let isResizing = false;
let currentLayout = 'horizontal';
let startX, startY, initialTranslateX = 0, initialTranslateY = 0;
let currentTranslateX = 0, currentTranslateY = 0;
let currentPath = '/';

let state = {
    initialized: false,
    commits: {},
    branches: {},
    HEAD: null,
    commitCounter: 0,
    stagedFiles: [],
    modifiedFiles: ['src/App.js', 'src/styles.css', 'README.md', 'package.json']
};

const branchColors = {
    'main': '#3b82f6',
    'master': '#3b82f6',
    'develop': '#10b981',
    'feature': '#f59e0b',
    'hotfix': '#ef4444',
    'release': '#8b5cf6',
    'default': '#ec4899'
};

const fileSystem = {
    '/': { type: 'dir', children: ['src', 'public', 'node_modules', 'package.json', 'README.md', '.gitignore', '.git'] },
    '/src': { type: 'dir', children: ['App.js', 'styles.css', 'utils.js', 'components'] },
    '/src/components': { type: 'dir', children: ['Header.jsx', 'Footer.jsx', 'Sidebar.jsx'] },
    '/public': { type: 'dir', children: ['index.html', 'favicon.ico'] },
    '/node_modules': { type: 'dir', children: ['react', 'react-dom', 'lucide-react'] },
    '/package.json': { type: 'file' },
    '/README.md': { type: 'file' },
    '/.gitignore': { type: 'file' },
    '/.git': { type: 'dir', children: ['config', 'HEAD', 'objects', 'refs'] }
};

// --- Utilities ---
function getBranchColor(name) {
    if (!name) return branchColors.default;
    if (branchColors[name]) return branchColors[name];
    if (name.includes('develop') || name === 'dev') return branchColors.develop;
    if (name.includes('feat')) return branchColors.feature;
    if (name.includes('fix') || name.includes('bug')) return branchColors.hotfix;
    if (name.includes('release')) return branchColors.release;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const colors = Object.values(branchColors);
    return colors[Math.abs(hash) % colors.length];
}

function updatePrompt() {
    const displayPath = currentPath === '/' ? '~' : `~${currentPath}`;
    if (terminalPrompt) terminalPrompt.textContent = `mojahid@gitice:${displayPath}$`;
}

function getFullPath(path) {
    if (path.startsWith('/')) return path;
    if (path === '..') {
        if (currentPath === '/') return '/';
        const parts = currentPath.split('/').filter(p => p);
        parts.pop();
        return '/' + parts.join('/');
    }
    if (path === '.') return currentPath;
    const prefix = currentPath === '/' ? '' : currentPath;
    return prefix + (path.startsWith('/') ? '' : '/') + path;
}

function generateCommitId() {
    state.commitCounter++;
    const hash = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0') + state.commitCounter.toString(16);
    return hash.substring(0, 7);
}

function printTerminal(text, type = '') {
    const div = document.createElement('div');
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = text;
    if (type) div.className = type;
    terminalOutput.appendChild(div);
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

function showToast(message) {
    if (!toastElement) return;
    toastElement.textContent = message;
    toastElement.classList.add('show');
    setTimeout(() => toastElement.classList.remove('show'), 2000);
}

function getHeadBranch() {
    if (state.HEAD && state.HEAD.startsWith('refs/heads/')) return state.HEAD.replace('refs/heads/', '');
    return null;
}

function resolveHead() {
    const branch = getHeadBranch();
    if (branch) return state.branches[branch];
    return state.HEAD;
}

// --- Git Engine ---
const gitCommands = {
    help: () => {
        printTerminal('Available Shell Commands:');
        printTerminal('  ls [dir]           - List directory contents');
        printTerminal('  cd <dir>           - Change directory');
        printTerminal('  pwd                - Print working directory');
        printTerminal('  clear              - Clear terminal output');
        printTerminal('  touch <file>       - Create a new empty file');
        printTerminal('\nAvailable Git Commands:');
        printTerminal('  git init           - Initialize a new repository');
        printTerminal('  git status         - Show the working tree status');
        printTerminal('  git add <file>|.   - Add file contents to the index');
        printTerminal('  git rm <file>      - Remove files from the working tree and from the index');
        printTerminal('  git commit [-a] -m - Record changes to the repository (--amend to amend)');
        printTerminal('  git branch         - List, create, or delete branches (-d, -D, -m)');
        printTerminal('  git checkout       - Switch branches or restore working tree files (-b)');
        printTerminal('  git switch         - Switch branches (-c to create)');
        printTerminal('  git restore        - Restore working tree files');
        printTerminal('  git merge <br>     - Join two or more development histories together');
        printTerminal('  git rebase <br>    - Reapply commits on top of another base tip');
        printTerminal('  git reset <mode>   - Reset current HEAD to specified state (--soft, --mixed, --hard)');
        printTerminal('  git revert <commit>- Revert some existing commits');
        printTerminal('  git cherry-pick <c>- Apply the changes introduced by some existing commits');
        printTerminal('  git stash [pop]    - Stash the changes in a dirty working directory away');
        printTerminal('  git log            - Show commit logs (--oneline, --graph)');
        printTerminal('\nTry "git <command> --help" for more information.');
    },
    'git init': () => {
        if (state.initialized) { printTerminal('Reinitialized existing Git repository', 'info'); return; }
        state.initialized = true;
        state.branches = { 'main': null };
        state.HEAD = 'refs/heads/main';
        state.stashes = [];
        printTerminal('Initialized empty Git repository', 'success');
        renderGraph();
    },
    'git status': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const branch = getHeadBranch();
        printTerminal(branch ? `On branch ${branch}` : `HEAD detached at ${resolveHead()}`);
        if (state.stagedFiles.length) {
            printTerminal('Changes to be committed:');
            state.stagedFiles.forEach(f => printTerminal(`\tmodified:   ${f}`, 'success'));
        }
        if (state.modifiedFiles.length) {
            printTerminal('\nChanges not staged for commit:');
            state.modifiedFiles.forEach(f => printTerminal(`\tmodified:   ${f}`, 'error'));
        }
        if (!state.stagedFiles.length && !state.modifiedFiles.length) printTerminal('nothing to commit, working tree clean');
    },
    'git add': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (!args.length) return printTerminal('Nothing specified, nothing added.', 'warn');
        if (args.includes('.') || args.includes('-A') || args.includes('--all')) {
            state.stagedFiles = [...new Set([...state.stagedFiles, ...state.modifiedFiles])];
            state.modifiedFiles = [];
        } else {
            args.forEach(file => {
                if (file.startsWith('-')) return;
                const idx = state.modifiedFiles.indexOf(file);
                if (idx !== -1) {
                    state.modifiedFiles.splice(idx, 1);
                    if (!state.stagedFiles.includes(file)) state.stagedFiles.push(file);
                } else if (!state.stagedFiles.includes(file)) {
                    state.stagedFiles.push(file); // allow adding non-existent files for simulation
                }
            });
        }
    },
    'git rm': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        args.forEach(file => {
            if (file.startsWith('-')) return;
            const idxS = state.stagedFiles.indexOf(file);
            const idxM = state.modifiedFiles.indexOf(file);
            if (idxS !== -1) state.stagedFiles.splice(idxS, 1);
            if (idxM !== -1) state.modifiedFiles.splice(idxM, 1);
            printTerminal(`rm '${file}'`);
        });
    },
    'git commit': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (args.includes('-a') || args.includes('--all')) {
            state.stagedFiles = [...new Set([...state.stagedFiles, ...state.modifiedFiles])];
            state.modifiedFiles = [];
        }
        const amend = args.includes('--amend');
        const allowEmpty = args.includes('--allow-empty');
        if (!amend && !allowEmpty && !state.stagedFiles.length) return printTerminal('nothing to commit, working tree clean');
        
        const msgIdx = args.indexOf('-m');
        const currentId = resolveHead();
        const branch = getHeadBranch();
        let message = (msgIdx !== -1 && args[msgIdx + 1]) ? args[msgIdx + 1] : 'Update';

        if (amend && currentId) {
            const oldCommit = state.commits[currentId];
            if (msgIdx === -1) message = oldCommit.message;
            oldCommit.message = message;
            state.stagedFiles = [];
            printTerminal(`[${branch || 'detached HEAD'} ${currentId}] ${message} (amended)`, 'success');
            renderGraph();
            return;
        }

        const newId = generateCommitId();
        state.commits[newId] = {
            id: newId, message, timestamp: Date.now(),
            parents: currentId ? [currentId] : [],
            branch: branch || 'detached',
            color: getBranchColor(branch)
        };
        if (branch) state.branches[branch] = newId; else state.HEAD = newId;
        state.stagedFiles = [];
        printTerminal(`[${branch || 'detached HEAD'} ${newId}] ${message}`, 'success');
        renderGraph();
    },
    'git branch': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (!args.length) {
            Object.keys(state.branches).forEach(b => printTerminal(`${getHeadBranch() === b ? '* ' : '  '}${b}`, getHeadBranch() === b ? 'success' : ''));
            return;
        }
        const target = args[1] || args[0];
        if (args[0] === '-d' || args[0] === '-D') {
            if (!target || target.startsWith('-')) return printTerminal('fatal: branch name required', 'error');
            if (state.branches[target] === undefined) return printTerminal(`error: branch '${target}' not found.`, 'error');
            if (getHeadBranch() === target) return printTerminal(`error: Cannot delete branch '${target}' checked out`, 'error');
            const hash = state.branches[target];
            delete state.branches[target];
            
            // Forcefully wipe out all commits associated with this branch to clear the visual track if not merged
            if (args[0] === '-D') {
                 Object.keys(state.commits).forEach(id => {
                     if (state.commits[id].branch === target) delete state.commits[id];
                 });
            }
            printTerminal(`Deleted branch ${target} (was ${hash ? hash.substring(0, 7) : 'unknown'}).`);
            renderGraph();
            return;
        }
        if (args[0] === '-m' || args[0] === '-M') {
            const oldName = args.length === 3 ? args[1] : getHeadBranch();
            const newName = args.length === 3 ? args[2] : args[1];
            if (!oldName) return printTerminal('fatal: no branch specified to rename', 'error');
            if (!state.branches[oldName]) return printTerminal(`error: refname refs/heads/${oldName} not found`, 'error');
            if (state.branches[newName]) return printTerminal(`fatal: A branch named '${newName}' already exists.`, 'error');
            state.branches[newName] = state.branches[oldName];
            delete state.branches[oldName];
            if (state.HEAD === `refs/heads/${oldName}`) state.HEAD = `refs/heads/${newName}`;
            Object.values(state.commits).forEach(c => { if (c.branch === oldName) c.branch = newName; });
            renderGraph();
            return;
        }
        if (state.branches[args[0]]) return printTerminal(`fatal: branch '${args[0]}' already exists`, 'error');
        state.branches[args[0]] = resolveHead();
        renderGraph();
    },
    'git checkout': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (!args.length) return printTerminal('fatal: missing branch or path', 'error');
        let target = args[0];
        if (target === '-b' || target === '-B') { 
            const bName = args[1];
            if (target === '-B' || !state.branches[bName]) {
                state.branches[bName] = resolveHead();
            } else {
                return printTerminal(`fatal: A branch named '${bName}' already exists.`, 'error');
            }
            target = bName; 
        } else if (target === '--') {
            args.slice(1).forEach(f => {
                if (state.modifiedFiles.includes(f)) {
                    state.modifiedFiles.splice(state.modifiedFiles.indexOf(f), 1);
                    printTerminal(`Restored ${f}`);
                }
            });
            return;
        }
        if (state.branches[target] !== undefined) { state.HEAD = `refs/heads/${target}`; printTerminal(`Switched to branch '${target}'`); }
        else {
            const hash = Object.keys(state.commits).find(k => k.startsWith(target));
            if (hash) { state.HEAD = hash; printTerminal(`Note: switching to '${hash}'. Detached HEAD.`, 'warn'); }
            else if (state.modifiedFiles.includes(target) || state.stagedFiles.includes(target)) {
                 if (state.modifiedFiles.includes(target)) state.modifiedFiles.splice(state.modifiedFiles.indexOf(target), 1);
                 return; // File checkout
            }
            else printTerminal(`error: pathspec '${target}' did not match any file(s) known to git`, 'error');
        }
        renderGraph();
    },
    'git switch': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (!args.length) return printTerminal('fatal: missing branch', 'error');
        if (args[0] === '-c' || args[0] === '-C') {
             gitCommands['git checkout'](['-b', args[1]]);
        } else {
             gitCommands['git checkout']([args[0]]);
        }
    },
    'git restore': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const staged = args.includes('--staged');
        args.forEach(f => {
            if (f.startsWith('-')) return;
            if (staged) {
                const idx = state.stagedFiles.indexOf(f);
                if (idx !== -1) { state.stagedFiles.splice(idx, 1); state.modifiedFiles.push(f); }
            } else {
                const idx = state.modifiedFiles.indexOf(f);
                if (idx !== -1) state.modifiedFiles.splice(idx, 1);
            }
        });
    },
    'git merge': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const targetHash = state.branches[args[0]] || Object.keys(state.commits).find(k => k.startsWith(args[0]));
        if (!targetHash) return printTerminal(`merge: ${args[0]} - not something we can merge`, 'error');
        const current = resolveHead();
        if (current === targetHash) return printTerminal('Already up to date.');
        
        let isFastForward = false;
        let p = targetHash;
        const visited = new Set();
        const q = [p];
        while(q.length) {
            let n = q.shift();
            if (n === current) { isFastForward = true; break; }
            if (visited.has(n)) continue; visited.add(n);
            if (state.commits[n]) q.push(...state.commits[n].parents);
        }

        const branch = getHeadBranch();
        if (isFastForward && !args.includes('--no-ff')) {
             if (branch) state.branches[branch] = targetHash; else state.HEAD = targetHash;
             printTerminal('Fast-forward', 'success');
        } else {
             const newId = generateCommitId();
             state.commits[newId] = {
                 id: newId, message: `Merge branch '${args[0]}'`, timestamp: Date.now(),
                 parents: [current, targetHash], branch: branch || 'detached', color: getBranchColor(branch)
             };
             if (branch) state.branches[branch] = newId; else state.HEAD = newId;
             printTerminal('Merge made by recursive strategy.', 'success');
        }
        renderGraph();
    },
    'git rebase': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const targetHash = state.branches[args[0]] || Object.keys(state.commits).find(k => k.startsWith(args[0]));
        if (!targetHash) return printTerminal(`fatal: invalid upstream '${args[0]}'`, 'error');
        const current = resolveHead();
        if (current === targetHash) return printTerminal('Current branch is up to date.');
        const branch = getHeadBranch();
        
        const getAncestors = (start) => {
            const res = new Set(); const q = [start];
            while(q.length) {
                let n = q.shift(); if (!res.has(n) && state.commits[n]) { res.add(n); q.push(...state.commits[n].parents); }
            }
            return res;
        };
        const targetAncestors = getAncestors(targetHash);
        const toRebase = [];
        let curr = current;
        while (curr && !targetAncestors.has(curr)) {
            toRebase.unshift(state.commits[curr]);
            curr = state.commits[curr].parents[0];
        }
        
        if (toRebase.length === 0) {
            if (branch) state.branches[branch] = targetHash; else state.HEAD = targetHash;
            printTerminal(`Fast-forwarded ${branch} to ${args[0]}.`, 'success');
        } else {
            let newBase = targetHash;
            toRebase.forEach(c => {
                const newId = generateCommitId();
                state.commits[newId] = {
                    id: newId, message: c.message, timestamp: Date.now(),
                    parents: [newBase], branch: branch || 'detached', color: getBranchColor(branch)
                };
                newBase = newId;
            });
            if (branch) state.branches[branch] = newBase; else state.HEAD = newBase;
            printTerminal(`Successfully rebased and updated ${branch || 'detached HEAD'}.`, 'success');
        }
        renderGraph();
    },
    'git cherry-pick': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const targetStr = args[0];
        const targetHash = Object.keys(state.commits).find(k => k.startsWith(targetStr));
        const targetCommit = state.commits[targetHash];
        if (!targetCommit) return printTerminal(`fatal: bad revision '${targetStr}'`, 'error');
        const branch = getHeadBranch();
        const currentId = resolveHead();
        const newId = generateCommitId();
        state.commits[newId] = {
            id: newId, message: targetCommit.message, timestamp: Date.now(),
            parents: currentId ? [currentId] : [], branch: branch || 'detached', color: getBranchColor(branch)
        };
        if (branch) state.branches[branch] = newId; else state.HEAD = newId;
        printTerminal(`[${branch || 'detached HEAD'} ${newId}] ${targetCommit.message}`, 'success');
        renderGraph();
    },
    'git revert': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const targetStr = args[0];
        const targetHash = Object.keys(state.commits).find(k => k.startsWith(targetStr));
        const targetCommit = state.commits[targetHash];
        if (!targetCommit) return printTerminal(`fatal: bad revision '${targetStr}'`, 'error');
        const branch = getHeadBranch();
        const currentId = resolveHead();
        const newId = generateCommitId();
        state.commits[newId] = {
            id: newId, message: `Revert "${targetCommit.message}"`, timestamp: Date.now(),
            parents: currentId ? [currentId] : [], branch: branch || 'detached', color: getBranchColor(branch)
        };
        if (branch) state.branches[branch] = newId; else state.HEAD = newId;
        printTerminal(`[${branch || 'detached HEAD'} ${newId}] Revert "${targetCommit.message}"`, 'success');
        renderGraph();
    },
    'git reset': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const isHard = args.includes('--hard');
        const isSoft = args.includes('--soft');
        const isMixed = args.includes('--mixed') || (!isHard && !isSoft);
        const targetStr = args.find(a => !a.startsWith('-')) || 'HEAD';
        
        let target = state.branches[targetStr] || Object.keys(state.commits).find(k => k.startsWith(targetStr));
        if (targetStr === 'HEAD') target = resolveHead();
        else if (targetStr.startsWith('HEAD~')) {
             let steps = parseInt(targetStr.split('~')[1]) || 1;
             let curr = resolveHead();
             while (steps > 0 && curr && state.commits[curr].parents.length) {
                 curr = state.commits[curr].parents[0];
                 steps--;
             }
             target = curr;
        }

        if (!target) return printTerminal(`fatal: Cannot find commit ${targetStr}`, 'error');
        
        const branch = getHeadBranch();
        if (branch) state.branches[branch] = target; else state.HEAD = target;
        
        if (isHard) {
            state.stagedFiles = []; state.modifiedFiles = [];
            printTerminal(`HEAD is now at ${target.substring(0, 7)} ${state.commits[target].message}`, 'success');
        } else if (isMixed) {
            state.modifiedFiles = [...new Set([...state.modifiedFiles, ...state.stagedFiles])];
            state.stagedFiles = [];
            printTerminal('Unstaged changes after reset:', 'warn');
        }
        renderGraph();
    },
    'git stash': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (!state.stashes) state.stashes = [];
        if (args[0] === 'pop') {
            if (!state.stashes.length) return printTerminal('No stash entries found.', 'error');
            const stashed = state.stashes.pop();
            state.modifiedFiles = [...new Set([...state.modifiedFiles, ...stashed.modified])];
            state.stagedFiles = [...new Set([...state.stagedFiles, ...stashed.staged])];
            printTerminal(`Dropped refs/stash@{0} (${stashed.id})`);
            return;
        }
        if (args[0] === 'clear') { state.stashes = []; return printTerminal('Stash cleared.'); }
        if (!state.modifiedFiles.length && !state.stagedFiles.length) return printTerminal('No local changes to save');
        const branch = getHeadBranch() || 'detached HEAD';
        const headCommit = state.commits[resolveHead()];
        const stashMsg = `WIP on ${branch}: ${headCommit ? headCommit.id.substring(0, 7) : ''} ${headCommit ? headCommit.message : ''}`;
        state.stashes.push({ modified: [...state.modifiedFiles], staged: [...state.stagedFiles], id: generateCommitId() });
        state.modifiedFiles = []; state.stagedFiles = [];
        printTerminal(`Saved working directory and index state ${stashMsg}`, 'success');
    },
    'git log': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const oneline = args.includes('--oneline');
        const graph = args.includes('--graph');
        let curr = resolveHead();
        const visited = new Set();
        const queue = curr ? [curr] : [];
        while (queue.length) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            const c = state.commits[id];
            
            let refNames = [];
            if (state.HEAD === id) refNames.push('HEAD');
            else if (state.HEAD === `refs/heads/${c.branch}` && state.branches[c.branch] === id) refNames.push(`HEAD -> ${c.branch}`);
            Object.keys(state.branches).forEach(b => {
                if (state.branches[b] === id && state.HEAD !== `refs/heads/${b}`) refNames.push(b);
            });
            const refStr = refNames.length ? ` (${refNames.join(', ')})` : '';

            if (oneline) {
                printTerminal(`${graph ? '* ' : ''}${c.id.substring(0, 7)}${refStr} ${c.message}`, 'warn');
            } else {
                printTerminal(`commit ${c.id}${refStr}`, 'warn');
                printTerminal(`Author: Mojahid <mojahid@gitice.com>\nDate: ${new Date(c.timestamp).toUTCString()}\n\n    ${c.message}\n`);
            }
            c.parents.forEach(p => queue.push(p));
        }
    },
    ls: (args) => {
        const target = args[0] && !args[0].startsWith('-') ? getFullPath(args[0]) : currentPath;
        const entry = fileSystem[target];
        if (entry && entry.type === 'dir') printTerminal(entry.children.join('  '));
        else if (entry) printTerminal(args[0]);
        else printTerminal(`ls: cannot access '${args[0]}': No such file or directory`, 'error');
    },
    pwd: () => printTerminal(currentPath),
    cd: (args) => {
        const path = args[0] || '~';
        if (path === '~') { currentPath = '/'; updatePrompt(); return; }
        const target = getFullPath(path);
        if (fileSystem[target] && fileSystem[target].type === 'dir') { currentPath = target; updatePrompt(); }
        else printTerminal(`bash: cd: ${path}: No such file or directory`, 'error');
    },
    touch: (args) => {
        if (!args.length) return printTerminal('touch: missing file operand', 'error');
        args.forEach(f => {
            if (!f.startsWith('-') && !state.modifiedFiles.includes(f) && !state.stagedFiles.includes(f)) {
                 state.modifiedFiles.push(f);
            }
        });
    },
    clear: () => { terminalOutput.innerHTML = ''; }
};

// --- Graph Rendering ---
function renderGraph() {
    if (!nodesContainer || !svgCanvas) return;
    nodesContainer.innerHTML = '';
    svgCanvas.innerHTML = '';

    // Garbage collection: remove unreachable commits
    const reachable = new Set();
    const queue = [resolveHead()];
    Object.values(state.branches).forEach(hash => { if (hash) queue.push(hash); });
    
    while (queue.length) {
        const id = queue.shift();
        if (id && !reachable.has(id) && state.commits[id]) {
            reachable.add(id);
            state.commits[id].parents.forEach(p => queue.push(p));
        }
    }
    
    Object.keys(state.commits).forEach(id => {
        if (!reachable.has(id)) delete state.commits[id];
    });

    if (!Object.keys(state.commits).length) return;

    const commitList = Object.values(state.commits).sort((a, b) => a.timestamp - b.timestamp);
    const tracks = ['main', 'master', 'develop'];
    const layout = {};
    let y = 80;
    const X_SPACING = 100, Y_SPACING = 80;

    commitList.forEach(c => {
        let tIdx = tracks.indexOf(c.branch);
        if (tIdx === -1) { tIdx = tracks.length; tracks.push(c.branch); }
        layout[c.id] = { x: 80 + tIdx * X_SPACING, y };
        y += Y_SPACING;
    });

    const drawCurve = (x1, y1, x2, y2, color) => {
        if (x1 === x2) return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
        const midY = (y1 + y2) / 2, r = 20;
        const path = `M ${x1} ${y1} L ${x1} ${midY - r} Q ${x1} ${midY}, ${(x1+x2)/2} ${midY} Q ${x2} ${midY}, ${x2} ${midY + r} L ${x2} ${y2}`;
        return `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.6" />`;
    };

    let svgStr = '';
    commitList.forEach(c => {
        const {x, y} = layout[c.id];
        c.parents.forEach((pId, i) => {
            if (layout[pId]) svgStr += drawCurve(layout[pId].x, layout[pId].y, x, y, i > 0 ? c.color : (state.commits[pId]?.color || '#475569'));
        });
    });
    svgCanvas.innerHTML = svgStr;

    const labels = {};
    Object.keys(state.branches).forEach(b => {
        const id = state.branches[b];
        if (id) { if (!labels[id]) labels[id] = []; labels[id].push({ name: b, isHead: getHeadBranch() === b }); }
    });

    commitList.forEach(c => {
        const {x, y} = layout[c.id], isHead = resolveHead() === c.id;
        const node = document.createElement('div');
        node.className = `commit-node ${isHead ? 'head-node' : ''}`;
        node.style.left = `${x}px`; node.style.top = `${y}px`;
        node.style.backgroundColor = c.color;
        node.textContent = c.id.substring(0, 4);
        node.onclick = () => {
            if (navigator.clipboard) { navigator.clipboard.writeText(c.id); showToast(`Copied: ${c.id}`); }
        };
        
        node.oncontextmenu = (e) => {
            e.preventDefault();
            contextMenuTarget = c.id;
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
            contextMenu.classList.remove('hidden');
        };
        
        if (isHead) {
            const tag = document.createElement('div');
            tag.className = 'head-tag'; tag.textContent = 'HEAD';
            node.appendChild(tag);
        }

        const lbl = document.createElement('div');
        lbl.className = 'commit-label';
        let tags = '';
        if (labels[c.id]) tags = `<div class="branch-tags">${labels[c.id].map(l => `<span class="branch-tag ${l.isHead ? 'head' : ''}">${l.name}</span>`).join('')}</div>`;
        lbl.innerHTML = `${tags}<div class="commit-msg">${c.message}</div>`;
        node.appendChild(lbl);
        nodesContainer.appendChild(node);
    });

    const maxY = Math.max(...Object.values(layout).map(l => l.y));
    const targetY = -(maxY - (visualPanel?.clientHeight || 600) + 150);
    if (targetY < 0) {
        currentTranslateY = targetY; initialTranslateY = targetY;
        if (canvasContainer) canvasContainer.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
    }
}

// --- Scenarios ---
function resetState() {
    state = {
        initialized: false, commits: {}, branches: {}, HEAD: null, commitCounter: 0,
        stagedFiles: [], modifiedFiles: ['App.js', 'styles.css'], stashes: []
    };
    if (terminalOutput) terminalOutput.innerHTML = '';
    renderGraph();
}

function mockSimple() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['--allow-empty', '-m', 'Initial commit']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Setup project structure']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Add landing page']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Fix CSS layout issues']);
    printTerminal('Loaded Simple (Linear) Scenario.', 'success');
}
function mockIntermediate() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['--allow-empty', '-m', 'Initial commit']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Setup express server']);
    
    gitCommands['git checkout'](['-b', 'feature/auth']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Add JWT logic']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Add login UI components']);
    
    gitCommands['git checkout'](['main']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Update README.md']);
    
    gitCommands['git merge'](['feature/auth']);
    printTerminal('Loaded Intermediate (Branching) Scenario.', 'success');
}
function mockComplex() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['--allow-empty', '-m', 'Initial commit']);
    
    gitCommands['git checkout'](['-b', 'develop']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Setup development environment']);
    
    gitCommands['git checkout'](['-b', 'feature/dashboard']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Add dashboard skeleton']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git checkout'](['-b', 'feature/api']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Create user endpoints']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['feature/dashboard']);
    
    gitCommands['git checkout'](['main']);
    gitCommands['git checkout'](['-b', 'hotfix/security']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Fix severe security vulnerability']);
    gitCommands['git checkout'](['main']);
    gitCommands['git merge'](['hotfix/security']);
    printTerminal('Loaded Complex (Collaborative) Scenario.', 'success');
}
function mockAdvanced() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['--allow-empty', '-m', 'Initial commit']);
    
    gitCommands['git checkout'](['-b', 'develop']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Add core utilities']);
    
    gitCommands['git checkout'](['-b', 'feature/payment']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Integrate Stripe API']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git checkout'](['-b', 'feature/notifications']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Add email service']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['feature/payment']);
    
    gitCommands['git checkout'](['-b', 'release/v1.0']);
    gitCommands['git commit'](['--allow-empty', '-m', 'Bump version to 1.0']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['feature/notifications']);
    
    gitCommands['git checkout'](['main']);
    gitCommands['git merge'](['release/v1.0']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['release/v1.0']);
    printTerminal('Loaded Advanced (Enterprise) Scenario.', 'success');
}

function mockCustom() {
    resetState(); 
    gitCommands['git init']();
    printTerminal('Loaded Custom (Sandbox) Scenario. Start typing commands to build your own graph!', 'success');
}

// --- Initialization & Events ---
window.onload = () => {
    mainContent.classList.add(currentLayout);
    updatePrompt();
    mockSimple();

    toggleLayoutBtn.onclick = () => {
        mainContent.classList.remove(currentLayout);
        currentLayout = currentLayout === 'horizontal' ? 'vertical' : 'horizontal';
        mainContent.classList.add(currentLayout);
        visualPanel.style.flex = '1'; terminalPanel.style.flex = '1';
        visualPanel.style.width = ''; visualPanel.style.height = '';
        terminalPanel.style.width = ''; terminalPanel.style.height = '';
        setTimeout(renderGraph, 10);
    };

    projectSelect.onchange = (e) => {
        const v = e.target.value;
        
        if (v === 'custom') {
            customControls.classList.remove('hidden');
        } else {
            customControls.classList.add('hidden');
        }

        if (v === 'simple') mockSimple();
        else if (v === 'intermediate') mockIntermediate();
        else if (v === 'complex') mockComplex();
        else if (v === 'advanced') mockAdvanced();
        else if (v === 'custom') mockCustom();
    };

    btnCommit.onclick = () => {
        showModal('Commit', 'Enter commit message:', false, 'Custom commit', (msg) => {
            if (msg) gitCommands['git commit'](['--allow-empty', '-m', msg]);
        });
    };

    btnBranch.onclick = () => {
        showModal('Create Branch', 'Enter new branch name:', false, '', (branchName) => {
            if (branchName) {
                gitCommands['git branch']([branchName]);
                showModal('Switch Branch', `Switch to branch '${branchName}'?`, true, '', (confirm) => {
                    if (confirm) gitCommands['git checkout']([branchName]);
                });
            }
        });
    };

    btnCheckout.onclick = () => {
        showModal('Checkout', 'Enter branch name to checkout:', false, '', (branchName) => {
            if (branchName) gitCommands['git checkout']([branchName]);
        });
    };

    btnMerge.onclick = () => {
        showModal('Merge', 'Enter branch name to merge into current:', false, '', (branchName) => {
            if (branchName) gitCommands['git merge']([branchName]);
        });
    };

    document.addEventListener('click', () => {
        if (contextMenu) contextMenu.classList.add('hidden');
    });

    menuCommit.onclick = () => {
        if (!contextMenuTarget) return;
        gitCommands['git checkout']([contextMenuTarget]);
        showModal('Commit', 'Enter commit message:', false, 'Custom commit', (msg) => {
            if (msg) gitCommands['git commit'](['--allow-empty', '-m', msg]);
        });
    };

    menuBranch.onclick = () => {
        if (!contextMenuTarget) return;
        showModal('Create Branch', 'Enter new branch name:', false, '', (branchName) => {
            if (branchName) {
                gitCommands['git checkout']([contextMenuTarget]);
                gitCommands['git branch']([branchName]);
                showModal('Switch Branch', `Switch to branch '${branchName}'?`, true, '', (confirm) => {
                    if (confirm) gitCommands['git checkout']([branchName]);
                });
            }
        });
    };

    menuCheckout.onclick = () => {
        if (!contextMenuTarget) return;
        gitCommands['git checkout']([contextMenuTarget]);
    };

    menuCtxMerge.onclick = () => {
        if (!contextMenuTarget) return;
        gitCommands['git merge']([contextMenuTarget]);
    };

    resizer.onmousedown = (e) => {
        isResizing = true;
        document.body.style.cursor = currentLayout === 'horizontal' ? 'col-resize' : 'row-resize';
        mainContent.classList.add('resizing');
        e.preventDefault();
    };

    visualPanel.onmousedown = (e) => {
        isDragging = true; visualPanel.classList.add('dragging');
        startX = e.clientX; startY = e.clientY;
    };

    visualPanel.addEventListener('wheel', (e) => {
        e.preventDefault();
        currentTranslateX -= e.deltaX;
        currentTranslateY -= e.deltaY;
        initialTranslateX = currentTranslateX;
        initialTranslateY = currentTranslateY;
        canvasContainer.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
    }, { passive: false });

    window.onmousemove = (e) => {
        if (isResizing) {
            const rect = mainContent.getBoundingClientRect();
            const p = currentLayout === 'horizontal' ? ((e.clientX - rect.left) / mainContent.clientWidth) * 100 : ((e.clientY - rect.top) / mainContent.clientHeight) * 100;
            if (p > 15 && p < 85) { visualPanel.style.flex = `0 0 ${p}%`; terminalPanel.style.flex = `0 0 ${100 - p}%`; }
        } else if (isDragging) {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            currentTranslateX = initialTranslateX + dx; currentTranslateY = initialTranslateY + dy;
            canvasContainer.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
        }
    };

    window.onmouseup = () => {
        if (isResizing) { isResizing = false; document.body.style.cursor = 'default'; mainContent.classList.remove('resizing'); renderGraph(); }
        if (isDragging) { isDragging = false; visualPanel.classList.remove('dragging'); initialTranslateX = currentTranslateX; initialTranslateY = currentTranslateY; }
    };

    const parseCommand = (input) => {
        const tokens = input.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
        return tokens.map(t => t.replace(/^["']|["']$/g, ''));
    };

    let commandHistory = [];
    let historyIndex = -1;

    terminalInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const val = terminalInput.value.trim(); 
            if (val) {
                commandHistory.push(val);
                historyIndex = commandHistory.length;
            }
            terminalInput.value = ''; 
            if (!val) return;
            const displayPath = currentPath === '/' ? '~' : `~${currentPath}`;
            printTerminal(`mojahid@gitice:${displayPath}$ ${val}`);
            const parts = parseCommand(val), base = parts[0];
            if (base === 'git') {
                const sub = parts[1];
                if (sub === '--help' || sub === 'help') gitCommands.help();
                else if (gitCommands[`git ${sub}`]) gitCommands[`git ${sub}`](parts.slice(2));
                else printTerminal(`git: '${sub}' is not a git command.`, 'error');
            } else if (gitCommands[base]) gitCommands[base](parts.slice(1));
            else printTerminal(`bash: ${base}: command not found`, 'error');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                terminalInput.value = commandHistory[historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                terminalInput.value = commandHistory[historyIndex];
            } else {
                historyIndex = commandHistory.length;
                terminalInput.value = '';
            }
        }
    };

    terminalPanel.onclick = () => { if (!window.getSelection().toString()) terminalInput.focus(); };
};
