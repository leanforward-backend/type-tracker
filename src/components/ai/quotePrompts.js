/**
 * The quote-generation prompt, shared by the app (quoteGenerator.js) and the
 * offline seeding script (scripts/seed-free-quotes.mjs). No imports, so Node
 * can load it as-is.
 */

export const CATEGORY_PROMPT_CONFIG = {
  coding: {
    domain: "programming and computer science",
    requirements: "Focus on practical, actionable programming knowledge, algorithms, data structures, system architecture, networking, or databases.",
    // Deliberately varied in opening word, angle (mechanism, pitfall,
    // misconception, comparison) and subfield. These set the quality bar in
    // the prompt, so each one names a specific thing and says something true
    // and non-obvious about it -- in words. This is a typing app: no digit
    // runs, no code tokens, no symbol soup like O(n) or version numbers.
    examples: [
      "A JavaScript promise settles exactly once; any later attempt to resolve or reject it is silently ignored rather than raising an error.",
      "Git identifies every commit, tree and file by a hash of its contents, so identical files are stored once no matter how many branches reference them.",
      "Quicksort is fast on average but slows to quadratic time when the pivot is always the smallest or largest element, which is why many implementations choose it at random.",
      "Floating point numbers cannot represent most decimal fractions exactly, so adding one tenth to two tenths in most languages gives a result a hair above three tenths.",
      "A TCP connection begins with a three-way handshake in which both ends agree on starting sequence numbers before any payload is sent.",
      "When a distributed database loses contact between its nodes, it must choose between serving possibly stale data and refusing to answer at all.",
      "Database indexes speed up reads by maintaining a sorted tree over the indexed columns, but every insert and update must now also rewrite that tree.",
      "Bloom filters answer membership questions in constant time with no false negatives, at the cost of occasional false positives and no way to remove an element.",
      "Contrary to a common belief, the Python interpreter lock does not stop threads from overlapping network or disk work; it only serialises the execution of bytecode.",
      "Building a database query by pasting user input into its text lets an attacker rewrite the query, which parameterised statements prevent by sending data separately from code.",
      "Modern processors guess the outcome of each branch so the pipeline can keep fetching, and a wrong guess throws away roughly fifteen to twenty cycles of speculative work.",
      "Semantic versioning packs compatibility into three numbers: the major signals breaking changes, the minor adds features, and the patch fixes bugs without altering the interface.",
      "HTTP version two multiplexes many requests over a single connection, removing the head-of-line blocking that once made browsers open six connections per host.",
      "Rust's borrow checker insists that a value has either one mutable reference or any number of read-only ones, ruling out data races without a garbage collector.",
    ],
  },
  architecture: {
    domain: "software architecture and the technical decisions senior engineers are responsible for",
    requirements: "Focus on system design trade-offs, service boundaries, data ownership, scalability and resilience patterns, API and schema evolution, deployment and release strategy, observability, technical debt, and how architectural choices affect teams. Prefer the reasoning behind a decision over a definition.",
    examples: [
      "A bounded context draws a line around one consistent model and vocabulary, so two teams can both have a Customer without fighting over what the word means.",
      "Idempotent endpoints let a client safely retry a failed request, which turns a flaky network from a data corruption risk into a simple retry loop.",
      "Splitting a monolith into services trades in-process calls for network calls, so every boundary you draw should be one you would happily pay latency to cross.",
      "An architecture decision record captures the options considered and the reasons for the choice, so the next engineer inherits the reasoning rather than just the result.",
      "A circuit breaker stops calling a failing dependency for a cooling-off period, so one slow service cannot exhaust every thread in the callers upstream of it.",
      "Feature flags separate deploying code from releasing behaviour, which lets a team ship daily while turning risky changes on for a small slice of users first.",
      "Backward compatible schema changes add columns and never rename them, so old and new versions of a service can run side by side during a rolling deploy.",
      "Caching is a bet that data changes less often than it is read, and every cache needs an answer for what happens when that bet is wrong.",
      "Conway's law observes that a system's structure mirrors the communication structure of the organisation that built it, so team boundaries are architecture decisions too.",
      "Choosing boring technology conserves a team's limited budget for novelty, spending it only where the unusual choice buys something the product actually needs.",
    ],
  },
  math: {
    domain: "mathematics and mathematical concepts",
    requirements: "Focus on foundational theorems, calculus, linear algebra, geometry, probability, statistics, number theory, or logic.",
    examples: [
      "Euler's identity connects five fundamental constants: e, i, pi, one, and zero in a single compact equation.",
      "A matrix determinant represents the volume scaling factor of the linear transformation described by that matrix.",
      "Bayes' theorem calculates conditional probability by incorporating prior beliefs alongside new empirical evidence.",
    ],
  },
  science: {
    domain: "scientific principles and discoveries",
    requirements: "Focus on physics, chemistry, biology, genetics, thermodynamics, astronomy, or neuroscience.",
    examples: [
      "Mitochondria are membrane-bound organelles that generate cellular chemical energy via adenosine triphosphate synthesis.",
      "General relativity models gravitational attraction as the geometric curvature of spacetime caused by mass and energy.",
      "The Doppler effect shifts the perceived frequency of sound or light waves when the emitter is moving relative to an observer.",
    ],
  },
  history: {
    domain: "world history and historical milestones",
    requirements: "Focus on significant historical events, treaties, scientific inventions, archaeological discoveries, and civilizations.",
    examples: [
      "The invention of the Gutenberg movable type printing press in 1440 catalyzed the Renaissance and widespread literacy across Europe.",
      "The Magna Carta of 1215 established the fundamental legal principle that the monarch is subject to the rule of law.",
      "The Silk Road was an ancient network of trade routes connecting East Asia with the Mediterranean for over a millennium.",
    ],
  },
  geography: {
    domain: "geography, earth science, and geopolitical regions",
    requirements: "Focus on landforms, oceans, tectonic phenomena, climate zones, biomes, and world geographical landmarks.",
    examples: [
      "The Mariana Trench in the western Pacific Ocean contains Challenger Deep, the deepest known point on Earth.",
      "The Ring of Fire is a major horseshoe-shaped Pacific basin where most of Earth's volcanic eruptions and earthquakes occur.",
      "The Amazon River basin discharges a greater volume of water than the next seven largest rivers combined.",
    ],
  },
  art: {
    domain: "visual art, movements, and techniques",
    requirements: "Focus on art movements, color theory, classical techniques, sculpture, composition, and renowned historical masterpieces.",
    examples: [
      "Chiaroscuro is a classical painting technique utilizing dramatic contrasts between light and dark to sculpt three-dimensional depth.",
      "Impressionism originated in nineteenth-century France, emphasizing visible brushstrokes and accurate depictions of shifting light.",
      "The golden ratio is a mathematical proportion used across classical architecture and painting to produce aesthetic visual harmony.",
    ],
  },
  music: {
    domain: "music theory, acoustics, and composition",
    requirements: "Focus on harmony, scales, counterpoint, rhythm, acoustic properties, orchestration, and structural musical forms.",
    examples: [
      "Equal temperament is a tuning system that divides an octave into twelve equal semitones, enabling modulation into any key.",
      "Counterpoint is the polyphonic relationship between musical lines that are harmonically interdependent yet rhythmically distinct.",
      "The circle of fifths illustrates geometric relationships among the twelve chromatic pitch classes and their respective key signatures.",
    ],
  },
};

