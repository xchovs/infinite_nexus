import { extension_settings } from "../../../extensions.js";

// V2.0 - Infinite Nexus (Infinite Flow TRPG Plugin)
const extensionName = "infinite_nexus";
const extensionPath = `scripts/extensions/${extensionName}/`;

// State
let nexusState = {
    hp: 100,
    maxHp: 100,
    san: 100,
    maxSan: 100,
    karma: 0, // 奖励点数
    mission: "存活并寻找线索...", // 当前任务
    skills: [
        { name: "侦查", value: 50 },
        { name: "斗殴", value: 40 },
        { name: "闪避", value: 30 }
    ]
};

// --- DOM Generation ---

function createOverlay() {
    if (document.getElementById('infinite-nexus-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'infinite-nexus-overlay';
    overlay.innerHTML = `
        <div class="nexus-header">
            <span>UNIVERSE NEXUS</span>
            <span id="nexus-clock">D-01</span>
        </div>
        
        <div class="nexus-mission-box" id="nexus-mission">
            [任务] ${nexusState.mission}
        </div>

        <div class="nexus-content">
            <!-- HP -->
            <div class="nexus-stat-row">
                <div class="nexus-label">
                    <span>生命值 (INTEGRITY)</span>
                    <span id="nexus-hp-val">100/100</span>
                </div>
                <div class="nexus-bar-container">
                    <div id="nexus-hp-bar" class="nexus-bar-fill nexus-hp-fill" style="width: 100%"></div>
                </div>
            </div>

            <!-- SAN -->
            <div class="nexus-stat-row">
                <div class="nexus-label">
                    <span>理智值 (RATIONALITY)</span>
                    <span id="nexus-san-val">100/100</span>
                </div>
                <div class="nexus-bar-container">
                    <div id="nexus-san-bar" class="nexus-bar-fill nexus-san-fill" style="width: 100%"></div>
                </div>
            </div>

            <!-- Skills -->
            <div class="nexus-section-title">
                <span>技能列表 (SKILLS)</span>
                <span class="nexus-add-btn" id="nexus-add-skill-btn" title="手动添加技能">[+]</span>
            </div>
            <div class="nexus-skill-grid" id="nexus-skill-list">
                <!-- Skills injected here -->
            </div>
        </div>

        <!-- Store Button -->
        <div class="nexus-shop-btn" id="nexus-shop-open">
            主神兑换 (KARMA: <span id="nexus-karma-val">0</span>)
        </div>
    `;

    document.body.appendChild(overlay);

    // Create Shop Modal
    const shopModal = document.createElement('div');
    shopModal.id = 'nexus-shop-modal';
    shopModal.innerHTML = `
        <h3 style="color:#ffd700; border-bottom:1px solid #555; margin-bottom:15px; padding-bottom:10px;">主神强化兑换系统</h3>
        <div id="nexus-shop-list">
            <div class="nexus-shop-item">
                <span>急救喷雾 (HP恢复)</span>
                <button class="nexus-shop-buy" onclick="infiniteNexus.buyItem('急救喷雾', 100, '[HP +30]')">100点</button>
            </div>
            <div class="nexus-shop-item">
                <span>镇静剂 (SAN恢复)</span>
                <button class="nexus-shop-buy" onclick="infiniteNexus.buyItem('镇静剂', 100, '[SAN +20]')">100点</button>
            </div>
            <div class="nexus-shop-item">
                <span>沙漠之鹰 (威力+)</span>
                <button class="nexus-shop-buy" onclick="infiniteNexus.buyItem('沙漠之鹰', 500, '[SKILL: 枪械 60] [ITEM +沙漠之鹰]')">500点</button>
            </div>
        </div>
        <button style="margin-top:20px; width:100%; padding:10px; background:#444; color:#fff; border:none;" id="nexus-shop-close">关闭连接</button>
    `;
    document.body.appendChild(shopModal);

    // Listeners
    document.getElementById('nexus-add-skill-btn').addEventListener('click', manualAddSkill);
    document.getElementById('nexus-shop-open').addEventListener('click', () => { shopModal.style.display = 'block'; });
    document.getElementById('nexus-shop-close').addEventListener('click', () => { shopModal.style.display = 'none'; });

    renderSkills();
}

function renderSkills() {
    const list = document.getElementById('nexus-skill-list');
    if (!list) return;
    list.innerHTML = ""; // Clear

    nexusState.skills.forEach(skill => {
        const btn = document.createElement('div');
        btn.className = 'nexus-skill-btn';
        btn.innerHTML = `<span>${skill.name}</span> <span class="nexus-skill-val">${skill.value}</span>`;
        btn.onclick = () => performSkillCheck(skill.name, skill.value);
        list.appendChild(btn);
    });
}

function updateUI() {
    const hpBar = document.getElementById('nexus-hp-bar');
    const sanBar = document.getElementById('nexus-san-bar');

    if (hpBar) {
        const hpP = (nexusState.hp / nexusState.maxHp) * 100;
        hpBar.style.width = hpP + "%";
        document.getElementById('nexus-hp-val').innerText = `${nexusState.hp}/${nexusState.maxHp}`;
    }
    if (sanBar) {
        const sanP = (nexusState.san / nexusState.maxSan) * 100;
        sanBar.style.width = sanP + "%";
        document.getElementById('nexus-san-val').innerText = `${nexusState.san}/${nexusState.maxSan}`;
    }

    document.getElementById('nexus-karma-val').innerText = nexusState.karma;
    document.getElementById('nexus-mission').innerText = `[任务] ${nexusState.mission}`;

    // Glitch
    const overlay = document.getElementById('infinite-nexus-overlay');
    if (nexusState.hp < 30) overlay.classList.add('glitch-effect');
    else overlay.classList.remove('glitch-effect');
}

// --- Logic & Actions ---

function manualAddSkill() {
    const name = prompt("输入技能名称 (如: 侦查)", "");
    if (!name) return;
    const val = prompt(`输入【${name}】的数值 (0-100)`, "50");
    if (!val) return;

    addOrUpdateSkill(name, parseInt(val));
}

function addOrUpdateSkill(name, val) {
    const existing = nexusState.skills.find(s => s.name === name);
    if (existing) {
        existing.value = val; // Update
    } else {
        nexusState.skills.push({ name: name, value: val });
    }
    renderSkills();
    toastr.success(`技能【${name}】已记录: ${val}`);
}

async function performSkillCheck(name, targetVal) {
    // 1. Roll Dice
    const result = Math.floor(Math.random() * 100) + 1;
    const isSuccess = result <= targetVal;

    // 2. Format Message
    const outcome = isSuccess ? "成功" : "失败";
    const crit = (result <= 5) ? " (大成功!)" : (result >= 96 ? " (大失败!)" : "");

    const msg = `\n[系统判定] 玩家进行<${name}>检定: 目标${targetVal}, 掷出D100=${result} -> 【${outcome}${crit}】`;

    // 3. Inject to Input Box (Standard way for V1 to ensure user sees it before sending)
    const textarea = document.querySelector('#send_textarea');
    if (textarea) {
        textarea.value += msg;
        // Trigger event to resize box or notify angular if needed
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        toastr.info("检定结果已填入输入框，请点击发送");
    } else {
        alert(msg); // Fallback
    }
}

window.infiniteNexus = {
    buyItem: function (itemName, cost, effectTag) {
        if (nexusState.karma >= cost) {
            nexusState.karma -= cost;
            updateUI();

            // Send effect to chat input
            const textarea = document.querySelector('#send_textarea');
            if (textarea) {
                textarea.value += `\n[系统: 玩家购买了 ${itemName}] ${effectTag}`;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            toastr.success(`已购买: ${itemName}`);
        } else {
            toastr.error("奖励点数不足！");
        }
    }
};

// --- Parser (Regex) ---

function parseSystemTags(text) {
    // HP/SAN/Karma
    // Supports: [HP -10], [生命 -10], [理智 -5], [Karma +100], [点数 +100]
    const hpRegex = /\[(?:HP|生命|生命值)\s*([:+-]?)\s*(\d+)\]/gi;
    const sanRegex = /\[(?:SAN|理智|理智值)\s*([:+-]?)\s*(\d+)\]/gi;
    const karmaRegex = /\[(?:Karma|点数|奖励)\s*([:+-]?)\s*(\d+)\]/gi;
    const missionRegex = /\[(?:MISSION|任务|目标)\s*[:：]\s*(.*?)\]/i;

    // Skill: [SKILL: 侦查 60] or [获得技能 侦查 60]
    const skillRegex = /\[(?:SKILL|技能|获得技能)\s*[:：]?\s*(\S+)\s*(\d+)\]/gi;

    let match;
    let updated = false;

    // HP
    while ((match = hpRegex.exec(text)) !== null) {
        const op = match[1];
        const val = parseInt(match[2]);
        if (op === '-') nexusState.hp -= val;
        else if (op === '+') nexusState.hp += val;
        else nexusState.hp = val;
        updated = true;
    }

    // SAN
    while ((match = sanRegex.exec(text)) !== null) {
        const op = match[1];
        const val = parseInt(match[2]);
        if (op === '-') nexusState.san -= val;
        else if (op === '+') nexusState.san += val;
        else nexusState.san = val;
        updated = true;
    }

    // Karma
    while ((match = karmaRegex.exec(text)) !== null) {
        const op = match[1];
        const val = parseInt(match[2]);
        if (op === '-') nexusState.karma -= val;
        else nexusState.karma += val; // Default is add
        updated = true;
    }

    // Mission
    const missionMatch = text.match(missionRegex);
    if (missionMatch) {
        nexusState.mission = missionMatch[1];
        updated = true;
    }

    // Skills
    while ((match = skillRegex.exec(text)) !== null) {
        addOrUpdateSkill(match[1], parseInt(match[2]));
        // Note: render logic is handled in addOrUpdate
    }

    if (updated) {
        updateUI();
    }
}

// Hook
let lastMessageId = null;
// Usually we hook a specific event. For direct script usage, we poll or hook jQuery.
// Simple polling for new messages (inefficient but works for drop-in)
setInterval(() => {
    // In a real extension, use event_source.on(event_types.MESSAGE_RECEIVED)
    // Here we check the last message in DOM for tags
    const msgs = document.querySelectorAll('.mes_text');
    if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        // We need to avoid re-parsing. Real ST extensions have 'context'.
        // This is a 'dumb' parser that relies on user enabling it.
        // For this demo, let's assume we parse only if data-parsed attribute is missing
        if (!lastMsg.dataset.nexusParsed) {
            parseSystemTags(lastMsg.innerText);
            lastMsg.dataset.nexusParsed = "true";
        }
    }
}, 1000);

jQuery(document).ready(function () {
    const link = document.createElement('link');
    link.href = extensionPath + 'style.css';
    link.type = 'text/css';
    link.rel = 'stylesheet';
    document.head.append(link);
    createOverlay();
});
