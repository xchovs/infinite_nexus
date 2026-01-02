import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";

// V4.0 - Infinite Nexus with Dungeon System
const extensionName = "infinite_nexus";
const extensionPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/') + 1);

// State
let nexusState = {
    hp: 100, maxHp: 100,
    san: 100, maxSan: 100,
    karma: 0,
    time: "D-01",
    mission: "存活并寻找线索...",
    skills: [
        { name: "侦查", value: 50 },
        { name: "斗殴", value: 40 },
        { name: "闪避", value: 30 }
    ],
    inventory: [],
    shopItems: [
        { name: "止血剂", cost: 100, effect: "[HP +30]", desc: "快速止血，恢复30点生命" },
        { name: "清心丸", cost: 100, effect: "[SAN +20]", desc: "平复精神，恢复20点理智" },
        { name: "护心镜", cost: 300, effect: "[ITEM +护心镜]", desc: "物理防御力提升" },
        { name: "无限弹药沙鹰", cost: 1500, effect: "[SKILL: 枪械 70] [ITEM +沙鹰(无限)]", desc: "无限流经典神器" },
        { name: "洗髓丹", cost: 2000, effect: "[HP +50] [SKILL: 怪力 60] [SAN -10]", desc: "肉体强化，副作用较小" },
        { name: "免死金牌", cost: 5000, effect: "[MISSION: 任务完成]", desc: "直接跳过当前副本" }
    ],
    isMinimized: false
};

const BASE_STATE = {
    hp: 100, maxHp: 100,
    san: 100, maxSan: 100,
    karma: 0,
    time: "D-01",
    mission: "存活并寻找线索...",
    skills: [
        { name: "侦查", value: 50 },
        { name: "斗殴", value: 40 },
        { name: "闪避", value: 30 }
    ],
    inventory: []
};

let settings = null;

function initSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {
            teammates: [],
            commsHistory: {},
            pendingRequests: [],
            currentTeammate: null,
            aiConfig: { endpoint: '', apiKey: '', model: 'gpt-3.5-turbo' }
        };
    }
    if (!extension_settings[extensionName].pendingRequests) {
        extension_settings[extensionName].pendingRequests = [];
    }
    if (!extension_settings[extensionName].currentTeammate) {
        extension_settings[extensionName].currentTeammate = null;
    }
    if (!extension_settings[extensionName].aiConfig) {
        extension_settings[extensionName].aiConfig = { endpoint: '', apiKey: '', model: 'gpt-3.5-turbo' };
    }
    return extension_settings[extensionName];
}

const SIGNATURE_POOL = [
    "今天运气不错...", "小心行事。", "有什么需要帮忙的吗？",
    "刚从副本出来，累死了", "在线，随时联系", "正在研究新技能",
    "这个副本有点难搞", "休息中...", "正在调试通讯器..."
];

function getRandomSignature() {
    return SIGNATURE_POOL[Math.floor(Math.random() * SIGNATURE_POOL.length)];
}

