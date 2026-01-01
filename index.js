import { extension_settings } from "../../../extensions.js";

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

    // Comms Modal
    const commsModal = document.createElement('div');
    commsModal.id = 'nexus-comms-modal';
    commsModal.innerHTML = `
        <h3 style="border-bottom:1px dashed #ccc; margin-bottom:10px; padding-bottom:5px; font-size:1em;">
            纸鹤传音
            <span style="float:right; cursor:pointer;" id="nexus-comms-close">✕</span>
        </h3>
        <div id="nexus-comms-log" class="nexus-comms-log"></div>
        <input type="text" id="nexus-comms-input" class="nexus-comms-input" placeholder="输入讯息 (按回车发送)...">
    `;
    document.body.appendChild(commsModal);

    // Bindings
    document.getElementById('nexus-add-skill-btn').addEventListener('click', manualAddSkill);
    document.getElementById('nexus-universal-dice').addEventListener('click', () => performSkillCheck("运气", 50, true));
    document.getElementById('nexus-shop-open').addEventListener('click', () => { renderShopItems(); shopModal.style.display = 'block'; });
    document.getElementById('nexus-shop-close-x').addEventListener('click', () => { shopModal.style.display = 'none'; });

    document.getElementById('nexus-comms-open').addEventListener('click', () => {
        commsModal.style.display = 'block';
        document.getElementById('nexus-comms-input').focus();
    });
    document.getElementById('nexus-comms-close').addEventListener('click', () => { commsModal.style.display = 'none'; });
    document.getElementById('nexus-comms-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCommsMessage();
    });

    // Make Draggable + Smart Toggle on Header
    makeDraggable(overlay, document.getElementById('nexus-header-bar'));

    renderSkills();
    renderInventory();

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

    const log = document.getElementById('nexus-comms-log');
    const entry = document.createElement('div');
    entry.innerHTML = `<span class="nexus-msg-user">你:</span> ${msg}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;

    input.value = "";

    const textarea = document.querySelector('#send_textarea');
    if (textarea) {
        const prefix = textarea.value ? "\n" : "";
        textarea.value += prefix + `[传音: "${msg}"]`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        toastr.success("传音已就绪");
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
    document.getElementById('nexus-mission').innerText = `【任务】 ${nexusState.mission}`;

    const overlay = document.getElementById('infinite-nexus-overlay');
    if (nexusState.hp < 30) overlay.classList.add('glitch-effect');
    else overlay.classList.remove('glitch-effect');
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
    }
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

jQuery(document).ready(function () {
    const link = document.createElement('link');
    link.href = extensionPath + 'style.css';
    link.type = 'text/css';
    link.rel = 'stylesheet';
    document.head.append(link);
    setTimeout(createOverlay, 1000);
    console.log("[Infinite Nexus] V3.9 Loaded - PNG Restored");
});
