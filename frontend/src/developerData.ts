export interface DeveloperProfile {
  name: string;
  identity: string[];
  bio: string;
  analyticalMindset: string[];
  philosophicalFoundation: string;
  technicalFocus: string[];
  creativeInfluences: string[];
  education: string;
}

export const developerData: DeveloperProfile = {
  name: "Harsh",
  identity: [
    "Studying English Literature",
    "Self-Taught Developer",
    "Curious About Other Things"
  ],
  bio: "I'm a student at the University of Delhi, studying English literature. Outside of coursework, I taught myself software development and built Pulse Chat, a real-time messaging app, mostly through trial and error and a lot of debugging.",
  analyticalMindset: [
    "I like breaking a problem into smaller pieces before I start coding, rather than guessing at a fix",
    "I'm interested in psychology and how people behave online, which occasionally nudges a small UX decision",
    "I pick up math or logic as a feature needs it, even without a formal computer science background"
  ],
  philosophicalFoundation: "I've been interested in philosophy for a while, including ideas around first-principles and non-dual thinking. In practice, that mostly means I prefer simple, direct solutions over clever ones, and I try to be upfront about what the app does and does not do with user data.",
  technicalFocus: [
    "Backend work aimed at keeping the app predictable and easy to debug",
    "Trying to be careful with how user data and authentication are handled",
    "Reducing latency so messages feel close to instant",
    "Structuring the codebase so new features don't mean rewriting old ones"
  ],
  creativeInfluences: [
    "Years of playing competitive online games, including Call of Duty, shaped what I expect from responsive software",
    "I enjoy sci-fi films and space stories",
    "Some of my UX instincts come from gaming, where lag and friction aren't tolerated"
  ],
  education: "Pursuing a BA (Hons) in English at the University of Delhi. The reading and writing the degree demands carries over into how I document and explain my own code."
};