function createOverlay() {
    if (document.getElementById('infinite-nexus-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'infinite-nexus-overlay';
    overlay.className = 'minimized'; // 默认收起状态

    overlay.innerHTML = `
        <div class="nexus-comms-btn" id="nexus-comms-open" title="队友传音"></div>
        <div class="nexus-header" id="nexus-header-bar" title="点击收起/展开" onclick="event.stopPropagation(); toggleMinimize();">
            <span id="nexus-time">DAY 01</span>
        </div>
        <div class="nexus-content" id="nexus-body">
            <!-- Compact Stats Dashboard -->
            <div class="nexus-section" style="margin-bottom:15px; border-bottom:1px solid #ddd; padding-bottom:10px;">
                <div class="nexus-stat-row">
                    <span style="width:35px; font-weight:bold;">HP</span>
                    <div class="nexus-bar-container"><div class="nexus-bar-fill nexus-hp-fill" id="nexus-hp-bar"></div></div>
                    <span id="nexus-hp-text" style="width:60px; text-align:right;">100/100</span>
                </div>
                <div class="nexus-stat-row">
                    <span style="width:35px; font-weight:bold;">SAN</span>
                    <div class="nexus-bar-container"><div class="nexus-bar-fill nexus-san-fill" id="nexus-san-bar"></div></div>
                    <span id="nexus-san-text" style="width:60px; text-align:right;">100/100</span>
                </div>
                <div class="nexus-stat-row" style="justify-content:flex-end; margin-top:5px;">
                    <span style="margin-right:5px; font-weight:bold; color:#555;">Karma:</span>
                    <span id="nexus-karma-text" style="font-weight:bold; color:var(--nexus-accent-red);">0</span>
                </div>
            </div>

            <!-- Mission Area -->
            <div class="nexus-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; font-size:0.9em; color:#888;">
                    <span>当前任务</span>
                    <span id="nexus-switch-dungeon-btn" class="nexus-btn-small" title="切换副本/世界" style="cursor:pointer;">[切换]</span>
                </div>
                <div id="nexus-mission" class="nexus-mission-box" style="margin:0;">存活并寻找线索...</div>
            </div>

            <div class="nexus-section">
                <div class="nexus-section-title">技能 <span id="nexus-add-skill-btn" class="nexus-add-btn">+</span></div>
                <div id="nexus-skill-list" class="nexus-skill-grid"></div>
                <button id="nexus-universal-dice" class="nexus-dice-btn" style="width:100%; margin-top:10px;">🎲 通用检定</button>
            </div>
            <div class="nexus-section">
                <div class="nexus-section-title">物品 <span id="nexus-add-item-btn" class="nexus-add-btn" title="手动补录">+</span></div>
                <div id="nexus-inventory-list" class="nexus-inventory-grid"></div>
            </div>
            <div class="nexus-section" style="display:flex; gap:10px;">
                <button id="nexus-shop-open" class="nexus-btn-small" style="flex:1;">商店</button>
                <!-- Reserved for future buttons -->
                <div style="flex:1;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Restore from Seal (Minimized)
    overlay.addEventListener('click', (e) => {
        // Only trigger if minimized AND clicking the main overlay container (or ghost button)
        // But if we are NOT minimized, we want the HEADER to handle the minimize toggle.
        if (overlay.classList.contains('minimized')) {
            toggleMinimize();
        }
    });

    // Event listener for header removed in favor of inline onclick for stability
    // Minimize logic is handled by toggleMinimize() globally



    const addItemBtn = document.getElementById('nexus-add-item-btn');
    if (addItemBtn) addItemBtn.addEventListener('click', manualAddItem);

    // Shop Modal
    const shopModal = document.createElement('div');
    shopModal.id = 'nexus-shop-modal';
    shopModal.innerHTML = `
        <h3 class="nexus-modal-header">Karma 商店 <span id="nexus-shop-close-x" style="float:right; cursor:pointer;">✕</span></h3>
        <div id="nexus-shop-list"></div>
    `;
    document.body.appendChild(shopModal);

    // Comms Modal
    const commsModal = document.createElement('div');
    commsModal.id = 'nexus-comms-modal';
    commsModal.innerHTML = `
        <div class="nexus-comms-header">
            <span>队友传音</span>
            <div style="display:flex; gap:10px; align-items:center;">
                <span id="nexus-config-btn" class="nexus-config-icon" title="API 设置" style="cursor:pointer; font-size:14px;">⚙️</span>
                <span id="nexus-comms-close" style="cursor:pointer;">✕</span>
            </div>
        </div>
        <div class="nexus-comms-body">
            <div class="nexus-friend-panel">
                <div class="nexus-friend-header" style="justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:var(--nexus-gold);">好友列表</span>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span id="nexus-add-friend-btn" class="nexus-btn-small" title="手动添加好友">添加</span>
                        <span id="nexus-request-btn" class="nexus-btn-small" title="好友申请">申请 <span id="nexus-req-count">0</span></span>
                    </div>
                </div>
                <div id="nexus-friend-list" class="nexus-friend-list"></div>
            </div>
            <div class="nexus-chat-panel">
                <div id="nexus-current-chat-label" class="nexus-chat-label" style="display:none;">
                    正在与 <span id="nexus-chat-name"></span> 传音
                    <span id="nexus-clear-history-btn" class="nexus-clear-btn" title="清空记录">🗑️</span>
                </div>
                <div id="nexus-comms-log" class="nexus-comms-log">
                    <div class="nexus-comms-placeholder">选择好友开始传音...</div>
                </div>
                <input type="text" id="nexus-comms-input" class="nexus-comms-input" placeholder="选择好友后发送传音..." disabled>
            </div>
        </div>
    `;
    document.body.appendChild(commsModal);

    // Request Modal
    const requestModal = document.createElement('div');
    requestModal.id = 'nexus-request-modal';
    requestModal.innerHTML = `
        <h3 class="nexus-modal-header">
            好友申请
            <span style="float:right; cursor:pointer;" id="nexus-request-close">✕</span>
        </h3>
        <div id="nexus-request-list"></div>
    `;
    document.body.appendChild(requestModal);

    // Config Modal
    const configModal = document.createElement('div');
    configModal.id = 'nexus-config-modal';
    configModal.innerHTML = `
        <h3 class="nexus-modal-header">
            独立 API 设置
            <span style="float:right; cursor:pointer;" id="nexus-config-close">✕</span>
        </h3>
        <div class="nexus-config-row">
            <label>API Endpoint (Base URL)</label>
            <input type="text" id="nexus-api-endpoint" placeholder="e.g. https://api.openai.com/v1">
        </div>
        <div class="nexus-config-row">
            <label>API Key</label>
            <input type="password" id="nexus-api-key" placeholder="sk-...">
        </div>
        <div class="nexus-config-row">
            <label>Model <button id="nexus-fetch-models" class="nexus-btn-small">获取列表</button></label>
            <select id="nexus-api-model" class="nexus-select">
                <option value="">-- 先获取模型列表 --</option>
            </select>
        </div>
        <div class="nexus-config-row" style="margin-top:10px; border-top:1px dashed #ccc; padding-top:10px;">
            <label style="display:flex; align-items:center; cursor:pointer;">
                <input type="checkbox" id="nexus-immersive-mode" style="width:auto; margin-right:8px;"> 
                <span>开启沉浸模式 (AI 自动判断物品获取)</span>
            </label>
            <div style="font-size:0.8em; color:#666; margin-left:20px;">* 将每条回复发送给 AI 分析是否获得物品，消耗 Token。</div>
        </div>
        <div style="text-align:right; margin-top:15px;">
            <button id="nexus-config-save" class="nexus-btn-primary">保存设置</button>
        </div>
    `;
    document.body.appendChild(configModal);

    // Profile Modal
    const profileModal = document.createElement('div');
    profileModal.id = 'nexus-profile-modal';
    profileModal.innerHTML = `
        <h3 class="nexus-modal-header">
            角色档案
            <span style="float:right; cursor:pointer;" id="nexus-profile-close">✕</span>
        </h3>
        <div class="nexus-profile-content">
            <div class="nexus-config-row">
                <label>名称</label>
                <input type="text" id="nexus-profile-name" readonly style="background:#eee;">
            </div>
            <div class="nexus-config-row">
                <label>性格标签 <span style="font-weight:normal; color:#888;">(用逗号分隔)</span></label>
                <input type="text" id="nexus-profile-traits" placeholder="沉稳, 善战, 前军人">
            </div>
            <div class="nexus-config-row">
                <label>经历描述</label>
                <textarea id="nexus-profile-backstory" rows="3" placeholder="在第3副本相遇..."></textarea>
            </div>
            <div class="nexus-config-row">
                <label>备注</label>
                <textarea id="nexus-profile-notes" rows="2" placeholder="用户自定义备注..."></textarea>
            </div>
            <div class="nexus-config-row" style="display:flex; align-items:center; gap:10px;">
                <input type="checkbox" id="nexus-profile-inparty">
                <label for="nexus-profile-inparty" style="margin:0; cursor:pointer;">正在同一副本中</label>
            </div>
            <div class="nexus-profile-info" id="nexus-profile-source"></div>
            <div style="display:flex; gap:10px; margin-top:15px;">
                <button id="nexus-profile-save" class="nexus-btn-primary" style="flex:1;">保存</button>
                <button id="nexus-profile-refresh" class="nexus-btn-secondary" style="flex:1;">重新提取</button>
            </div>
        </div>
    `;
    document.body.appendChild(profileModal);

    // Clear Modal
    const clearModal = document.createElement('div');
    clearModal.id = 'nexus-clear-modal';
    clearModal.innerHTML = `
        <div class="nexus-clear-header"> 副本通关 </div>
        <div class="nexus-clear-title" id="nexus-clear-dungeon-name"></div>
        <div class="nexus-clear-stats">
            <div class="nexus-clear-row"><span> 耗时:</span><span id="nexus-clear-time"></span></div>
            <div class="nexus-clear-row"><span> 剩余HP:</span><span id="nexus-clear-hp"></span></div>
            <div class="nexus-clear-row"><span> 剩余SAN:</span><span id="nexus-clear-san"></span></div>
            <div class="nexus-clear-row nexus-clear-karma"><span> 获得Karma:</span><span id="nexus-clear-karma"></span></div>
        </div>
        <div class="nexus-clear-actions">
            <button id="nexus-start-new-dungeon" class="nexus-btn-primary">确定</button>
        </div>
    `;
    document.body.appendChild(clearModal);

    // New Dungeon Modal
    const newDungeonModal = document.createElement('div');
    newDungeonModal.id = 'nexus-new-dungeon-modal';
    newDungeonModal.innerHTML = `
        <div class="nexus-clear-header">选择副本类型</div>
        <div class="nexus-dungeon-options">
            <div class="nexus-dungeon-option" id="nexus-dungeon-normal">
                <div class="nexus-dungeon-icon"></div>
                <div class="nexus-dungeon-title">普通副本</div>
                <div class="nexus-dungeon-desc">标准无限流冒险</div>
            </div>
            <div class="nexus-dungeon-option nexus-dungeon-pink" id="nexus-dungeon-pink">
                <div class="nexus-dungeon-icon"></div>
                <div class="nexus-dungeon-title">粉红团</div>
                <div class="nexus-dungeon-desc">成人向内容 (R18)</div>
            </div>
        </div>
        <div style="text-align:center; margin-top:15px;">
            <button id="nexus-dungeon-cancel" class="nexus-btn-secondary">取消</button>
        </div>
    `;
    document.body.appendChild(newDungeonModal);

    // Event Bindings
    const switchBtn = document.getElementById('nexus-switch-dungeon-btn');
    if (switchBtn) switchBtn.addEventListener('click', () => {
        document.getElementById('nexus-new-dungeon-modal').style.display = 'block';
    });

    const clearConfirmBtn = document.getElementById('nexus-start-new-dungeon');
    if (clearConfirmBtn) {
        clearConfirmBtn.addEventListener('click', () => {
            document.getElementById('nexus-clear-modal').style.display = 'none';
        });
    }

    const cancelBtn = document.getElementById('nexus-dungeon-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        document.getElementById('nexus-new-dungeon-modal').style.display = 'none';
    });

    document.getElementById('nexus-add-skill-btn').addEventListener('click', manualAddSkill);
    document.getElementById('nexus-universal-dice').addEventListener('click', () => performSkillCheck("运气", 50, true));
    document.getElementById('nexus-shop-open').addEventListener('click', () => { renderShopItems(); shopModal.style.display = 'block'; });
    document.getElementById('nexus-shop-close-x').addEventListener('click', () => { shopModal.style.display = 'none'; });
    document.getElementById('nexus-comms-open').addEventListener('click', (e) => {
        e.stopPropagation(); // 防止事件冒泡到 overlay

        // 自动收起主界面
        const overlay = document.getElementById('infinite-nexus-overlay');
        if (overlay && !overlay.classList.contains('minimized')) {
            overlay.classList.add('minimized');
            nexusState.isMinimized = true;
            saveSettingsDebounced();
        }

        commsModal.style.display = 'block';
        renderFriendList();
        updateRequestBadge();
        if (settings.currentTeammate) renderCommsLog(settings.currentTeammate);
    });
    document.getElementById('nexus-comms-close').addEventListener('click', () => { commsModal.style.display = 'none'; });
    // Header click listener is now inline in HTML for simplicity, or we can add it here if inline is not preferred.
    // But since we rely on `toggleMinimize` which is global, inline `onclick` is fine for now, or we can bind it:
    // document.getElementById('nexus-header-bar').addEventListener('click', toggleMinimize);

    document.getElementById('nexus-comms-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCommsMessage();
    });

    document.getElementById('nexus-add-friend-btn').addEventListener('click', () => {
        const name = prompt("输入好友名称:");
        if (name && name.trim()) addTeammate(name.trim(), 'manual');
    });

    document.getElementById('nexus-request-btn').addEventListener('click', () => {
        renderRequestList();
        requestModal.style.display = 'block';
    });
    document.getElementById('nexus-request-close').addEventListener('click', () => { requestModal.style.display = 'none'; });

    document.getElementById('nexus-config-btn').addEventListener('click', () => {
        if (settings && settings.aiConfig) {
            document.getElementById('nexus-api-endpoint').value = settings.aiConfig.endpoint || '';
            document.getElementById('nexus-api-key').value = settings.aiConfig.apiKey || '';
            const modelSelect = document.getElementById('nexus-api-model');
            if (settings.aiConfig.model) {
                let found = false;
                for (let opt of modelSelect.options) {
                    if (opt.value === settings.aiConfig.model) { found = true; break; }
                }
                if (!found) {
                    const opt = document.createElement('option');
                    opt.value = settings.aiConfig.model;
                    opt.text = settings.aiConfig.model;
                    modelSelect.appendChild(opt);
                }
                modelSelect.value = settings.aiConfig.model;
            }
            const immersiveCb = document.getElementById('nexus-immersive-mode');
            if (immersiveCb) immersiveCb.checked = !!settings.immersiveMode;
        }
        configModal.style.display = 'block';
    });
    document.getElementById('nexus-config-close').addEventListener('click', () => { configModal.style.display = 'none'; });

    document.getElementById('nexus-fetch-models').addEventListener('click', async () => {
        const endpoint = document.getElementById('nexus-api-endpoint').value.trim();
        const apiKey = document.getElementById('nexus-api-key').value.trim();
        if (!endpoint || !apiKey) {
            toastr.warning("请先填写 Endpoint 和 API Key", "Infinite Nexus");
            return;
        }
        try {
            let modelsUrl = endpoint;
            if (!modelsUrl.endsWith('/')) modelsUrl += '/';
            if (!modelsUrl.includes('/models')) modelsUrl += 'models';
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const modelSelect = document.getElementById('nexus-api-model');
            modelSelect.innerHTML = '<option value="">-- 选择模型 --</option>';
            if (data.data && Array.isArray(data.data)) {
                data.data.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.text = m.id;
                    modelSelect.appendChild(opt);
                });
                toastr.success(`已获取 ${data.data.length} 个模型`, "Infinite Nexus");
            }
        } catch (error) {
            console.error("[Nexus] Fetch models error:", error);
            toastr.error("获取模型列表失败: " + error.message, "Infinite Nexus");
        }
    });

    document.getElementById('nexus-config-save').addEventListener('click', () => {
        if (!settings) return;
        settings.aiConfig = {
            endpoint: document.getElementById('nexus-api-endpoint').value.trim(),
            apiKey: document.getElementById('nexus-api-key').value.trim(),
            model: document.getElementById('nexus-api-model').value
        };
        const immersiveCb = document.getElementById('nexus-immersive-mode');
        if (immersiveCb) settings.immersiveMode = immersiveCb.checked;
        saveSettingsDebounced();
        toastr.success("API 设置已保存", "Infinite Nexus");
        configModal.style.display = 'none';
    });

    // Profile modal bindings
    document.getElementById('nexus-profile-close').addEventListener('click', () => { profileModal.style.display = 'none'; });
    document.getElementById('nexus-profile-save').addEventListener('click', saveCurrentProfile);
    document.getElementById('nexus-profile-refresh').addEventListener('click', async () => {
        const name = document.getElementById('nexus-profile-name').value;
        const teammate = settings.teammates.find(t => t.name === name);
        if (teammate) {
            toastr.info("正在重新提取档案...", "Infinite Nexus");
            await extractTeammateProfile(teammate);
            openProfileModal(teammate.id);
        }
    });

    // Clear modal bindings

    document.getElementById('nexus-dungeon-normal').addEventListener('click', () => {
        startNewDungeon('normal');
        newDungeonModal.style.display = 'none';
    });
    document.getElementById('nexus-dungeon-pink').addEventListener('click', () => {
        startNewDungeon('pink');
        newDungeonModal.style.display = 'none';
    });
    document.getElementById('nexus-dungeon-cancel').addEventListener('click', () => { newDungeonModal.style.display = 'none'; });

    document.getElementById('nexus-clear-history-btn').addEventListener('click', () => {
        if (settings.currentTeammate) {
            window.infiniteNexus.clearHistory(settings.currentTeammate);
        }
    });

    makeDraggable(overlay, document.getElementById('nexus-header-bar'));
    renderSkills();
    renderInventory();
    settings = initSettings();
    loadTeammatesFromWorldInfo();
    if (window.innerWidth < 600) toggleMinimize();

    // 好友列表可拖拽（使用专用函数，不触发 toggleMinimize）
    const commsHeader = commsModal.querySelector('.nexus-comms-header');
    if (commsHeader) makeModalDraggable(commsModal, commsHeader);
}

function makeDraggable(element, handle) {
    let isDragging = false, startX, startY, startLeft, startTop;
    let hasMoved = false;

    function startDrag(clientX, clientY, e) {
        if (e && e.target && e.target.classList.contains('nexus-toggle-btn')) return false;
        isDragging = true; hasMoved = false;
        startX = clientX; startY = clientY;
        const rect = element.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        return true;
    }

    function moveDrag(clientX, clientY) {
        if (!isDragging) return;
        const dx = clientX - startX, dy = clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
        element.style.left = (startLeft + dx) + 'px';
        element.style.top = (startTop + dy) + 'px';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
    }

    function endDrag() { isDragging = false; }

    // Mouse events - handle (header)
    handle.addEventListener('mousedown', (e) => {
        if (startDrag(e.clientX, e.clientY, e)) e.preventDefault();
    });

    // Mouse events - element itself (for minimized state)
    element.addEventListener('mousedown', (e) => {
        if (!element.classList.contains('minimized')) return;
        if (startDrag(e.clientX, e.clientY, e)) e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    // Touch events - handle (header)
    handle.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (startDrag(touch.clientX, touch.clientY, e)) e.preventDefault();
    }, { passive: false });

    // Touch events - element itself (for minimized state)
    element.addEventListener('touchstart', (e) => {
        if (!element.classList.contains('minimized')) return;
        const touch = e.touches[0];
        if (startDrag(touch.clientX, touch.clientY, e)) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        const wasMinimized = element.classList.contains('minimized');
        const wasDragging = isDragging;
        isDragging = false;
        // 触摸结束时，如果是 minimized 且没有移动，则展开
        if (wasMinimized && !hasMoved) {
            toggleMinimize();
        }
    });

    handle.addEventListener('click', (e) => {
        if (e.target.classList.contains('nexus-toggle-btn')) return;
        if (!hasMoved) toggleMinimize();
    });

    // Click on minimized ball to expand (for mouse)
    element.addEventListener('click', (e) => {
        if (!element.classList.contains('minimized')) return;
        if (!hasMoved) toggleMinimize();
    });
}

// 专用于 Modal 的拖拽函数（无点击最小化逻辑，支持触摸）
function makeModalDraggable(element, handle) {
    let isDragging = false, startX, startY, startLeft, startTop;
    let initialized = false;

    handle.style.cursor = 'move';

    function startDrag(clientX, clientY) {
        isDragging = true;
        startX = clientX;
        startY = clientY;

        const rect = element.getBoundingClientRect();
        if (!initialized) {
            element.style.transform = 'none';
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
            initialized = true;
        }

        startLeft = parseInt(element.style.left) || rect.left;
        startTop = parseInt(element.style.top) || rect.top;
    }

    function moveDrag(clientX, clientY) {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;

        let newTop = startTop + dy;
        if (newTop < 0) newTop = 0;

        element.style.left = (startLeft + dx) + 'px';
        element.style.top = newTop + 'px';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
    }

    function endDrag() {
        isDragging = false;
    }

    // Mouse events
    handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'SPAN' && e.target.style.cursor === 'pointer') return;
        if (e.target.id && e.target.id.includes('close')) return;
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    // Touch events
    handle.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'SPAN' && e.target.style.cursor === 'pointer') return;
        if (e.target.id && e.target.id.includes('close')) return;
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
    }, { passive: true });
    document.addEventListener('touchend', endDrag);
}

function toggleMinimize() {
    const overlay = document.getElementById('infinite-nexus-overlay');
    if (!overlay) return;

    // Anchor Right: 记录当前右边缘位置
    const rect = overlay.getBoundingClientRect();
    const currentRight = rect.right;
    const isMinimizing = !overlay.classList.contains('minimized');

    overlay.classList.toggle('minimized');
    const nowMinimized = overlay.classList.contains('minimized');
    nexusState.isMinimized = nowMinimized;

    // 如果手动拖拽过（有 left 样式），需要调整 left 保持右边缘固定
    if (overlay.style.left && overlay.style.left !== 'auto') {
        const targetWidth = nowMinimized ? 44 : 340;
        const newLeft = currentRight - targetWidth;
        overlay.style.left = newLeft + 'px';
        overlay.style.right = 'auto';
    }

    // Save state
    saveSettingsDebounced();
}

function updateUI() {
    nexusState.hp = Math.max(0, Math.min(nexusState.maxHp, nexusState.hp));
    nexusState.san = Math.max(0, Math.min(nexusState.maxSan, nexusState.san));
    const hpBar = document.getElementById('nexus-hp-bar');
    const sanBar = document.getElementById('nexus-san-bar');
    if (hpBar) hpBar.style.width = (nexusState.hp / nexusState.maxHp * 100) + '%';
    if (sanBar) sanBar.style.width = (nexusState.san / nexusState.maxSan * 100) + '%';
    const hpText = document.getElementById('nexus-hp-text');
    const sanText = document.getElementById('nexus-san-text');
    if (hpText) hpText.innerText = `${nexusState.hp}/${nexusState.maxHp}`;
    if (sanText) sanText.innerText = `${nexusState.san}/${nexusState.maxSan}`;
    const karmaText = document.getElementById('nexus-karma-text');
    if (karmaText) karmaText.innerText = nexusState.karma;
    const missionEl = document.getElementById('nexus-mission');
    if (missionEl) missionEl.innerText = nexusState.mission;
    const timeEl = document.getElementById('nexus-time');
    if (timeEl) timeEl.innerText = nexusState.time;
}

function sendCommsMessage() {
    const input = document.getElementById('nexus-comms-input');
    const msg = input.value.trim();
    if (!msg) return;
    if (!settings || !settings.currentTeammate) {
        toastr.warning("请先选择一个好友");
        return;
    }
    const teammateId = settings.currentTeammate;
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;

    const log = document.getElementById('nexus-comms-log');
    const userEntry = document.createElement('div');
    userEntry.style.marginBottom = "5px";
    userEntry.innerHTML = `<span class="nexus-msg-user">你:</span> ${msg}`;
    log.appendChild(userEntry);
    log.scrollTop = log.scrollHeight;

    if (!settings.commsHistory[teammateId]) settings.commsHistory[teammateId] = [];
    settings.commsHistory[teammateId].push({ role: "user", content: msg });
    saveSettingsDebounced();

    input.value = "";
    input.disabled = true;
    input.placeholder = "正在等待回复...";

    sendToTeammate(teammateId, msg).then(async (responses) => {
        input.disabled = false;
        input.placeholder = `给 ${teammate.name} 发送传音...`;
        if (responses && responses.length > 0) {
            for (let i = 0; i < responses.length; i++) {
                const response = responses[i];
                if (i > 0) await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
                const replyEntry = document.createElement('div');
                replyEntry.style.marginBottom = "5px";
                replyEntry.innerHTML = `<span style="color:var(--nexus-accent-red); font-weight:bold;">${teammate.name}:</span> ${response}`;
                log.appendChild(replyEntry);
                log.scrollTop = log.scrollHeight;
                settings.commsHistory[teammateId].push({ role: "assistant", content: response });
            }
            saveSettingsDebounced();
        }
    }).catch(err => {
        input.disabled = false;
        input.placeholder = `给 ${teammate.name} 发送传音...`;
        console.error("[Nexus] AI 通讯错误:", err);
        toastr.error("传音失败，请重试");
    });
}

async function callIndependentAI(systemPrompt, userMessage, history = []) {
    if (!settings.aiConfig || !settings.aiConfig.endpoint || !settings.aiConfig.apiKey) {
        throw new Error("API 未配置");
    }
    const { endpoint, apiKey, model } = settings.aiConfig;
    let url = endpoint;
    if (!url.endsWith('/')) url += '/';
    if (!url.includes('/chat/completions')) url += 'chat/completions';

    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage }
    ];

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'gpt-3.5-turbo', messages: messages, max_tokens: 200, temperature: 0.7 })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    if (!data.choices || data.choices.length === 0) throw new Error("No choices returned from AI");
    return data.choices[0].message.content.trim();
}

async function sendToTeammate(teammateId, message) {
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return [];

    if (!settings.aiConfig || !settings.aiConfig.endpoint) {
        toastr.warning("请先点击传音面板的  按钮配置独立 API", "Infinite Nexus");
        return ["[系统提示: 未配置 API，无法连接队友]"];
    }

    try {
        const traitsDesc = teammate.traits && teammate.traits.length > 0 ? teammate.traits.join('、') : '友好、健谈';
        const backstoryDesc = teammate.backstory ? `背景: ${teammate.backstory}` : '';
        const isVerbose = teammate.traits?.some(t => ['健谈', '话多', '活泼', '热情', '外向'].includes(t));
        const replyCountHint = isVerbose ? '4-7条' : '2-4条';

        const systemPrompt = `你现在扮演 Infinite Nexus 系统中的队友 "${teammate.name}"。
性格特征: ${traitsDesc}
${backstoryDesc}
你们正在一个危险的无限流副本中。

请以 "${teammate.name}" 的身份回复玩家的消息。

【重要格式要求】
1. 根据你的性格，可以发送 ${replyCountHint} 消息
2. 每条消息用 ||| 分隔
3. 每条消息要简短（30字以内），像发微信/传音一样
4. 语气要符合你的性格特征（${traitsDesc}）
5. 不要写动作描述，只写对话内容

示例格式：
刚看到你的消息|||怎么了，出什么事了？|||需要我过来帮忙吗`;

        const history = (settings.commsHistory[teammateId] || []).slice(-6).map(entry => ({ role: entry.role, content: entry.content }));
        const reply = await callIndependentAI(systemPrompt, message, history);
        const replies = reply.split('|||').map(r => r.trim()).filter(r => r.length > 0).slice(0, 7);

        if (Math.random() < 0.3) {
            teammate.signature = getRandomSignature();
            saveSettingsDebounced();
            renderFriendList();
        }

        return replies.length > 0 ? replies : [reply];
    } catch (error) {
        console.error("[Nexus] sendToTeammate error:", error);
        toastr.error(`API 调用失败: ${error.message}`, "Infinite Nexus");
        return [`[信号中断: ${error.message}]`];
    }
}

async function extractTeammateProfile(teammate) {
    if (!teammate) return;
    console.log(`[Nexus] 开始提取 ${teammate.name} 的角色档案...`);
    const worldInfoProfile = getProfileFromWorldInfo(teammate.name);
    if (worldInfoProfile) {
        teammate.worldInfoKey = worldInfoProfile.key;
        if (worldInfoProfile.content) {
            await extractFromText(teammate, worldInfoProfile.content, "worldinfo");
            return;
        }
    }
    const chatProfile = await extractFromChatHistory(teammate.name);
    if (chatProfile) {
        await extractFromText(teammate, chatProfile, "chat");
    }
}

function getProfileFromWorldInfo(name) {
    try {
        const context = getContext();
        if (!context.worldInfo) return null;
        for (const entry of Object.values(context.worldInfo)) {
            if (entry.key && entry.key.toLowerCase().includes(name.toLowerCase())) {
                return { key: entry.key, content: entry.content };
            }
        }
    } catch (e) { console.warn("[Nexus] WorldInfo access error:", e); }
    return null;
}

async function extractFromChatHistory(name) {
    try {
        const context = getContext();
        if (!context.chat) return null;
        const relevantMessages = context.chat.filter(m => m.mes && m.mes.includes(name)).slice(-10);
        if (relevantMessages.length === 0) return null;
        return relevantMessages.map(m => m.mes).join('\n').slice(0, 2000);
    } catch (e) { console.warn("[Nexus] Chat history access error:", e); }
    return null;
}

async function extractFromText(teammate, text, source) {
    if (!settings.aiConfig || !settings.aiConfig.endpoint) return;
    try {
        const systemPrompt = `分析以下文本，提取角色"${teammate.name}"的信息。
返回JSON格式: {"traits": ["性格词1", "性格词2"], "backstory": "简短经历描述"}
只返回JSON，不要其他内容。`;
        const result = await callIndependentAI(systemPrompt, text.slice(0, 1500), []);
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            if (data.traits) teammate.traits = data.traits;
            if (data.backstory) teammate.backstory = data.backstory;
            saveSettingsDebounced();
            console.log(`[Nexus] 成功提取 ${teammate.name} 的档案 (来源: ${source})`);
        }
    } catch (e) { console.warn("[Nexus] Profile extraction error:", e); }
}

function loadTeammatesFromWorldInfo() {
    try {
        const context = getContext();
        if (!context.worldInfo) return;
        for (const entry of Object.values(context.worldInfo)) {
            if (entry.key && entry.content && entry.content.includes('[队友]')) {
                const name = entry.key.split(',')[0].trim();
                if (name && !settings.teammates.some(t => t.name === name)) {
                    addTeammate(name, 'worldinfo');
                }
            }
        }
    } catch (e) { console.warn("[Nexus] Failed to load WorldInfo teammates:", e); }
}

function addTeammate(name, source) {
    if (!settings) return;
    if (settings.teammates.some(t => t.name === name)) {
        toastr.info(`${name} 已经是好友了`);
        return;
    }
    const newTeammate = {
        id: 'tm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: name,
        source: source,
        signature: getRandomSignature(),
        traits: [],
        backstory: "",
        notes: "",
        worldInfoKey: null,
        inParty: false
    };
    settings.teammates.push(newTeammate);
    saveSettingsDebounced();
    renderFriendList();
    toastr.success(`已添加好友: ${name}`);
    extractTeammateProfile(newTeammate);
}

function updateRequestBadge() {
    if (!settings) return;
    const btn = document.getElementById('nexus-request-btn');
    if (btn) {
        const count = settings.pendingRequests.length;
        btn.innerHTML = `申请 <span id="nexus-req-count">${count}</span>`;
        if (count > 0) {
            btn.style.color = '#ffdb74';
            btn.style.borderColor = '#ffdb74';
        } else {
            btn.style.color = '';
            btn.style.borderColor = '';
        }
        btn.style.display = 'inline-block';
    }
}

function renderSkills() {
    const list = document.getElementById('nexus-skill-list');
    if (!list) return;
    list.innerHTML = "";
    nexusState.skills.forEach(skill => {
        const div = document.createElement('div');
        div.className = 'nexus-skill-tag';
        div.title = "点击进行技能检定";
        div.onclick = () => infiniteNexus.rollSkill(skill.name, skill.value);
        div.innerHTML = `
            ${skill.name} <span class="nexus-skill-val-tag">${skill.value}</span>
        `;
        list.appendChild(div);
    });
}

function performSkillCheck(skillName, skillValue, isUniversal = false) {
    const roll = Math.floor(Math.random() * 100) + 1;
    let result, color;
    if (roll <= skillValue / 5) { result = "大成功!"; color = "#4CAF50"; }
    else if (roll <= skillValue / 2) { result = "困难成功"; color = "#8BC34A"; }
    else if (roll <= skillValue) { result = "成功"; color = "#03A9F4"; }
    else if (roll >= 96) { result = "大失败!"; color = "#F44336"; }
    else { result = "失败"; color = "#FF9800"; }
    toastr.info(`[${skillName}]  ${roll} / ${skillValue}  <span style="color:${color}; font-weight:bold;">${result}</span>`, "技能检定", { escapeHtml: false });

    // Hidden Injection: Store result to be appended to next message
    if (!settings.pendingDice) settings.pendingDice = [];
    settings.pendingDice.push(`[系统检定: ${skillName} ${roll}/${skillValue} ${result}]`);
    saveSettingsDebounced();
}

function renderInventory() {
    const list = document.getElementById('nexus-inventory-list');
    if (!list) return;
    list.innerHTML = "";
    if (nexusState.inventory.length > 0 && typeof nexusState.inventory[0] === 'string') {
        nexusState.inventory = nexusState.inventory.map(name => ({ name, count: 1, consumable: false }));
    }
    if (nexusState.inventory.length === 0) {
        list.innerHTML = `<div style="color:#888; font-size:0.8em; padding:5px;">(空)</div>`;
        return;
    }
    nexusState.inventory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'nexus-item';
        div.title = item.consumable ? '消耗品 (点击使用)' : '物品 (点击使用/丢弃)';
        const countBadge = `<span class="nexus-item-count" style="margin-left:5px; color:#888; font-size:0.9em;">x${item.count}</span>`;
        div.innerHTML = `${item.name}${countBadge}`;

        // Mouse click
        div.addEventListener('click', (e) => {
            e.preventDefault();
            showItemContextMenu(e.pageX, e.pageY, item.name, item.consumable);
        });

        // Touch support
        div.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            showItemContextMenu(touch.pageX, touch.pageY, item.name, item.consumable);
        });

        list.appendChild(div);
    });
}

function showItemContextMenu(x, y, itemName, isConsumable) {
    const existing = document.getElementById('nexus-item-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'nexus-item-menu';
    menu.className = 'nexus-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // 创建按钮而不是用 innerHTML onclick
    const useBtn = document.createElement('div');
    useBtn.className = 'nexus-menu-item';
    useBtn.textContent = '使用';
    useBtn.addEventListener('click', () => infiniteNexus.useItem(itemName));
    useBtn.addEventListener('touchend', (e) => { e.preventDefault(); infiniteNexus.useItem(itemName); });

    const dropBtn = document.createElement('div');
    dropBtn.className = 'nexus-menu-item nexus-menu-danger';
    dropBtn.textContent = '丢弃';
    dropBtn.addEventListener('click', () => infiniteNexus.dropItem(itemName));
    dropBtn.addEventListener('touchend', (e) => { e.preventDefault(); infiniteNexus.dropItem(itemName); });

    menu.appendChild(useBtn);
    menu.appendChild(dropBtn);
    document.body.appendChild(menu);

    // 点击/触摸其他地方关闭菜单
    setTimeout(() => {
        function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('touchend', closeMenu);
        }
        document.addEventListener('click', closeMenu, { once: true });
        document.addEventListener('touchend', closeMenu, { once: true });
    }, 50);
}

function renderShopItems() {
    const list = document.getElementById('nexus-shop-list');
    list.innerHTML = "";
    nexusState.shopItems.forEach(item => {
        const row = document.createElement('div');
        row.className = 'nexus-shop-item';
        const canAfford = nexusState.karma >= item.cost;
        const btnStyle = canAfford ? "" : "opacity:0.5; background:#eee;";
        row.innerHTML = `
            <div style="flex-grow:1;">
                <div style="font-weight:bold;">${item.name}</div>
                <div style="font-size:0.75em; color:#666;">${item.desc}</div>
            </div>
            <button class="nexus-shop-buy" style="${btnStyle}" 
                onclick="infiniteNexus.buyItem('${item.name}', ${item.cost}, '${item.effect.replace(/'/g, "\\'")}')">
                ${item.cost}
            </button>
        `;
        list.appendChild(row);
    });
}

function showClearModal(dungeonName, bonusKarma = 50) {
    document.getElementById('nexus-clear-dungeon-name').innerText = `【${dungeonName}】`;
    document.getElementById('nexus-clear-time').innerText = nexusState.time;
    document.getElementById('nexus-clear-hp').innerText = `${nexusState.hp}/${nexusState.maxHp}`;
    document.getElementById('nexus-clear-san').innerText = `${nexusState.san}/${nexusState.maxSan}`;
    document.getElementById('nexus-clear-karma').innerText = `+${bonusKarma}`;
    nexusState.karma += bonusKarma;
    updateUI();
    document.getElementById('nexus-clear-modal').style.display = 'block';
    toastr.success(`副本通关！获得 ${bonusKarma} Karma`, "Infinite Nexus");
}

function startNewDungeon(type) {
    nexusState.hp = nexusState.maxHp;
    nexusState.san = nexusState.maxSan;
    nexusState.time = "D-01";
    const textarea = document.querySelector('#send_textarea');

    const normalPrompt = `[Infinite Nexus 副本开始]
你和{{char}}突然被一股神秘力量拉入了"无限流"副本世界。

【角色设定】请随机决定：
- {{char}}是第一次被拉入副本的"新人"（惊慌、不解），还是已经历过多次副本的"老人"（冷静、有经验）
- {{user}}同理，也随机决定是新人还是老人
- 两人可以是一起被传送，或在副本中偶遇

【开场描写要求】
1. 描述被传送的瞬间感受（白光/眩晕/意识模糊）
2. 描述副本环境：危险程度、氛围、规则提示
3. 描写{{char}}和{{user}}的初次反应，体现他们是新人还是老人
4. 给出初始任务提示

【末尾输出系统标签】
[任务: 副本主线任务] [时间: D-01]

【后续剧情中】
- 受伤输出 [HP -数值]
- 精神冲击输出 [SAN -数值]  
- 获得物品输出 [物品: 物品名]
- 技能检定输出 [技能: 技能名 数值]

请开始描述副本开场：`;

    const pinkPrompt = `[Infinite Nexus 粉红团副本]
你和{{char}}突然被一股暧昧的力量拉入了"无限流"的特殊副本——粉红团。

【角色设定】请随机决定：
- {{char}}是第一次经历这种副本的"纯情新人"，还是见多识广的"老司机"
- {{user}}同理，随机决定经验程度
- 两人的相遇可以是意外，也可以是命运安排

【开场描写要求】
1. 描述被传送的瞬间感受（身体发热、意识朦胧）
2. 描述副本环境：暧昧氛围、诱惑元素、危险与情欲交织
3. 描写{{char}}的反应，体现其性格和经验程度
4. 给出带有暗示性的任务提示

【末尾输出系统标签】
[任务: 副本任务] [时间: D-01]

【后续剧情中适时输出】
[HP] [SAN] [物品] 等标签

请开始描述粉红团开场 (R18)：`;

    if (type === 'normal') {
        nexusState.mission = "新副本：存活并探索...";
        toastr.info("开始普通副本", "Infinite Nexus");
        if (textarea) {
            textarea.value = normalPrompt;
            textarea.style.setProperty('color', '#b85450', 'important');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (type === 'pink') {
        nexusState.mission = "粉红团：享受特殊剧情...";
        toastr.info("开始粉红团", "Infinite Nexus");
        if (textarea) {
            textarea.value = pinkPrompt;
            textarea.style.setProperty('color', '#b85450', 'important');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    updateUI();
}

function manualAddSkill() {
    const name = prompt("输入技能名称", "");
    if (!name) return;
    const val = prompt(`输入数值(0 - 100)`, "50");
    if (!val) return;
    addOrUpdateSkill(name, parseInt(val));
}

function addOrUpdateSkill(name, val) {
    const existing = nexusState.skills.find(s => s.name === name);
    if (existing) { existing.value = val; }
    else { nexusState.skills.push({ name: name, value: val }); }
    renderSkills();
}

function manualAddItem() {
    const name = prompt("请输入物品名称:");
    if (!name) return;
    const countStr = prompt("请输入数量:", "1");
    const count = parseInt(countStr);
    if (!isNaN(count) && count > 0) {
        addItem(name, count);
    }
}

function addItem(itemName, count = 1, consumable = false) {
    if (nexusState.inventory.length > 0 && typeof nexusState.inventory[0] === 'string') {
        nexusState.inventory = nexusState.inventory.map(name => ({ name, count: 1, consumable: false }));
    }
    // Auto-detect consumable
    if (!consumable) {
        if (/[药剂丸丹水茶酒食肉包卷]|Potion|Elixir|Food|Meat|Scroll|Box|Pack/i.test(itemName)) {
            consumable = true;
        }
    }
    const existing = nexusState.inventory.find(item => item.name === itemName);
    if (existing) { existing.count += count; }
    else { nexusState.inventory.push({ name: itemName, count: count, consumable: consumable }); }
    renderInventory();
    toastr.success(`获得物品: ${itemName} x${count} `, "Infinite Nexus");
}

function useItem(itemName) {
    const item = nexusState.inventory.find(i => i.name === itemName);
    if (!item) return;
    if (item.consumable) {
        item.count -= 1;
        toastr.success(`消耗使用了 ${itemName} (剩余: ${item.count})`, "Infinite Nexus");
        if (item.count <= 0) nexusState.inventory = nexusState.inventory.filter(i => i.name !== itemName);
        renderInventory();
    } else {
        toastr.info(`使用了 ${itemName} (不消耗)`, "Infinite Nexus");
    }
}

function dropItem(itemName, amount = 1) {
    const item = nexusState.inventory.find(i => i.name === itemName);
    if (!item) return;
    item.count -= amount;
    if (item.count <= 0) nexusState.inventory = nexusState.inventory.filter(i => i.name !== itemName);
    toastr.warning(`丢弃了 ${itemName} `, "Infinite Nexus");
    renderInventory();
}

function addPendingRequest(name, reason) {
    if (!settings) return;
    if (settings.teammates.some(t => t.name === name)) return;
    if (settings.pendingRequests.some(r => r.name === name)) return;
    settings.pendingRequests.push({ name, reason, time: new Date().toLocaleString() });
    saveSettingsDebounced();
    updateRequestBadge();
    toastr.info(`收到来自 ${name} 的好友申请`, "Infinite Nexus");
}

function renderRequestList() {
    const list = document.getElementById('nexus-request-list');
    if (!list || !settings) return;
    list.innerHTML = "";
    if (settings.pendingRequests.length === 0) {
        list.innerHTML = '<div style="color:#888; padding:10px;">暂无好友申请</div>';
        return;
    }
    settings.pendingRequests.forEach((req, idx) => {
        const div = document.createElement('div');
        div.className = 'nexus-request-item';
        div.innerHTML = `
        < div > <strong>${req.name}</strong></div >
            <div style="font-size:0.8em; color:#666;">${req.reason}</div>
            <div style="margin-top:5px;">
                <button class="nexus-btn-primary" onclick="infiniteNexus.acceptRequest(${idx})">接受</button>
                <button class="nexus-btn-secondary" onclick="infiniteNexus.rejectRequest(${idx})">拒绝</button>
            </div>
    `;
        list.appendChild(div);
    });
}

function selectTeammate(teammateId) {
    if (!settings) return;
    settings.currentTeammate = teammateId;
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;
    document.getElementById('nexus-chat-name').innerText = teammate.name;
    document.getElementById('nexus-current-chat-label').style.display = 'block';
    const input = document.getElementById('nexus-comms-input');
    input.disabled = false;
    input.placeholder = `给 ${teammate.name} 发送传音...`;
    renderCommsLog(teammateId);
    renderFriendList();
}

function renderCommsLog(teammateId) {
    const log = document.getElementById('nexus-comms-log');
    log.innerHTML = "";
    const history = settings.commsHistory[teammateId] || [];
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (history.length === 0) {
        log.innerHTML = '<div class="nexus-comms-placeholder">还没有消息记录...</div>';
        return;
    }
    history.forEach(msg => {
        const entry = document.createElement('div');
        entry.style.marginBottom = "8px"; // Increased spacing
        if (msg.role === 'user') {
            entry.innerHTML = `<span class="nexus-msg-user">你:</span> <span class="nexus-msg-content">${msg.content}</span>`;
        } else {
            // Removed hardcoded red
            entry.innerHTML = `<span class="nexus-msg-sender">${teammate ? teammate.name : '队友'}:</span> <span class="nexus-msg-content">${msg.content}</span>`;
        }
        log.appendChild(entry);
    });
    log.scrollTop = log.scrollHeight;
}

function renderFriendList() {
    const list = document.getElementById('nexus-friend-list');
    if (!list || !settings) return;
    list.innerHTML = "";
    if (settings.teammates.length === 0) {
        list.innerHTML = '<div style="color:#888; padding:5px;">还没有好友</div>';
        return;
    }
    settings.teammates.forEach(t => {
        if (!t.signature) t.signature = getRandomSignature();
        const div = document.createElement('div');
        div.className = 'nexus-friend-item' + (settings.currentTeammate === t.id ? ' active' : '');
        div.innerHTML = `
            <div style="flex:1; cursor:pointer;" onclick="selectTeammate('${t.id}')">
                <span class="nexus-friend-name" style="font-weight:bold; color:var(--nexus-gold-bright);">${t.name}</span>
                <span class="nexus-friend-sig" style="color:var(--nexus-text-sub); font-size:0.75em; margin-left:8px;">${t.signature}</span>
            </div>
            <div class="nexus-friend-actions" style="display:flex; gap:3px;">
                <span class="nexus-btn-mini" onclick="infiniteNexus.openProfile('${t.id}')" title="档案">档</span>
                <span class="nexus-btn-mini nexus-btn-danger" onclick="infiniteNexus.deleteTeammate('${t.id}')" title="删除">删</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function deleteTeammate(teammateId) {
    if (!settings) return;
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;
    if (!confirm(`确定要删除好友 "${teammate.name}" 吗？`)) return;
    settings.teammates = settings.teammates.filter(t => t.id !== teammateId);
    delete settings.commsHistory[teammateId];
    if (settings.currentTeammate === teammateId) {
        settings.currentTeammate = null;
        document.getElementById('nexus-current-chat-label').style.display = 'none';
        document.getElementById('nexus-comms-input').disabled = true;
        document.getElementById('nexus-comms-input').placeholder = '选择好友后发送传音...';
        document.getElementById('nexus-comms-log').innerHTML = '<div class="nexus-comms-placeholder">选择好友开始传音...</div>';
    }
    saveSettingsDebounced();
    renderFriendList();
    toastr.warning(`已删除好友: ${teammate.name} `);
}

function openProfileModal(teammateId) {
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;
    document.getElementById('nexus-profile-name').value = teammate.name;
    document.getElementById('nexus-profile-traits').value = (teammate.traits || []).join(', ');
    document.getElementById('nexus-profile-backstory').value = teammate.backstory || '';
    document.getElementById('nexus-profile-notes').value = teammate.notes || '';
    document.getElementById('nexus-profile-inparty').checked = teammate.inParty || false;
    document.getElementById('nexus-profile-source').innerText = `来源: ${teammate.source || 'unknown'} ` + (teammate.worldInfoKey ? ` | WorldInfo: ${teammate.worldInfoKey} ` : '');
    document.getElementById('nexus-profile-modal').style.display = 'block';
}

function saveCurrentProfile() {
    const name = document.getElementById('nexus-profile-name').value;
    const teammate = settings.teammates.find(t => t.name === name);
    if (!teammate) return;
    teammate.traits = document.getElementById('nexus-profile-traits').value.split(',').map(s => s.trim()).filter(s => s);
    teammate.backstory = document.getElementById('nexus-profile-backstory').value.trim();
    teammate.notes = document.getElementById('nexus-profile-notes').value.trim();
    teammate.inParty = document.getElementById('nexus-profile-inparty').checked;
    saveSettingsDebounced();
    toastr.success("档案已保存", "Infinite Nexus");
    document.getElementById('nexus-profile-modal').style.display = 'none';
}

function recalculateStateFromChat() {
    try {
        const context = getContext();
        if (!context.chat) return;
        Object.assign(nexusState, JSON.parse(JSON.stringify(BASE_STATE)));
        context.chat.forEach(msg => {
            if (msg.is_user) return;
            if (msg.mes) parseSystemTagsForRecalc(msg.mes);
        });
        updateUI();
        renderSkills();
        renderInventory();
        console.log("[Nexus] 状态重算完成");
    } catch (e) { console.warn("[Nexus] recalculateStateFromChat error:", e); }
}

function parseSystemTagsForRecalc(text) {
    if (!text) return;
    const blockRegex = /[[\u3010](.*?)[\]\u3011]/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        const content = match[1];
        if (/(HP|生命|Life)/i.test(content)) {
            const parts = content.split(/(HP|生命|Life)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1], val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.hp -= val;
                    else if (sign === '+') nexusState.hp += val;
                    else nexusState.hp = val;
                }
            }
        }
        if (/(SAN|理智)/i.test(content)) {
            const parts = content.split(/(SAN|理智)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1], val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.san -= val;
                    else if (sign === '+') nexusState.san += val;
                    else nexusState.san = val;
                }
            }
        }
        if (/(Karma|点数|奖励)/i.test(content) && !/(消费|花费)/i.test(content)) {
            const parts = content.split(/(Karma|点数|奖励)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1], val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.karma -= val;
                    else nexusState.karma += val;
                }
            }
        }
        if (/(MISSION|任务|目标)/i.test(content)) {
            let clean = content.replace(/(MISSION|任务|目标)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) nexusState.mission = clean;
        }
        if (/(SKILL|技能)/i.test(content) && /\d+/.test(content)) {
            const skillMatch = /([\u4e00-\u9fa5\w]+)\s*[:：]?\s*(\d+)/.exec(content.replace(/(SKILL|技能)/ig, ""));
            if (skillMatch) addOrUpdateSkill(skillMatch[1], parseInt(skillMatch[2]));
        }
        if (/(TIME|时间|日期)/i.test(content)) {
            let clean = content.replace(/(TIME|时间|日期)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) nexusState.time = clean;
        }
        if (/(ITEM|物品|道具)/i.test(content)) {
            let clean = content.replace(/(ITEM|物品|道具)/ig, "").trim().replace(/^[+\-:：\s]+/, "");
            clean = clean.replace(/^(获得|发现)/, "").trim();
            if (clean && clean.length <= 12 && !/^(注意|警告|系统)/.test(clean)) addItem(clean);
        }
    }
}

