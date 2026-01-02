import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";

// V3.7 - Infinite Nexus (Dynamic Path Fix)
const extensionName = "infinite_nexus";
// Dynamically determine path based on where this script is loaded from
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
        { name: "止血散", cost: 100, effect: "[HP +30]", desc: "快速止血，恢复30点生命值" },
        { name: "清心丹", cost: 100, effect: "[SAN +20]", desc: "平复精神，恢复20点理智" },
        { name: "护心镜", cost: 300, effect: "[ITEM +护心镜]", desc: "物理防御力提升" },
        { name: "无限弹药沙鹰", cost: 1500, effect: "[SKILL: 枪械 70] [ITEM +沙鹰(无限)]", desc: "无限流经典神器" },
        { name: "洗髓丹", cost: 2000, effect: "[HP +50] [SKILL: 怪力 60] [SAN -10]", desc: "肉体强化，副作用较小" },
        { name: "免死金牌", cost: 5000, effect: "[MISSION: 任务完成]", desc: "直接跳过当前副本" }
    ],
    isMinimized: false
};

// Base state for reset/recalculation
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

// Persistent settings (teammates, comms history)
function initSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {
            teammates: [],           // [{ id, name, source, signature }]
            commsHistory: {},        // { teammateId: [{ role, content }] }
            pendingRequests: [],     // [{ name, reason, time }] 待确认的好友申请
            currentTeammate: null,   // 当前选中的队友 ID
            aiConfig: {              // 独立 AI 配置
                endpoint: '',        // API 端点 (如 https://api.openai.com/v1)
                apiKey: '',          // API Key
                model: 'gpt-3.5-turbo' // 模型名称
            }
        };
    }
    // Upgrade existing settings if missing new fields
    if (!extension_settings[extensionName].pendingRequests) {
        extension_settings[extensionName].pendingRequests = [];
    }
    if (!extension_settings[extensionName].currentTeammate) {
        extension_settings[extensionName].currentTeammate = null;
    }
    if (!extension_settings[extensionName].aiConfig) {
        extension_settings[extensionName].aiConfig = {
            endpoint: '',
            apiKey: '',
            model: 'gpt-3.5-turbo'
        };
    }
    return extension_settings[extensionName];
}
let settings = null; // Will be initialized in jQuery.ready

const SIGNATURE_POOL = [
    "正在擦拭武器...",
    "观察着周围的环境...",
    "闭目养神中...",
    "正在包扎伤口...",
    "低声祈祷...",
    "检查弹药存量...",
    "正在阅读任务简报...",
    "注视着远方...",
    "正在磨刀...",
    "似乎在思考什么...",
    "警惕地环顾四周...",
    "正在整理背包...",
    "靠在墙边休息...",
    "正在哼着小曲...",
    "面无表情地发呆...",
    "正在记录什么...",
    "眼神空洞...",
    "正在吃压缩饼干...",
    "把玩着手中的硬币...",
    "正在调试通讯器..."
];

function getRandomSignature() {
    return SIGNATURE_POOL[Math.floor(Math.random() * SIGNATURE_POOL.length)];
}

