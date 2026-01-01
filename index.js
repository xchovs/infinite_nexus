import { extension_settings } from "../../../extensions.js";

const extensionName = "infinite_nexus";
const extensionPath = `scripts/extensions/${extensionName}/`;

let nexusState = {
    hp: 100,
    maxHp: 100,
    san: 100,
    maxSan: 100,
    inventory: []
};

// --- DOM Manipulation ---

function createOverlay() {
    if (document.getElementById('infinite-nexus-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'infinite-nexus-overlay';
    overlay.innerHTML = `
        <div class="nexus-header">
            <span>UNIVERSE NEXUS</span>
            <span id="nexus-clock">00:00:00</span>
        </div>
        
        <div class="nexus-stat-row">
            <div class="nexus-label">
                <span>INTEGRITY (HP)</span>
                <span id="nexus-hp-val">100/100</span>
            </div>
            <div class="nexus-bar-container">
                <div id="nexus-hp-bar" class="nexus-bar-fill nexus-hp-fill" style="width: 100%"></div>
            </div>
        </div>

        <div class="nexus-stat-row">
            <div class="nexus-label">
                <span>RATIONALITY (SAN)</span>
                <span id="nexus-san-val">100/100</span>
            </div>
            <div class="nexus-bar-container">
                <div id="nexus-san-bar" class="nexus-bar-fill nexus-san-fill" style="width: 100%"></div>
            </div>
        </div>

        <div class="nexus-stat-row" style="margin-top:15px; border-top: 1px solid #333; padding-top:10px;">
            <div class="nexus-label">INVENTORY</div>
            <div id="nexus-inventory-list" style="font-size: 0.85em; color: #888; min-height: 20px;">
                Checking spatial storage...
            </div>
        </div>

        <button id="nexus-dice-btn" class="nexus-dice-btn">INITIATE SKILL CHECK (D100)</button>
    `;

    document.body.appendChild(overlay);

    // Bind Event Listeners
    document.getElementById('nexus-dice-btn').addEventListener('click', performDiceRoll);
}

function updateUI() {
    const hpBar = document.getElementById('nexus-hp-bar');
    const sanBar = document.getElementById('nexus-san-bar');
    const hpVal = document.getElementById('nexus-hp-val');
    const sanVal = document.getElementById('nexus-san-val');

    if (hpBar) {
        const hpPercent = (nexusState.hp / nexusState.maxHp) * 100;
        hpBar.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;
        hpVal.textContent = `${nexusState.hp}/${nexusState.maxHp}`;
    }

    if (sanBar) {
        const sanPercent = (nexusState.san / nexusState.maxSan) * 100;
        sanBar.style.width = `${Math.max(0, Math.min(100, sanPercent))}%`;
        sanVal.textContent = `${nexusState.san}/${nexusState.maxSan}`;
    }

    // Dynamic Glitch Effect on low health
    const overlay = document.getElementById('infinite-nexus-overlay');
    if (nexusState.hp < 30) {
        overlay.classList.add('glitch-effect');
        overlay.style.border = '1px solid red';
    } else {
        overlay.classList.remove('glitch-effect');
        overlay.style.border = '1px solid #444';
    }
}

// --- Logic Engine ---

function parseSystemTags(text) {
    let updated = false;

    // Matches [HP -10], [HP +5], [SAN -2], [Hp: 50] (set), etc.
    const hpRegex = /\[(?:HP|Health)\s*([:+-]?)\s*(\d+)\]/gi;
    const sanRegex = /\[(?:SAN|Sanity)\s*([:+-]?)\s*(\d+)\]/gi;

    let match;

    // Process HP
    while ((match = hpRegex.exec(text)) !== null) {
        const operator = match[1];
        const value = parseInt(match[2]);

        if (operator === '+' || operator === '') {
            // If no operator but just a number, usually implies damage if in context, 
            // but strictly: "+": heal, "-": damage, ":" or empty with context logic? 
            // Let's standardise: [HP -10] or [HP +10]. 
            // If [HP 50] (no sign), we treat as SET? No, let's treat no sign as SET if ':' exists, else careful.
            // Actually, typically [HP -10] is standard.
            // Let's support: [HP -10], [HP +10], [HP: 50] (Set).
        }

        if (operator === '-') nexusState.hp -= value;
        else if (operator === '+') nexusState.hp += value;
        else if (operator === ':') nexusState.hp = value;

        updated = true;
    }

    // Process SAN
    while ((match = sanRegex.exec(text)) !== null) {
        const operator = match[1];
        const value = parseInt(match[2]);

        if (operator === '-') nexusState.san -= value;
        else if (operator === '+') nexusState.san += value;
        else if (operator === ':') nexusState.san = value;

        updated = true;
    }

    if (updated) {
        // Clamp values
        nexusState.hp = Math.min(nexusState.maxHp, Math.max(0, nexusState.hp));
        nexusState.san = Math.min(nexusState.maxSan, Math.max(0, nexusState.san));
        updateUI();
        toastr.info(`Status Updated: HP ${nexusState.hp} | SAN ${nexusState.san}`);
    }
}

async function performDiceRoll() {
    // Generate result
    const result = Math.floor(Math.random() * 100) + 1;
    let quality = "Normal";
    if (result <= 5) quality = "Critical Success";
    else if (result >= 96) quality = "Fumble";

    // Inject into chat
    // We utilize the ST API to insert a message or just append to the input?
    // Usually extensions utilize: getContext(), sendSystemMessage(), or simply modify user input.
    // Let's try sending a system message for visibility.

    // Note: 'extension_settings' and other globals are usually available in ST environment.
    // For now, we will simulate the chat insertion log logic 
    // or use the 'kanka' or 'dice' extension standard if known.
    // Let's assume we can trigger a slash command.

    alert(`Rolled D100: ${result} (${quality})`);

    // TODO: Ideally, send this to the chat so the AI can see it.
    // In actual ST extension: 
    // const context = getContext();
    // context.chat.push({ ... }); 
    // saveChat();
}

// --- SillyTavern Hooks ---

// This function runs when a message is received from AI
function onMessageReceived(data) {
    if (data && data.message) {
        parseSystemTags(data.message);
    }
}

// Entry point
jQuery(document).ready(function () {
    console.log("[Infinite Nexus] Loading...");

    // Inject CSS
    const link = document.createElement('link');
    link.href = extensionPath + 'style.css';
    link.type = 'text/css';
    link.rel = 'stylesheet';
    document.head.append(link);

    createOverlay();

    // Hook into ST events (pseudo-code, as ST event names vary by version)
    // event_source.on(event_types.MESSAGE_RECEIVED, onMessageReceived); 
    // We will set up a MutationObserver or hook standard globals in a real deployment
    // For now, we expose the parse function globally for testing.
    window.infiniteNexus = {
        parse: parseSystemTags,
        state: nexusState
    };
});
