// ---------------------------------------------------------------------------
// Stick Legacy — game constants, unit stats & difficulty tuning
// A tribute to classic stick-figure RTS gameplay (Stick War: Legacy style).
// ---------------------------------------------------------------------------

export const VIEW_W = 1280;          // logical canvas width
export const VIEW_H = 720;           // logical canvas height
export const WORLD_W = 4400;         // total world width (scrollable)
export const GROUND_Y = 560;         // world y of the ground line
export const POP_CAP = 30;           // population cap per side

export const TEAM = { PLAYER: 1, ENEMY: 2 };

export const STATUE_X = { 1: 360, 2: WORLD_W - 360 };
export const MINE_X   = { 1: 1020, 2: WORLD_W - 1020 };
export const STATUE_HALF = 78;       // extra melee reach vs statues
export const HOLD_OFFSET = 350;      // defend line distance from own statue
export const DEPOSIT_RANGE = 135;    // how close miners deposit at the statue

export const AGGRO = { melee: 380, ranged: 520 };

export const CARRY = 22;             // gold a miner carries per trip
export const MINE_SWINGS = 3;        // pick swings to fill a load

// Unit roster (costs / stats inspired by the genre classic)
export const UNIT_TYPES = {
  miner:  { key:'miner',  name:'Miner',      cost:70,   hp:130,  dmg:9,   atkSpeed:1.05, range:36,  speed:104, pop:1, hotkey:'1', weapon:'pick',  scale:0.92,
            desc:'Mines gold at the mine and hauls it home. Can fight back with his pick.' },
  sword:  { key:'sword',  name:'Swordwrath', cost:130,  hp:230,  dmg:26,  atkSpeed:1.25, range:44,  speed:126, pop:1, hotkey:'2', weapon:'sword', scale:1.0,
            desc:'Fast and aggressive swordsman. Cheap backbone of your army.' },
  archer: { key:'archer', name:'Archidon',   cost:220,  hp:165,  dmg:36,  atkSpeed:0.8,  range:430, speed:106, pop:1, hotkey:'3', weapon:'bow',   scale:1.0, ranged:true,
            desc:'Loose arrows from afar. Deadly in a line, fragile up close.' },
  spear:  { key:'spear',  name:'Spearton',   cost:300,  hp:560,  dmg:33,  atkSpeed:0.95, range:58,  speed:110, pop:1, hotkey:'4', weapon:'spear', scale:1.05,
            desc:'Helmeted tank with spear and shield. Holds the line.' },
  mage:   { key:'mage',   name:'Magikill',   cost:480,  hp:185,  dmg:46,  atkSpeed:0.55, range:380, speed:100, pop:1, hotkey:'5', weapon:'staff', scale:1.02, ranged:true, aoe:88,
            desc:'Hurls exploding orbs of energy that splash damage crowds.' },
  giant:  { key:'giant',  name:'Giant',      cost:1500, hp:3200, dmg:170, atkSpeed:0.45, range:95,  speed:62,  pop:4, hotkey:'6', weapon:'club',  scale:2.35,
            desc:'A slow colossus. One smash shakes the earth and scatters armies.' },
};
export const TRAIN_ORDER = ['miner', 'sword', 'archer', 'spear', 'mage', 'giant'];

export const DIFFICULTY = {
  easy:   { key:'easy',   label:'Easy',   startGold:350, aiTrickle:3.2, aiReaction:1.25, aiStatueHp:3800, aiMiners:3, waveScale:0.75 },
  normal: { key:'normal', label:'Normal', startGold:300, aiTrickle:4.4, aiReaction:0.95, aiStatueHp:4600, aiMiners:4, waveScale:0.95 },
  hard:   { key:'hard',   label:'Hard',   startGold:250, aiTrickle:5.6, aiReaction:0.7,  aiStatueHp:5200, aiMiners:5, waveScale:1.15 },
};

export const PLAYER_STATUE_HP = 5600;

// Team palettes — stick bodies are near-black; teams read through accents.
export const TEAM_COLORS = {
  1: { main:'#4aa3ff', dark:'#2c6cb5', name:'BLUE EMPIRE',  body:'#232b38', limbBack:'#151a23' },
  2: { main:'#ff5f4d', dark:'#b53a2c', name:'RED HORDE',    body:'#38272b', limbBack:'#221619' },
};