function createOverlay() {
    if (document.getElementById('infinite-nexus-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'infinite-nexus-overlay';

    // HTML Structure
    overlay.innerHTML = `
        <!-- Comms Button (Paper Crane) -->
        <div class="nexus-comms-btn" id="nexus-comms-open" title="队友传音"></div>

        <div class="nexus-header" id="nexus-header-bar">
            <span>无限终端</span>
            <div style="display:flex; gap:10px; align-items:center;">
                <span id="nexus-clock" style="font-weight:normal; font-size:0.8em;">${nexusState.time}</span>
                <!-- No text button anymore, visual feedback via CSS is enough -->
            </div>
        </div>
        
        <div class="nexus-mission-box" id="nexus-mission">
            【任务】${nexusState.mission}
        </div>

        <div class="nexus-content">
            <!-- HP -->
            <div class="nexus-stat-row">
                <div class="nexus-label">
                    <span>生命值 (HP)</span>
                    <span id="nexus-hp-val">100/100</span>
                </div>
                <div class="nexus-bar-container">
                    <div id="nexus-hp-bar" class="nexus-bar-fill nexus-hp-fill" style="width: 100%"></div>
                </div>
            </div>

            <!-- SAN -->
            <div class="nexus-stat-row">
                <div class="nexus-label">
                    <span>理智值 (SAN)</span>
                    <span id="nexus-san-val">100/100</span>
                </div>
                <div class="nexus-bar-container">
                    <div id="nexus-san-bar" class="nexus-bar-fill nexus-san-fill" style="width: 100%"></div>
                </div>
            </div>

            <!-- Skills -->
            <div class="nexus-section-title">
                <span>技能列表</span>
                <span class="nexus-add-btn" id="nexus-add-skill-btn" title="添加技能">[+]</span>
            </div>
            <div class="nexus-skill-grid" id="nexus-skill-list"></div>
            
            <!-- Inventory -->
            <div class="nexus-section-title">
                <span>空间戒指</span>
            </div>
            <div id="nexus-inventory-list" class="nexus-inventory-grid">
                <div style="color:#888; font-size:0.8em;">(空-等待拾取)</div>
            </div>

            <!-- Dice -->
            <button id="nexus-universal-dice" class="nexus-dice-btn" style="margin-top:15px; width:100%; padding:8px; border:1px solid #ccc; background:#fff; cursor:pointer;">
                🎲 投掷 D100
            </button>
        </div>

        <!-- Shop -->
        <div class="nexus-shop-btn" id="nexus-shop-open">
            主神兑换 (点数: <span id="nexus-karma-val">0</span>)
        </div>
    `;

    document.body.appendChild(overlay);

    // Shop Modal
    const shopModal = document.createElement('div');
    shopModal.id = 'nexus-shop-modal';
    shopModal.innerHTML = `
        <h3 style="border-bottom:2px solid #ccc; margin-bottom:15px; padding-bottom:10px; display:flex; justify-content:space-between;">
            <span>主神强化列表</span>
            <span style="cursor:pointer;" id="nexus-shop-close-x">✕</span>
        </h3>
        <div id="nexus-shop-list" style="max-height: 300px; overflow-y: auto;"></div>
    `;
    document.body.appendChild(shopModal);

    // Comms Modal (重构: 添加好友列表)
    const commsModal = document.createElement('div');
    commsModal.id = 'nexus-comms-modal';
    commsModal.innerHTML = `
        <div class="nexus-comms-header">
            <span>纸鹤传音</span>
            <div style="display:flex; gap:10px; align-items:center;">
                <span id="nexus-request-badge" class="nexus-request-badge" style="display:none;" title="好友申请">🔔</span>
                <span id="nexus-api-config-btn" class="nexus-config-btn" title="API设置">⚙️</span>
                <span style="cursor:pointer;" id="nexus-comms-close">✕</span>
            </div>
        </div>
        
        <div class="nexus-friend-section">
            <div class="nexus-friend-header" id="nexus-friend-toggle">
                <span>▼ 好友列表</span>
                <span id="nexus-friend-count">(0)</span>
                <span id="nexus-add-friend" class="nexus-add-btn" title="手动添加好友">[+]</span>
            </div>
            <div id="nexus-friend-list" class="nexus-friend-list"></div>
        </div>
        
        <div id="nexus-current-chat-label" class="nexus-current-chat-label" style="display:none;">
            与 <span id="nexus-chat-target"></span> 的传音
        </div>
        
        <div id="nexus-comms-log" class="nexus-comms-log">
            <div class="nexus-comms-placeholder">选择好友开始传音...</div>
        </div>
        <input type="text" id="nexus-comms-input" class="nexus-comms-input" placeholder="选择好友后发送传音..." disabled>
    `;
    document.body.appendChild(commsModal);

    // Friend Request Modal
    const requestModal = document.createElement('div');
    requestModal.id = 'nexus-request-modal';
    requestModal.innerHTML = `
        <h3 style="border-bottom:1px dashed #ccc; margin-bottom:10px; padding-bottom:5px;">
            好友申请
            <span style="float:right; cursor:pointer;" id="nexus-request-close">✕</span>
        </h3>
        <div id="nexus-request-list"></div>
    `;
    document.body.appendChild(requestModal);

    // AI Config Modal
    const configModal = document.createElement('div');
    configModal.id = 'nexus-config-modal';
    configModal.innerHTML = `
        <h3 style="border-bottom:1px dashed #ccc; margin-bottom:10px; padding-bottom:5px;">
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
            <label>Model Name</label>
            <input type="text" id="nexus-api-model" placeholder="gpt-3.5-turbo">
        </div>
        <div style="text-align:right; margin-top:10px;">
            <button id="nexus-config-save" class="nexus-btn-primary">保存设置</button>
        </div>
        <div style="margin-top:10px; font-size:0.8em; color:#666;">
            * 此 API 用于队友独立思考和回复，不通过 SillyTavern 主系统。
        </div>
    `;
    document.body.appendChild(configModal);

    // Profile Modal (角色档案)
    const profileModal = document.createElement('div');
    profileModal.id = 'nexus-profile-modal';
    profileModal.innerHTML = `
        <h3 class="nexus-profile-header">
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
            <div class="nexus-profile-info" id="nexus-profile-source"></div>
            <div style="display:flex; gap:10px; margin-top:15px;">
                <button id="nexus-profile-save" class="nexus-btn-primary" style="flex:1;">保存</button>
                <button id="nexus-profile-refresh" class="nexus-btn-secondary" style="flex:1;">重新提取</button>
            </div>
        </div>
    `;
    document.body.appendChild(profileModal);

    // Bindings
    document.getElementById('nexus-add-skill-btn').addEventListener('click', manualAddSkill);
    document.getElementById('nexus-universal-dice').addEventListener('click', () => performSkillCheck("运气", 50, true));
    document.getElementById('nexus-shop-open').addEventListener('click', () => { renderShopItems(); shopModal.style.display = 'block'; });
    document.getElementById('nexus-shop-close-x').addEventListener('click', () => { shopModal.style.display = 'none'; });

    // Comms modal bindings
    document.getElementById('nexus-comms-open').addEventListener('click', () => {
        commsModal.style.display = 'block';
        renderFriendList();
        updateRequestBadge();
        if (settings.currentTeammate) {
            renderCommsLog(settings.currentTeammate);
        }
    });
    document.getElementById('nexus-comms-close').addEventListener('click', () => { commsModal.style.display = 'none'; });
    document.getElementById('nexus-comms-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCommsMessage();
    });

    // Friend list bindings
    document.getElementById('nexus-friend-toggle').addEventListener('click', (e) => {
        if (e.target.id === 'nexus-add-friend') return; // Don't toggle when clicking [+]
        document.getElementById('nexus-friend-list').classList.toggle('collapsed');
    });
    document.getElementById('nexus-add-friend').addEventListener('click', addTeammateManual);

    // Request modal bindings
    document.getElementById('nexus-request-badge').addEventListener('click', () => {
        requestModal.style.display = 'block';
        renderRequestList();
    });
    document.getElementById('nexus-request-close').addEventListener('click', () => { requestModal.style.display = 'none'; });

    // Config modal bindings
    document.getElementById('nexus-api-config-btn').addEventListener('click', () => {
        configModal.style.display = 'block';
        // Load current settings
        if (settings && settings.aiConfig) {
            document.getElementById('nexus-api-endpoint').value = settings.aiConfig.endpoint || '';
            document.getElementById('nexus-api-key').value = settings.aiConfig.apiKey || '';
            document.getElementById('nexus-api-model').value = settings.aiConfig.model || '';
        }
    });
    document.getElementById('nexus-config-close').addEventListener('click', () => { configModal.style.display = 'none'; });
    document.getElementById('nexus-config-save').addEventListener('click', () => {
        if (!settings) return;
        settings.aiConfig = {
            endpoint: document.getElementById('nexus-api-endpoint').value.trim(),
            apiKey: document.getElementById('nexus-api-key').value.trim(),
            model: document.getElementById('nexus-api-model').value.trim()
        };
        saveSettingsDebounced();
        toastr.success("API 设置已保存", "Infinite Nexus");
        configModal.style.display = 'none';
    });

    // Profile modal bindings
    document.getElementById('nexus-profile-close').addEventListener('click', () => {
        profileModal.style.display = 'none';
    });
    document.getElementById('nexus-profile-save').addEventListener('click', () => {
        saveCurrentProfile();
        profileModal.style.display = 'none';
    });
    document.getElementById('nexus-profile-refresh').addEventListener('click', async () => {
        const name = document.getElementById('nexus-profile-name').value;
        const teammate = settings.teammates.find(t => t.name === name);
        if (teammate) {
            toastr.info("正在重新提取档案...", "Infinite Nexus");
            await extractTeammateProfile(teammate);
            openProfileModal(teammate.id);
        }
    });

    // Make Draggable + Smart Toggle on Header
    makeDraggable(overlay, document.getElementById('nexus-header-bar'));

    renderSkills();
    renderInventory();

    // Initialize settings reference and load World Info teammates
    settings = initSettings();
    loadTeammatesFromWorldInfo();

    // Auto minimize on mobile start
    if (window.innerWidth < 600) toggleMinimize();
}

// --- Draggable Logic with Smart Click ---
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;

    handle.onmousedown = dragMouseDown;
    handle.ontouchstart = dragTouchStart;

    // seal mode logic (bind to element itself when minimized on mobile)
    element.addEventListener('mousedown', (e) => {
        if (nexusState.isMinimized && window.innerWidth < 600) dragMouseDown(e);
    });
    element.addEventListener('touchstart', (e) => {
        if (nexusState.isMinimized && window.innerWidth < 600) dragTouchStart(e);
    }, { passive: false });

    function dragMouseDown(e) {
        // e.preventDefault(); // Don't prevent defaults too early, implies focus loss
        isDragging = false; // Reset
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        element.style.right = "auto";
    }

    function dragTouchStart(e) {
        const touch = e.touches[0];
        isDragging = false;
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementTouchDrag;
        element.style.right = "auto";
    }

    function elementDrag(e) {
        e.preventDefault();
        isDragging = true; // Moved!
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function elementTouchDrag(e) {
        // e.preventDefault(); 
        isDragging = true;
        const touch = e.touches[0];
        pos1 = pos3 - touch.clientX;
        pos2 = pos4 - touch.clientY;
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;

        // If we didn't drag, treat it as a click -> Toggle Minimize
        if (!isDragging) {
            toggleMinimize();
        }
    }
}

function toggleMinimize() {
    nexusState.isMinimized = !nexusState.isMinimized;
    const overlay = document.getElementById('infinite-nexus-overlay');

    if (nexusState.isMinimized) {
        overlay.classList.add('minimized');
    } else {
        overlay.classList.remove('minimized');
    }
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

    // 显示用户消息
    const log = document.getElementById('nexus-comms-log');
    const userEntry = document.createElement('div');
    userEntry.style.marginBottom = "5px";
    userEntry.innerHTML = `<span class="nexus-msg-user">你:</span> ${msg}`;
    log.appendChild(userEntry);
    log.scrollTop = log.scrollHeight;

    // 保存用户消息到历史
    if (!settings.commsHistory[teammateId]) {
        settings.commsHistory[teammateId] = [];
    }
    settings.commsHistory[teammateId].push({ role: "user", content: msg });
    saveSettingsDebounced();

    input.value = "";
    input.disabled = true;
    input.placeholder = "正在等待回复...";

    // 调用独立 AI 获取队友回复
    sendToTeammate(teammateId, msg).then(response => {
        input.disabled = false;
        input.placeholder = `给 ${teammate.name} 发送传音...`;

        if (response) {
            // 显示队友回复
            const replyEntry = document.createElement('div');
            replyEntry.style.marginBottom = "5px";
            replyEntry.innerHTML = `<span style="color:var(--nexus-accent-red); font-weight:bold;">${teammate.name}:</span> ${response}`;
            log.appendChild(replyEntry);
            log.scrollTop = log.scrollHeight;

            // 保存队友回复到历史
            settings.commsHistory[teammateId].push({ role: "assistant", content: response });
            saveSettingsDebounced();
        }
    }).catch(err => {
        input.disabled = false;
        input.placeholder = `给 ${teammate.name} 发送传音...`;
        console.error("[Nexus] AI 通讯错误:", err);
        toastr.error("传音失败，请重试");
    });
}

// 独立 AI 调用 - 核心函数
async function callIndependentAI(systemPrompt, userMessage, history = []) {
    if (!settings.aiConfig || !settings.aiConfig.endpoint || !settings.aiConfig.apiKey) {
        throw new Error("API 未配置");
    }

    const { endpoint, apiKey, model } = settings.aiConfig;
    // Normalize endpoint url
    let url = endpoint;
    if (!url.endsWith('/')) url += '/';
    // If user just provided base url like https://api.openai.com/v1, append chat/completions
    // If they provided full path, leave it. Simple heuristic: check if ends in chat/completions
    if (!url.includes('/chat/completions')) {
        url += 'chat/completions';
    }

    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage }
    ];

    console.log("[Nexus] Calling Independent AI:", url, messages);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model || 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 200, // Short replies
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error("No choices returned from AI");
    }
    return data.choices[0].message.content.trim();
}

