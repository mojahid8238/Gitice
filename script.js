// DOM Elements
const terminalInput = document.getElementById('terminal-input');
const terminalOutput = document.getElementById('terminal-output');
const terminalBody = document.getElementById('terminal-body');
const nodesContainer = document.getElementById('nodes-container');
const svgCanvas = document.getElementById('git-graph-svg');
const visualPanel = document.querySelector('.visualization-panel');
const canvasContainer = document.querySelector('.canvas-container');

// Dragging state
let isDragging = false;
let startX, startY, initialTranslateX = 0, initialTranslateY = 0;
let currentTranslateX = 0, currentTranslateY = 0;

// Colors for branches
const branchColors = {
    'main': '#3b82f6',
    'master': '#3b82f6',
    'develop': '#10b981',
    'feature': '#f59e0b',
    'hotfix': '#ef4444',
    'release': '#8b5cf6',
    'default': '#ec4899'
};

const getBranchColor = (branchName) => {
    if (!branchName) return branchColors.default;
    if (branchName === 'main' || branchName === 'master') return branchColors.main;
    if (branchName.includes('develop') || branchName === 'dev') return branchColors.develop;
    if (branchName.includes('feat') || branchName.includes('feature')) return branchColors.feature;
    if (branchName.includes('hotfix') || branchName.includes('fix') || branchName.includes('bug')) return branchColors.hotfix;
    if (branchName.includes('release')) return branchColors.release;
    
    const colors = Object.values(branchColors);
    let hash = 0;
    for (let i = 0; i < branchName.length; i++) {
        hash = branchName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

// Git State
let state = {
    initialized: false,
    commits: {},
    branches: {},
    HEAD: null,
    commitCounter: 0,
    stagedFiles: [],
    modifiedFiles: ['src/App.js', 'src/styles.css', 'README.md', 'package.json']
};

// Mock File System
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

let currentPath = '/';

const updatePrompt = () => {
    const promptElement = document.querySelector('.prompt');
    const displayPath = currentPath === '/' ? '~' : `~${currentPath}`;
    if (promptElement) promptElement.textContent = `mojahid@gitice:${displayPath}$`;
};

// Utils
const getFullPath = (path) => {
    if (path.startsWith('/')) return path;
    if (path === '..') {
        if (currentPath === '/') return '/';
        const parts = currentPath.split('/').filter(p => p);
        parts.pop();
        return '/' + parts.join('/');
    }
    if (path === '.') return currentPath;
    return (currentPath === '/' ? '' : currentPath) + (path.startsWith('/') ? '' : '/') + path;
};

const generateCommitId = () => {
    state.commitCounter++;
    const hash = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0') + state.commitCounter.toString(16);
    return hash.substring(0, 7);
};

const printTerminal = (text, type = '') => {
    const div = document.createElement('div');
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = text;
    if (type) div.className = type;
    terminalOutput.appendChild(div);
    terminalBody.scrollTop = terminalBody.scrollHeight;
};

// Git Commands Implementation
const commands = {
    help: () => {
        printTerminal('Available Commands:');
        printTerminal('  ls [dir]           - List directory contents');
        printTerminal('  cd <dir>           - Change directory');
        printTerminal('  pwd                - Print working directory');
        printTerminal('  clear              - Clear terminal output');
        printTerminal('\nGit Commands:');
        printTerminal('  git init           - Initialize repository');
        printTerminal('  git status         - Show status');
        printTerminal('  git add .          - Stage all changes');
        printTerminal('  git commit -m ""   - Create commit');
        printTerminal('  git branch [name]  - List/Create branches');
        printTerminal('  git checkout <br>  - Switch branches');
        printTerminal('  git merge <br>     - Merge branches');
        printTerminal('  git log            - View history');
    },
    clear: () => {
        terminalOutput.innerHTML = '';
    },
    ls: (args) => {
        const target = args[0] ? getFullPath(args[0]) : currentPath;
        const entry = fileSystem[target];
        if (entry && entry.type === 'dir') {
            printTerminal(entry.children.join('  '));
        } else if (entry && entry.type === 'file') {
            printTerminal(args[0]);
        } else {
            printTerminal(`ls: cannot access '${args[0]}': No such file or directory`, 'error');
        }
    },
    pwd: () => {
        printTerminal(currentPath === '/' ? '/' : currentPath);
    },
    cd: (args) => {
        if (!args[0] || args[0] === '~') {
            currentPath = '/';
            updatePrompt();
            return;
        }
        const target = getFullPath(args[0]);
        if (fileSystem[target] && fileSystem[target].type === 'dir') {
            currentPath = target;
            updatePrompt();
        } else {
            printTerminal(`bash: cd: ${args[0]}: No such file or directory`, 'error');
        }
    },
    'git init': () => {
        if (state.initialized) {
            printTerminal('Reinitialized existing Git repository in /home/mojahid/repo/.git/', 'info');
            return;
        }
        state.initialized = true;
        state.branches = { 'main': null };
        state.HEAD = 'refs/heads/main';
        state.commits = {};
        printTerminal('Initialized empty Git repository in /home/mojahid/repo/.git/', 'success');
        renderGraph();
    },
    'git add': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        state.stagedFiles = [...state.modifiedFiles];
        state.modifiedFiles = [];
    },
    'git status': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const currentBranch = getHeadBranch();
        if (currentBranch) printTerminal(`On branch ${currentBranch}`);
        else printTerminal(`HEAD detached at ${resolveHead()}`);
        
        if (state.stagedFiles.length > 0) {
            printTerminal('Changes to be committed:');
            state.stagedFiles.forEach(f => printTerminal(`\tmodified:   ${f}`, 'success'));
        }
        if (state.modifiedFiles.length > 0) {
            printTerminal('\nChanges not staged for commit:');
            state.modifiedFiles.forEach(f => printTerminal(`\tmodified:   ${f}`, 'error'));
        }
        if (state.stagedFiles.length === 0 && state.modifiedFiles.length === 0) {
            printTerminal('nothing to commit, working tree clean');
        }
    },
    'git commit': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        let message = 'Update';
        const msgMatch = args.join(' ').match(/-m\s+["'](.*?)["']/);
        if (msgMatch) message = msgMatch[1];

        const currentCommitId = resolveHead();
        const newCommitId = generateCommitId();
        let currentBranch = getHeadBranch();

        const commit = {
            id: newCommitId,
            message: message,
            parents: currentCommitId ? [currentCommitId] : [],
            color: getBranchColor(currentBranch),
            branch: currentBranch || 'detached',
            timestamp: Date.now()
        };

        state.commits[newCommitId] = commit;
        if (currentBranch) state.branches[currentBranch] = newCommitId;
        else state.HEAD = newCommitId;
        
        state.stagedFiles = [];
        printTerminal(`[${currentBranch || 'detached HEAD'} ${newCommitId}] ${message}`, 'success');
        renderGraph();
    },
    'git branch': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (args.length === 0) {
            Object.keys(state.branches).forEach(b => {
                const prefix = getHeadBranch() === b ? '* ' : '  ';
                printTerminal(`${prefix}${b}`, getHeadBranch() === b ? 'success' : '');
            });
            return;
        }
        const branchName = args[0];
        if (state.branches[branchName] !== undefined) return printTerminal(`fatal: A branch named '${branchName}' already exists.`, 'error');
        const currentCommitId = resolveHead();
        state.branches[branchName] = currentCommitId;
        renderGraph();
    },
    'git checkout': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        let target = args[0];
        if (target === '-b') {
            target = args[1];
            commands['git branch']([target]);
        }
        if (state.branches[target] !== undefined) {
            state.HEAD = `refs/heads/${target}`;
            printTerminal(`Switched to branch '${target}'`);
        } else if (state.commits[target]) {
            state.HEAD = target;
            printTerminal(`Note: switching to '${target}'. You are in 'detached HEAD' state.`, 'warn');
        } else {
            printTerminal(`error: pathspec '${target}' did not match any file(s) known to git`, 'error');
        }
        renderGraph();
    },
    'git merge': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const targetBranch = args[0];
        const currentBranch = getHeadBranch();
        if (!currentBranch) return printTerminal('fatal: You are not on a branch.', 'error');
        if (currentBranch === targetBranch) return printTerminal('Already up to date.');

        const targetCommitId = state.branches[targetBranch];
        if (!targetCommitId) return printTerminal(`merge: ${targetBranch} - not something we can merge`, 'error');

        const currentCommitId = resolveHead();
        const newCommitId = generateCommitId();
        const commit = {
            id: newCommitId,
            message: `Merge branch '${targetBranch}' into ${currentBranch}`,
            parents: [currentCommitId, targetCommitId],
            color: getBranchColor(currentBranch),
            branch: currentBranch,
            timestamp: Date.now()
        };

        state.commits[newCommitId] = commit;
        state.branches[currentBranch] = newCommitId;
        printTerminal(`Merge made by the 'recursive' strategy.`, 'success');
        renderGraph();
    },
    'git log': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        let curr = resolveHead();
        if (!curr) return printTerminal('fatal: your current branch has no commits yet', 'error');
        const visited = new Set();
        const queue = [curr];
        while(queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            const c = state.commits[id];
            printTerminal(`commit ${c.id}`, 'warn');
            printTerminal(`Author: Mojahid <mojahid@example.com>\nDate:   ${new Date(c.timestamp).toUTCString()}\n\n    ${c.message}\n`);
            c.parents.forEach(p => queue.push(p));
        }
    }
};

