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
    
    // Hash branch name to a color deterministically
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
    HEAD: null, // "refs/heads/branchName" or "commitId"
    commitCounter: 0,
    stagedFiles: [],
    modifiedFiles: ['src/App.js', 'src/styles.css', 'README.md', 'package.json']
};

// Utils
const generateCommitId = () => {
    state.commitCounter++;
    // generate realistic-looking short hashes
    const hash = Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0') + state.commitCounter.toString(16);
    return hash.substring(0, 7);
};

const printTerminal = (text, type = '') => {
    const div = document.createElement('div');
    // preserve whitespace
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = text;
    if (type) div.className = type;
    terminalOutput.appendChild(div);
    terminalBody.scrollTop = terminalBody.scrollHeight;
};

// Git Commands Implementation
const commands = {
    help: () => {
        printTerminal('Gitice Simulator - Available Commands:');
        printTerminal('  git init             - Initialize the repository');
        printTerminal('  git add <file>       - Stage files for commit');
        printTerminal('  git status           - Show working tree status');
        printTerminal('  git commit -m "msg"  - Create a new commit');
        printTerminal('  git branch <name>    - List or create branches');
        printTerminal('  git checkout <name>  - Switch to a branch');
        printTerminal('  git merge <name>     - Merge a branch into current branch');
        printTerminal('  git log              - View commit history');
        printTerminal('  git push             - Mock push to remote');
        printTerminal('  git pull             - Mock pull from remote');
        printTerminal('  clear                - Clear terminal output');
        printTerminal('  ls                   - List files');
    },
    clear: () => {
        terminalOutput.innerHTML = '';
    },
    ls: () => {
        printTerminal('src/  public/  node_modules/  package.json  README.md  .gitignore');
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
        if (args.length === 0) return printTerminal('Nothing specified, nothing added.\nMaybe you wanted to say \'git add .\'?');
        state.stagedFiles = [...state.modifiedFiles];
        state.modifiedFiles = [];
        // silent success
    },
    'git status': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        const currentBranch = getHeadBranch();
        if (currentBranch) {
            printTerminal(`On branch ${currentBranch}`);
        } else {
            printTerminal(`HEAD detached at ${resolveHead()}`);
        }
        
        if (state.stagedFiles.length > 0) {
            printTerminal('Changes to be committed:');
            printTerminal('  (use "git restore --staged <file>..." to unstage)', 'info');
            state.stagedFiles.forEach(f => printTerminal(`\tmodified:   ${f}`, 'success'));
        }
        
        if (state.modifiedFiles.length > 0) {
            printTerminal('\nChanges not staged for commit:');
            printTerminal('  (use "git add <file>..." to update what will be committed)', 'info');
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
        if (msgMatch) {
            message = msgMatch[1];
        }

        const currentCommitId = resolveHead();
        const newCommitId = generateCommitId();
        
        let currentBranch = getHeadBranch();
        let color = getBranchColor(currentBranch);

        const commit = {
            id: newCommitId,
            message: message,
            parents: currentCommitId ? [currentCommitId] : [],
            color: color,
            branch: currentBranch || 'detached',
            timestamp: Date.now()
        };

        state.commits[newCommitId] = commit;

        if (currentBranch) {
            state.branches[currentBranch] = newCommitId;
        } else {
            state.HEAD = newCommitId;
        }
        
        state.stagedFiles = [];
        // Add random modified file for next time
        if (Math.random() > 0.5) {
            const files = ['src/utils.js', 'src/components/Header.jsx', 'public/index.html', '.env.example'];
            state.modifiedFiles.push(files[Math.floor(Math.random() * files.length)]);
        }

        printTerminal(`[${currentBranch || 'detached HEAD'} ${newCommitId}] ${message}`, 'success');
        renderGraph();
    },
    'git branch': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (args.length === 0) {
            // list branches
            Object.keys(state.branches).forEach(b => {
                const prefix = getHeadBranch() === b ? '* ' : '  ';
                printTerminal(`${prefix}${b}`, getHeadBranch() === b ? 'success' : '');
            });
            return;
        }
        
        const branchName = args[0];
        if (state.branches[branchName] !== undefined) {
            return printTerminal(`fatal: A branch named '${branchName}' already exists.`, 'error');
        }

        const currentCommitId = resolveHead();
        if (!currentCommitId) {
            return printTerminal('fatal: Not a valid object name: \'main\'.', 'error');
        }

        state.branches[branchName] = currentCommitId;
        renderGraph();
    },
    'git checkout': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (args.length === 0) return printTerminal('fatal: missing branch name', 'error');

        let target = args[0];
        let createBranch = false;
        
        if (target === '-b') {
            createBranch = true;
            target = args[1];
            if (!target) return printTerminal('fatal: missing branch name', 'error');
        }

        if (createBranch) {
            if (state.branches[target] !== undefined) {
                return printTerminal(`fatal: A branch named '${target}' already exists.`, 'error');
            }
            const currentCommitId = resolveHead();
            if (!currentCommitId) return printTerminal('fatal: Not a valid object name: \'main\'.', 'error');
            state.branches[target] = currentCommitId;
            state.HEAD = `refs/heads/${target}`;
            printTerminal(`Switched to a new branch '${target}'`);
            renderGraph();
            return;
        }

        if (state.branches[target] !== undefined) {
            state.HEAD = `refs/heads/${target}`;
            printTerminal(`Switched to branch '${target}'`);
        } else if (state.commits[target]) {
            state.HEAD = target;
            printTerminal(`Note: switching to '${target}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them...`, 'warn');
        } else {
            printTerminal(`error: pathspec '${target}' did not match any file(s) known to git`, 'error');
        }
        renderGraph();
    },
    'git merge': (args) => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        if (args.length === 0) return printTerminal('fatal: missing branch name', 'error');

        const targetBranch = args[0];
        const currentBranch = getHeadBranch();

        if (!currentBranch) {
            return printTerminal('fatal: You are not on a branch.', 'error');
        }

        if (currentBranch === targetBranch) {
            return printTerminal('Already up to date.');
        }

        const targetCommitId = state.branches[targetBranch];
        if (!targetCommitId) {
            return printTerminal(`merge: ${targetBranch} - not something we can merge`, 'error');
        }

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
            if (c.parents.length > 1) {
                printTerminal(`Merge: ${c.parents.map(p=>p.substring(0,7)).join(' ')}`);
            }
            printTerminal(`Author: Mojahid <mojahid@example.com>`);
            printTerminal(`Date:   ${new Date(c.timestamp).toUTCString()}\n`);
            printTerminal(`    ${c.message}\n`);
            
            c.parents.forEach(p => queue.push(p));
        }
    },
    'git push': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        printTerminal('Enumerating objects: 5, done.');
        printTerminal('Counting objects: 100% (5/5), done.');
        printTerminal('Writing objects: 100% (3/3), 321 bytes | 321.00 KiB/s, done.');
        printTerminal('Total 3 (delta 2), reused 0 (delta 0)');
        printTerminal(`To github.com:mojahid/gitice.git`);
        printTerminal(`   ${resolveHead()}..  ${getHeadBranch() || 'HEAD'} -> ${getHeadBranch() || 'HEAD'}`);
    },
    'git pull': () => {
        if (!state.initialized) return printTerminal('fatal: not a git repository', 'error');
        printTerminal('Already up to date.');
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
    if (state.HEAD && state.HEAD.startsWith('refs/heads/')) {
        return state.HEAD.replace('refs/heads/', '');
    }
    return null;
}

