/**
 * The quote-generation prompt, shared by the app (quoteGenerator.js) and the
 * offline seeding script (scripts/seed-free-quotes.mjs). No imports, so Node
 * can load it as-is.
 */

// Every example sets the quality bar in the prompt, so each one has to teach:
// it names a specific technique, mechanism or result and says why it works,
// what it costs, or what it beats. No who-coined-it trivia, no definitions of
// familiar things, no dates for their own sake. Deliberately varied in opening
// word, angle and subfield. This is a typing app, so everything is in words:
// no digit runs, no code tokens, no symbols like O(n) or version numbers.
export const CATEGORY_PROMPT_CONFIG = {
  ai: {
    domain: "artificial intelligence and machine learning",
    requirements: "Teach how modern AI systems actually work: the specific techniques inside neural networks, training, language models, evaluation and safety, and why each one works or what it trades away. Write for someone who already knows that models learn from data and wants the next layer down. Skip hype, predictions, and who named what.",
    examples: [
      "Reverse-mode automatic differentiation gets every weight's gradient from one forward and one backward pass, whereas forward mode would need a separate pass for each weight.",
      "Mel-frequency cepstral coefficients describe each short slice of speech on a pitch scale that is fine at low frequencies and coarse at high ones, matching how human hearing resolves sound.",
      "Language models read text as tokens, chunks of a few characters each, which is why they can stumble when asked to count the letters in a word.",
      "A held-out test set is only trustworthy while nobody tunes against it; once results steer design choices, it quietly becomes part of the training process.",
      "Attention compares every token with every other token, so doubling the context length roughly quadruples that work, which is why long context windows are expensive.",
      "Residual connections add a layer's input straight to its output, giving gradients a direct path back through hundreds of layers instead of fading at every step.",
      "Mixture of experts models send each token through only a few of their many feed-forward blocks, so total parameters can grow far faster than the compute spent per token.",
      "Diffusion models learn to remove a little noise at a time, so generating an image means starting from pure static and repeating that denoising step many times.",
      "Reward hacking is when a model scores highly on its reward without doing the intended task, like a boat racing agent that circles forever collecting bonus targets instead of finishing.",
      "Key-value caching keeps each token's attention keys and values during generation, so producing the next token costs one new row of work instead of reprocessing the whole prompt.",
      "Contrastive training pulls matching image and caption pairs together in embedding space and pushes mismatched pairs apart, so a model learns to search images by text without labelled categories.",
    ],
  },
  coding: {
    domain: "programming and computer science",
    requirements: "Teach how programming tools, algorithms, data structures, networks and databases work under the surface, and the practical consequence for someone writing code: why something is fast or slow, safe or risky, and what it trades away.",
    examples: [
      "A JavaScript promise settles exactly once; any later attempt to resolve or reject it is silently ignored rather than raising an error.",
      "Git identifies every commit, tree and file by a hash of its contents, so identical files are stored once no matter how many branches reference them.",
      "Quicksort is fast on average but slows to quadratic time when the pivot is always the smallest or largest element, which is why many implementations choose it at random.",
      "Floating point numbers cannot represent most decimal fractions exactly, so adding one tenth to two tenths in most languages gives a result a hair above three tenths.",
      "TCP slow start doubles the sending window every round trip until a packet is lost, which is why short downloads on a fresh connection rarely reach the link's full speed.",
      "When a distributed database loses contact between its nodes, it must choose between serving possibly stale data and refusing to answer at all.",
      "Database indexes speed up reads by maintaining a sorted tree over the indexed columns, but every insert and update must now also rewrite that tree.",
      "Bloom filters answer membership questions in constant time with no false negatives, at the cost of occasional false positives and no way to remove an element.",
      "Contrary to a common belief, the Python interpreter lock does not stop threads from overlapping network or disk work; it only serialises the execution of bytecode.",
      "Building a database query by pasting user input into its text lets an attacker rewrite the query, which parameterised statements prevent by sending data separately from code.",
      "Modern processors guess the outcome of each branch so the pipeline can keep fetching, and a wrong guess throws away roughly fifteen to twenty cycles of speculative work.",
      "Generational garbage collectors bet that most objects die young, so they sweep a small nursery of new objects often and leave the long-lived heap alone.",
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
    requirements: "Teach why mathematical results are true and what they explain: the key idea behind a proof, why a counterintuitive result happens, or what a concept lets you do. Cover probability, statistics, linear algebra, calculus, number theory, geometry and logic. Never just state that a theorem exists.",
    examples: [
      "A test that is ninety-nine percent accurate for a disease one person in a thousand has still returns mostly false positives, because errors among the healthy majority outnumber the real cases.",
      "Cantor's diagonal argument shows the real numbers cannot be listed: any proposed list misses the number built by changing the nth digit of the nth entry.",
      "Eigenvectors are the directions a matrix only stretches and never rotates, which is why applying the matrix over and over lines almost any vector up with the dominant one.",
      "The central limit theorem explains why bell curves are everywhere: adding up many small independent effects gives a normal distribution almost regardless of how each effect is spread.",
      "The birthday paradox works because what grows quickly is the number of pairs, not people: twenty-three people form two hundred and fifty-three pairs, each a chance to share a birthday.",
      "A matrix's determinant is the factor by which it scales area or volume, so a determinant of zero means the transformation flattens space and cannot be undone.",
      "Euclid proved there are infinitely many primes by multiplying any finite list of them and adding one, giving a number that no prime on the list divides.",
      "Benford's law predicts that about thirty percent of numbers in many real data sets start with a one, because quantities that grow by multiplying linger longest at low leading digits.",
      "Simpson's paradox occurs when a trend in every subgroup reverses in the combined data, because the groups differ in size and in a hidden factor that drives the outcome.",
    ],
  },
  science: {
    domain: "scientific principles and discoveries",
    requirements: "Teach the mechanism behind natural phenomena in physics, chemistry, biology, genetics, astronomy and neuroscience: why something happens, not just what it is called. Prefer explanations of everyday observations and surprising consequences over textbook definitions.",
    examples: [
      "Mitochondria carry their own small genome, inherited only from the mother, because they descend from bacteria that an ancestral cell engulfed rather than digested.",
      "Air scatters short blue wavelengths far more strongly than long red ones, so the sky looks blue, and sunsets turn red when sunlight crosses so much air that the blue is scattered away.",
      "Enzymes speed reactions by lowering the energy barrier to get them started, not by changing how much energy they release, so they cannot make an unfavourable reaction run on its own.",
      "Ice floats because hydrogen bonds lock water molecules into an open hexagonal lattice that takes up more room than the liquid, which stops lakes freezing solid from the bottom up.",
      "Bacteria can pass antibiotic resistance genes to unrelated species on small rings of DNA called plasmids, which is why resistance spreads faster than ordinary inheritance would allow.",
      "Stars burn steadily for billions of years because fusion regulates itself: if the core heats up, it expands and cools, slowing the reactions back down.",
      "Neurons signal along their length electrically but across the gap to the next cell chemically, which is why drugs that mimic or block neurotransmitters can change mood.",
      "Clocks run slower deeper in a gravity well, so satellite navigation would drift by kilometres a day if its orbiting clocks were not corrected for general relativity.",
      "Vaccines work because memory cells left by a first exposure let the immune system respond in days rather than weeks, before a pathogen can multiply enough to cause serious illness.",
    ],
  },
  history: {
    domain: "world history",
    requirements: "Teach why things happened and what they changed: the causes behind events, the mechanisms by which inventions, institutions and trade reshaped societies, and the consequences people at the time did not expect. A date or a name is context, never the point.",
    examples: [
      "Printing made the Reformation hard to suppress: Luther's pamphlets could be reset and reprinted in a new town faster than the authorities could find and burn the copies.",
      "The Black Death raised wages across western Europe by killing so many labourers that survivors could demand more, which loosened the serfdom that tied peasants to the land.",
      "Bills of exchange let medieval merchants move money across Europe without carrying coin, by having a banker in one city promise payment through a partner in another.",
      "Few goods or people ever travelled the whole Silk Road; it worked as a relay of local traders, each carrying goods one stage before selling them on.",
      "Mesopotamia's earliest writing records grain, livestock and labour, showing that writing grew out of bookkeeping long before anyone used it for stories or laws.",
      "Magna Carta was annulled within months of being sealed, and it mattered because later kings reissued it so often that it became the standard proof that rulers were bound by law.",
      "Andean and Mexican silver flowed to China in the sixteenth century because Ming tax reforms demanded payment in silver, making it the one thing Europeans could trade for silk and porcelain.",
      "Britain industrialised first partly because its coal lay close to the surface and its wages were high, which made machines that replaced labour unusually worth building there.",
    ],
  },
  geography: {
    domain: "geography and earth science",
    requirements: "Teach why the physical world is shaped the way it is: the processes behind landforms, climate, oceans, rivers, plate tectonics, and where people live. Explain the cause behind a place, not just its record or location.",
    examples: [
      "Deserts cluster near thirty degrees latitude because air that rose at the equator sinks there, warming and drying out as it descends.",
      "Mountains make rain shadows: moist air cools and drops its rain climbing the windward slope, so one side of a range can be rainforest while the other is desert.",
      "Volcanoes line up along subduction zones because the sinking plate releases water into the mantle above it, lowering the melting point of the rock until it becomes magma.",
      "Coastlines get longer the more closely you measure them, because a finer ruler follows smaller bays and headlands, so any stated coastline length depends on the scale used.",
      "Mercator maps keep angles true, so a straight line is a constant compass bearing, at the cost of drawing Greenland as large as Africa, which is about fourteen times bigger.",
      "Glaciers carve U-shaped valleys while rivers carve V-shaped ones, because ice grinds the whole floor and sides at once instead of cutting down along a narrow channel.",
      "The Dead Sea is so salty because nothing flows out of it: water leaves only by evaporation, which carries none of the dissolved minerals away.",
      "Coral reefs thrive in clear, nutrient-poor water because algae inside the coral feed it through sunlight, and fertiliser runoff lets faster-growing seaweed smother the reef.",
    ],
  },
  art: {
    domain: "visual art and its techniques",
    requirements: "Teach how art is made and why it works on the viewer: the techniques, materials and visual tricks artists use, and the practical reasons movements and styles changed. Explain the effect and its cause rather than labelling a style or listing famous works.",
    examples: [
      "Renaissance painters made distant hills recede by painting them paler and bluer, copying the way air scatters light over long distances, a trick called atmospheric perspective.",
      "Impressionists could paint outdoors because paint was newly sold in portable metal tubes, letting them chase changing light instead of grinding pigments in a studio.",
      "Ultramarine was ground from lapis lazuli shipped from Afghanistan and could cost more than gold, so patrons wrote into contracts exactly where a painter had to use it.",
      "Fresco lasts for centuries because pigment brushed onto wet lime plaster is locked in as the lime hardens, so the painter must finish each day's patch before it dries.",
      "Complementary colours placed side by side make each other look more intense, which is why Van Gogh set orange stars and lamps against deep blue skies.",
      "Cubists painted objects from several viewpoints at once, breaking with the single fixed eye of linear perspective that had ruled Western painting since the Renaissance.",
      "Lost-wax casting lets a sculptor model in soft wax, coat it in clay, melt the wax out and pour bronze into the hollow, so fine detail survives into hard metal.",
      "Forgers are often caught by their materials rather than their brushwork, such as titanium white in a supposed old master, a pigment not sold until the twentieth century.",
    ],
  },
  music: {
    domain: "music theory, acoustics, and composition",
    requirements: "Teach why music works the way it does: the acoustics behind harmony and timbre, why chords and rhythms create tension and release, how instruments produce their sound, and the craft decisions of composers and producers. Explain the reason, not just the term.",
    examples: [
      "Equal temperament makes every key sound alike by giving each semitone an identical ratio, at the cost of leaving every interval except the octave slightly out of tune with pure harmonics.",
      "A clarinet sounds hollow because its cylindrical bore, closed at the reed end, favours odd-numbered harmonics, while an oboe's conical bore produces the full series.",
      "A dominant seventh chord pulls toward home because it contains a tritone whose two notes each sit a semitone away from a note of the tonic chord.",
      "Swing divides each beat unevenly, making the first eighth note longer than the second, which is why jazz written as straight eighths is not played that way.",
      "Compressors turn down only the loudest moments of a vocal, which lets the whole track be turned up so quiet syllables stay audible over the band.",
      "Two notes an octave apart sound like versions of the same note because the higher one vibrates exactly twice as fast, so every one of its harmonics lines up with the lower note's.",
      "Baroque composers often wrote only a bass line with figures showing the harmony, trusting the keyboard player to improvise the chords above it.",
      "Two slightly mistuned notes interfere and produce a slow throbbing called beating, and musicians tune by ear by adjusting until that throbbing disappears.",
    ],
  },
};

/**
 * Each batch is steered toward a random handful of these, so consecutive
 * batches for the same category explore different ground instead of
 * converging on the model's favourite dozen facts.
 */
const CATEGORY_SUBTOPICS = {
  ai: [
    "neural network basics", "gradient descent and optimisers", "backpropagation", "transformers and attention",
    "tokenisation", "embeddings and vector search", "pretraining and scaling", "fine-tuning and instruction tuning",
    "reinforcement learning", "reinforcement learning from human feedback", "evaluation and benchmarks",
    "overfitting and regularisation", "computer vision and convolutional networks", "diffusion and image generation",
    "speech recognition and synthesis", "recommendation systems", "decision trees and classical machine learning",
    "hallucination and factuality", "alignment and AI safety", "interpretability", "bias and fairness",
    "AI agents and tool use", "retrieval augmented generation", "hardware and GPUs for training",
    "why the AI winters happened and what ended them", "how chess and Go engines search and evaluate positions", "data quality and labelling",
  ],
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
    "the key idea behind famous proofs", "numerical methods", "cryptographic mathematics", "chaos and fractals", "game theory", "optimisation",
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
    "how forgeries are detected", "how specific famous works achieve their effect",
  ],
  music: [
    "harmony and chord progressions", "scales and modes", "rhythm and meter", "counterpoint", "orchestration and timbre",
    "acoustics and overtones", "tuning systems", "the Baroque era", "Classical and Romantic composers", "jazz improvisation",
    "blues and rock origins", "electronic music and synthesis", "recording and production", "music notation history",
    "world music traditions", "opera", "film scoring", "musical instruments and how they work", "hearing and psychoacoustics",
    "song structure", "minimalism", "why common chord progressions work",
  ],
};