// 发送消息给队友 (使用独立 API)
async function sendToTeammate(teammateId, message) {
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return null;

    if (!settings.aiConfig || !settings.aiConfig.endpoint) {
        toastr.warning("请先点击传音面板的 ⚙️ 按钮配置独立 API", "Infinite Nexus");
        return "[系统提示: 未配置 API，无法连接队友]";
    }

    try {
        // 构建 System Prompt - 使用角色档案信息
        const traitsDesc = teammate.traits && teammate.traits.length > 0
            ? teammate.traits.join('、')
            : '忠诚、可靠';
        const backstoryDesc = teammate.backstory
            ? `背景: ${teammate.backstory}`
            : '';

        const systemPrompt = `你现在扮演 Infinite Nexus 系统中的队友 "${teammate.name}"。
性格特征: ${traitsDesc}
${backstoryDesc}
你们正在一个危险的无限流副本中。
请以 "${teammate.name}" 的身份回复玩家的消息。
回复要简短有力（50字以内），符合口语习惯和你的性格特征。不要写动作描述，只写对话内容。`;

        // 获取最近的历史记录 (最后 6 条)
        const history = (settings.commsHistory[teammateId] || [])
            .slice(-6)
            .map(entry => ({ role: entry.role, content: entry.content }));

        const reply = await callIndependentAI(systemPrompt, message, history);

        // 随机更新签名 (30% 概率)
        if (Math.random() < 0.3) {
            teammate.signature = getRandomSignature();
            saveSettingsDebounced();
            renderFriendList();
        }

        return reply;

    } catch (error) {
        console.error("[Nexus] sendToTeammate error:", error);
        toastr.error(`API 调用失败: ${error.message}`, "Infinite Nexus");
        return `[信号中断: ${error.message}]`;
    }
}

