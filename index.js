import { extension_settings } from "../../../extensions.js";

// V2.1 - Infinite Nexus (Infinite Flow TRPG Plugin)
const extensionName = "infinite_nexus";
const extensionPath = `scripts/extensions/${extensionName}/`;

// State
let nexusState = {
    hp: 100,
    maxHp: 100,
    san: 100,
    maxSan: 100,
    karma: 0,
    mission: "存活并寻找线索...",
    skills: [
        { name: "侦查", value: 50 },
        { name: "斗殴", value: 40 },
        { name: "闪避", value: 30 }
    ],
    // Shop Items Configuration
    shopItems: [
        { name: "急救喷雾", cost: 100, effect: "[HP +30]", desc: "快速止血，恢复30点生命值" },
        { name: "镇静剂", cost: 100, effect: "[SAN +20]", desc: "平复精神，恢复20点理智" },
        { name: "初级防弹衣", cost: 300, effect: "[ITEM +防弹衣]", desc: "物理防御力提升" },
        { name: "无限弹药沙漠之鹰", cost: 1500, effect: "[SKILL: 枪械 70] [ITEM +沙鹰(无限)]", desc: "无限流经典神器，附带枪械精通" },
        { name: "T病毒强化血清", cost: 2000, effect: "[HP +50] [SKILL: 怪力 60] [SAN -10]", desc: "大幅强化肉体，但有感染风险" },
        { name: "豁免权 (Ticket)", cost: 5000, effect: "[MISSION: 任务完成]", desc: "直接跳过当前恐怖片副本" }
    ]
};

// --- DOM Generation ---