window.infiniteNexus = {
    buyItem: function (itemName, cost, effectTag) {
        if (nexusState.karma >= cost) {
            nexusState.karma -= cost;
            updateUI();
            const textarea = document.querySelector('#send_textarea');
            if (textarea) {
                const prefix = textarea.value ? "\n" : "";
                textarea.value += prefix + `[系统: 玩家花费${cost} 点兑换了 < ${itemName}>]\n${effectTag} `;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            addItem(itemName);
            toastr.success(`已兑换: ${itemName} `);
            renderShopItems();
        } else {
            toastr.error("点数不足");
        }
    },
    acceptRequest: function (idx) {
        if (!settings) return;
        const req = settings.pendingRequests[idx];
        if (req) {
            addTeammate(req.name, "request");
            settings.pendingRequests.splice(idx, 1);
            saveSettingsDebounced();
            renderRequestList();
            updateRequestBadge();
            renderFriendList();
            toastr.success(`${req.name} 已加入好友列表`);
            if (settings.pendingRequests.length === 0) {
                document.getElementById('nexus-request-modal').style.display = 'none';
            }
        }
    },
    rejectRequest: function (idx) {
        if (!settings) return;
        const req = settings.pendingRequests[idx];
        if (req) {
            settings.pendingRequests.splice(idx, 1);
            saveSettingsDebounced();
            renderRequestList();
            updateRequestBadge();
            toastr.warning(`已拒绝 ${req.name} 的好友申请`);
            if (settings.pendingRequests.length === 0) {
                document.getElementById('nexus-request-modal').style.display = 'none';
            }
        }
    },
    deleteTeammate: deleteTeammate,
    openProfile: openProfileModal,
    selectTeammate: selectTeammate,
    clearHistory: function (teammateId) {
        if (!settings) return;
        if (!confirm("确定要清空与该好友的所有对话记录吗？")) return;
        settings.commsHistory[teammateId] = [];
        saveSettingsDebounced();
        if (settings.currentTeammate === teammateId) renderCommsLog(teammateId);
        toastr.info("对话记录已清空", "Infinite Nexus");
    },
    useItem: useItem,
    dropItem: dropItem,
    rollSkill: performSkillCheck
};

window.selectTeammate = selectTeammate;

function parseSystemTags(text) {
    if (!text) return;
    const blockRegex = /[[\u3010](.*?)[\]\u3011]/g;
    let match;
    let updated = false;

    while ((match = blockRegex.exec(text)) !== null) {
        const content = match[1];

        if (/(HP|生命|Life|Integrity)/i.test(content)) {
            const parts = content.split(/(HP|生命|Life|Integrity)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1], val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.hp -= val;
                    else if (sign === '+') nexusState.hp += val;
                    else nexusState.hp = val;
                    updated = true;
                }
            }
        }

        if (/(SAN|理智|Rationality)/i.test(content)) {
            const parts = content.split(/(SAN|理智|Rationality)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1], val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.san -= val;
                    else if (sign === '+') nexusState.san += val;
                    else nexusState.san = val;
                    updated = true;
                }
            }
        }

        if (/(Karma|点数|奖励)/i.test(content) && !/(消费|花费|购买|兑换)/i.test(content)) {
            const parts = content.split(/(Karma|点数|奖励)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1], val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.karma -= val;
                    else nexusState.karma += val;
                    updated = true;
                }
            }
        }

        if (/(MISSION|任务|目标)/i.test(content)) {
            let clean = content.replace(/(MISSION|任务|目标)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) { nexusState.mission = clean; updated = true; }
        }

        if (/(SKILL|技能|获得)/i.test(content) && /\d+/.test(content)) {
            const skillMatch = /([\u4e00-\u9fa5\w]+)\s*[:：]?\s*(\d+)/.exec(content.replace(/(SKILL|技能|获得)/ig, ""));
            if (skillMatch) addOrUpdateSkill(skillMatch[1], parseInt(skillMatch[2]));
        }

        if (/(TIME|时间|日期|天数)/i.test(content)) {
            let clean = content.replace(/(TIME|时间|日期|天数)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) { nexusState.time = clean; updated = true; }
        }

        if (/(ITEM|物品|道具)/i.test(content)) {
            let clean = content.replace(/(ITEM|物品|道具)/ig, "").trim().replace(/^[+\-:：\s]+/, "");
            clean = clean.replace(/^(获得|发现|关键线索|提示)/, "").trim();
            if (clean.length > 12) continue;
            if (/^(注意|警告|系统|数据)/.test(clean)) continue;
            if (clean) addItem(clean);
        }

        if (/(好友申请|FRIEND_REQUEST)/i.test(content)) {
            const reqMatch = content.match(/[:：]\s*([^,，]+)[,，]\s*(理由|reason)[:：]?\s*(.+)/i);
            if (reqMatch) addPendingRequest(reqMatch[1].trim(), reqMatch[3].trim());
        }

        if (/(TEAM|队友|小队)/i.test(content)) {
            const teamMatch = content.match(/[:：]\s*([^\]\u3011]+)/i);
            if (teamMatch) {
                const name = teamMatch[1].trim();
                if (name && !settings.teammates.some(t => t.name === name)) addTeammate(name, "worldinfo");
            }
        }

        if (/(通关|CLEAR|副本完成|DUNGEON_COMPLETE)/i.test(content)) {
            const clearMatch = content.match(/[:：]\s*(.+)/i);
            const dungeonName = clearMatch ? clearMatch[1].trim() : "未知副本";
            showClearModal(dungeonName);
            updated = true;
        }
    }
    if (updated) updateUI();
}

