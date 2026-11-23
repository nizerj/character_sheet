import { saveState } from './state.js';

export const DEFAULT_SHOP_ITEMS = [
  { id: 'item_safe_pass', name: 'Safe Room Pass (+1 Recovery Freeze)', cost: 200, special: 'safe_pass', desc: 'Pause stat decay & protect your streak during rest/sick days.' },
  { id: 'item_gaming',    name: '1h Guilt-Free Gaming / Anime', cost: 80,  special: null, desc: 'Earned pure leisure time.' },
  { id: 'item_treat',     name: 'Coffee / Treat Meal',          cost: 150, special: null, desc: 'Order or grab something delicious.' },
  { id: 'item_book',      name: 'Buy a New Book / Game',        cost: 350, special: null, desc: 'Big milestone reward.' },
];

export function ensureShopState(state) {
  if (typeof state.gold !== 'number' || Number.isNaN(state.gold)) state.gold = 0;
  if (!Array.isArray(state.shopItems)) {
    state.shopItems = DEFAULT_SHOP_ITEMS.map(x => ({ ...x }));
  }
  if (!Array.isArray(state.redemptions)) state.redemptions = [];
}

export function addShopItem(state, { name, cost, desc = '' }) {
  ensureShopState(state);
  const item = {
    id: 'shop_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: name.trim(),
    cost: Math.max(5, Math.round(Number(cost) || 100)),
    desc: desc.trim(),
    special: null,
  };
  state.shopItems.push(item);
  saveState(state);
  return item;
}

export function deleteShopItem(state, itemId) {
  ensureShopState(state);
  state.shopItems = state.shopItems.filter(i => i.id !== itemId || i.special === 'safe_pass');
  saveState(state);
}

export function redeemShopItem(state, itemId) {
  ensureShopState(state);
  const item = state.shopItems.find(i => i.id === itemId);
  if (!item) return { ok: false, error: 'Reward not found.' };
  if (state.gold < item.cost) {
    return { ok: false, error: `Need ${item.cost - state.gold} more Gold (have ${state.gold} G).` };
  }

  state.gold -= item.cost;

  if (item.special === 'safe_pass') {
    if (!state.safeRoom) state.safeRoom = { activeUntil: null, passes: 2 };
    state.safeRoom.passes = (state.safeRoom.passes || 0) + 1;
  }

  state.redemptions.unshift({
    id: 'red_' + Date.now(),
    name: item.name,
    cost: item.cost,
    timestamp: new Date().toISOString(),
  });
  if (state.redemptions.length > 50) state.redemptions = state.redemptions.slice(0, 50);

  saveState(state);
  return { ok: true, item, remainingGold: state.gold };
}