// State Helpers
const resetState = () => {
    state = {
        initialized: false,
        commits: {},
        branches: {},
        HEAD: null,
        commitCounter: 0,
        stagedFiles: [],
        modifiedFiles: ['src/App.js', 'src/styles.css', 'README.md', 'package.json']
    };
    terminalOutput.innerHTML = '';
    renderGraph();
};

function getHeadBranch() {
    if (state.HEAD && state.HEAD.startsWith('refs/heads/')) return state.HEAD.replace('refs/heads/', '');
    return null;
}

function resolveHead() {
    const branch = getHeadBranch();
    if (branch) return state.branches[branch];
    return state.HEAD;
}

// Layout and Rendering Graph
function renderGraph() {
    nodesContainer.innerHTML = '';
    svgCanvas.innerHTML = '';
    if (Object.keys(state.commits).length === 0) return;

    const commitList = Object.values(state.commits).sort((a, b) => a.timestamp - b.timestamp);
    const tracks = ['main', 'master', 'develop'];
    const layout = {};
    let y = 80;
    const X_SPACING = 100;
    const Y_SPACING = 80;

    commitList.forEach((commit) => {
        let trackIndex = tracks.indexOf(commit.branch);
        if (trackIndex === -1) {
            trackIndex = tracks.length;
            tracks.push(commit.branch);
        }
        layout[commit.id] = { x: 80 + trackIndex * X_SPACING, y: y };
        y += Y_SPACING;
    });

    let svgContent = '';
    const drawCurve = (x1, y1, x2, y2, color) => {
        const radius = 20;
        if (x1 === x2) return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
        const midY = (y1 + y2) / 2;
        const path = `M ${x1} ${y1} L ${x1} ${midY - radius} Q ${x1} ${midY}, ${(x1+x2)/2} ${midY} Q ${x2} ${midY}, ${x2} ${midY + radius} L ${x2} ${y2}`;
        return `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.6" />`;
    };

    commitList.forEach(commit => {
        const {x, y} = layout[commit.id];
        commit.parents.forEach((parentId, index) => {
            const parentLayout = layout[parentId];
            if (parentLayout) {
                const isMergeEdge = index > 0;
                const edgeColor = isMergeEdge ? commit.color : (state.commits[parentId]?.color || '#475569');
                svgContent += drawCurve(parentLayout.x, parentLayout.y, x, y, edgeColor);
            }
        });
    });
    svgCanvas.innerHTML = svgContent;

    const labelsMap = {};
    Object.keys(state.branches).forEach(b => {
        const cId = state.branches[b];
        if (cId) {
            if (!labelsMap[cId]) labelsMap[cId] = [];
            labelsMap[cId].push({ name: b, isHead: getHeadBranch() === b });
        }
    });

    commitList.forEach(commit => {
        const {x, y} = layout[commit.id];
        const isHeadCommit = resolveHead() === commit.id;
        const node = document.createElement('div');
        node.className = `commit-node ${isHeadCommit ? 'head-node' : ''}`;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.backgroundColor = commit.color;
        node.title = `Commit: ${commit.id}\nMessage: ${commit.message}`;
        
        const labelContainer = document.createElement('div');
        labelContainer.className = 'commit-label';
        let tagsHtml = '';
        if (labelsMap[commit.id]) {
            tagsHtml = `<div class="branch-tags">` + 
                labelsMap[commit.id].map(l => `<span class="branch-tag ${l.isHead ? 'head' : ''}">${l.name}</span>`).join('') +
                `</div>`;
        }
        labelContainer.innerHTML = `${tagsHtml}<div class="commit-msg">${commit.message}</div>`;
        node.appendChild(labelContainer);
        nodesContainer.appendChild(node);
    });

    if (Object.keys(state.commits).length > 0 && layout) {
        let maxY = 0;
        Object.values(layout).forEach(l => { if (l.y > maxY) maxY = l.y; });
        const viewHeight = visualPanel.clientHeight;
        const targetY = -(maxY - viewHeight + 150);
        if (targetY < 0) {
            currentTranslateY = targetY;
            initialTranslateY = currentTranslateY;
            canvasContainer.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
        }
    }
}