setInterval(() => {
    const msgs = document.querySelectorAll('.mes_text');
    if (msgs.length > 0) {
        const start = Math.max(0, msgs.length - 10);
        for (let i = start; i < msgs.length; i++) {
            const msg = msgs[i];
            const currentText = msg.innerText;
            const lastParsedLen = parseInt(msg.dataset.nexusParsedLen || "0");
            if (currentText.length !== lastParsedLen) {
                parseSystemTags(currentText);
                msg.dataset.nexusParsedLen = currentText.length;
            }
        }
    }
}, 2000);

function generateCommsSummary() {
    if (!settings || !settings.teammates || settings.teammates.length === 0) return "";
    let summary = "";
    let hasContent = false;
    Object.entries(settings.commsHistory).forEach(([teammateId, history]) => {
        if (!history || history.length === 0) return;
        const teammate = settings.teammates.find(t => t.id === teammateId);
        if (!teammate) return;
        const recentHistory = history.slice(-3);
        if (recentHistory.length > 0) {
            hasContent = true;
            summary += `\n【与 ${teammate.name} 的传音】\n`;
            recentHistory.forEach(msg => {
                const sender = msg.role === "user" ? "你" : teammate.name;
                summary += `${sender}: ${msg.content} \n`;
            });
        }
    });
    return hasContent ? summary : "";
}

