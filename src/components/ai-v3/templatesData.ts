/* Shared outbound template library (9 sequences) used by both the Browse
   Templates modal and the Outbound Templates tab. Copy is verbatim from
   docs/updated-docs/ai-agent.jsx; day/time are normalized to the standardized
   cadence — message 1 instant, then Day 1/3/5/7 @ 10:00 AM in the account/lead
   timezone — by index, so every template stays uniform. */

export interface SmsStep { day: string; instant?: boolean; channel: "sms"; time?: string; text: string }
export interface EmailStep { day: string; instant?: boolean; channel: "email"; time?: string; subject: string; body: string }
export type FlowStep = SmsStep | EmailStep;
export interface Template {
  id: string; channel: "sms"; name: string; stage: string; sent: number; message: string;
  flow: SmsStep[]; emailSent: number; emailFlow: EmailStep[];
}

export const TEMPLATE_CH: Record<string, { label: string; icon: string; bg: string; fg: string }> = {
  sms: { label: "SMS", icon: "message", bg: "#5BB4E3", fg: "#fff" },
  email: { label: "Email", icon: "mail", bg: "var(--accent)", fg: "#fff" },
};
export const SEND_TIME = "10:00 AM"; // all non-instant steps send at 10 AM in the account/lead timezone

// Standardized cadence: message 1 instant, then next day, then every 2 days.
const STD_DAYS = ["Day 0", "Day 1", "Day 3", "Day 5", "Day 7"];
const STD_OFFSETS = [0, 1, 3, 5, 7];
export function dayOffset(dayStr: string): number {
  const m = String(dayStr).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
/** Rewrite a flow so every step uses the standard day/time/instant by index. */
function normalize<T extends FlowStep>(steps: T[]): T[] {
  return steps.map((s, i) => ({
    ...s,
    day: STD_DAYS[i] ?? `Day ${1 + i * 2}`,
    ...(i === 0 ? { instant: true, time: undefined } : { instant: false, time: SEND_TIME }),
  }));
}
function normTemplate(t: Template): Template {
  return { ...t, flow: normalize(t.flow), emailFlow: normalize(t.emailFlow) };
}

export { STD_OFFSETS };

const RAW_TEMPLATES: Template[] = [
  {
    id: "t1", channel: "sms", name: "Buyer Follow-Up", stage: "BUYER", sent: 412,
    message: "Hey {{first_name}}, saw you were interested in homes in {{area}} — are you looking to buy soon or just browsing?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, saw you were interested in homes in {{area}} — are you looking to buy soon or just browsing?" },
      { day: "Day 1", channel: "sms", text: "Hi {{first_name}}, just wanted to follow up. Are you still looking to buy a home around {{area}}?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, not sure if you saw my last message — are you still interested in homes in {{area}}?" },
      { day: "Day 5", channel: "sms", text: "Hey {{first_name}}, I can send you a few good options in {{area}} if you're still looking. Want me to?" },
      { day: "Day 7", channel: "sms", text: "Hi {{first_name}}, I don't want to bug you — I'll assume timing isn't right. Feel free to reach out anytime if that changes!" },
    ],
    emailSent: 268,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "A few homes you might like", body: "Hey {{first_name}},\nI came across a few homes that match what you're looking for. Want me to send them your way?\n— {{agent_name}}" },
      { day: "Day 2", channel: "email", subject: "Quick question for you", body: "Hi {{first_name}},\nJust wanted to check — are you actively looking right now, or still exploring your options?\n— {{agent_name}}" },
      { day: "Day 4", channel: "email", subject: "Good opportunities hitting the market", body: "Hey {{first_name}},\nThere are a few homes hitting the market right now that are priced really well compared to others nearby. If you want, I can send you the best ones before they get picked up.\n— {{agent_name}}" },
      { day: "Day 6", channel: "email", subject: "This week or weekend?", body: "Hey {{first_name}},\nI'm showing a few homes this week that match what you're looking for. Would you be open to taking a look Wednesday or Saturday?\n— {{agent_name}}" },
      { day: "Day 8", channel: "email", subject: "Should I keep sending homes?", body: "Hey {{first_name}},\nJust wanted to check in to see if you want me to send you good options as they come up. Just let me know.\n— {{agent_name}}" },
    ],
  },
  {
    id: "t2", channel: "sms", name: "Buyer Appointment Push", stage: "BUYER", sent: 286,
    message: "Hey {{first_name}}, would you be open to touring a few homes this week?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, would you be open to touring a few homes this week?" },
      { day: "Day 1", channel: "sms", text: "Hey {{first_name}}, I have a couple homes that match what you're looking for — want me to set up a quick showing?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, a few good homes are getting picked up quickly right now — do you want to take a look before they're gone?" },
      { day: "Day 5", channel: "sms", text: "Hey {{first_name}}, I'm free this week — would weekday evenings or this weekend work better for you?" },
      { day: "Day 7", channel: "sms", text: "Hey {{first_name}}, not sure if timing is right, but happy to line up some homes whenever you're ready. Just let me know." },
    ],
    emailSent: 191,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "Quick question about your home search", body: "Hey {{first_name}},\nI saw you were looking at homes recently — are you actively trying to find something right now, or just browsing? I'd be happy to send you options that match exactly what you're looking for and even set up private tours if anything stands out. Let me know 👍\n— {{agent_name}}" },
      { day: "Day 1", channel: "email", subject: "Found a few homes you might like", body: "Hey {{first_name}},\nI came across a few homes in {{area}} that could be a great fit based on what you're looking for. Would you like me to send them over? I can also set up a time to tour any that catch your eye.\n— {{agent_name}}" },
      { day: "Day 3", channel: "email", subject: "Want to see any homes this week?", body: "Hey {{first_name}},\nQuick question — if you found the right home, would you want to see it in person this week? Homes in {{area}} have been moving pretty quickly, so I can help you get in early if something pops up.\n— {{agent_name}}" },
      { day: "Day 5", channel: "email", subject: "Should I keep sending homes?", body: "Hey {{first_name}},\nNot sure where you're at in the process, but I didn't want to overload you. Do you want me to keep sending you homes that match what you're looking for, or are you still just exploring for now? Happy to help either way.\n— {{agent_name}}" },
      { day: "Day 7", channel: "email", subject: "Still looking or pause for now?", body: "Hey {{first_name}},\nI haven't heard back, so I just wanted to check in one last time. Should I keep an eye out for homes and reach out when something good pops up, or would you prefer I close this out for now? Either way, feel free to reach out anytime 👍\n— {{agent_name}}" },
    ],
  },
  {
    id: "t3", channel: "sms", name: "Seller Follow-Up", stage: "SELLER", sent: 198,
    message: "Hey {{first_name}}, I saw you were interested in your home value. Are you just curious, or thinking about selling soon?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, I saw you were interested in your home value. Are you just curious, or thinking about selling soon?" },
      { day: "Day 1", channel: "sms", text: "Hi {{first_name}}, just wanted to follow up. I ran some numbers for homes near {{area}}. Want me to send a quick estimate of what your house can sell for in today's market?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, quick question — homes in {{area}} have been selling pretty fast lately. Have you thought about what you'd list your home for?" },
      { day: "Day 5", channel: "sms", text: "Hey {{first_name}}, no rush at all — just checking in. Even if you're not ready to sell, I can keep you updated on your home value over time." },
      { day: "Day 7", channel: "sms", text: "Hey {{first_name}}, I don't want to keep bugging you. Should I close this out for now, or are you still interested in seeing your home value?" },
    ],
    emailSent: 142,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "Buyers looking in your area", body: "Hey {{first_name}},\nI've been working with a few buyers actively looking in your area, and your home came up. Have you thought about selling, or just keeping an eye on the market?\n— {{agent_name}}" },
      { day: "Day 2", channel: "email", subject: "What your home could sell for", body: "Hey {{first_name}},\nQuick heads up — homes around you have been selling strong recently. If you're curious, I can give you an idea of what your home would sell for in today's market.\n— {{agent_name}}" },
      { day: "Day 4", channel: "email", subject: "Strong demand right now", body: "Hey {{first_name}},\nThere's still solid buyer demand right now, especially for homes like yours. The ones priced right are moving quickly and getting strong offers. Want me to show you what that could look like for your place?\n— {{agent_name}}" },
      { day: "Day 6", channel: "email", subject: "This week or weekend?", body: "Hey {{first_name}},\nIf you're open to it, I can swing by for a quick 10-minute walkthrough and give you a realistic price + strategy. No pressure at all, just helpful info. Would this week or weekend be better?\n— {{agent_name}}" },
      { day: "Day 8", channel: "email", subject: "Still thinking about selling?", body: "Hey {{first_name}},\nNot sure where you're at with selling, but I can keep you updated on what homes near you are actually selling for. Just let me know.\n— {{agent_name}}" },
    ],
  },
  {
    id: "t4", channel: "sms", name: "Seller Appointment Push", stage: "SELLER", sent: 154,
    message: "Hey {{first_name}}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10–15 minute call so I can give you a more accurate estimate?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10–15 minute call so I can give you a more accurate estimate?" },
      { day: "Day 1", channel: "sms", text: "Hi {{first_name}}, just following up. A quick call would help me understand your property, timeline, and what homes near you are selling for. Do you have time today or tomorrow?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, homes in {{area}} can vary a lot depending on condition, upgrades, and timing. Want to schedule a quick home value review so I can give you a realistic number?" },
      { day: "Day 5", channel: "sms", text: "Hi {{first_name}}, even if you're not ready to sell right now, it may still help to know what your options are. Would you like me to walk you through your estimated value and possible selling strategy?" },
      { day: "Day 7", channel: "sms", text: "Hey {{first_name}}, I don't want to keep bugging you. Should I close this out for now, or would you still like to schedule a quick call about your home value?" },
    ],
    emailSent: 108,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "Quick question about your home", body: "Hey {{first_name}},\nNot sure if you've considered selling recently, but I've been seeing strong buyer activity in your area. If you're curious what your home could realistically sell for in today's market, I'd be happy to give you a quick estimate and strategy.\n— {{agent_name}}" },
      { day: "Day 2", channel: "email", subject: "Buyers are still looking nearby", body: "Hi {{first_name}},\nI'm still working with buyers looking for homes in your area, and inventory is staying pretty limited. If you've thought about making a move, this could be a good time to explore your options. Happy to walk you through what that could look like.\n— {{agent_name}}" },
      { day: "Day 4", channel: "email", subject: "Want a quick home value breakdown?", body: "Hey {{first_name}},\nA lot of homeowners are surprised by what homes are actually selling for right now. I can put together a quick breakdown of:\n• Estimated value\n• Nearby sales\n• What buyers are paying\n• Possible net proceeds\nWould you like me to send one over?\n— {{agent_name}}" },
      { day: "Day 6", channel: "email", subject: "This week or weekend?", body: "Hey {{first_name}},\nIf it's easier, I can stop by for a quick 10-minute walkthrough and give you a realistic idea of pricing and strategy. No pressure at all, just useful information so you know your options. Would this week or weekend work better?\n— {{agent_name}}" },
      { day: "Day 8", channel: "email", subject: "Should I keep you updated?", body: "Hey {{first_name}},\nTotally understand if the timing isn't right. I can still keep you updated on:\n• Nearby home sales\n• Buyer demand\n• Pricing trends in your area\nJust let me know if you'd like occasional updates.\n— {{agent_name}}" },
    ],
  },
  {
    id: "t5", channel: "sms", name: "Re-engagement Campaign", stage: "RE-ENGAGE", sent: 132,
    message: "Hey {{first_name}}, are you still looking to buy, or did you already find a house?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, are you still looking to buy, or did you already find a house?" },
      { day: "Day 1", channel: "sms", text: "Hey {{first_name}}, I'm seeing some solid opportunities right now — want me to send you a few that match what you're looking for?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, what's your timeline looking like right now?" },
      { day: "Day 5", channel: "sms", text: "Hi {{first_name}}, just checking — are you still in the market right now?" },
      { day: "Day 7", channel: "sms", text: "Hey {{first_name}}, a few strong homes just hit the market. I can send you the best ones if you're still looking?" },
    ],
    emailSent: 96,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "Quick check-in", body: "Hey {{first_name}},\nNot sure where you're at with your home search right now. Are you still looking, or did you put things on hold?\n— {{agent_name}}" },
      { day: "Day 2", channel: "email", subject: "Homes you might like", body: "Hey {{first_name}},\nA few solid homes just came up that fit what you were looking for. Want me to send you the best ones?\n— {{agent_name}}" },
      { day: "Day 4", channel: "email", subject: "Market update", body: "Hey {{first_name}},\nQuick update — I'm seeing some price adjustments and better opportunities popping up right now. Could be a good time to take another look. Let me know if you'd like me to send options that may interest you.\n— {{agent_name}}" },
      { day: "Day 6", channel: "email", subject: "Timing might be better now", body: "Hey {{first_name}},\nSome buyers who paused a few months ago are starting to jump back in right now. If you've been thinking about it again, I can help you move at the right time.\n— {{agent_name}}" },
      { day: "Day 8", channel: "email", subject: "Let me know", body: "Hey {{first_name}},\nNot sure if now just isn't the right time — totally fine if that's the case. Should I stop sending homes for now, or do you still want to stay updated?\n— {{agent_name}}" },
    ],
  },
  {
    id: "t6", channel: "sms", name: "Open House Follow-Up", stage: "NURTURE", sent: 119,
    message: "Hey {{first_name}}, it was great meeting you at the open house! Would you like me to send you similar homes that pop up?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, it was great meeting you at the open house! Would you like me to send you similar homes that pop up?" },
      { day: "Day 1", channel: "sms", text: "Hey {{first_name}}, are you actively looking to buy a home in the next 3–6 months, or just exploring?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, I came across a couple homes similar to the one you saw. Want me to send them over?" },
      { day: "Day 5", channel: "sms", text: "Hey {{first_name}}, quick question — if you found the right home, how soon would you be ready to move?" },
      { day: "Day 7", channel: "sms", text: "Hey {{first_name}}, not sure if you're still in the market, but happy to keep an eye out for deals that fit what you're looking for. Want me to do that?" },
    ],
    emailSent: 84,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "About the open house", body: "Hey {{first_name}},\nIt was great meeting you at the open house today. Let me know if you'd like to tour any homes or if you have any questions.\n— {{agent_name}}" },
      { day: "Day 1", channel: "email", subject: "A few options you might like", body: "Hey {{first_name}},\nBased on what you liked at the open house, I can send you a few similar homes that just hit the market. Want me to send those over?\n— {{agent_name}}" },
      { day: "Day 3", channel: "email", subject: "Quick update", body: "Hey {{first_name}},\nJust a heads up — homes like the one you saw are moving pretty quickly right now. Let me know if you'd like me to send similar options.\n— {{agent_name}}" },
      { day: "Day 5", channel: "email", subject: "Want to see a few homes?", body: "Hey {{first_name}},\nI'm showing a few homes this week that are similar to the one you saw. Would you be open to taking a look on a weekday evening or weekend?\n— {{agent_name}}" },
      { day: "Day 7", channel: "email", subject: "Still looking?", body: "Hey {{first_name}},\nNot sure where you're at in your search, but I can keep sending you strong options as they come up. Just let me know.\n— {{agent_name}}" },
    ],
  },
  {
    id: "t7", channel: "sms", name: "Cold Lead Nurture", stage: "COLD", sent: 97,
    message: "Hey {{first_name}}, just wanted to check in. Are you still thinking about making a move, or has that been put on hold for now?",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, just wanted to check in. Are you still thinking about making a move, or has that been put on hold for now?" },
      { day: "Day 1", channel: "sms", text: "Hi {{first_name}}, no rush at all. Just curious — what does your timeline look like right now?" },
      { day: "Day 3", channel: "sms", text: "Hey {{first_name}}, I know timing can change. If you'd like, I can keep an eye out for opportunities that fit what you're looking for." },
      { day: "Day 5", channel: "sms", text: "Hi {{first_name}}, are you still interested in the market, or should I check back with you later on?" },
      { day: "Day 7", channel: "sms", text: "Hey {{first_name}}, I don't want to keep bugging you. Feel free to reach out anytime if things change — I'd be happy to help." },
    ],
    emailSent: 71,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "Just checking in", body: "Hey {{first_name}},\nNot sure where you're at in the process right now, but I wanted to reach out and introduce myself. If you're thinking about buying, selling, or just have questions about the market, I'm happy to help.\n— {{agent_name}}" },
      { day: "Day 3", channel: "email", subject: "Still thinking about making a move?", body: "Hey {{first_name}},\nA lot of people I've spoken with recently are still trying to figure out the right timing. Are you actively considering a move, or just keeping an eye on things for now?\n— {{agent_name}}" },
      { day: "Day 7", channel: "email", subject: "Market update", body: "Hey {{first_name}},\nJust a quick update — new homes are hitting the market every week and some good opportunities are popping up. If you'd like me to keep you updated, just let me know.\n— {{agent_name}}" },
      { day: "Day 14", channel: "email", subject: "Have any questions?", body: "Hey {{first_name}},\nReal estate can be confusing, especially when you're not sure where to start. If you have any questions about buying, selling, financing, or the market, feel free to reach out anytime.\n— {{agent_name}}" },
      { day: "Day 21", channel: "email", subject: "Stay in touch?", body: "Hey {{first_name}},\nI haven't heard back, which is completely okay. Would you like me to keep sending occasional market updates and opportunities, or should I leave the ball in your court for now?\n— {{agent_name}}" },
    ],
  },
  {
    id: "t8", channel: "sms", name: "Past Client", stage: "PAST CLIENT", sent: 64,
    message: "Hey {{first_name}}, hope everything has been going well since your move. Just wanted to check in and see how things are going.",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, hope everything has been going well since your move. Just wanted to check in and see how things are going." },
      { day: "Day 30", channel: "sms", text: "Hi {{first_name}}, quick question — have you had any friends, family, or coworkers talking about buying or selling lately?" },
      { day: "Day 90", channel: "sms", text: "Hey {{first_name}}, hope you're enjoying the home. If you ever need anything real estate related, don't hesitate to reach out." },
      { day: "Day 180", channel: "sms", text: "Hi {{first_name}}, just checking in. If you'd ever like an updated value on your home, I'd be happy to put one together." },
      { day: "Day 365", channel: "sms", text: "Hey {{first_name}}, hard to believe it's already been a year! Hope everything is going great. Let me know if I can help with anything." },
    ],
    emailSent: 53,
    emailFlow: [
      { day: "Day 0", instant: true, channel: "email", subject: "Hope you're doing well", body: "Hey {{first_name}},\nJust wanted to check in and see how everything has been going since we last worked together. Hope you're enjoying the home and settling in well.\n— {{agent_name}}" },
      { day: "Day 30", channel: "email", subject: "Quick market update", body: "Hey {{first_name}},\nI wanted to send a quick update on what's happening in the market around your area. If you're ever curious about your home's value or local activity, I'd be happy to help.\n— {{agent_name}}" },
      { day: "Day 60", channel: "email", subject: "Anyone I can help?", body: "Hey {{first_name}},\nOne of the biggest compliments I can receive is an introduction to a friend or family member who needs help buying or selling. If someone comes to mind, I'd love the opportunity to help them.\n— {{agent_name}}" },
      { day: "Day 90", channel: "email", subject: "Home value update", body: "Hey {{first_name}},\nA lot can change in a few months. If you'd like an updated estimate of what your home could sell for today, I'd be happy to put one together for you.\n— {{agent_name}}" },
      { day: "Day 120", channel: "email", subject: "Always here if you need anything", body: "Hey {{first_name}},\nEven if you're not planning a move anytime soon, I'm always here as a resource. Whether it's real estate questions, referrals, contractors, or market updates, don't hesitate to reach out.\n— {{agent_name}}" },
    ],
  },
  {
    id: "t9", channel: "sms", name: "Long-Term Nurture", stage: "NURTURE", sent: 48,
    message: "Hey {{first_name}}, thanks again for chatting with me. I know your timeline may be a little further out, but I'm here whenever you're ready.",
    flow: [
      { day: "Day 0", instant: true, channel: "sms", text: "Hey {{first_name}}, thanks again for chatting with me. I know your timeline may be a little further out, but I'm here whenever you're ready." },
      { day: "Day 30", channel: "sms", text: "Hi {{first_name}}, just checking in. Has anything changed with your plans since we last spoke?" },
      { day: "Day 60", channel: "sms", text: "Hey {{first_name}}, a few interesting opportunities have popped up recently. Let me know if you'd like me to keep an eye out for anything specific." },
      { day: "Day 90", channel: "sms", text: "Hi {{first_name}}, hope everything is going well. Are you still thinking about making a move later this year?" },
      { day: "Day 120", channel: "sms", text: "Hey {{first_name}}, no pressure at all. Just wanted to stay in touch and let you know I'm here whenever the timing feels right." },
    ],
    emailSent: 39,
    emailFlow: [
      { day: "Month 1", instant: true, channel: "email", subject: "Real estate update", body: "Hey {{first_name}},\nJust checking in with a quick market update. There are some interesting opportunities showing up right now, and I wanted to stay on your radar in case your plans change.\n— {{agent_name}}" },
      { day: "Month 2", channel: "email", subject: "Curious about your plans", body: "Hey {{first_name}},\nJust wondering if anything has changed since we last spoke. Are you still considering a move at some point, or staying put for now?\n— {{agent_name}}" },
      { day: "Month 3", channel: "email", subject: "What's happening locally", body: "Hey {{first_name}},\nI've been keeping an eye on the local market and wanted to check in. If you'd like updates on home values, inventory, or market trends, I'd be happy to send them over.\n— {{agent_name}}" },
      { day: "Month 4", channel: "email", subject: "Still here to help", body: "Hey {{first_name}},\nI know timing is everything when it comes to real estate. Whenever the time is right, I'll be here to help answer questions and guide you through the process.\n— {{agent_name}}" },
      { day: "Month 6", channel: "email", subject: "Should I keep you updated?", body: "Hey {{first_name}},\nI wanted to do a quick check-in. Would you like to continue receiving occasional updates and opportunities, or would you prefer I only reach out when you contact me? Either way is completely fine.\n— {{agent_name}}" },
    ],
  },
];

export const OUTBOUND_TEMPLATES: Template[] = RAW_TEMPLATES.map(normTemplate);
