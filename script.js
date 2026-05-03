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
        printTerminal('\nAvailable Git Commands:');
        printTerminal('  git init           - Initialize a new repository');
        printTerminal('  git status         - Show the working tree status');
        printTerminal('  git add <file>     - Add file contents to the index');
        printTerminal('  git commit -m <msg>- Record changes to the repository');
        printTerminal('  git branch [name]  - List, create, or delete branches');
        printTerminal('  git checkout <br>  - Switch branches or restore working tree files');
        printTerminal('  git merge <br>     - Join two or more development histories together');
        printTerminal('  git reset --hard <h>- Reset current HEAD to specified state');
        printTerminal('  git log            - Show commit logs');
        printTerminal('\nTry "git help" or "git <command> --help" for more information.');
    },
    'git init': () => {
        if (state.initialized) { printTerminal('Reinitialized existing Git repository', 'info'); return; }
        state.initialized = true;
        state.branches = { 'main': null };
        state.HEAD = 'refs/heads/main';
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
        state.stagedFiles = [...state.modifiedFiles];
        state.modifiedFiles = [];
    },
    'git commit': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const msgIdx = args.indexOf('-m');
        const message = (msgIdx !== -1 && args[msgIdx + 1]) ? args[msgIdx + 1] : 'Update';
        const currentId = resolveHead();
        const newId = generateCommitId();
        const branch = getHeadBranch();
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
        if (args[0] === '-d' || args[0] === '-D') {
            const target = args[1];
            if (!target) return printTerminal('fatal: branch name required', 'error');
            if (state.branches[target] === undefined) return printTerminal(`error: branch '${target}' not found.`, 'error');
            if (getHeadBranch() === target) return printTerminal(`error: Cannot delete branch '${target}' checked out`, 'error');
            const hash = state.branches[target];
            delete state.branches[target];
            
            // Forcefully wipe out all commits associated with this branch to clear the visual track
            Object.keys(state.commits).forEach(id => {
                if (state.commits[id].branch === target) {
                    delete state.commits[id];
                }
            });
            
            printTerminal(`Deleted branch ${target} (was ${hash ? hash.substring(0, 7) : 'unknown'}).`);
            renderGraph();
            return;
        }
        if (state.branches[args[0]]) return printTerminal(`fatal: branch '${args[0]}' already exists`, 'error');
        state.branches[args[0]] = resolveHead();
        renderGraph();
    },
    'git checkout': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        let target = args[0];
        if (target === '-b') { gitCommands['git branch']([args[1]]); target = args[1]; }
        if (state.branches[target] !== undefined) { state.HEAD = `refs/heads/${target}`; printTerminal(`Switched to branch '${target}'`); }
        else {
            const hash = Object.keys(state.commits).find(k => k.startsWith(target));
            if (hash) { state.HEAD = hash; printTerminal(`Note: switching to '${hash}'. Detached HEAD.`, 'warn'); }
            else printTerminal(`error: pathspec '${target}' did not match`, 'error');
        }
        renderGraph();
    },
    'git merge': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const targetHash = state.branches[args[0]] || Object.keys(state.commits).find(k => k.startsWith(args[0]));
        if (!targetHash) return printTerminal(`merge: ${args[0]} - not something we can merge`, 'error');
        const current = resolveHead();
        if (current === targetHash) return printTerminal('Already up to date.');
        const newId = generateCommitId();
        const branch = getHeadBranch();
        state.commits[newId] = {
            id: newId, message: `Merge branch '${args[0]}'`, timestamp: Date.now(),
            parents: [current, targetHash], branch: branch || 'detached', color: getBranchColor(branch)
        };
        if (branch) state.branches[branch] = newId; else state.HEAD = newId;
        printTerminal('Merge made by recursive strategy.', 'success');
        renderGraph();
    },
    'git reset': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const isHard = args.includes('--hard');
        const targetStr = isHard ? (args[args.indexOf('--hard') + 1] || args[0]) : args[0];
        if (targetStr === '--hard') return printTerminal('fatal: must specify a commit to reset to', 'error');
        const target = state.branches[targetStr] || Object.keys(state.commits).find(k => k.startsWith(targetStr));
        if (!target) return printTerminal(`fatal: Cannot find commit ${targetStr}`, 'error');
        const branch = getHeadBranch();
        if (branch) state.branches[branch] = target; else state.HEAD = target;
        if (isHard) { state.stagedFiles = []; state.modifiedFiles = []; }
        printTerminal(`HEAD is now at ${target.substring(0, 7)} ${state.commits[target].message}`, 'success');
        renderGraph();
    },
    'git log': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        let curr = resolveHead();
        const visited = new Set();
        const queue = curr ? [curr] : [];
        while (queue.length) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            const c = state.commits[id];
            printTerminal(`commit ${c.id}`, 'warn');
            printTerminal(`Author: Mojahid <mojahid@gitice.com>\nDate: ${new Date(c.timestamp).toUTCString()}\n\n    ${c.message}\n`);
            c.parents.forEach(p => queue.push(p));
        }
    },
    ls: (args) => {
        const target = args[0] ? getFullPath(args[0]) : currentPath;
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
        stagedFiles: [], modifiedFiles: ['App.js', 'styles.css']
    };
    if (terminalOutput) terminalOutput.innerHTML = '';
    renderGraph();
}

