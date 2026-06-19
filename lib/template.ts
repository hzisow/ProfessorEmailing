// Default email template and sender defaults for ProfPing.
// Merge fields: {{lastName}}, {{name}}, {{area}}, {{university}},
// {{department}}, {{hook}}, {{senderName}}, {{senderSchool}}, {{senderGradYear}}

export const DEFAULT_SUBJECT =
  "High school student interested in your work on {{area}}";

export const DEFAULT_BODY = `Dear Professor {{lastName}},

My name is {{senderName}}, and I'm a sophomore at {{senderSchool}}. {{hook}}

A bit about me. I serve as a Massachusetts DECA State Officer, representing around 13,000 students, and I qualified for the international championship in Principles of Finance. I taught myself enough React and Python to build a web app that uses the Anthropic API to grade financial reasoning against a rubric, and this summer I'll be at Oxford's Saïd Business School for their AI and Machine Learning Pioneers program. I don't have formal research experience yet, but I learn fast and I'm reliable with the unglamorous parts of a project.

I'd be glad to help your group in any capacity over the coming months, whether that's data work, literature review, or supporting a project already underway. I've attached my resume with the full picture.

Would you have 15 minutes in the next week or two to talk about whether there's a fit? I'm happy to work around your schedule.`;

export const DEFAULT_SIGNATURE = `Thank you for your time,
{{senderName}}`;

export const DEFAULT_SENDER = {
  senderName: "Henry Zisow",
  senderSchool: "Gann Academy",
  senderGradYear: "2028",
};

export const DEFAULT_THROTTLE_SECONDS = 45;
export const MIN_THROTTLE_SECONDS = 10;