function injectCommsContext() {
    try {
        const context = getContext();
        if (!context.chat || context.chat.length === 0) return;

        // Find last user message
        let lastUserMsg = null;
        for (let i = context.chat.length - 1; i >= 0; i--) {
            if (context.chat[i].is_user) { lastUserMsg = context.chat[i]; break; }
        }
        if (!lastUserMsg) return;

        let injection = "";

        // 1. Inject Comms
        const commsSummary = generateCommsSummary();
        if (commsSummary && !lastUserMsg.mes.includes("【与 ")) {
            injection += "\n" + commsSummary;
            console.log("[Nexus] Injecting Comms History");
        }

        // 2. Inject Pending Dice
        if (settings.pendingDice && settings.pendingDice.length > 0) {
            injection += "\n" + settings.pendingDice.join("\n");
            console.log("[Nexus] Injecting Dice Result:", settings.pendingDice);
            settings.pendingDice = []; // Clear after injection
            saveSettingsDebounced();
        }

        // Apply Injection
        if (injection) {
            lastUserMsg.mes += injection;
            // Force update UI if visible (optional, usually internal state update is enough for prompt generation)
            // But we might need to trigger variable update
        }

    } catch (e) { console.warn("[Nexus] Context injection error:", e); }
}

/* DUPLICATES REMOVED
// --- Restored Missing Functions ---
function renderShopItems() {
    const list = document.getElementById('nexus-shop-list');
    if (!list) return;
    list.innerHTML = "";
    nexusState.shopItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'nexus-shop-item';
        div.innerHTML = `
        < div >
                <div style="font-weight:bold;">${item.name}</div>
                <div style="font-size:0.8em; color:#666;">${item.desc}</div>
            </div >
        <button class="nexus-shop-buy" onclick="infiniteNexus.buyItem('${item.name}', ${item.cost})">${item.cost} Karma</button>
    `;
        list.appendChild(div);
    });
}
 
function buyItem(name, cost) {
    if (nexusState.karma < cost) {
        toastr.warning("Karma 不足！", "Infinite Nexus");
        return;
    }
    nexusState.karma -= cost;
    addItem(name);
    updateUI();
    toastr.success(`购买了 ${ name } `, "Infinite Nexus");
    renderShopItems();
}
 
function manualAddSkill() {
    const name = prompt("请输入技能名称:");
    if (!name) return;
    const valStr = prompt("请输入技能数值 (1-100):", "50");
    const val = parseInt(valStr);
    if (isNaN(val)) return;
    addOrUpdateSkill(name, val);
}
 
function openProfileModal(teammateId) {
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;
    document.getElementById('nexus-profile-name').value = teammate.name;
    document.getElementById('nexus-profile-traits').value = (teammate.traits || []).join(', ');
    document.getElementById('nexus-profile-backstory').value = teammate.backstory || '';
    document.getElementById('nexus-profile-notes').value = teammate.notes || '';
    const inPartyCb = document.getElementById('nexus-profile-inparty');
    if (inPartyCb) inPartyCb.checked = !!teammate.inParty;
    const sourceText = teammate.worldInfoKey ? `来源: WorldInfo(${ teammate.worldInfoKey })` : "来源: 手动添加";
    const sourceEl = document.getElementById('nexus-profile-source');
    if (sourceEl) sourceEl.innerText = sourceText;
 
    const modal = document.getElementById('nexus-profile-modal');
    modal.dataset.currentId = teammateId;
    modal.style.display = 'block';
}
 
function saveCurrentProfile() {
    const modal = document.getElementById('nexus-profile-modal');
    const teammateId = modal.dataset.currentId;
    if (!teammateId) return;
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;
 
    teammate.traits = document.getElementById('nexus-profile-traits').value.split(/[,，]/).map(s => s.trim()).filter(s => s);
    teammate.backstory = document.getElementById('nexus-profile-backstory').value;
    teammate.notes = document.getElementById('nexus-profile-notes').value;
    const inPartyCb = document.getElementById('nexus-profile-inparty');
    if (inPartyCb) teammate.inParty = inPartyCb.checked;
 
    saveSettingsDebounced();
    toastr.success("档案已保存", "Infinite Nexus");
    modal.style.display = 'none';
    if (typeof renderFriendList === 'function') renderFriendList();
}
 
// Expose to global window object
if (!window.infiniteNexus) window.infiniteNexus = {};
window.infiniteNexus.buyItem = buyItem;
window.infiniteNexus.renderShopItems = renderShopItems;
window.infiniteNexus.openProfileModal = openProfileModal;
*/
console.log("Nexus Cleaned & Loaded");
jQuery(document).ready(function () {
    const link = document.createElement('link');
    link.href = extensionPath + 'nexus-style.css';
    link.type = 'text/css';
    link.rel = 'stylesheet';
    document.head.append(link);
    setTimeout(createOverlay, 1000);

    try { eventSource.on(event_types.USER_MESSAGE_RENDERED, injectCommsContext); }
    catch (e) { console.warn("[Nexus] 无法注册 USER_MESSAGE_RENDERED 事件:", e); }

    try {
        if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
                // Determine text content. 'data' might be message ID or object.
                // We'll read the DOM or Context. 
                // Context is updated asynchronously. Better to read the last message from DOM?
                setTimeout(() => {
                    const msgs = document.querySelectorAll('.mes_text');
                    if (msgs.length > 0) {
                        const lastMsg = msgs[msgs.length - 1];
                        if (lastMsg) {
                            analyzeGameEvents(lastMsg.innerText);
                            triggerProactiveRequests();
                        }
                    }
                }, 1000);
            });
        }
        if (event_types.MESSAGE_DELETED) {
            eventSource.on(event_types.MESSAGE_DELETED, () => { console.log("[Nexus] 检测到消息删除，重算状态"); recalculateStateFromChat(); });
        }
        if (event_types.MESSAGE_EDITED) {
            eventSource.on(event_types.MESSAGE_EDITED, () => { console.log("[Nexus] 检测到消息编辑，重算状态"); recalculateStateFromChat(); });
        }
        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => { console.log("[Nexus] 检测到聊天切换，重算状态"); setTimeout(recalculateStateFromChat, 500); });
        }
        if (event_types.MESSAGE_SWIPED) {
            eventSource.on(event_types.MESSAGE_SWIPED, () => { console.log("[Nexus] 检测到消息滑动切换，重算状态"); recalculateStateFromChat(); });
        }
    } catch (e) { console.warn("[Nexus] 注册状态管理事件时出错:", e); }

    console.log("[Infinite Nexus] V4.0 Loaded - Teammate System Active");
});