// Scenario Implementations
const mockSimple = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Initial commit"']);
    commands['git commit'](['-m', '"Add LICENSE"']);
    commands['git commit'](['-m', '"Add README"']);
    commands['git commit'](['-m', '"Setup project structure"']);
    printTerminal('Loaded Simple (Linear) scenario.', 'success');
};

const mockIntermediate = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Initial commit"']);
    commands['git commit'](['-m', '"Base architecture"']);
    commands['git checkout'](['-b', 'feature/login']);
    commands['git commit'](['-m', '"Add login UI"']);
    commands['git commit'](['-m', '"Implement authentication"']);
    commands['git checkout'](['main']);
    commands['git commit'](['-m', '"Update dependencies"']);
    commands['git merge'](['feature/login']);
    printTerminal('Loaded Intermediate (Branching) scenario.', 'success');
};

const mockComplex = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Initial commit"']);
    commands['git checkout'](['-b', 'develop']);
    commands['git commit'](['-m', '"Setup dev environment"']);
    commands['git checkout'](['-b', 'feature/api']);
    commands['git commit'](['-m', '"REST API skeleton"']);
    commands['git checkout'](['develop']);
    commands['git checkout'](['-b', 'feature/ui']);
    commands['git commit'](['-m', '"Main dashboard UI"']);
    commands['git checkout'](['main']);
    commands['git checkout'](['-b', 'hotfix/v1.0.1']);
    commands['git commit'](['-m', '"Fix critical security bug"']);
    commands['git checkout'](['main']);
    commands['git merge'](['hotfix/v1.0.1']);
    commands['git checkout'](['develop']);
    commands['git merge'](['hotfix/v1.0.1']);
    commands['git merge'](['feature/api']);
    printTerminal('Loaded Complex (Collaborative) scenario.', 'success');
};