function createOverlay() {
    if (document.getElementById('infinite-nexus-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'infinite-nexus-overlay';
    // Style adjustments for scrolling content if needed
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
            
            <!-- Universal Dice -->
            <button id="nexus-universal-dice" class="nexus-dice-btn" style="margin-top:10px;">🎲 投掷 D100 (通用判定)</button>
        </div>

        <!-- Store Button -->
        <div class="nexus-shop-btn" id="nexus-shop-open">
            主神兑换列表 (当前奖励点: <span id="nexus-karma-val">0</span>)
        </div>
    `;

    document.body.appendChild(overlay);

    // Create Shop Modal
    const shopModal = document.createElement('div');
    shopModal.id = 'nexus-shop-modal';
    shopModal.innerHTML = `
        <h3 style="color:#ffd700; border-bottom:1px solid #555; margin-bottom:15px; padding-bottom:10px; display:flex; justify-content:space-between;">
            <span>主神强化兑换系统</span>
            <span style="font-size:0.8em; color:#aaa; cursor:pointer;" id="nexus-shop-close-x">✕</span>
        </h3>
        <div id="nexus-shop-list" style="max-height: 300px; overflow-y: auto;">
            <!-- Items injected via JS -->
        </div>
        <div style="margin-top:15px; border-top:1px solid #444; padding-top:10px; text-align:right; font-size:0.8em; color:#666;">
            *兑换即时生效，物品将自动存入空间戒指
        </div>
    `;
    document.body.appendChild(shopModal);

    // Listeners
    document.getElementById('nexus-add-skill-btn').addEventListener('click', manualAddSkill);
    document.getElementById('nexus-universal-dice').addEventListener('click', () => performSkillCheck("运气", 50, true)); // True means explicit 'Luck/General' check

    document.getElementById('nexus-shop-open').addEventListener('click', () => {
        renderShopItems();
        shopModal.style.display = 'block';
    });
    // Close logic
    document.getElementById('nexus-shop-close-x').addEventListener('click', () => { shopModal.style.display = 'none'; });

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target == shopModal) shopModal.style.display = 'none';
    });

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

function renderShopItems() {
    const list = document.getElementById('nexus-shop-list');
    list.innerHTML = "";

    nexusState.shopItems.forEach(item => {
        const row = document.createElement('div');
        row.className = 'nexus-shop-item';
        // Check affordability
        const canAfford = nexusState.karma >= item.cost;
        const btnStyle = canAfford ? "" : "opacity:0.5; cursor:not-allowed;";

        row.innerHTML = `
            <div style="flex-grow:1;">
                <div style="color:#eee; font-weight:bold;">${item.name}</div>
                <div style="font-size:0.75em; color:#888;">${item.desc}</div>
            </div>
            <button class="nexus-shop-buy" style="${btnStyle}" 
                onclick="infiniteNexus.buyItem('${item.name}', ${item.cost}, '${item.effect.replace(/'/g, "\\'")}')">
                ${item.cost} pts
            </button>
        `;
        list.appendChild(row);
    });
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

    const karmaInfo = document.getElementById('nexus-karma-val');
    if (karmaInfo) karmaInfo.innerText = nexusState.karma;

    const missionInfo = document.getElementById('nexus-mission');
    if (missionInfo) missionInfo.innerText = `[任务] ${nexusState.mission}`;

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
        existing.value = val;
    } else {
        nexusState.skills.push({ name: name, value: val });
    }
    renderSkills();
    toastr.success(`技能【${name}】已记录: ${val}`);
}

async function performSkillCheck(name, targetVal, isGeneral = false) {
    // 1. Roll Dice
    const result = Math.floor(Math.random() * 100) + 1;
    let isSuccess = result <= targetVal;

    // For general luck roll (target 50 usually), or just showing the number
    if (isGeneral) {
        // Just a D100 roll
        // We set success if <= 50 just for color, but text differs
    }

    // 2. Format Message
    const outcome = isSuccess ? "成功" : "失败";
    const crit = (result <= 5) ? " (大成功!)" : (result >= 96 ? " (大失败!)" : "");

    let msg = "";
    if (isGeneral) {
        msg = `\n[系统判定] 玩家进行<运气/通用>检定: D100=${result}`;
    } else {
        msg = `\n[系统判定] 玩家进行<${name}>检定: 目标${targetVal}, 掷出D100=${result} -> 【${outcome}${crit}】`;
    }

    // 3. Inject to Input Box
    const textarea = document.querySelector('#send_textarea');
    if (textarea) {
        // Check if textarea already has text, append newline
        const prefix = textarea.value ? "\n" : "";
        textarea.value += prefix + msg;

        // Trigger resize/input events for ST framework (React/Angular/Vanilla mix)
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.focus();

        toastr.info("🎲 检定结果已生成 (请点击发送)");
    } else {
        alert(msg);
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
                const prefix = textarea.value ? "\n" : "";
                textarea.value += prefix + `[系统: 玩家花费${cost}点购买了 <${itemName}>]\n${effectTag}`;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            toastr.success(`已购买: ${itemName}`);
            renderShopItems(); // Re-render to update buttons availability
        } else {
            toastr.error("奖励点数不足 (你需要更多Karma)！");
        }
    }
};

// --- Fuzzy Parser (V2.1) ---

function parseSystemTags(text) {
    if (!text) return;

    // Strategy: Look for brackets [...] or 【...】
    // Inside, look for keywords.
    const blockRegex = /[\[【](.*?)[\】\]]/g;

    let match;
    let updated = false;

    while ((match = blockRegex.exec(text)) !== null) {
        const content = match[1];

        // HP Logic
        // Matches: HP, 生命, Integrity
        if (/(HP|生命|Life|Integrity)/i.test(content)) {
            // Find numbers. If preceeded by -, minus. If +, plus.
            // We use a regex that captures the sign before the number
            const numRegex = /([+\-－]?)\s*(\d+)/;
            // Split by keyword to look AFTER it
            const parts = content.split(/(HP|生命|Life|Integrity)/i);
            if (parts.length > 2) { // 0:before, 1:KEY, 2:after
                const afterKey = parts[2];
                const numMatch = numRegex.exec(afterKey);
                if (numMatch) {
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.hp -= val;
                    else if (sign === '+') nexusState.hp += val;
                    else nexusState.hp = val; // Set
                    updated = true;
                }
            }
        }

        // SAN Logic
        if (/(SAN|理智|Rationality)/i.test(content)) {
            const parts = content.split(/(SAN|理智|Rationality)/i);
            if (parts.length > 2) {
                const afterKey = parts[2];
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(afterKey);
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

        // Karma
        if (/(Karma|点数|奖励)/i.test(content) && !/(消费|花费|购买)/i.test(content)) {
            const parts = content.split(/(Karma|点数|奖励)/i);
            if (parts.length > 2) {
                const afterKey = parts[2];
                const numMatch = /([+\-－]?)\s*(\d+)/.exec(afterKey);
                if (numMatch) {
                    let sign = numMatch[1];
                    let val = parseInt(numMatch[2]);
                    if (sign === '-' || sign === '－') nexusState.karma -= val;
                    else nexusState.karma += val;
                    updated = true;
                }
            }
        }

        // Mission (Greedy match inside brackets)
        if (/(MISSION|任务|目标)/i.test(content)) {
            // Take everything after colon/keyword
            let clean = content.replace(/(MISSION|任务|目标)/ig, "").replace(/^[:：\s]+/, "").trim();
            if (clean) {
                nexusState.mission = clean;
                updated = true;
            }
        }

        // Skills
        if (/(SKILL|技能|获得)/i.test(content) && /\d+/.test(content)) {
            // Look for chinese/words then number
            // e.g. "获得技能 枪械 50"
            const skillMatch = /([\u4e00-\u9fa5\w]+)\s*[:：]?\s*(\d+)/.exec(content.replace(/(SKILL|技能|获得)/ig, ""));
            if (skillMatch) {
                addOrUpdateSkill(skillMatch[1], parseInt(skillMatch[2]));
            }
        }
    }

    if (updated) updateUI();
}

// Hook
setInterval(() => {
    const msgs = document.querySelectorAll('.mes_text');
    if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
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

    // Delay creation slightly to wait for DOM stability
    setTimeout(createOverlay, 1000);

    console.log("[Infinite Nexus] V2.1 Loaded");
});