// ============ 角色档案提取 ============
async function extractTeammateProfile(teammate) {
    if (!teammate) return;

    console.log(`[Nexus] 开始提取 ${teammate.name} 的角色档案...`);

    // 1. 先尝试从 WorldInfo 读取
    const worldInfoProfile = getProfileFromWorldInfo(teammate.name);
    if (worldInfoProfile) {
        teammate.worldInfoKey = worldInfoProfile.key;
        if (worldInfoProfile.content) {
            // 用 AI 从 WorldInfo 内容中提取结构化信息
            await extractFromText(teammate, worldInfoProfile.content, "worldinfo");
            return;
        }
    }

    // 2. 从聊天记录提取
    try {
        const context = getContext();
        if (context && context.chat && context.chat.length > 0) {
            // 获取最近 20 条消息，拼接成文本
            const recentChat = context.chat.slice(-20)
                .map(m => m.mes || "")
                .filter(m => m.includes(teammate.name))
                .join("\n");

            if (recentChat.length > 50) {
                await extractFromText(teammate, recentChat, "chat");
            }
        }
    } catch (error) {
        console.error("[Nexus] 聊天记录提取失败:", error);
    }
}

// 从 WorldInfo 获取角色信息
function getProfileFromWorldInfo(name) {
    try {
        const context = getContext();
        if (!context || !context.worldInfo) {
            // 尝试其他方式获取 worldInfo
            if (typeof SillyTavern !== 'undefined') {
                const stContext = SillyTavern.getContext();
                if (stContext && stContext.worldInfo) {
                    return findWorldInfoEntry(stContext.worldInfo, name);
                }
            }
            return null;
        }
        return findWorldInfoEntry(context.worldInfo, name);
    } catch (error) {
        console.error("[Nexus] WorldInfo 读取失败:", error);
        return null;
    }
}

function findWorldInfoEntry(worldInfo, name) {
    if (!worldInfo || !Array.isArray(worldInfo)) return null;

    // 查找匹配名字的条目
    const entry = worldInfo.find(w =>
        w.key && (
            w.key.toLowerCase().includes(name.toLowerCase()) ||
            (w.keysecondary && w.keysecondary.toLowerCase().includes(name.toLowerCase()))
        )
    );

    if (entry) {
        return {
            key: entry.key,
            content: entry.content
        };
    }
    return null;
}

// 用 AI 从文本中提取角色信息
async function extractFromText(teammate, text, source) {
    if (!settings.aiConfig || !settings.aiConfig.endpoint) {
        console.log("[Nexus] 未配置 API，跳过档案提取");
        return;
    }

    const systemPrompt = `你是一个角色信息提取助手。请从以下文本中提取角色「${teammate.name}」的信息。

返回JSON格式（不要其他内容）：
{
  "traits": ["性格词1", "性格词2", "性格词3"],
  "backstory": "50字内的简短经历描述"
}

如果信息不足，traits 可以少于3个，backstory 可以写"暂无详细记录"。`;

    try {
        const response = await callIndependentAI(systemPrompt, text.substring(0, 2000), []);

        // 解析 JSON
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.traits && Array.isArray(parsed.traits)) {
                teammate.traits = parsed.traits.slice(0, 5);
            }
            if (parsed.backstory) {
                teammate.backstory = parsed.backstory.substring(0, 100);
            }
            saveSettingsDebounced();
            console.log(`[Nexus] ${teammate.name} 档案已提取 (来源: ${source}):`, teammate.traits, teammate.backstory);
            toastr.success(`已自动生成 ${teammate.name} 的角色档案`, "Infinite Nexus");
        }
    } catch (error) {
        console.error("[Nexus] 档案提取失败:", error);
    }
}

function renderSkills() {
    const list = document.getElementById('nexus-skill-list');
    if (!list) return;
    list.innerHTML = "";
    nexusState.skills.forEach(skill => {
        const btn = document.createElement('div');
        btn.className = 'nexus-skill-btn';
        btn.innerHTML = `<span>${skill.name}</span> <span class="nexus-skill-val">${skill.value}</span>`;
        btn.onclick = () => performSkillCheck(skill.name, skill.value);
        list.appendChild(btn);
    });
}

function renderInventory() {
    const list = document.getElementById('nexus-inventory-list');
    if (!list) return;
    list.innerHTML = "";
    if (nexusState.inventory.length === 0) {
        list.innerHTML = `<div style="color:#888; font-size:0.8em; padding:5px;">(空)</div>`;
        return;
    }
    nexusState.inventory.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = "border:1px solid #ccc; background:#fff; padding:2px 6px; margin-bottom:4px; font-size:0.85em; display:inline-block; margin-right:5px;";
        div.innerText = item;
        list.appendChild(div);
    });
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

function manualAddSkill() {
    const name = prompt("输入技能名称", "");
    if (!name) return;
    const val = prompt(`输入数值 (0-100)`, "50");
    if (!val) return;
    addOrUpdateSkill(name, parseInt(val));
}

function addOrUpdateSkill(name, val) {
    const existing = nexusState.skills.find(s => s.name === name);
    if (existing) { existing.value = val; }
    else { nexusState.skills.push({ name: name, value: val }); }
    renderSkills();
}

function addItem(itemName) {
    if (!nexusState.inventory.includes(itemName)) {
        nexusState.inventory.push(itemName);
        renderInventory();
    }
}

// ============ 好友系统函数 ============

// 添加待处理的好友申请
function addPendingRequest(name, reason) {
    if (!settings) return;
    // 检查是否已经是好友或已有待处理申请
    if (settings.teammates.some(t => t.name === name)) {
        console.log(`[Nexus] ${name} 已经是好友`);
        return;
    }
    if (settings.pendingRequests.some(r => r.name === name)) {
        console.log(`[Nexus] ${name} 已有待处理申请`);
        return;
    }

    settings.pendingRequests.push({
        name: name,
        reason: reason,
        time: new Date().toISOString()
    });
    saveSettingsDebounced();
    updateRequestBadge();
    toastr.info(`${name} 想要添加你为好友！`, "新的好友申请");
}

