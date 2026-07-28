/* Thirty-five — the voice.
   An external cron hits this every 5 minutes. Most slots do nothing. Some fire
   a message of a random kind at a random moment, so it never becomes wallpaper.

   Env vars on Vercel:
     VAPID_PUBLIC   VAPID_PRIVATE   PUSH_SUB   TICK_KEY
     RATE          how often a quiet slot speaks, in percent. Default 4.
     ANCHORS       "on" to also fire the 13 fixed bells. Leave unset if the
                   .ics calendar is already handling those, or you get doubles.
*/

const webpush = require('web-push');

const TZ = 'Asia/Kolkata';
const WAKE = 10 * 60;        // 10:00 — nothing fires before this
const SLEEP = 1 * 60;        // 01:00 — nothing fires after this

/* the fixed points. off by default — your calendar has these. */
const ANCHORS = [
  { t: '10:00', ttl: 'Feet down', kind: 'direction' },
  { t: '10:30', ttl: 'Load the bar', kind: 'direction' },
  { t: '12:15', ttl: 'Write it down', kind: 'reminder' },
  { t: '13:00', ttl: 'Protein first', kind: 'reminder' },
  { t: '13:15', ttl: 'One file. Ten minutes', kind: 'direction' },
  { t: '15:00', ttl: 'A break ends', kind: 'reminder' },
  { t: '15:30', ttl: 'Back to it', kind: 'direction' },
  { t: '19:00', ttl: 'Shoes. Door', kind: 'direction' },
  { t: '20:00', ttl: 'Last block', kind: 'direction' },
  { t: '22:00', ttl: 'Food. Protein first', kind: 'reminder' },
  { t: '23:00', ttl: 'This is the hour', kind: 'direction' },
  { t: '01:00', ttl: 'Read. Screens down', kind: 'reminder' },
  { t: '02:00', ttl: 'Sleep', kind: 'reminder' }
];

/* ── five registers ──────────────────────────────────────────── */
const VOICE = {
  motivation: {
    title: ['Keep going', 'Still here', 'Again', 'Hold the line', 'Day by day'],
    lines: [
      "You are detrained, not finished. Your body remembers what it used to be and it will hand it back faster than it has any right to. That window is open right now.",
      "The dip is days seventeen to twenty-six. Energy down, hunger up, scale stuck. It is in the plan. It is not a signal. It ends.",
      "Nobody sees the Tuesday session. That is exactly why it counts more than the ones people see.",
      "You have shipped campaigns under real pressure. You have earned things nobody handed you. The body is the last file still open.",
      "Add half a kilo or add one rep. That is the entire method. Do it for thirty-five days and the mirror handles the rest.",
      "Every run you finished, you were glad you finished. Every one you skipped, you were not. A hundred per cent record on both sides.",
      "You are twenty-eight. Everything about you is still plastic. That stops being true later. It is true right now.",
      "Discipline is not a feeling you summon. It is small decisions made slightly faster than the objection arrives."
    ]
  },
  reminder: {
    title: ['Reminder', 'Checkpoint', 'The list', 'Small thing'],
    lines: [
      "Two hundred grams of protein does not happen by accident. Where are you right now? Say the number.",
      "Fifteen minutes of spine work. Cat cow, thoracic rotation, superman. Including the days you did nothing else.",
      "Water. You are almost certainly behind. Four litres, and you have had less than you think.",
      "Log the sets while you are still in the room. A number you did not write down did not happen.",
      "Face pulls. You pressed today. That is the deal that keeps your shoulders working.",
      "Pages tonight equal the day number. It goes up by one every day and it is meant to.",
      "Sunlight in the first hour. Ten seconds of admin that fixes tonight's sleep.",
      "Weigh in tomorrow morning, same time, after the toilet, before food. The daily number is noise. The week is signal."
    ]
  },
  comment: {
    title: ['Noticed', 'For what it is worth', 'An observation', 'By the way'],
    lines: [
      "Your slips cluster at one hour of the day. Open the ledger and look at which one. That hour is fixable. Your character is not the problem.",
      "The scale will stall for five to ten days and then drop all at once. When it stalls, that is not the plan failing.",
      "Two kilos came off in week one. Most of that was water and gut content, not fat. Do not recalibrate your expectations off it.",
      "You are more likely to quit on a day you already did most of the work than on a day you did none. Odd, but consistent.",
      "The evening scroll and the evening eating are the same event wearing two coats.",
      "Half a session logged beats a full session imagined. It has never once been close.",
      "You do not have a motivation problem. You have a starting problem. Those need different tools.",
      "Boredom is not an emergency. Two minutes in it becomes an idea. Reaching for the phone makes it an evening."
    ]
  },
  validation: {
    title: ['Noted', 'That counts', 'Logged', 'Fine'],
    lines: [
      "You turned up on a day you did not want to. That is the only thing that has ever separated anybody from anybody.",
      "That is more consecutive days than you have managed in five years. I am not going to make a fuss about it. It is just true.",
      "You logged it honestly, including the bad parts. A tracker you lie to is a diary of a man who does not exist. Yours is not that.",
      "The work is starting to show up in the numbers. Not in the mirror yet. The numbers come first.",
      "You kept your word to yourself today. Do it again tomorrow and it stops being an event.",
      "Most people quit at day four. You are past that. It does not entitle you to anything, but it is worth knowing.",
      "You caught yourself and logged it instead of spiralling. That is the actual skill. The abstinence is downstream of it."
    ]
  },
  direction: {
    title: ['Now', 'Do this', 'Move', 'No negotiations'],
    lines: [
      "Stand up. Whatever you are doing, stand up first and decide second.",
      "Put the phone in another room. Now, while you are still capable of deciding things.",
      "Ten minutes. One task. No tabs. Then you are free to hate me.",
      "Shoes on. Stand outside the door. That is the only decision available to you.",
      "Go and do the first exercise. Only the first. You will not want to leave after that.",
      "Five hundred millilitres of water, then wait ten minutes by an actual clock.",
      "Close every tab. If it matters it will still exist in twenty minutes.",
      "Cold water on your face. Six minutes outside. Do not negotiate from a sitting position.",
      "Screens down. Your sleep tonight is the most important lift of the day."
    ]
  }
};
/* weighted — validation stays rare so it keeps its value */
const KINDS = ['motivation','motivation','motivation',
               'reminder','reminder','reminder',
               'comment','comment','comment',
               'direction','direction','direction','direction',
               'validation'];