const mockAdvanced = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Core initialization"']);
    commands['git checkout'](['-b', 'develop']);
    for(let i=1; i<=3; i++) commands['git commit'](['-m', `"Sprint ${i} work"`]);
    commands['git checkout'](['-b', 'feature/big-change']);
    commands['git commit'](['-m', '"Architectural refactor"']);
    commands['git checkout'](['develop']);
    commands['git checkout'](['-b', 'release/v1.1.0']);
    commands['git commit'](['-m', '"Version bump v1.1.0"']);
    commands['git checkout'](['main']);
    commands['git merge'](['release/v1.1.0']);
    commands['git checkout'](['develop']);
    commands['git merge'](['release/v1.1.0']);
    commands['git checkout'](['feature/big-change']);
    commands['git merge'](['develop']);
    commands['git commit'](['-m', '"Finish big change"']);
    commands['git checkout'](['develop']);
    commands['git merge'](['feature/big-change']);
    printTerminal('Loaded Advanced (Enterprise) scenario.', 'success');
};

// Layout and Resizing Logic
const mainContent = document.querySelector('.main-content');
const resizer = document.getElementById('resizer');
const toggleLayoutBtn = document.getElementById('toggle-layout');
const terminalPanel = document.querySelector('.terminal-panel');
const projectSelect = document.getElementById('project-select');