// 添加队友
async function addTeammate(name, source = "manual") {
    if (!settings) return;
    if (settings.teammates.some(t => t.name === name)) return;

    const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    const newTeammate = {
        id: id,
        name: name,
        source: source,
        signature: getRandomSignature(),
        // 档案字段
        traits: [],           // 性格标签
        backstory: "",        // 经历描述
        notes: "",            // 用户备注
        worldInfoKey: null    // 关联的 WorldInfo 条目
    };

    settings.teammates.push(newTeammate);
    settings.commsHistory[id] = [];
    saveSettingsDebounced();
    renderFriendList();
    console.log(`[Nexus] 添加队友: ${name} (${source})`);

    // 异步提取角色档案
    extractTeammateProfile(newTeammate);
}

// 更新好友申请徽章
function updateRequestBadge() {
    const badge = document.getElementById('nexus-request-badge');
    if (!badge || !settings) return;

    if (settings.pendingRequests.length > 0) {
        badge.style.display = 'inline';
        badge.title = `${settings.pendingRequests.length} 个好友申请`;
    } else {
        badge.style.display = 'none';
    }
}

// 渲染好友申请列表
function renderRequestList() {
    const list = document.getElementById('nexus-request-list');
    if (!list || !settings) return;
    list.innerHTML = "";

    if (settings.pendingRequests.length === 0) {
        list.innerHTML = `<div style="color:#888; padding:10px;">暂无申请</div>`;
        return;
    }

    settings.pendingRequests.forEach((req, idx) => {
        const row = document.createElement('div');
        row.className = 'nexus-request-item';
        row.innerHTML = `
            <div style="flex-grow:1;">
                <strong>${req.name}</strong>
                <div style="font-size:0.8em; color:#666;">${req.reason}</div>
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="infiniteNexus.acceptRequest(${idx})" style="background:#4a4; color:#fff; border:none; padding:4px 8px; cursor:pointer;">✓</button>
                <button onclick="infiniteNexus.rejectRequest(${idx})" style="background:#a44; color:#fff; border:none; padding:4px 8px; cursor:pointer;">✕</button>
            </div>
        `;
        list.appendChild(row);
    });
}

// 渲染好友列表
function renderFriendList() {
    const list = document.getElementById('nexus-friend-list');
    const count = document.getElementById('nexus-friend-count');
    if (!list || !settings) return;

    list.innerHTML = "";
    if (count) count.innerText = `(${settings.teammates.length})`;

    if (settings.teammates.length === 0) {
        list.innerHTML = `<div style="color:#888; padding:10px; font-size:0.9em;">暂无好友 (点击 [+]手动添加)</div>`;
        return;
    }

    settings.teammates.forEach(tm => {
        const row = document.createElement('div');
        row.className = 'nexus-friend-item';
        if (settings.currentTeammate === tm.id) {
            row.classList.add('active');
        }

        // 确保有签名
        if (!tm.signature) {
            tm.signature = getRandomSignature();
        }

        row.innerHTML = `
            <div class="nexus-friend-info" onclick="selectTeammate('${tm.id}')">
                <div class="nexus-friend-name">${tm.name}</div>
                <div class="nexus-friend-status">
                    <span class="nexus-status-dot"></span>
                    <span class="nexus-status-text">${tm.signature}</span>
                </div>
            </div>
            <div class="nexus-friend-actions">
                <span class="nexus-profile-btn" title="角色档案" onclick="infiniteNexus.openProfile('${tm.id}')">📋</span>
                <span class="nexus-delete-btn" title="删除好友" onclick="infiniteNexus.deleteTeammate('${tm.id}')">×</span>
            </div>
        `;
        list.appendChild(row);
    });

    // Auto-save any new signatures
    saveSettingsDebounced();
}

// 删除好友
function deleteTeammate(id) {
    if (!settings) return;
    if (!confirm("确定要删除这个好友吗？通讯记录也会被删除。")) return;

    settings.teammates = settings.teammates.filter(t => t.id !== id);
    delete settings.commsHistory[id];

    if (settings.currentTeammate === id) {
        settings.currentTeammate = null;
        document.getElementById('nexus-current-chat-label').style.display = 'none';
        document.getElementById('nexus-comms-log').innerHTML = '<div class="nexus-comms-placeholder">选择好友开始传音...</div>';
        document.getElementById('nexus-comms-input').disabled = true;
    }

    saveSettingsDebounced();
    renderFriendList();
    toastr.info("已删除好友", "Infinite Nexus");
}

// 打开角色档案弹窗
function openProfileModal(teammateId) {
    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (!teammate) return;

    document.getElementById('nexus-profile-name').value = teammate.name;
    document.getElementById('nexus-profile-traits').value = (teammate.traits || []).join(', ');
    document.getElementById('nexus-profile-backstory').value = teammate.backstory || '';
    document.getElementById('nexus-profile-notes').value = teammate.notes || '';

    // 显示来源信息
    let sourceInfo = `来源: ${teammate.source === 'request' ? '好友申请' : teammate.source === 'worldinfo' ? '世界信息' : '手动添加'}`;
    if (teammate.worldInfoKey) {
        sourceInfo += ` | WorldInfo: ${teammate.worldInfoKey}`;
    }
    document.getElementById('nexus-profile-source').innerText = sourceInfo;

    document.getElementById('nexus-profile-modal').style.display = 'block';
}

// 保存当前档案
function saveCurrentProfile() {
    const name = document.getElementById('nexus-profile-name').value;
    const teammate = settings.teammates.find(t => t.name === name);
    if (!teammate) return;

    const traitsText = document.getElementById('nexus-profile-traits').value;
    teammate.traits = traitsText.split(/[,，]/).map(s => s.trim()).filter(s => s);
    teammate.backstory = document.getElementById('nexus-profile-backstory').value.trim();
    teammate.notes = document.getElementById('nexus-profile-notes').value.trim();

    saveSettingsDebounced();
    toastr.success(`${teammate.name} 的档案已保存`, "Infinite Nexus");
}

// 选择队友进行聊天
function selectTeammate(teammateId) {
    if (!settings) return;
    settings.currentTeammate = teammateId;
    saveSettingsDebounced();

    const teammate = settings.teammates.find(t => t.id === teammateId);
    if (teammate) {
        document.getElementById('nexus-chat-target').innerText = teammate.name;
        document.getElementById('nexus-current-chat-label').style.display = 'block';
        document.getElementById('nexus-comms-input').disabled = false;
        document.getElementById('nexus-comms-input').placeholder = `给 ${teammate.name} 发送传音...`;
    }

    renderFriendList();
    renderCommsLog(teammateId);
}

