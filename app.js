// Floor Planner Application Logic

class FloorPlanner {
    constructor() {
        // State
        this.room = {
            width: 500, // cm
            length: 400, // cm
            height: 260  // cm
        };
        this.items = []; // Array of { id, label, type, w, l, h, x, y, rotation, color }
        this.selectedItemId = null;
        this.gridSnap = true;
        this.gridSize = 10; // cm grid snap

        // 2D Canvas State
        this.canvas = document.getElementById('floorCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scale = 1; // px per cm
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.dragMode = null; // 'move', 'rotate', 'resize'
        this.dragTarget = null;
        this.dragOffset = { x: 0, y: 0 };
        this.activeView = '2d';

        // Tape Measure State
        this.tapeMode = false;
        this.tapeStart = null; // { x, y } in cm
        this.tapeEnd = null;   // { x, y } in cm

        // Clipboard State
        this.clipboard = null;

        // Undo / Redo History State
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        // Default Presets Configuration
        this.presets = [
            { type: 'sofa', label: 'Sofa', w: 200, l: 90, h: 85, color: '#3b82f6', icon: 'fa-couch' },
            { type: 'bed', label: 'Queen Bed', w: 160, l: 200, h: 100, color: '#8b5cf6', icon: 'fa-bed' },
            { type: 'table', label: 'Dining Table', w: 140, l: 80, h: 75, color: '#f59e0b', icon: 'fa-utensils' },
            { type: 'desk', label: 'Office Desk', w: 120, l: 60, h: 75, color: '#10b981', icon: 'fa-desktop' },
            { type: 'door', label: 'Door', w: 90, l: 15, h: 210, color: '#ef4444', icon: 'fa-door-open' },
            { type: 'window', label: 'Window', w: 120, l: 15, h: 120, color: '#06b6d4', icon: 'fa-window-maximize' }
        ];

        // 3D Three.js State
        this.threeSetup = false;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.threeMeshes = new Map(); // itemId -> mesh/group

        this.init();
    }

    init() {
        this.loadPresets();
        this.setupEventListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            if (this.threeSetup) this.onThreeResize();
        });

        // Display Startup Room Modal
        this.openStartupModal();

