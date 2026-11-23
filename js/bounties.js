import { ABILITIES } from './constants.js';
import { todayKey, saveState, applyXpGain } from './state.js';

const BOUNTY_POOL = {
  academics: [
    'Review class notes for 15 minutes',
    'Summarize 1 concept you learned in your own words',
    'Solve 3 practice problems without distractions',
    'Organize upcoming exam / assignment deadlines',
  ],
  culture: [
    'Read 15 pages of a book or essay',
    'Watch a thoughtful documentary or philosophy lecture',
    'Listen to a full album actively with no phone scrolling',
    'Write a 3-sentence reflection on something you read or saw',
  ],
  fitness: [
    'Do a 10-minute mobility or stretching session',
    'Go for a brisk 15-minute walk outside',
    'Hit 3 quick sets of pushups / bodyweight squats',
    'Drink 2L+ water & prep a healthy meal',
  ],
  charisma: [
    'Message a friend you haven’t talked to recently',
    'Give someone a genuine compliment today',
    'Call a friend or family member for 10 minutes',
    'Make plans for a social hangout this week',
  ],
  productivity: [
    'Clear your desk and close unused browser tabs',
    'Plan tomorrow’s Top 3 priority tasks',
    'Do a 20-minute distraction-free sprint on a nagging task',
    'Reach Inbox Zero or clean up your desktop files',
  ],
};

function pickOne(arr, exclude = new Set()) {
  const choices = arr.filter(t => !exclude.has(t));
  const list = choices.length > 0 ? choices : arr;
  return list[Math.floor(Math.random() * list.length)];
}

export function generateDailyBounties(state, forceReroll = false) {
  const today = todayKey();
  if (!state.bounties) state.bounties = { date: null, rerollsUsed: 0, items: [] };

  if (!forceReroll && state.bounties.date === today && Array.isArray(state.bounties.items) && state.bounties.items.length > 0) {
    return state.bounties;
  }

  if (forceReroll && state.bounties.date === today && state.bounties.rerollsUsed >= 1) {
    return null; // Already used today's free reroll
  }

  // Prioritize the 3 lowest-XP abilities so bounties nudge well-rounded growth!
  const sortedAbs = [...ABILITIES].sort((a, b) => (state.abilities[a.id]?.xp || 0) - (state.abilities[b.id]?.xp || 0));
  const targetAbs = [sortedAbs[0].id, sortedAbs[1].id, sortedAbs[2].id];
  const prevTitles = new Set((state.bounties.items || []).map(x => x.title));

  const items = targetAbs.map((abId, idx) => ({
    id: `bty_${today}_${idx}_${Math.floor(Math.random() * 1000)}`,
    abilityId: abId,
    title: pickOne(BOUNTY_POOL[abId], prevTitles),
    xp: 35,
    gold: 20,
    claimed: false,
  }));

  state.bounties = {
    date: today,
    rerollsUsed: forceReroll && state.bounties.date === today ? (state.bounties.rerollsUsed || 0) + 1 : 0,
    items,
  };
  saveState(state);
  return state.bounties;
}

export function claimBounty(state, bountyId) {
  const list = state.bounties?.items || [];
  const b = list.find(x => x.id === bountyId);
  if (!b || b.claimed) return null;
  b.claimed = true;

  const res = applyXpGain(state, {
    title: `🎯 Daily Bounty: ${b.title}`,
    difficultyId: 'easy',
    abilityIds: [b.abilityId],
    skillIds: [],
    multiplier: 1.0,
    extraGold: b.gold,
  });

  saveState(state);
  return { ...res, bounty: b };
}