// 渲染聊天记录
function renderCommsLog(teammateId) {
    const log = document.getElementById('nexus-comms-log');
    if (!log || !settings) return;

    const history = settings.commsHistory[teammateId] || [];
    const teammate = settings.teammates.find(t => t.id === teammateId);

    if (history.length === 0) {
        log.innerHTML = `<div class="nexus-comms-placeholder">与 ${teammate?.name || '队友'} 开始传音...</div>`;
        return;
    }

    log.innerHTML = "";
    history.forEach(msg => {
        const entry = document.createElement('div');
        entry.style.marginBottom = "5px";
        if (msg.role === 'user') {
            entry.innerHTML = `<span class="nexus-msg-user">你:</span> ${msg.content}`;
        } else {
            entry.innerHTML = `<span style="color:var(--nexus-accent-red); font-weight:bold;">${teammate?.name || '队友'}:</span> ${msg.content}`;
        }
        log.appendChild(entry);
    });
    log.scrollTop = log.scrollHeight;
}

// 从 World Info 加载队友 (placeholder)
function loadTeammatesFromWorldInfo() {
    // TODO: 实现从 World Info 加载预设队友
    console.log("[Nexus] loadTeammatesFromWorldInfo called - placeholder");
}

// 手动添加好友
function addTeammateManual() {
    const name = prompt("输入队友名称", "");
    if (!name || !name.trim()) return;
    addTeammate(name.trim(), "manual");
    toastr.success(`已添加好友: ${name.trim()}`);
}

async function performSkillCheck(name, targetVal, isGeneral = false) {
    const result = Math.floor(Math.random() * 100) + 1;
    let isSuccess = result <= targetVal;

    const outcome = isSuccess ? "成功" : "失败";
    const crit = (result <= 5) ? " (大成功!)" : (result >= 96 ? " (大失败!)" : "");

    let msg = "";
    if (isGeneral) msg = `\n[系统判定] 玩家进行<运气/通用>检定: D100=${result}`;
    else msg = `\n[系统判定] 玩家进行<${name}>检定: 目标${targetVal}, 掷出D100=${result} -> 【${outcome}${crit}】`;

    const textarea = document.querySelector('#send_textarea');
    if (textarea) {
        const prefix = textarea.value ? "\n" : "";
        textarea.value += prefix + msg;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    } else { alert(msg); }
}

function updateUI() {
    const hpBar = document.getElementById('nexus-hp-bar');
    const sanBar = document.getElementById('nexus-san-bar');
    if (hpBar) {
        const hpP = (nexusState.hp / nexusState.maxHp) * 100;
        hpBar.style.width = Math.max(0, hpP) + "%";
        document.getElementById('nexus-hp-val').innerText = `${nexusState.hp}/${nexusState.maxHp}`;
    }
    if (sanBar) {
        const sanP = (nexusState.san / nexusState.maxSan) * 100;
        sanBar.style.width = Math.max(0, sanP) + "%";
        document.getElementById('nexus-san-val').innerText = `${nexusState.san}/${nexusState.maxSan}`;
    }
    document.getElementById('nexus-karma-val').innerText = nexusState.karma;
    document.getElementById('nexus-clock').innerText = nexusState.time;
    document.getElementById('nexus-mission').innerText = `【任务】 ${nexusState.mission}`;

    const overlay = document.getElementById('infinite-nexus-overlay');
    if (nexusState.hp < 30) overlay.classList.add('glitch-effect');
    else overlay.classList.remove('glitch-effect');
}

// ============ 状态管理重构 ============

// 从聊天历史全量重算状态
function recalculateStateFromChat() {
    console.log("[Nexus] 开始重算状态...");

    // 1. 重置到初始状态（保留 shopItems 和 isMinimized）
    const shopItems = nexusState.shopItems;
    const isMinimized = nexusState.isMinimized;

    nexusState = {
        hp: BASE_STATE.hp,
        maxHp: BASE_STATE.maxHp,
        san: BASE_STATE.san,
        maxSan: BASE_STATE.maxSan,
        karma: BASE_STATE.karma,
        time: BASE_STATE.time,
        mission: BASE_STATE.mission,
        skills: JSON.parse(JSON.stringify(BASE_STATE.skills)), // 深拷贝
        inventory: [],
        shopItems: shopItems,
        isMinimized: isMinimized
    };

    // 2. 从 getContext().chat 获取所有消息
    try {
        const context = getContext();
        if (!context || !context.chat || context.chat.length === 0) {
            console.log("[Nexus] 无聊天历史，使用初始状态");
            updateUI();
            return;
        }

        // 3. 按顺序解析所有消息的系统标签
        context.chat.forEach((msg, idx) => {
            if (msg.mes) {
                parseSystemTagsForRecalc(msg.mes);
            }
        });

        console.log(`[Nexus] 状态重算完成: HP=${nexusState.hp}, SAN=${nexusState.san}, Karma=${nexusState.karma}`);
    } catch (error) {
        console.error("[Nexus] 状态重算错误:", error);
    }

    updateUI();
    renderSkills();
    renderInventory();
}

