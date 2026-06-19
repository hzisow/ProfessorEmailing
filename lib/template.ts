// Default email template and sender defaults for ProfPing.
// Merge fields: {{lastName}}, {{name}}, {{area}}, {{university}},
// {{department}}, {{hook}}, {{senderName}}, {{senderSchool}}, {{senderGradYear}}

export const DEFAULT_SUBJECT =
  "High school student interested in your work on {{area}}";

export const DEFAULT_BODY = `Dear Professor {{lastName}},

My name is Henry Zisow, and I'm currently a sophomore at Gann Academy in Waltham, MA. {{hook}}

I've been drawn to the intersection of finance and AI for a while, and I've tried to build in that space rather than just read about it. I founded the Boston chapter of Building Financial Futures of America, a nonprofit that teaches free financial literacy, and I serve as a Massachusetts DECA State Officer representing around 13,000 students. I also qualified for the International Career Development Conference in Principles of Finance through DECA. This summer, I'll be at Oxford's Saïd Business School for their AI and Machine Learning Pioneers program.

I'm truly interested in the range of projects your group is working on, and I would love to take part in or support any one of them. My resume is attached with the full picture of my background. I would greatly appreciate any opportunities you have for me.`;

export const DEFAULT_SIGNATURE = `Thank you for your time and consideration,
Henry Zisow`;

export const DEFAULT_SENDER = {
  senderName: "Henry Zisow",
  senderSchool: "Gann Academy",
  senderGradYear: "2028",
};

export const DEFAULT_THROTTLE_SECONDS = 45;
export const MIN_THROTTLE_SECONDS = 10;