let isResizing = false;
let currentLayout = 'horizontal';

mainContent.classList.add(currentLayout);

toggleLayoutBtn.addEventListener('click', () => {
    mainContent.classList.remove(currentLayout);
    currentLayout = currentLayout === 'horizontal' ? 'vertical' : 'horizontal';
    mainContent.classList.add(currentLayout);
    visualPanel.style.flex = '1';
    terminalPanel.style.flex = '1';
    visualPanel.style.width = '';
    visualPanel.style.height = '';
    terminalPanel.style.width = '';
    terminalPanel.style.height = '';
    setTimeout(renderGraph, 10);
});

projectSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'simple') mockSimple();
    else if (val === 'intermediate') mockIntermediate();
    else if (val === 'complex') mockComplex();
    else if (val === 'advanced') mockAdvanced();
});

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = currentLayout === 'horizontal' ? 'col-resize' : 'row-resize';
    mainContent.classList.add('resizing');
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const rect = mainContent.getBoundingClientRect();
    const percentage = currentLayout === 'horizontal' 
        ? ((e.clientX - rect.left) / mainContent.clientWidth) * 100
        : ((e.clientY - rect.top) / mainContent.clientHeight) * 100;
    
    if (percentage > 15 && percentage < 85) {
        visualPanel.style.flex = `0 0 ${percentage}%`;
        terminalPanel.style.flex = `0 0 ${100 - percentage}%`;
    }
});

window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
        mainContent.classList.remove('resizing');
        renderGraph();
    }
});

// Dragging logic for graph
visualPanel.addEventListener('mousedown', (e) => {
    isDragging = true;
    visualPanel.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    currentTranslateX = initialTranslateX + dx;
    currentTranslateY = initialTranslateY + dy;
    canvasContainer.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px)`;
});

window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    visualPanel.classList.remove('dragging');
    initialTranslateX = currentTranslateX;
    initialTranslateY = currentTranslateY;
});

// Terminal Focus
document.querySelector('.terminal-panel').addEventListener('click', () => {
    if (!window.getSelection().toString()) terminalInput.focus();
});

// Terminal Input Handling
terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const val = terminalInput.value.trim();
        terminalInput.value = '';
        if (!val) return;
        
        const displayPath = currentPath === '/' ? '~' : `~${currentPath}`;
        printTerminal(`mojahid@gitice:${displayPath}$ ${val}`);
        
        const parts = val.match(/(?:[^\s"']+|["'][^"']*["'])+/g);
        if (!parts) return;

        const baseCmd = parts[0];
        if (baseCmd === 'git') {
            if (parts.length > 1) {
                const gitSubCmd = parts[1];
                const fullCmd = `git ${gitSubCmd}`;
                const args = parts.slice(2).map(a => a.replace(/^["'](.*)["']$/, '$1'));
                if (commands[fullCmd]) commands[fullCmd](args);
                else printTerminal(`git: '${gitSubCmd}' is not a git command.`, 'error');
            } else {
                printTerminal(`usage: git <command> [<args>]`);
            }
        } else if (commands[baseCmd]) {
            const args = parts.slice(1).map(a => a.replace(/^["'](.*)["']$/, '$1'));
            commands[baseCmd](args);
        } else {
            printTerminal(`bash: ${baseCmd}: command not found`, 'error');
        }
    }
});

// Initial load
setTimeout(() => {
    updatePrompt();
    mockSimple();
}, 100);