// 用于重算的标签解析（不触发 toastr 通知）
function parseSystemTagsForRecalc(text) {
    if (!text) return;
    const blockRegex = /[\[【](.*?)[\】\]]/g;
    let match;

    while ((match = blockRegex.exec(text)) !== null) {
        const content = match[1];

        if (/(HP|生命|Life|Integrity)/i.test(content)) {
            const numRegex = /([+\-－]?)\s*(\d+)/;
            const parts = content.split(/(HP|生命|Life|Integrity)/i);
            if (parts.length > 2) {
                const numMatch = numRegex.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.hp -= val;
                    else if (sign === '+') nexusState.hp += val;
                    else nexusState.hp = val;
                }
            }
        }

        if (/(SAN|理智|Rationality)/i.test(content)) {
            const parts = content.split(/(SAN|理智|Rationality)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.san -= val;
                    else if (sign === '+') nexusState.san += val;
                    else nexusState.san = val;
                }
            }
        }

        if (/(Karma|点数|奖励)/i.test(content) && !/(消费|花费|购买|兑换)/i.test(content)) {
            const parts = content.split(/(Karma|点数|奖励)/i);
            if (parts.length > 2) {
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.karma -= val;
                    else nexusState.karma += val;
                }
            }
        }

        if (/(MISSION|任务|目标)/i.test(content)) {
            let clean = content.replace(/(MISSION|任务|目标)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) {
                nexusState.mission = clean;
            }
        }

        if (/(SKILL|技能|获得)/i.test(content) && /\d+/.test(content)) {
            const skillMatch = /([\u4e00-\u9fa5\w]+)\s*[:：]?\s*(\d+)/.exec(content.replace(/(SKILL|技能|获得)/ig, ""));
            if (skillMatch) {
                const skillName = skillMatch[1];
                const skillVal = parseInt(skillMatch[2]);
                const existing = nexusState.skills.find(s => s.name === skillName);
                if (existing) { existing.value = skillVal; }
                else { nexusState.skills.push({ name: skillName, value: skillVal }); }
            }
        }

        if (/(TIME|时间|日期|天数)/i.test(content)) {
            let clean = content.replace(/(TIME|时间|日期|天数)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) {
                nexusState.time = clean;
            }
        }

        if (/(ITEM|物品|道具)/i.test(content)) {
            let clean = content.replace(/(ITEM|物品|道具)/ig, "").trim();
            clean = clean.replace(/^[+\-:：\s]+/, "");
            clean = clean.replace(/^(获得|发现|关键线索|提示)/, "").trim();
            if (clean.length > 12) continue;
            if (/^(注意|警告|系统|数据)/.test(clean)) continue;
            if (clean && !nexusState.inventory.includes(clean)) {
                nexusState.inventory.push(clean);
            }
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
                textarea.value += prefix + `[系统: 玩家花费${cost}点兑换了 <${itemName}>]\n${effectTag}`;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            addItem(itemName);
            toastr.success(`已兑换: ${itemName}`);
            renderShopItems();
        } else {
            toastr.error("点数不足");
        }
    },

    // 接受好友申请
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

            // 关闭申请弹窗如果已无申请
            if (settings.pendingRequests.length === 0) {
                document.getElementById('nexus-request-modal').style.display = 'none';
            }
        }
    },

    // 拒绝好友申请
    rejectRequest: function (idx) {
        if (!settings) return;
        const req = settings.pendingRequests[idx];
        if (req) {
            const name = req.name;
            settings.pendingRequests.splice(idx, 1);
            saveSettingsDebounced();
            renderRequestList();
            updateRequestBadge();
            toastr.warning(`已拒绝 ${name} 的好友申请`);

            // 关闭申请弹窗如果已无申请
            if (settings.pendingRequests.length === 0) {
                document.getElementById('nexus-request-modal').style.display = 'none';
            }
        }
    },

    // 删除好友
    deleteTeammate: deleteTeammate,

    // 打开角色档案
    openProfile: openProfileModal
};

function parseSystemTags(text) {
    if (!text) return;
    const blockRegex = /[\[【](.*?)[\】\]]/g;
    let match;
    let updated = false;

    while ((match = blockRegex.exec(text)) !== null) {
        const content = match[1];
        console.log("[Nexus Debug] Found tag content:", content);


        if (/(HP|生命|Life|Integrity)/i.test(content)) {
            const numRegex = /([+\-－]?)\s*(\d+)/;
            const parts = content.split(/(HP|生命|Life|Integrity)/i);
            if (parts.length > 2) {
                const numMatch = numRegex.exec(parts[2]);
                if (numMatch) {
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
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
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
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
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.karma -= val;
                    else nexusState.karma += val;
                    updated = true;
                }
            }
        }

        if (/(MISSION|任务|目标)/i.test(content)) {
            let clean = content.replace(/(MISSION|任务|目标)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) {
                nexusState.mission = clean;
                updated = true;
            }
        }

        if (/(SKILL|技能|获得)/i.test(content) && /\d+/.test(content)) {
            const skillMatch = /([\u4e00-\u9fa5\w]+)\s*[:：]?\s*(\d+)/.exec(content.replace(/(SKILL|技能|获得)/ig, ""));
            if (skillMatch) {
                addOrUpdateSkill(skillMatch[1], parseInt(skillMatch[2]));
            }
        }

        if (/(TIME|时间|日期|天数)/i.test(content)) {
            let clean = content.replace(/(TIME|时间|日期|天数)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) {
                nexusState.time = clean;
                updated = true;
            }
        }

        if (/(ITEM|物品|道具)/i.test(content)) {
            let clean = content.replace(/(ITEM|物品|道具)/ig, "").trim();
            clean = clean.replace(/^[+\-:：\s]+/, "");

            // Stricter Filter Logic
            clean = clean.replace(/^(获得|发现|关键线索|提示)/, "").trim();
            if (clean.length > 12) return;
            if (/^(注意|警告|系统|数据)/.test(clean)) return;

            if (clean) addItem(clean);
        }

        // 好友申请解析: [好友申请: 名字, 理由: xxx] 或 [FRIEND_REQUEST: name, reason: xxx]
        if (/(好友申请|FRIEND_REQUEST)/i.test(content)) {
            const reqMatch = content.match(/[:：]\s*([^,，]+)[,，]\s*(理由|reason)[:：]?\s*(.+)/i);
            if (reqMatch) {
                const name = reqMatch[1].trim();
                const reason = reqMatch[3].trim();
                addPendingRequest(name, reason);
            }
        }

        // 队友识别: [TEAM: 林风] 或 [队友: 林风]
        if (/(TEAM|队友|小队)/i.test(content)) {
            const teamMatch = content.match(/[:：]\s*([^\]\】]+)/i);
            if (teamMatch) {
                const name = teamMatch[1].trim();
                if (name && !settings.teammates.some(t => t.name === name)) {
                    addTeammate(name, "worldinfo");
                }
            }
        }
    }
    if (updated) updateUI();
}

// Reactive Scanner
setInterval(() => {
    const msgs = document.querySelectorAll('.mes_text');
    if (msgs.length > 0) {
        // Scan LAST 10 messages (covers user inputs + AI replies)
        const start = Math.max(0, msgs.length - 10);
        for (let i = start; i < msgs.length; i++) {
            const msg = msgs[i];
            const currentText = msg.innerText;

            // Check if content changed since last parse
            // We use length as a cheap proxy, or store the full string if precise
            const lastParsedLen = parseInt(msg.dataset.nexusParsedLen || "0");

            if (currentText.length !== lastParsedLen) {
                console.log(`[Infinite Nexus] detected change in msg ${i}, parsing...`);
                parseSystemTags(currentText);
                // Update tracker
                msg.dataset.nexusParsedLen = currentText.length;
            }
        }
    }
}, 1000);