/* deterministic per (day, slot) so a slot always resolves the same way */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
const pickFrom = (arr, seed) => arr[seed % arr.length];

/* would this slot speak? deterministic, so we can look backwards for spacing */
function speaks(dayKey, slot, rate) {
  if (slot > SLEEP && slot < WAKE) return false;          // asleep
  return hash(dayKey + ':' + slot) % 100 < rate;
}

module.exports = async (req, res) => {
  if (!process.env.TICK_KEY || req.query.key !== process.env.TICK_KEY) {
    return res.status(401).json({ error: 'bad key' });
  }
  if (!process.env.PUSH_SUB) {
    return res.status(200).json({ error: 'no subscription stored yet' });
  }

  const rate = Math.max(0, Math.min(30, parseInt(process.env.RATE || '4', 10)));
  const useAnchors = String(process.env.ANCHORS || '').toLowerCase() === 'on';

  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t).value;
  const h = +g('hour'), m = +g('minute');
  const dayKey = `${g('year')}-${g('month')}-${g('day')}`;
  const slot = Math.floor((h * 60 + m) / 5) * 5;

  let title, body, tag, hard = false;

  const anchor = useAnchors && ANCHORS.find(a => {
    const [ah, am] = a.t.split(':').map(Number);
    return ah * 60 + am === slot;
  });

  if (anchor) {
    title = anchor.ttl;
    body = pickFrom(VOICE[anchor.kind].lines, hash(dayKey + anchor.t));
    tag = 'anchor-' + anchor.t;
    hard = true;
  } else {
    if (!speaks(dayKey, slot, rate)) {
      return res.status(200).json({ ok: true, slot, spoke: false });
    }
    // don't crowd: stay quiet if a random fired in the last 40 minutes
    for (let back = 5; back <= 40; back += 5) {
      const prev = (slot - back + 1440) % 1440;
      if (speaks(dayKey, prev, rate)) {
        return res.status(200).json({ ok: true, slot, spoke: false, reason: 'too soon' });
      }
    }
    const seed = hash(dayKey + '#' + slot);
    const kind = KINDS[seed % KINDS.length];
    title = pickFrom(VOICE[kind].title, seed >> 3);
    body = pickFrom(VOICE[kind].lines, seed >> 7);
    tag = 'v-' + slot;
  }

  webpush.setVapidDetails('mailto:srbhyana7@gmail.com',
    process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

  try {
    await webpush.sendNotification(JSON.parse(process.env.PUSH_SUB),
      JSON.stringify({ title, body, tag, hard }));
    return res.status(200).json({ ok: true, slot, spoke: true, title, body });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message), code: e && e.statusCode });
  }
};