function mockSimple() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['-m', 'Initial commit']);
    gitCommands['git commit'](['-m', 'Setup project structure']);
    gitCommands['git commit'](['-m', 'Add landing page']);
    gitCommands['git commit'](['-m', 'Fix CSS layout issues']);
    printTerminal('Loaded Simple (Linear) Scenario.', 'success');
}
function mockIntermediate() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['-m', 'Initial commit']);
    gitCommands['git commit'](['-m', 'Setup express server']);
    
    gitCommands['git checkout'](['-b', 'feature/auth']);
    gitCommands['git commit'](['-m', 'Add JWT logic']);
    gitCommands['git commit'](['-m', 'Add login UI components']);
    
    gitCommands['git checkout'](['main']);
    gitCommands['git commit'](['-m', 'Update README.md']);
    
    gitCommands['git merge'](['feature/auth']);
    printTerminal('Loaded Intermediate (Branching) Scenario.', 'success');
}
function mockComplex() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['-m', 'Initial commit']);
    
    gitCommands['git checkout'](['-b', 'develop']);
    gitCommands['git commit'](['-m', 'Setup development environment']);
    
    gitCommands['git checkout'](['-b', 'feature/dashboard']);
    gitCommands['git commit'](['-m', 'Add dashboard skeleton']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git checkout'](['-b', 'feature/api']);
    gitCommands['git commit'](['-m', 'Create user endpoints']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['feature/dashboard']);
    
    gitCommands['git checkout'](['main']);
    gitCommands['git checkout'](['-b', 'hotfix/security']);
    gitCommands['git commit'](['-m', 'Fix severe security vulnerability']);
    gitCommands['git checkout'](['main']);
    gitCommands['git merge'](['hotfix/security']);
    printTerminal('Loaded Complex (Collaborative) Scenario.', 'success');
}
function mockAdvanced() {
    resetState(); gitCommands['git init']();
    gitCommands['git commit'](['-m', 'Initial commit']);
    
    gitCommands['git checkout'](['-b', 'develop']);
    gitCommands['git commit'](['-m', 'Add core utilities']);
    
    gitCommands['git checkout'](['-b', 'feature/payment']);
    gitCommands['git commit'](['-m', 'Integrate Stripe API']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git checkout'](['-b', 'feature/notifications']);
    gitCommands['git commit'](['-m', 'Add email service']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['feature/payment']);
    
    gitCommands['git checkout'](['-b', 'release/v1.0']);
    gitCommands['git commit'](['-m', 'Bump version to 1.0']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['feature/notifications']);
    
    gitCommands['git checkout'](['main']);
    gitCommands['git merge'](['release/v1.0']);
    
    gitCommands['git checkout'](['develop']);
    gitCommands['git merge'](['release/v1.0']);
    printTerminal('Loaded Advanced (Enterprise) Scenario.', 'success');
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
        if (v === 'simple') mockSimple();
        else if (v === 'intermediate') mockIntermediate();
        else if (v === 'complex') mockComplex();
        else if (v === 'advanced') mockAdvanced();
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

    terminalInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const val = terminalInput.value.trim(); terminalInput.value = ''; if (!val) return;
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
        }
    };

    terminalPanel.onclick = () => { if (!window.getSelection().toString()) terminalInput.focus(); };
};