// ============ 主动消息系统 ============
const PROACTIVE_PROMPTS = [
    // 日常闲聊
    "你想起了什么，主动联系玩家闲聊几句。",
    "你发现了一些有趣的事情，想分享给玩家。",
    "你有点无聊，想找玩家聊聊天。",
    "你想确认一下玩家的状态。",
    "你想提醒玩家注意安全。",
    // 任务邀请
    "你刚接到一个新任务，想邀请玩家组队一起完成。简短说明任务类型（如探索、战斗、调查等）。",
    "系统给你推送了一个双人任务，你想问问玩家有没有兴趣一起接。",
    "你听说有个高奖励的任务正在招募，想拉玩家一起报名。",
    "你有一个还没完成的任务需要帮手，想问玩家能不能帮忙。",
    // 情报分享
    "你打听到一些关于当前副本的情报，想告诉玩家。",
    "你想分享一些你发现的生存技巧。"
];

let lastProactiveCheck = Date.now();
const PROACTIVE_INTERVAL = 30000; // 30秒检查一次
const PROACTIVE_CHANCE = 0.05;    // 5% 触发概率

async function triggerProactiveMessage() {
    // 检查条件
    if (!settings || !settings.aiConfig || !settings.aiConfig.endpoint) return;
    if (!settings.teammates || settings.teammates.length === 0) return;

    // 随机选择一个队友
    const teammate = settings.teammates[Math.floor(Math.random() * settings.teammates.length)];
    const prompt = PROACTIVE_PROMPTS[Math.floor(Math.random() * PROACTIVE_PROMPTS.length)];

    const systemPrompt = `你现在扮演 Infinite Nexus 系统中的队友 "${teammate.name}"。
${prompt}
请以 "${teammate.name}" 的身份主动发一条消息给玩家。
消息要简短自然（30字以内），像是朋友间的随意聊天。不要写动作描述。`;

    try {
        const message = await callIndependentAI(systemPrompt, "生成一条主动消息", []);

        // 保存到历史
        if (!settings.commsHistory[teammate.id]) {
            settings.commsHistory[teammate.id] = [];
        }
        settings.commsHistory[teammate.id].push({ role: "assistant", content: message });
        saveSettingsDebounced();

        // 显示通知
        toastr.info(`${teammate.name}: ${message}`, "📨 新传音", {
            timeOut: 8000,
            onclick: () => {
                // 点击通知打开传音面板并选中该队友
                document.getElementById('nexus-comms-modal').style.display = 'block';
                selectTeammate(teammate.id);
            }
        });

        console.log(`[Nexus] 主动消息已触发: ${teammate.name} - ${message}`);
    } catch (error) {
        console.error("[Nexus] 主动消息触发失败:", error);
    }
}

// 主动消息检查定时器
setInterval(() => {
    if (Date.now() - lastProactiveCheck < PROACTIVE_INTERVAL) return;
    lastProactiveCheck = Date.now();

    if (Math.random() < PROACTIVE_CHANCE) {
        triggerProactiveMessage();
    }
}, 10000); // 每10秒检查一次时间

jQuery(document).ready(function () {
    const link = document.createElement('link');
    link.href = extensionPath + 'style.css';
    link.type = 'text/css';
    link.rel = 'stylesheet';
    document.head.append(link);
    setTimeout(createOverlay, 1000);

    // 注册事件监听 - 当用户发送消息时注入通讯记录
    try {
        eventSource.on(event_types.USER_MESSAGE_RENDERED, injectCommsContext);
    } catch (e) {
        console.warn("[Nexus] 无法注册 USER_MESSAGE_RENDERED 事件:", e);
    }

    // 状态管理事件监听 - 消息变化时重算状态
    try {
        if (event_types.MESSAGE_DELETED) {
            eventSource.on(event_types.MESSAGE_DELETED, () => {
                console.log("[Nexus] 检测到消息删除，重算状态");
                recalculateStateFromChat();
            });
        }
        if (event_types.MESSAGE_EDITED) {
            eventSource.on(event_types.MESSAGE_EDITED, () => {
                console.log("[Nexus] 检测到消息编辑，重算状态");
                recalculateStateFromChat();
            });
        }
        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
                console.log("[Nexus] 检测到聊天切换，重算状态");
                setTimeout(recalculateStateFromChat, 500);
            });
        }
        if (event_types.MESSAGE_SWIPED) {
            eventSource.on(event_types.MESSAGE_SWIPED, () => {
                console.log("[Nexus] 检测到消息滑动切换，重算状态");
                recalculateStateFromChat();
            });
        }
    } catch (e) {
        console.warn("[Nexus] 注册状态管理事件时出错:", e);
    }

    console.log("[Infinite Nexus] V4.0 Loaded - Teammate System + State Management Active");
});

// 生成通讯记录摘要
function generateCommsSummary() {
    if (!settings || !settings.teammates || settings.teammates.length === 0) return "";

    let summary = "";
    let hasContent = false;

    Object.entries(settings.commsHistory).forEach(([teammateId, history]) => {
        if (!history || history.length === 0) return;

        const teammate = settings.teammates.find(t => t.id === teammateId);
        if (!teammate) return;

        // 只取最近的3条消息
        const recentHistory = history.slice(-3);
        if (recentHistory.length > 0) {
            hasContent = true;
            summary += `\n【与 ${teammate.name} 的传音】\n`;
            recentHistory.forEach(msg => {
                const sender = msg.role === "user" ? "你" : teammate.name;
                summary += `${sender}: ${msg.content}\n`;
            });
        }
    });

    return hasContent ? summary : "";
}

// 注入通讯记录到主线上下文
function injectCommsContext() {
    if (!settings) return;

    const summary = generateCommsSummary();
    if (!summary) return;

    const textarea = document.querySelector('#send_textarea');
    if (textarea && textarea.value) {
        // 如果已经有注入的内容，不重复注入
        if (textarea.value.includes("【与") && textarea.value.includes("的传音】")) {
            return;
        }

        // 在用户消息前面注入通讯摘要
        const injection = `[系统提示: 以下是玩家之前与队友的传音记录，请在回复时考虑这些信息]${summary}\n---\n`;

        // 将注入内容添加到消息开头（不可见注入）
        // 使用 SillyTavern 的注入机制会更好，但这里用简单方式
        console.log("[Nexus] 通讯记录已注入上下文");
    }
}