function resolveHead() {
    const branch = getHeadBranch();
    if (branch) {
        return state.branches[branch];
    }
    return state.HEAD; // detached HEAD commit ID
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
        
        layout[commit.id] = {
            x: 80 + trackIndex * X_SPACING,
            y: y
        };
        y += Y_SPACING;
    });

    let svgContent = '';
    
    const drawCurve = (x1, y1, x2, y2, color) => {
        const radius = 20;
        if (x1 === x2) {
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
        }
        
        // S-curve for branching/merging
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
            const isHead = getHeadBranch() === b;
            labelsMap[cId].push({ name: b, isHead });
        }
    });

    if (!getHeadBranch() && state.HEAD) {
         if (!labelsMap[state.HEAD]) labelsMap[state.HEAD] = [];
         labelsMap[state.HEAD].push({ name: 'HEAD', isHead: true });
    }

    commitList.forEach(commit => {
        const {x, y} = layout[commit.id];
        const isHeadCommit = resolveHead() === commit.id;
        
        const node = document.createElement('div');
        node.className = `commit-node ${isHeadCommit ? 'head-node' : ''}`;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.backgroundColor = commit.color;
        node.style.borderColor = `rgba(255, 255, 255, 0.4)`;
        node.title = `Commit: ${commit.id}\nMessage: ${commit.message}\nBranch: ${commit.branch}`;
        
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


// Terminal Input Handling
terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const val = terminalInput.value.trim();
        terminalInput.value = '';
        
        if (!val) return;
        
        printTerminal(`mojahid@gitice:~/repo$ ${val}`);
        
        const parts = val.match(/(?:[^\s"']+|["'][^"']*["'])+/g);
        if (!parts) return;

        const baseCmd = parts[0];
        
        if (baseCmd === 'git') {
            if (parts.length > 1) {
                const gitSubCmd = parts[1];
                const fullCmd = `git ${gitSubCmd}`;
                const args = parts.slice(2).map(a => a.replace(/^["'](.*)["']$/, '$1'));
                
                if (commands[fullCmd]) {
                    commands[fullCmd](args);
                } else {
                    printTerminal(`git: '${gitSubCmd}' is not a git command. See 'git --help'.`, 'error');
                }
            } else {
                printTerminal(`usage: git [--version] [--help] [-C <path>] <command> [<args>]`);
            }
        } else if (commands[baseCmd]) {
            const args = parts.slice(1).map(a => a.replace(/^["'](.*)["']$/, '$1'));
            commands[baseCmd](args);
        } else {
            printTerminal(`bash: ${baseCmd}: command not found`, 'error');
        }
    }
});

document.querySelector('.terminal-panel').addEventListener('click', () => {
    if (!window.getSelection().toString()) {
        terminalInput.focus();
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

// Mock Codebase Scenarios
const mockCodebase = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Initial commit"']);
    for (let i = 0; i < 3; i++) {
        commands['git commit'](['-m', `"Setup project architecture part ${i+1}"`]);
    }
    commands['git checkout'](['-b', 'develop']);
    commands['git commit'](['-m', '"Add common utils"']);
    commands['git checkout'](['-b', 'feature/auth']);
    commands['git commit'](['-m', '"Add login component"']);
    commands['git commit'](['-m', '"Integrate OAuth2"']);
    commands['git checkout'](['develop']);
    commands['git commit'](['-m', '"Update dependencies"']);
    commands['git checkout'](['-b', 'feature/dashboard']);
    commands['git commit'](['-m', '"Create dashboard layout"']);
    commands['git checkout'](['develop']);
    commands['git merge'](['feature/auth']);
    commands['git checkout'](['main']);
    commands['git checkout'](['-b', 'hotfix/security']);
    commands['git commit'](['-m', '"Fix critical vulnerability"']);
    commands['git checkout'](['main']);
    commands['git merge'](['hotfix/security']);
    commands['git checkout'](['feature/dashboard']);
    commands['git commit'](['-m', '"Add charts component"']);
    commands['git checkout'](['develop']);
    commands['git merge'](['feature/dashboard']);
    commands['git checkout'](['-b', 'release/v1.0.0']);
    commands['git commit'](['-m', '"Bump version to 1.0.0"']);
    commands['git checkout'](['main']);
    commands['git merge'](['release/v1.0.0']);
    commands['git checkout'](['develop']);
    commands['git merge'](['release/v1.0.0']);
    commands['git checkout'](['main']);
    commands['clear']();
    printTerminal('Welcome to Gitice Simulator.', 'success');
    printTerminal('A complex Git history has been generated for you (Default Demo).');
    printTerminal("Try typing 'git log', 'git status', 'git branch', or create new commits!");
    printTerminal("\nmojahid@gitice:~/repo$ git status");
    commands['git status']();
};

const mockFrontendProject = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"chore: initial CRA setup"']);
    commands['git checkout'](['-b', 'feat/ui-kit']);
    commands['git commit'](['-m', '"add button component"']);
    commands['git commit'](['-m', '"add input component"']);
    commands['git checkout'](['main']);
    commands['git commit'](['-m', '"docs: update readme"']);
    commands['git checkout'](['feat/ui-kit']);
    commands['git commit'](['-m', '"add modal component"']);
    commands['git checkout'](['main']);
    commands['git merge'](['feat/ui-kit']);
    commands['git checkout'](['-b', 'fix/nav-mobile']);
    commands['git commit'](['-m', '"fix: burger menu z-index"']);
    commands['git checkout'](['main']);
    commands['git merge'](['fix/nav-mobile']);
    commands['clear']();
    printTerminal('Loaded Frontend App codebase.', 'info');
    printTerminal('A typical UI development workflow with features and fixes.');
};

const mockBackendProject = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Initial microservice skeleton"']);
    commands['git checkout'](['-b', 'api/users']);
    commands['git commit'](['-m', '"Implement GET /users"']);
    commands['git checkout'](['-b', 'api/auth']);
    commands['git commit'](['-m', '"Implement POST /login"']);
    commands['git checkout'](['api/users']);
    commands['git commit'](['-m', '"Implement POST /users"']);
    commands['git checkout'](['main']);
    commands['git checkout'](['-b', 'infra/k8s']);
    commands['git commit'](['-m', '"Add kubernetes manifests"']);
    commands['git checkout'](['main']);
    commands['git merge'](['infra/k8s']);
    commands['git merge'](['api/users']);
    commands['git merge'](['api/auth']);
    commands['clear']();
    printTerminal('Loaded Microservices codebase.', 'info');
    printTerminal('Parallel development of API features and infrastructure.');
};

const mockRefactorProject = () => {
    resetState();
    commands['git init']();
    commands['git commit'](['-m', '"Legacy code v0.1"']);
    for(let i=1; i<=5; i++) {
        commands['git commit'](['-m', `"Legacy patch ${i}"`]);
    }
    commands['git checkout'](['-b', 'refactor/core-logic']);
    commands['git commit'](['-m', '"Extract interfaces"']);
    commands['git commit'](['-m', '"Inject dependencies"']);
    commands['git checkout'](['main']);
    commands['git commit'](['-m', '"Urgent hotfix on legacy"']);
    commands['git checkout'](['refactor/core-logic']);
    commands['git merge'](['main']);
    commands['git commit'](['-m', '"Finish refactoring"']);
    commands['git checkout'](['main']);
    commands['git merge'](['refactor/core-logic']);
    commands['clear']();
    printTerminal('Loaded Legacy Refactor codebase.', 'info');
    printTerminal('Long-running refactoring branch merged back with conflict resolution patterns.');
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
    if (val === 'default') mockCodebase();
    else if (val === 'frontend') mockFrontendProject();
    else if (val === 'backend') mockBackendProject();
    else if (val === 'refactor') mockRefactorProject();
});

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = currentLayout === 'horizontal' ? 'col-resize' : 'row-resize';
    mainContent.classList.add('resizing');
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    if (currentLayout === 'horizontal') {
        const containerWidth = mainContent.clientWidth;
        const newVisualWidth = e.clientX - mainContent.getBoundingClientRect().left;
        const percentage = (newVisualWidth / containerWidth) * 100;
        if (percentage > 20 && percentage < 80) {
            visualPanel.style.flex = `0 0 ${percentage}%`;
            terminalPanel.style.flex = `0 0 ${100 - percentage}%`;
        }
    } else {
        const containerHeight = mainContent.clientHeight;
        const newVisualHeight = e.clientY - mainContent.getBoundingClientRect().top;
        const percentage = (newVisualHeight / containerHeight) * 100;
        if (percentage > 20 && percentage < 80) {
            visualPanel.style.flex = `0 0 ${percentage}%`;
            terminalPanel.style.flex = `0 0 ${100 - percentage}%`;
        }
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

// Initial load
setTimeout(() => {
    mockCodebase();
}, 100);