// Every angle carries a "why" or a "compared to what". Angles like "a precise
// definition", "a date" or "who discovered it" produced trivia and glossary
// entries, so they are gone.
const STYLE_ANGLES = [
  "why a named technique or idea works: the mechanism that makes it effective",
  "a trade-off: what an approach gains and what it gives up",
  "two related approaches contrasted, and when each one wins",
  "a non-obvious consequence or failure mode of something familiar",
  "a common misconception, corrected by the actual mechanism",
  "the specific problem a named technique or institution was created to solve",
  "a cause and its effect, including the step that connects them",
  "a number that explains a design choice or an outcome, never a number for its own sake",
];

export function sample(list, n) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export const SYSTEM_INSTRUCTION = `You write short educational facts for a typing-practice app. Each fact is typed by a learner, so it must be accurate, self-contained, and pleasant to type. Above all, every fact must teach the reader something.

What teaching means:
- Write for a curious reader who already knows the basics of the subject. Skip anything they would already know or could guess.
- Name a specific technique, mechanism, result or phenomenon by its real name, then say why it works, what problem it solves, what it trades away, or how it differs from the obvious alternative. That "why" or "compared to what" is the lesson; without it the fact is only a definition.
- Test every fact before keeping it: after typing it, could the reader explain something new to a friend, or reason about a case the fact never mentioned? If not, replace it.
- Only state what you are sure is correct. If you are unsure of a detail, choose a different fact.

Too shallow, never write facts like these:
- "John McCarthy coined the term artificial intelligence in 1955." Trivia: who named something, or when, teaches nothing about the subject.
- "Tool-using AI agents parse model outputs into command calls, run them, and read back the results." Describes what a familiar thing does, with no insight into why or how well.
- "Hallucinations occur because language models minimise next-token prediction loss rather than verifying facts." A popular one-line explanation the reader has already heard, dressed in technical words.
- "Mitochondria are organelles that generate chemical energy for the cell." A textbook definition with no mechanism or consequence.

Quality bar:
- Specific over generic: name the concept, the mechanism, the number, or the trade-off. Never state something vague like "X is important in Y" or "X revolutionised Y".
- Dates and names are context at most, never the point of a fact.
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
    requirements: `Teach ${topic} beyond the basics: how its core mechanisms and techniques work, why they work, the trade-offs between approaches, notable results, and common misconceptions. Stay strictly on ${topic}; if the topic is narrow, go deeper rather than drifting to neighbouring subjects.`,
    examples: Object.values(CATEGORY_PROMPT_CONFIG).flatMap((c) => c.examples),
  };
}

// How many stored quotes a prompt names, enough to cover a whole seeded free
// pool. At about 40 tokens each that is up to 12k tokens of prompt; the app's
// paid pools hold a few dozen, so its refills stay small.
const MAX_AVOID = 300;

const JSON_ARRAY_FORMAT ='Respond with a raw JSON array of strings only: ["fact 1", "fact 2", ...]';

/**
 * The prompt for one batch of new quotes.
 * @param {string[]} avoid quotes already in the pool; the newest MAX_AVOID
 *   are named in the prompt so the model covers new ground.
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
  // A few examples show the target depth: a named thing plus why it works.
  const examples = sample(configData.examples, 4);
  const examplesHeading = topic
    ? "Quality bar. These are from other subjects; each names a specific thing and explains why it works or what it trades away. Match that depth for your topic:"
    : "Quality bar. Each of these names a specific thing and explains why it works or what it trades away. Match that depth, but do not reuse these facts or their phrasing:";

  // Naming what's already stored is what actually forces new material. The
  // similarity filter only catches near-verbatim copies, so a fact left off
  // this list tends to come back reworded.
  const avoidBlock =
    avoid.length > 0
      ? `\n\nALREADY IN THE POOL. Do not restate, reword, or cover the same specific fact as any of these:\n${avoid
          .slice(-MAX_AVOID)
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