        this.centerRoomInView();
        this.updateStats();
        this.saveState(); // Initial state for history
        this.render2D();
    }

    openStartupModal() {
        const modal = document.getElementById('startupModal');
        if (!modal) return;
        document.getElementById('startupRoomWidth').value = this.room.width;
        document.getElementById('startupRoomLength').value = this.room.length;
        document.getElementById('startupRoomHeight').value = this.room.height;
        modal.style.display = 'flex';
    }

    applyStartupRoom() {
        const w = parseFloat(document.getElementById('startupRoomWidth').value) || 500;
        const l = parseFloat(document.getElementById('startupRoomLength').value) || 400;
        const h = parseFloat(document.getElementById('startupRoomHeight').value) || 260;

        this.room = {
            width: Math.max(100, w),
            length: Math.max(100, l),
            height: Math.max(150, h)
        };

        // Update sidebar input values
        document.getElementById('roomWidth').value = this.room.width;
        document.getElementById('roomLength').value = this.room.length;
        document.getElementById('roomHeight').value = this.room.height;

        document.getElementById('startupModal').style.display = 'none';

        this.centerRoomInView();
        this.updateStats();
        this.saveState();
        this.render();
    }

    loadPresets() {
        const saved = localStorage.getItem('floorplanner_presets');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.presets = parsed;
                }
            } catch (e) {}
        }
        this.renderPresetButtons();
    }

    savePresets() {
        localStorage.setItem('floorplanner_presets', JSON.stringify(this.presets));
        this.renderPresetButtons();
    }

    renderPresetButtons() {
        const grid = document.getElementById('presetsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        this.presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.dataset.type = preset.type;
            btn.dataset.label = preset.label;
            btn.dataset.w = preset.w;
            btn.dataset.l = preset.l;
            btn.dataset.h = preset.h;
            btn.dataset.color = preset.color;

            const sizeText = (preset.type === 'door' || preset.type === 'window') 
                ? `${preset.w}cm` 
                : `${preset.w}x${preset.l}`;

            btn.innerHTML = `
                <i class="fa-solid ${preset.icon || 'fa-box'}"></i>
                <span>${preset.label} (${sizeText})</span>
            `;

            btn.addEventListener('click', () => {
                const x = Math.max(0, (this.room.width - preset.w) / 2);
                const y = Math.max(0, (this.room.length - preset.l) / 2);

                const item = this.addItem({ 
                    label: preset.label, 
                    type: preset.type, 
                    w: preset.w, 
                    l: preset.l, 
                    h: preset.h, 
                    x, 
                    y, 
                    rotation: 0, 
                    color: preset.color 
                });
                this.selectItem(item.id);
                this.render();
            });

            grid.appendChild(btn);
        });
    }

    openPresetsModal() {
        const modal = document.getElementById('presetsModal');
        const container = document.getElementById('presetsFormContainer');
        container.innerHTML = '';

        this.presets.forEach((preset, index) => {
            const row = document.createElement('div');
            row.className = 'preset-edit-row';
            row.innerHTML = `
                <div class="preset-edit-title">
                    <i class="fa-solid ${preset.icon || 'fa-box'}"></i> ${preset.label}
                </div>
                <div class="input-group-row">
                    <div class="input-wrapper">
                        <label>Width (cm)</label>
                        <input type="number" id="preset_w_${index}" value="${preset.w}" min="10">
                    </div>
                    <div class="input-wrapper">
                        <label>Length (cm)</label>
                        <input type="number" id="preset_l_${index}" value="${preset.l}" min="10">
                    </div>
                    <div class="input-wrapper">
                        <label>Height (cm)</label>
                        <input type="number" id="preset_h_${index}" value="${preset.h}" min="10">
                    </div>
                </div>
            `;
            container.appendChild(row);
        });

        modal.style.display = 'flex';
    }

    closePresetsModal() {
        document.getElementById('presetsModal').style.display = 'none';
    }

    savePresetsFromModal() {
        this.presets.forEach((preset, index) => {
            const w = parseFloat(document.getElementById(`preset_w_${index}`).value);
            const l = parseFloat(document.getElementById(`preset_l_${index}`).value);
            const h = parseFloat(document.getElementById(`preset_h_${index}`).value);

            if (!isNaN(w) && w > 0) preset.w = w;
            if (!isNaN(l) && l > 0) preset.l = l;
            if (!isNaN(h) && h > 0) preset.h = h;
        });

        this.savePresets();
        this.closePresetsModal();
    }

    copyItem() {
        if (!this.selectedItemId) return;
        const item = this.items.find(i => i.id === this.selectedItemId);
        if (!item) return;

        this.clipboard = JSON.parse(JSON.stringify(item));
    }

    pasteItem() {
        if (!this.clipboard) return;

        const newItem = this.addItem({
            ...this.clipboard,
            id: null,
            label: `${this.clipboard.label} (Copy)`,
            x: this.clipboard.x + 20,
            y: this.clipboard.y + 20
        });

        this.selectItem(newItem.id);
        this.render();
    }

    saveState() {
        const state = JSON.stringify({
            room: this.room,
            items: this.items
        });

        // Don't push duplicate state
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === state) {
            return;
        }

        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        // Clear redo stack on new action
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length <= 1) return; // Retain initial state
        const currentState = this.undoStack.pop();
        this.redoStack.push(currentState);

        const previousState = JSON.parse(this.undoStack[this.undoStack.length - 1]);
        this.applyState(previousState);
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);

        const stateObj = JSON.parse(nextState);
        this.applyState(stateObj);
    }

    applyState(state) {
        this.room = { ...state.room };
        this.items = state.items.map(item => ({ ...item }));

        // Update UI inputs for room
        document.getElementById('roomWidth').value = this.room.width;
        document.getElementById('roomLength').value = this.room.length;
        document.getElementById('roomHeight').value = this.room.height || 260;

        // Verify selected item still exists
        if (this.selectedItemId && !this.items.some(i => i.id === this.selectedItemId)) {
            this.selectItem(null);
        } else if (this.selectedItemId) {
            this.selectItem(this.selectedItemId);
        } else {
            this.selectItem(null);
        }

        this.updateStats();
        this.render();
    }

    setupEventListeners() {
        // Room dimension controls
        const updateRoomAction = () => {
            const w = parseFloat(document.getElementById('roomWidth').value) || 500;
            const l = parseFloat(document.getElementById('roomLength').value) || 400;
            const h = parseFloat(document.getElementById('roomHeight').value) || 260;
            this.room = { width: Math.max(100, w), length: Math.max(100, l), height: Math.max(150, h) };
            this.centerRoomInView();
            this.updateStats();
            this.saveState();
            this.render();
        };

        document.getElementById('updateRoomBtn').addEventListener('click', updateRoomAction);
        ['roomWidth', 'roomLength', 'roomHeight'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    updateRoomAction();
                    document.getElementById(id).blur();
                }
            });
        });

        // View mode switching
        document.getElementById('view2dBtn').addEventListener('click', () => this.switchView('2d'));
        document.getElementById('view3dBtn').addEventListener('click', () => this.switchView('3d'));

        // Preset items buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const label = btn.dataset.label;
                const w = parseFloat(btn.dataset.w);
                const l = parseFloat(btn.dataset.l);
                const h = parseFloat(btn.dataset.h);
                const color = btn.dataset.color;

                // Center in room
                const x = Math.max(0, (this.room.width - w) / 2);
                const y = Math.max(0, (this.room.length - l) / 2);

                const item = this.addItem({ label, type, w, l, h, x, y, rotation: 0, color });
                this.selectItem(item.id);
                this.render();
            });
        });

        // Add Custom Item
        const addCustomAction = () => {
            const label = document.getElementById('customName').value || 'Custom Item';
            const w = parseFloat(document.getElementById('customW').value) || 100;
            const l = parseFloat(document.getElementById('customL').value) || 100;
            const h = parseFloat(document.getElementById('customH').value) || 80;
            const color = document.getElementById('customColor').value || '#ec4899';

            const x = Math.max(0, (this.room.width - w) / 2);
            const y = Math.max(0, (this.room.length - l) / 2);

            const item = this.addItem({ label, type: 'custom', w, l, h, x, y, rotation: 0, color });
            this.selectItem(item.id);
            this.render();
        };

        document.getElementById('addCustomBtn').addEventListener('click', addCustomAction);
        ['customName', 'customW', 'customL', 'customH', 'customColor'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomAction();
                    document.getElementById(id).blur();
                }
            });
        });

        // Inspector live updates
        const updateFromInspector = () => {
            if (!this.selectedItemId) return;
            const item = this.items.find(i => i.id === this.selectedItemId);
            if (!item) return;

            item.label = document.getElementById('inspectLabel').value;
            item.w = Math.max(10, parseFloat(document.getElementById('inspectW').value) || 10);
            item.l = Math.max(10, parseFloat(document.getElementById('inspectL').value) || 10);
            item.x = parseFloat(document.getElementById('inspectX').value) || 0;
            item.y = parseFloat(document.getElementById('inspectY').value) || 0;
            item.rotation = (parseFloat(document.getElementById('inspectRot').value) || 0) % 360;
            item.color = document.getElementById('inspectColor').value;

            this.render();
        };

        ['inspectLabel', 'inspectW', 'inspectL', 'inspectX', 'inspectY', 'inspectRot', 'inspectColor'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', updateFromInspector);
            el.addEventListener('change', () => this.saveState());
        });

        // Duplicate / Delete
        document.getElementById('duplicateBtn').addEventListener('click', () => {
            if (!this.selectedItemId) return;
            const item = this.items.find(i => i.id === this.selectedItemId);
            if (!item) return;

            const newItem = this.addItem({
                ...item,
                id: null,
                label: `${item.label} (Copy)`,
                x: item.x + 20,
                y: item.y + 20
            });
            this.selectItem(newItem.id);
            this.render();
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            if (!this.selectedItemId) return;
            this.deleteItem(this.selectedItemId);
            this.render();
        });

        // Undo / Redo buttons
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());

        // Canvas View Controls
        document.getElementById('zoomInBtn').addEventListener('click', () => { this.scale *= 1.2; this.render2D(); });
        document.getElementById('zoomOutBtn').addEventListener('click', () => { this.scale /= 1.2; this.render2D(); });
        document.getElementById('resetViewBtn').addEventListener('click', () => { this.centerRoomInView(); this.render2D(); });
        
        const gridBtn = document.getElementById('toggleGridBtn');
        gridBtn.addEventListener('click', () => {
            this.gridSnap = !this.gridSnap;
            gridBtn.classList.toggle('active', this.gridSnap);
            gridBtn.innerHTML = `<i class="fa-solid fa-border-all"></i> Grid Snap: ${this.gridSnap ? 'ON' : 'OFF'}`;
        });

        const tapeBtn = document.getElementById('tapeMeasureBtn');
        tapeBtn.addEventListener('click', () => {
            this.tapeMode = !this.tapeMode;
            tapeBtn.classList.toggle('active', this.tapeMode);
            tapeBtn.innerHTML = `<i class="fa-solid fa-ruler"></i> Tape Measure: ${this.tapeMode ? 'ON' : 'OFF'}`;
            if (!this.tapeMode) {
                this.tapeStart = null;
                this.tapeEnd = null;
            }
            this.canvas.style.cursor = this.tapeMode ? 'crosshair' : 'default';
            this.render2D();
        });

        // Clear, Export, Import
        document.getElementById('clearAllBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all furniture?')) {
                this.items = [];
                this.selectItem(null);
                this.saveState();
                this.render();
                this.updateStats();
            }
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ room: this.room, items: this.items }, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `floor_plan_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.room && data.items) {
                        this.room = data.room;
                        document.getElementById('roomWidth').value = this.room.width;
                        document.getElementById('roomLength').value = this.room.length;
                        document.getElementById('roomHeight').value = this.room.height || 260;
                        this.items = data.items;
                        this.selectItem(null);
                        this.centerRoomInView();
                        this.updateStats();
                        this.saveState();
                        this.render();
                    }
                } catch (err) {
                    alert('Invalid floor plan JSON file.');
                }
            };
            reader.readAsText(file);
        });

        // 2D Mouse Interaction
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Startup Modal event listeners
        document.getElementById('startPlannerBtn').addEventListener('click', () => this.applyStartupRoom());
        ['startupRoomWidth', 'startupRoomLength', 'startupRoomHeight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.applyStartupRoom();
                    }
                });
            }
        });

        // Presets Modal event listeners
        document.getElementById('editPresetsBtn').addEventListener('click', () => this.openPresetsModal());
        document.getElementById('closePresetsModalBtn').addEventListener('click', () => this.closePresetsModal());
        document.getElementById('savePresetsBtn').addEventListener('click', () => this.savePresetsFromModal());
        document.getElementById('presetsModal').addEventListener('click', (e) => {
            if (e.target.id === 'presetsModal') this.closePresetsModal();
        });

        // Keyboard Shortcuts (Undo/Redo: Ctrl+Z/Ctrl+Y, Copy/Paste: Ctrl+C/Ctrl+V, Delete/Backspace)
        window.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            const isTyping = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

            if ((e.ctrlKey || e.metaKey) && !isTyping) {
                const key = e.key.toLowerCase();
                if (key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                } else if (key === 'y') {
                    e.preventDefault();
                    this.redo();
                } else if (key === 'c') {
                    e.preventDefault();
                    this.copyItem();
                } else if (key === 'v') {
                    e.preventDefault();
                    this.pasteItem();
                }
                return;
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
                if (this.selectedItemId) {
                    e.preventDefault();
                    this.deleteItem(this.selectedItemId);
                    this.render();
                }
            }
        });
    }

    addItem(itemData) {
        const item = {
            id: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            label: itemData.label || 'Item',
            type: itemData.type || 'custom',
            w: parseFloat(itemData.w) || 100,
            l: parseFloat(itemData.l) || 100,
            h: parseFloat(itemData.h) || 80,
            x: parseFloat(itemData.x) || 0,
            y: parseFloat(itemData.y) || 0,
            rotation: parseFloat(itemData.rotation) || 0,
            color: itemData.color || '#3b82f6'
        };
        this.items.push(item);
        this.updateStats();
        this.saveState();
        return item;
    }

    deleteItem(id) {
        this.items = this.items.filter(i => i.id !== id);
        if (this.selectedItemId === id) this.selectItem(null);
        this.updateStats();
        this.saveState();
    }

    selectItem(id) {
        this.selectedItemId = id;
        const inspector = document.getElementById('inspectorPanel');
        if (!id) {
            inspector.style.display = 'none';
            return;
        }

        const item = this.items.find(i => i.id === id);
        if (!item) {
            inspector.style.display = 'none';
            return;
        }

        inspector.style.display = 'flex';
        document.getElementById('inspectLabel').value = item.label;
        document.getElementById('inspectW').value = item.w;
        document.getElementById('inspectL').value = item.l;
        document.getElementById('inspectX').value = Math.round(item.x);
        document.getElementById('inspectY').value = Math.round(item.y);
        document.getElementById('inspectRot').value = Math.round(item.rotation);
        document.getElementById('inspectColor').value = item.color;
    }

    updateStats() {
        const area = (this.room.width * this.room.length) / 10000;
        document.getElementById('roomAreaVal').textContent = `${area.toFixed(2)} m²`;
        document.getElementById('itemCountVal').textContent = this.items.length;
    }

    resizeCanvas() {
        const wrapper = document.getElementById('canvas2dWrapper');
        this.canvas.width = wrapper.clientWidth;
        this.canvas.height = wrapper.clientHeight;
        this.render2D();
    }

    centerRoomInView() {
        const wrapper = document.getElementById('canvas2dWrapper');
        const padding = 100;
        const scaleX = (wrapper.clientWidth - padding) / this.room.width;
        const scaleY = (wrapper.clientHeight - padding) / this.room.length;
        this.scale = Math.min(scaleX, scaleY, 2.5); // limit max scale

        this.panX = (wrapper.clientWidth - this.room.width * this.scale) / 2;
        this.panY = (wrapper.clientHeight - this.room.length * this.scale) / 2;
    }

    // Convert Screen to Canvas Room Coordinates (cm)
    screenToCm(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = screenX - rect.left;
        const canvasY = screenY - rect.top;

        const cmX = (canvasX - this.panX) / this.scale;
        const cmY = (canvasY - this.panY) / this.scale;
        return { x: cmX, y: cmY };
    }

    // Render Dispatcher
    render() {
        if (this.activeView === '2d') {
            this.render2D();
        } else {
            this.render3D();
        }
    }

    switchView(mode) {
        this.activeView = mode;
        document.getElementById('view2dBtn').classList.toggle('active', mode === '2d');
        document.getElementById('view3dBtn').classList.toggle('active', mode === '3d');
        document.getElementById('canvas2dWrapper').classList.toggle('active', mode === '2d');
        document.getElementById('canvas3dWrapper').classList.toggle('active', mode === '3d');

        if (mode === '3d') {
            if (!this.threeSetup) this.init3D();
            this.render3D();
        } else {
            this.render2D();
        }
    }

    /* ---------------- 2D Canvas Engine ---------------- */

    render2D() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.scale, this.scale);

        // Draw Room Background & Outer Wall
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, this.room.width, this.room.length);

        // Draw Room Grid Lines (50cm major, 10cm minor)
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= this.room.width; x += 10) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.room.length);
            ctx.stroke();
        }
        for (let y = 0; y <= this.room.length; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.room.width, y);
            ctx.stroke();
        }

        // Draw Walls (thick borders)
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, this.room.width, this.room.length);

        // Draw Dimensions Text on Walls
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.max(10, 14 / this.scale)}px Plus Jakarta Sans`;
        ctx.textAlign = 'center';
        ctx.fillText(`${this.room.width} cm`, this.room.width / 2, -10);
        
        ctx.save();
        ctx.translate(-15, this.room.length / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${this.room.length} cm`, 0, 0);
        ctx.restore();

        // Draw Furniture Items
        this.items.forEach(item => {
            this.drawItem2D(ctx, item, item.id === this.selectedItemId);
        });

        // Draw Metric Tape Line if active
        if (this.tapeStart && this.tapeEnd) {
            this.drawTapeMeasure2D(ctx);
        }

        ctx.restore();
    }

    drawItem2D(ctx, item, isSelected) {
        ctx.save();
        // Item center translation
        const centerX = item.x + item.w / 2;
        const centerY = item.y + item.l / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((item.rotation * Math.PI) / 180);

        // Item Body
        ctx.fillStyle = item.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-item.w / 2, -item.l / 2, item.w, item.l);

        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = isSelected ? '#ffffff' : '#0f172a';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(-item.w / 2, -item.l / 2, item.w, item.l);

        // Direction Indicator (Front line)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(-item.w / 2, -item.l / 2, item.w, 4);

        // Label Text
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 ${Math.max(9, 12 / this.scale)}px Plus Jakarta Sans`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, 0, 0);

        // Selection Handles if selected
        if (isSelected) {
            // Selection box border
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(-item.w / 2 - 4, -item.l / 2 - 4, item.w + 8, item.l + 8);
            ctx.setLineDash([]);

            // Resize Handle (bottom-right)
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(item.w / 2 + 4, item.l / 2 + 4, 6 / this.scale, 0, Math.PI * 2);
            ctx.fill();

            // Rotation Handle (top stem)
            ctx.strokeStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(0, -item.l / 2 - 4);
            ctx.lineTo(0, -item.l / 2 - 25);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, -item.l / 2 - 25, 6 / this.scale, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawTapeMeasure2D(ctx) {
        const p1 = this.tapeStart;
        const p2 = this.tapeEnd;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distanceCm = Math.hypot(dx, dy);

        ctx.save();

        // Tape Line
        ctx.strokeStyle = '#f59e0b'; // Amber yellow tape
        ctx.lineWidth = 3 / this.scale;
        ctx.setLineDash([6 / this.scale, 4 / this.scale]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Endpoint circles
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 5 / this.scale, 0, Math.PI * 2);
        ctx.arc(p2.x, p2.y, 5 / this.scale, 0, Math.PI * 2);
        ctx.fill();

        // Measurement Badge
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const labelText = distanceCm >= 100 
            ? `${(distanceCm / 100).toFixed(2)} m (${Math.round(distanceCm)} cm)`
            : `${Math.round(distanceCm)} cm`;

        const fontSize = Math.max(12, 14 / this.scale);
        ctx.font = `700 ${fontSize}px Plus Jakarta Sans`;

        const textMetrics = ctx.measureText(labelText);
        const padding = 8 / this.scale;
        const bgW = textMetrics.width + padding * 2;
        const bgH = fontSize + padding;

        // Draw Badge Background
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5 / this.scale;
        ctx.beginPath();
        ctx.roundRect(midX - bgW / 2, midY - bgH / 2 - 12 / this.scale, bgW, bgH, 6 / this.scale);
        ctx.fill();
        ctx.stroke();

        // Draw Badge Text
        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, midX, midY - 12 / this.scale);

        ctx.restore();
    }

    // 2D Interaction Handlers
    handleMouseDown(e) {
        if (this.activeView !== '2d') return;

        const pos = this.screenToCm(e.clientX, e.clientY);

        // If Tape Measure tool is active
        if (this.tapeMode) {
            this.isDragging = true;
            this.dragMode = 'tape';
            this.tapeStart = pos;
            this.tapeEnd = pos;
            this.render2D();
            return;
        }

        // Check handle click on selected item first
        if (this.selectedItemId) {
            const item = this.items.find(i => i.id === this.selectedItemId);
            if (item) {
                const handleAction = this.checkHandleHit(item, pos);
                if (handleAction) {
                    this.isDragging = true;
                    this.dragMode = handleAction;
                    this.dragTarget = item;
                    this.dragOffset = { x: pos.x, y: pos.y };
                    return;
                }
            }
        }

        // Check item click (from top stack down)
        let clickedItem = null;
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.isPosInsideItem(pos, this.items[i])) {
                clickedItem = this.items[i];
                break;
            }
        }

        if (clickedItem) {
            this.selectItem(clickedItem.id);
            this.isDragging = true;
            this.dragMode = 'move';
            this.dragTarget = clickedItem;
            this.dragOffset = {
                x: pos.x - clickedItem.x,
                y: pos.y - clickedItem.y
            };
            this.render2D();
        } else {
            // Clicked empty area -> start canvas pan or deselect
            this.selectItem(null);
            this.isDragging = true;
            this.dragMode = 'pan';
            this.dragOffset = { x: e.clientX - this.panX, y: e.clientY - this.panY };
            this.render2D();
        }
    }

    handleMouseMove(e) {
        if (!this.isDragging || this.activeView !== '2d') return;

        const pos = this.screenToCm(e.clientX, e.clientY);

        if (this.dragMode === 'tape') {
            this.tapeEnd = pos;
            this.render2D();
            return;
        }

        if (this.dragMode === 'pan') {
            this.panX = e.clientX - this.dragOffset.x;
            this.panY = e.clientY - this.dragOffset.y;
            this.render2D();
            return;
        }

        if (!this.dragTarget) return;

        if (this.dragMode === 'move') {
            let newX = pos.x - this.dragOffset.x;
            let newY = pos.y - this.dragOffset.y;

            if (this.gridSnap) {
                newX = Math.round(newX / this.gridSize) * this.gridSize;
                newY = Math.round(newY / this.gridSize) * this.gridSize;
            }

            this.dragTarget.x = newX;
            this.dragTarget.y = newY;
            this.selectItem(this.dragTarget.id);
            this.render2D();
        } else if (this.dragMode === 'rotate') {
            const centerX = this.dragTarget.x + this.dragTarget.w / 2;
            const centerY = this.dragTarget.y + this.dragTarget.l / 2;
            const rad = Math.atan2(pos.y - centerY, pos.x - centerX);
            let deg = (rad * (180 / Math.PI)) + 90;
            if (deg < 0) deg += 360;

            if (this.gridSnap) {
                deg = Math.round(deg / 15) * 15; // 15 degree angle snap
            }

            this.dragTarget.rotation = deg % 360;
            this.selectItem(this.dragTarget.id);
            this.render2D();
        } else if (this.dragMode === 'resize') {
            let newW = pos.x - this.dragTarget.x;
            let newL = pos.y - this.dragTarget.y;

            if (this.gridSnap) {
                newW = Math.round(newW / this.gridSize) * this.gridSize;
                newL = Math.round(newL / this.gridSize) * this.gridSize;
            }

            this.dragTarget.w = Math.max(20, newW);
            this.dragTarget.l = Math.max(20, newL);
            this.selectItem(this.dragTarget.id);
            this.render2D();
        }
    }

    handleMouseUp() {
        if (this.isDragging && ['move', 'rotate', 'resize'].includes(this.dragMode)) {
            this.saveState();
        }
        this.isDragging = false;
        this.dragMode = null;
        this.dragTarget = null;
    }

    handleWheel(e) {
        if (this.activeView !== '2d') return;
        e.preventDefault();

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom centered around mouse location
        const newScale = Math.min(Math.max(0.2, this.scale * zoomFactor), 5.0);
        this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
        this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
        this.scale = newScale;

        this.render2D();
    }

    isPosInsideItem(pos, item) {
        // Simple bounding box check (ignoring rotation for straightforward selection)
        const cx = item.x + item.w / 2;
        const cy = item.y + item.l / 2;
        const rad = (-item.rotation * Math.PI) / 180;

        const dx = pos.x - cx;
        const dy = pos.y - cy;

        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

        return rx >= -item.w / 2 && rx <= item.w / 2 && ry >= -item.l / 2 && ry <= item.l / 2;
    }

    checkHandleHit(item, pos) {
        const cx = item.x + item.w / 2;
        const cy = item.y + item.l / 2;
        const rad = (-item.rotation * Math.PI) / 180;

        const dx = pos.x - cx;
        const dy = pos.y - cy;

        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

        // Rotation Handle (top)
        const rotHandleX = 0;
        const rotHandleY = -item.l / 2 - 25;
        const distRot = Math.hypot(rx - rotHandleX, ry - rotHandleY);
        if (distRot <= 15) return 'rotate';

        // Resize Handle (bottom right corner)
        const resHandleX = item.w / 2 + 4;
        const resHandleY = item.l / 2 + 4;
        const distRes = Math.hypot(rx - resHandleX, ry - resHandleY);
        if (distRes <= 15) return 'resize';

        return null;
    }

    /* ---------------- 3D Three.js Engine ---------------- */

    init3D() {
        const container = document.getElementById('threeContainer');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);

        this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 10000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lighting Setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight.position.set(300, 800, 500);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 100;
        dirLight.shadow.camera.far = 2500;
        const d = 1000;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        this.scene.add(dirLight);

        this.threeSetup = true;
    }

    onThreeResize() {
        const container = document.getElementById('threeContainer');
        if (!container || !this.renderer) return;
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    render3D() {
        if (!this.threeSetup) return;

        // Clear previous room models
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        // Re-add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight.position.set(this.room.width, this.room.height * 3, this.room.length);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Room Floor
        const floorGeo = new THREE.PlaneGeometry(this.room.width, this.room.length);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(this.room.width / 2, 0, this.room.length / 2);
        floorMesh.receiveShadow = true;
        this.scene.add(floorMesh);

        // Floor Grid Lines Helper
        const grid = new THREE.GridHelper(Math.max(this.room.width, this.room.length), Math.max(this.room.width, this.room.length) / 50, 0x3b82f6, 0x334155);
        grid.position.set(this.room.width / 2, 1, this.room.length / 2);
        this.scene.add(grid);

        // Walls (Partial 3D Cutaway walls for easy interior view)
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, opacity: 0.6, transparent: true });
        const wallThickness = 10;
        const wallHeight = this.room.height;

        // Back Wall
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(this.room.width, wallHeight, wallThickness), wallMat);
        backWall.position.set(this.room.width / 2, wallHeight / 2, -wallThickness / 2);
        this.scene.add(backWall);

        // Left Wall
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, this.room.length), wallMat);
        leftWall.position.set(-wallThickness / 2, wallHeight / 2, this.room.length / 2);
        this.scene.add(leftWall);

        // Build Furniture Meshes
        this.items.forEach(item => {
            const geo = new THREE.BoxGeometry(item.w, item.h, item.l);
            const mat = new THREE.MeshStandardMaterial({
                color: item.color,
                roughness: 0.5,
                metalness: 0.1
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Position in 3D (converting 2D top-left to 3D center)
            const posX = item.x + item.w / 2;
            const posZ = item.y + item.l / 2;
            const posY = item.h / 2;

            mesh.position.set(posX, posY, posZ);
            mesh.rotation.y = (-item.rotation * Math.PI) / 180;

            // Optional 3D Accent Details
            const edgeGeo = new THREE.EdgesGeometry(geo);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 });
            const wireframe = new THREE.LineSegments(edgeGeo, edgeMat);
            mesh.add(wireframe);

            this.scene.add(mesh);
        });

        // Camera Position adjustment
        this.camera.position.set(this.room.width * 1.5, this.room.height * 2.5, this.room.length * 2);
        this.controls.target.set(this.room.width / 2, 0, this.room.length / 2);
        this.controls.update();

        // 3D Render Loop
        const animate = () => {
            if (this.activeView !== '3d') return;
            requestAnimationFrame(animate);
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
}

// Instantiate App when loaded
window.addEventListener('DOMContentLoaded', () => {
    window.floorPlanner = new FloorPlanner();
});