/**
 * Each batch is steered toward a random handful of these, so consecutive
 * batches for the same category explore different ground instead of
 * converging on the model's favourite dozen facts.
 */
const CATEGORY_SUBTOPICS = {
  coding: [
    "memory management and garbage collection", "concurrency and race conditions", "compilers and interpreters",
    "networking protocols", "relational database internals", "NoSQL and caching", "cryptography basics",
    "operating system scheduling", "file systems", "distributed systems and consensus", "version control internals",
    "testing strategies", "type systems", "functional programming", "object-oriented design", "sorting and searching",
    "graph algorithms", "dynamic programming", "hashing and probabilistic structures", "HTTP and REST", "browsers and rendering",
    "CPU caches and branch prediction", "floating point arithmetic", "regular expressions and parsing", "security vulnerabilities",
    "containers and virtualisation", "message queues", "API design", "observability and logging", "Unicode and text encoding",
  ],
  architecture: [
    "monolith versus microservices trade-offs", "service boundaries and bounded contexts", "data ownership and shared databases",
    "API versioning and evolution", "schema migration and backward compatibility", "event-driven architecture and messaging",
    "idempotency and retries", "consistency models and eventual consistency", "caching strategy and invalidation",
    "resilience patterns such as circuit breakers and bulkheads", "rate limiting and backpressure", "observability, tracing and SLOs",
    "deployment strategies such as blue-green and canary", "feature flags and release management", "multi-tenancy",
    "authentication and authorization architecture", "secrets and configuration management", "technical debt and refactoring strategy",
    "architecture decision records and documentation", "Conway's law and team topology", "build versus buy decisions",
    "cost awareness and capacity planning", "legacy modernisation and the strangler fig pattern", "modular monoliths and package boundaries",
    "domain-driven design", "CQRS and read models", "queue-based load levelling", "designing for testability", "disaster recovery and backups",
  ],
  math: [
    "number theory and primes", "combinatorics", "probability paradoxes", "statistics and inference", "linear algebra",
    "eigenvalues and transformations", "calculus and limits", "differential equations", "topology", "set theory and infinity",
    "logic and proof techniques", "geometry and trigonometry", "graph theory", "group theory and symmetry", "famous unsolved problems",
    "history of mathematics", "numerical methods", "cryptographic mathematics", "chaos and fractals", "game theory", "optimisation",
    "series and convergence", "complex numbers", "measurement and units",
  ],
  science: [
    "quantum mechanics", "thermodynamics and entropy", "electromagnetism", "particle physics", "astronomy and cosmology",
    "plate tectonics and geology", "cell biology", "genetics and DNA", "evolution", "immunology", "neuroscience",
    "chemistry of bonding", "acids, bases and reactions", "materials science", "climate and atmosphere", "oceanography",
    "microbiology", "ecology", "human anatomy", "optics and light", "sound and waves", "radioactivity", "space exploration",
  ],
  history: [
    "ancient Mesopotamia and Egypt", "classical Greece and Rome", "medieval Europe", "the Islamic Golden Age", "imperial China",
    "pre-Columbian Americas", "African kingdoms", "the Renaissance", "the Age of Exploration", "the Scientific Revolution",
    "the Enlightenment", "the Industrial Revolution", "revolutions and independence movements", "the World Wars", "the Cold War",
    "decolonisation", "history of medicine", "history of technology", "trade routes and economics", "famous treaties and laws",
    "archaeological discoveries", "history of writing and printing", "Australian history", "Pacific and Oceania",
  ],
  geography: [
    "mountain ranges and formation", "rivers and deltas", "deserts", "oceans and currents", "volcanoes and earthquakes",
    "climate zones and biomes", "glaciers and ice sheets", "islands and archipelagos", "population and urbanisation",
    "borders and geopolitics", "natural resources", "coral reefs", "rainforests", "polar regions", "lakes and wetlands",
    "map projections and navigation", "time zones", "agriculture and land use", "natural disasters", "caves and karst",
    "Australia and Oceania", "megacities",
  ],
  art: [
    "Renaissance painting", "Baroque and chiaroscuro", "Impressionism", "Cubism and abstraction", "Surrealism",
    "sculpture techniques", "color theory", "composition and the golden ratio", "printmaking", "photography as art",
    "architecture movements", "Japanese and East Asian art", "Indigenous Australian art", "street art", "art conservation",
    "pigments and materials", "perspective and drawing", "modern and contemporary art", "ceramics and glass", "textile arts",
    "famous forgeries and heists", "iconic individual works",
  ],
  music: [
    "harmony and chord progressions", "scales and modes", "rhythm and meter", "counterpoint", "orchestration and timbre",
    "acoustics and overtones", "tuning systems", "the Baroque era", "Classical and Romantic composers", "jazz improvisation",
    "blues and rock origins", "electronic music and synthesis", "recording and production", "music notation history",
    "world music traditions", "opera", "film scoring", "musical instruments and how they work", "hearing and psychoacoustics",
    "song structure", "minimalism", "music theory terminology",
  ],
};

