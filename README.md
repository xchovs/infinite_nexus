# Infinite Nexus (无限终端)

SillyTavern Plugin for "Infinite Flow" (无限流) Roleplay.

## Features
- **Status Overlay**: Displays HP (Integrity) and SAN (Rationality) bars.
- **Auto-Parser**: Automatically updates stats when AI outputs `[HP -10]` or `[SAN -5]`.
- **Dice Roller**: Adds a D100 skill check button.
- **Glitch Effects**: Visual feedback when health is low.

## Installation (Gitee/Git)
1. Open SillyTavern.
2. Go to **Extensions** -> **Install Extension**.
3. Paste this repository URL.
4. Click **Install**.

## Usage
Add the following rule to your Character Card or World Info:
> "If Player takes damage, append `[HP -Amount]`. If Player loses sanity, append `[SAN -Amount]`."

## Included Scenarios
- **Ghost Train**: See `GhostTrain_Character.json`.