const STYLE_ANGLES = [
  "a precise definition",
  "how something works mechanically, step by step",
  "a surprising or counterintuitive fact",
  "a concrete quantity or date, kept short and written so it is easy to type",
  "a common misconception and the correction",
  "a comparison between two related ideas",
  "a cause-and-effect relationship",
  "a historical origin or who discovered it",
];

export function sample(list, n) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export const SYSTEM_INSTRUCTION = `You write short educational facts for a typing-practice app. Each fact is typed by a learner, so it must be accurate, self-contained, and pleasant to type.

Quality bar:
- Specific over generic: name the concept, the mechanism, the number, the person, or the trade-off. Never state something vague like "X is important in Y".
- One idea per fact, expressed in one or two plain sentences.
- Vary sentence openings. Do not begin more than one fact in a batch with the same word, and avoid starting facts with "The".
- Plain ASCII punctuation only: no em dashes, no curly quotes, no markdown, no bullet symbols, no numbering, no emoji.
- No questions, no second person, no filler like "Did you know" or "Interestingly".

Typability rules (this text is typed by hand, character by character):
- Write in words. Never include code, identifiers, file paths, URLs, or notation such as O(n), x = y, HTTP/2, AES-256, or IEEE 754. Say "quadratic time", "version two", or "a 256 bit key" instead.
- Numbers only when they are the point, and then short: a year or a small count is fine; never a long decimal, a hash, an address, or a string of more than four digits.
- Avoid symbol characters: no parentheses, slashes, brackets, braces, angle brackets, underscores, pipes, backslashes, percent or ampersand signs. Commas, periods, colons, semicolons, apostrophes and hyphens are fine.`;

export function cleanQuote(quote) {
  if (!quote || typeof quote !== "string") return "";
  let text = quote.trim();
  text = text.replace(/^["']|["']$/g, "");
  text = text.replace(/^\d+[.)]\s*/, "");
  text = text.replace(/^[-*•]\s*/, "");
  text = text.replace(/[`]/g, "");
  text = text.trim();
  return text;
}

/**
 * Prompt config for a topic the user typed in. There is no curated subtopic
 * list, so the model is asked to spread the batch itself, and the quality-bar
 * examples are borrowed from the built-in categories to show the level of
 * specificity rather than the subject.
 */
function customTopicConfig(topic) {
  return {
    domain: topic,
    requirements: `Cover ${topic} broadly: its core concepts, mechanisms, key figures, history, notable results, and common misconceptions. Stay strictly on ${topic}; if the topic is narrow, go deeper rather than drifting to neighbouring subjects.`,
    examples: [
      ...CATEGORY_PROMPT_CONFIG.coding.examples,
      ...CATEGORY_PROMPT_CONFIG.architecture.examples,
    ],
  };
}

const JSON_ARRAY_FORMAT = 'Respond with a raw JSON array of strings only: ["fact 1", "fact 2", ...]';

/**
 * The prompt for one batch of new quotes.
 * @param {string[]} avoid quotes already in the pool; the newest 60 are named
 *   in the prompt so the model covers new ground.
 * @param {{ topic?: string, responseFormat?: string }} options `topic` is a
 *   custom topic's name; `responseFormat` replaces the JSON array instruction.
 * @returns {{ prompt: string, targetCount: number, label: string, examples: string[] }}
 *   `examples` is every quality-bar example for the category, which callers
 *   dedupe against so the model can't satisfy the request by echoing them.
 */
export function buildBatchPrompt(category, count, avoid = [], { topic, responseFormat = JSON_ARRAY_FORMAT } = {}) {
  const targetCount = Math.min(Math.max(count, 1), 20);
  const categoryKey = topic ? category : CATEGORY_PROMPT_CONFIG[category] ? category : "coding";
  const configData = topic ? customTopicConfig(topic) : CATEGORY_PROMPT_CONFIG[categoryKey];

  // Steer each batch toward different subtopics and angles. Without this the
  // same prompt at the same temperature keeps producing the model's favourite
  // handful of facts, which the dedupe then discards, leaving the pool static.
  const subtopicBlock = topic
    ? `Pick ${Math.min(targetCount, 8)} clearly different subtopics within ${topic} and spread the facts across them, no more than two facts per subtopic.`
    : `Spread the facts across these subtopics, at least one fact each and no more than two per subtopic:
${sample(CATEGORY_SUBTOPICS[categoryKey], Math.min(targetCount, 8))
  .map((s) => `- ${s}`)
  .join("\n")}`;
  const angles = sample(STYLE_ANGLES, 4);
  // A few examples show the target level of specificity.
  const examples = sample(configData.examples, 3);
  const examplesHeading = topic
    ? "Quality bar. These are from other subjects; match their level of specificity for your topic:"
    : "Quality bar. Match this level of specificity, but do not reuse these facts or their phrasing:";

  // Naming what's already stored is what actually forces new material. Send
  // the most recent entries; the similarity filter catches the rest.
  const avoidBlock =
    avoid.length > 0
      ? `\n\nALREADY IN THE POOL. Do not restate, reword, or cover the same specific fact as any of these:\n${avoid
          .slice(-60)
          .map((q) => `- ${q}`)
          .join("\n")}`
      : "";

  const prompt = `Write exactly ${targetCount} facts about ${configData.domain}.

Focus: ${configData.requirements}

${subtopicBlock}

Mix these angles across the batch:
${angles.map((a) => `- ${a}`).join("\n")}

${examplesHeading}
${examples.map((e) => `- ${e}`).join("\n")}

Length: 70 to 220 characters each. Every fact must be about a clearly different specific thing from every other fact in the batch.

${responseFormat}${avoidBlock}`;

  return { prompt, targetCount, label: topic ?? categoryKey, examples: configData.examples };
}
