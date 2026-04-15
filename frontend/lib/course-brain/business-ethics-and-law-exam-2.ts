import type { CourseBrain } from "@/types/course-brain";

export const BUSINESS_ETHICS_AND_LAW_EXAM_2_BRAIN: CourseBrain = {
  id: "bel-exam-2",
  version: "2026-04-13",
  courseSlug: "bel",
  courseTitle: "Business Ethics and Law",
  examSlug: "midterm-1",
  examTitle: "Exam 2 Review",
  scopeSummary:
    "Exam 2 covers the March 9-April 16 materials, cases 4-9, and requires students to apply the ethical frameworks across employment, advertising, CSR, ESG, and AI scenarios.",
  focusTopics: [
    "Ethical frameworks and case-based reasoning",
    "U.S. business law foundations and regulators",
    "Employment discrimination and worker protections",
    "Advertising claims, puffery, and FTC unfairness",
    "CSR, ESG, and greenwashing",
    "AI ethics, virtual influencers, and algorithmic bias",
  ],
  sourceMaterials: [
    {
      id: "bel-syllabus",
      title: "Course syllabus",
      kind: "syllabus",
      relativePath: "BE&L/ETHICS.pdf",
      summary:
        "Defines the course around ethical frameworks, business law, case analysis, and current issues like AI ethics, privacy, sustainability, and employee rights.",
      inScope: true,
    },
    {
      id: "bel-exam-announcement",
      title: "Exam 2 announcement",
      kind: "announcement",
      relativePath: "BE&L/exam2announcement.rtf",
      summary:
        "Exam 2 includes all content from March 9 through April 16 plus cases 4-9, and it explicitly requires recall of the ethical frameworks from class.",
      inScope: true,
    },
    {
      id: "bel-lecture-10",
      title: "March 9 lecture: sources of law and business structure",
      kind: "lecture",
      relativePath: "BE&L/lecture10_march9.pptx",
      summary:
        "Introduces sources of law in the US, basic legal structures of business, and the regulatory/legal backdrop for later course applications.",
      inScope: true,
    },
    {
      id: "bel-lecture-march-16",
      title: "March 16 lecture: courts, precedent, and employment discrimination",
      kind: "lecture",
      relativePath: "BE&L/draft_slides_march16.pptx",
      summary:
        "Covers civil versus criminal law, court hierarchy, precedent, and how employment discrimination doctrines sit inside the US legal system.",
      inScope: true,
    },
    {
      id: "bel-lecture-12",
      title: "March 23 lecture: discrimination, OSHA, EEOC, and advertising",
      kind: "lecture",
      relativePath: "BE&L/lecture12_march23.pptx",
      summary:
        "Extends the employment law unit through Title VII, PDA, ADEA, ADA, OSHA, EEOC enforcement, and deceptive advertising rules.",
      inScope: true,
    },
    {
      id: "bel-lecture-13",
      title: "March 30 lecture: pollution, CSR, ESG, and sustainability",
      kind: "lecture",
      relativePath: "BE&L/lecture13_march30(1).pptx",
      summary:
        "Frames pollution, ecological ethics, corporate social responsibility, ESG, and greenwashing as both ethical and business decision problems.",
      inScope: true,
    },
    {
      id: "bel-lecture-14",
      title: "April 13 lecture: AI ethics",
      kind: "lecture",
      relativePath: "BE&L/lecture14_april13.pptx",
      summary:
        "Focuses on AI bias, discrimination, privacy, autonomy, generative AI attribution, and AI legislation, with the exam scope reaffirmed.",
      inScope: true,
    },
    {
      id: "bel-practice-questions",
      title: "Practice questions",
      kind: "practice_questions",
      relativePath: "BE&L/Practice Questions for Final Exam.pdf",
      summary:
        "Shows the expected exam style: mixed multiple choice, short answer, and mini-case analysis around FTC deception, due care, employment law, ESG, and AI marketing ethics.",
      inScope: true,
    },
    {
      id: "bel-employment-vignettes",
      title: "Employment Vignettes",
      kind: "case",
      relativePath: "BE&L/Employment Vignettes.pdf",
      summary:
        "Provides concrete discrimination scenarios around pregnancy, disability, age, and national origin, emphasizing pretext, accommodation, and evidentiary reasoning.",
      inScope: true,
    },
    {
      id: "bel-danone",
      title: "Danone: Redefining Corporate Responsibility",
      kind: "case",
      relativePath: "BE&L/Danone_ Redefining Corporate Responsibility.pdf",
      summary:
        "Explores B Corp certification, stakeholder purpose, and whether large multinationals can credibly balance profit with social and environmental commitments.",
      inScope: true,
    },
    {
      id: "bel-etsy",
      title: "Etsy: Keeping it Real by Keeping Taxes Low",
      kind: "case",
      relativePath: "BE&L/Etsy_ Keeping it Real by Keeping Taxes Low.pdf",
      summary:
        "Tests the tension between profit-maximization, public values, corporate authenticity, and whether a socially responsible brand can defend aggressive tax strategy.",
      inScope: true,
    },
    {
      id: "bel-fairphone",
      title: "Fairphone: Dialing Up Sustainability in Smartphones",
      kind: "case",
      relativePath: "BE&L/Fairphone_ Dialing Up Sustainability in Smartphones.pdf",
      summary:
        "Examines sustainable design, right-to-repair, social enterprise constraints, and the tradeoff between mission purity and scaling impact.",
      inScope: true,
    },
    {
      id: "bel-mastercard",
      title: "Mastercard's Ethical Approach to Governing AI",
      kind: "case",
      relativePath: "BE&L/Mastercard's Ethical Approach to Governing AI.pdf",
      summary:
        "Shows AI governance in practice through privacy by design, data responsibility, consumer trust, and organizational tradeoffs around AI use.",
      inScope: true,
    },
    {
      id: "bel-clueless",
      title: "The Clueless: Navigating an Ethical AI Marketing Dilemma",
      kind: "case",
      relativePath: "BE&L/The Clueless_ Navigating an Ethical AI Marketing Dilemma.pdf",
      summary:
        "Centers AI-generated virtual influencer marketing, anthropomorphism, manipulation, transparency, authenticity, and bias concerns.",
      inScope: true,
    },
  ],
  concepts: [
    {
      id: "bel-ethical-frameworks",
      label: "Ethical frameworks and moral reasoning",
      summary:
        "Students must apply utilitarianism, rights and duties, justice, virtue ethics, and care-based reasoning when analyzing short answers and cases.",
      masteryHint:
        "Strong answers compare more than one framework and justify why one leads to the better judgment in the facts at hand.",
      focusTags: ["ethical frameworks", "moral reasoning", "case-based reasoning"],
      sourceIds: ["bel-syllabus", "bel-exam-announcement", "bel-practice-questions"],
      caseIds: [
        "bel-case-danone",
        "bel-case-etsy",
        "bel-case-fairphone",
        "bel-case-mastercard",
        "bel-case-clueless",
      ],
      relatedConceptIds: [
        "bel-business-law-foundations",
        "bel-ftc-advertising",
        "bel-csr-esg",
        "bel-ai-governance",
      ],
      suggestedBloomTargets: ["remember", "understand", "apply", "analyze"],
      x: 18,
      y: 22,
    },
    {
      id: "bel-business-law-foundations",
      label: "Business law foundations, courts, and regulators",
      summary:
        "The exam expects students to know sources of law, civil versus criminal law, precedent, court hierarchy, and how agencies like the FTC, EEOC, and OSHA operate in business regulation.",
      masteryHint:
        "Be able to move from rule source to institution: what kind of law, which regulator or court, and why that matters in the scenario.",
      focusTags: ["business law foundations", "regulators", "courts", "sources of law"],
      sourceIds: ["bel-lecture-10", "bel-lecture-march-16", "bel-lecture-12"],
      caseIds: ["bel-case-employment-vignettes", "bel-case-mastercard"],
      relatedConceptIds: [
        "bel-employment-discrimination",
        "bel-osha-rights",
        "bel-ftc-advertising",
      ],
      suggestedBloomTargets: ["remember", "understand", "apply"],
      x: 42,
      y: 18,
    },
    {
      id: "bel-employment-discrimination",
      label: "Employment discrimination law and worker protections",
      summary:
        "Students need to spot discrimination issues under Title VII, PDA, ADEA, ADA, and GINA, including accommodation, pretext, and evidentiary patterns in fact scenarios.",
      masteryHint:
        "The best answers name the statute, identify the protected status or disability issue, and point to the specific facts that suggest discriminatory motive or failed accommodation.",
      focusTags: [
        "employment discrimination",
        "worker protections",
        "title vii",
        "pda",
        "adea",
        "ada",
        "gina",
      ],
      sourceIds: ["bel-lecture-march-16", "bel-lecture-12", "bel-employment-vignettes"],
      caseIds: ["bel-case-employment-vignettes"],
      relatedConceptIds: ["bel-business-law-foundations", "bel-osha-rights"],
      suggestedBloomTargets: ["understand", "apply", "analyze"],
      x: 68,
      y: 24,
    },
    {
      id: "bel-osha-rights",
      label: "OSHA and workplace safety rights",
      summary:
        "The safety unit focuses on the right to a safe workplace, right-to-know rules, training, protective equipment, inspections, and anti-retaliation principles.",
      masteryHint:
        "Students should connect OSHA questions to concrete employer duties, not just a vague idea that safety matters.",
      focusTags: ["osha", "workplace safety", "right-to-know", "employee safety rights"],
      sourceIds: ["bel-lecture-12"],
      caseIds: [],
      relatedConceptIds: ["bel-business-law-foundations", "bel-employment-discrimination"],
      suggestedBloomTargets: ["remember", "understand", "apply"],
      x: 84,
      y: 46,
    },
    {
      id: "bel-ftc-advertising",
      label: "FTC advertising claims, deception, and due care",
      summary:
        "Students must distinguish objective claims from subjective claims, identify puffery versus deception, and explain unfairness, substantiation, endorsements, and due-care obligations to consumers.",
      masteryHint:
        "The recurring exam move is: classify the claim, explain whether evidence is required, then evaluate the ethical due-care issue separately from bare legality.",
      focusTags: [
        "advertising claims",
        "puffery",
        "ftc unfairness",
        "deceptive advertising",
        "due care",
      ],
      sourceIds: ["bel-lecture-12", "bel-practice-questions"],
      caseIds: ["bel-case-clueless"],
      relatedConceptIds: [
        "bel-ethical-frameworks",
        "bel-ai-marketing",
        "bel-csr-esg",
      ],
      suggestedBloomTargets: ["understand", "apply", "analyze"],
      x: 70,
      y: 72,
    },
    {
      id: "bel-csr-esg",
      label: "CSR, ESG, stakeholder fairness, and greenwashing",
      summary:
        "The sustainability unit asks students to reason about CSR types, ESG variability, B Corp legitimacy, tradeoffs in scaling ethical business, and when sustainability claims become reputational theater.",
      masteryHint:
        "Students do best when they separate measurement issues from moral evaluation: ESG scores are imperfect signals, not moral truth by themselves.",
      focusTags: ["csr", "esg", "greenwashing", "stakeholder", "sustainability"],
      sourceIds: ["bel-lecture-13", "bel-practice-questions", "bel-danone", "bel-fairphone", "bel-etsy"],
      caseIds: [
        "bel-case-danone",
        "bel-case-etsy",
        "bel-case-fairphone",
      ],
      relatedConceptIds: [
        "bel-ethical-frameworks",
        "bel-ftc-advertising",
        "bel-ai-governance",
      ],
      suggestedBloomTargets: ["understand", "apply", "analyze"],
      x: 42,
      y: 80,
    },
    {
      id: "bel-ai-marketing",
      label: "AI marketing, virtual influencers, and anthropomorphism",
      summary:
        "The marketing AI unit focuses on virtual influencers, anthropomorphism, authenticity, transparency, manipulation, and the ethics of persuasive AI personas.",
      masteryHint:
        "Good answers explain why lifelike design changes consumer trust and vulnerability instead of treating the AI influencer as just another ad tool.",
      focusTags: [
        "ai ethics",
        "virtual influencers",
        "anthropomorphism",
        "ai marketing",
      ],
      sourceIds: ["bel-clueless", "bel-practice-questions"],
      caseIds: ["bel-case-clueless"],
      relatedConceptIds: ["bel-ftc-advertising", "bel-ai-governance"],
      suggestedBloomTargets: ["understand", "apply", "analyze"],
      x: 18,
      y: 70,
    },
    {
      id: "bel-ai-governance",
      label: "AI bias, privacy, autonomy, and accountability",
      summary:
        "The AI governance material covers bias in training data and algorithms, privacy risks, loss of autonomy, attribution, intellectual property complexity, and responsibility for AI-driven harm.",
      masteryHint:
        "Students should separate types of AI risk: bias, privacy, autonomy, and attribution are related but not interchangeable.",
      focusTags: ["algorithmic bias", "privacy", "autonomy", "ai governance", "accountability"],
      sourceIds: ["bel-lecture-14", "bel-mastercard", "bel-clueless"],
      caseIds: ["bel-case-mastercard", "bel-case-clueless"],
      relatedConceptIds: ["bel-ai-marketing", "bel-csr-esg", "bel-ethical-frameworks"],
      suggestedBloomTargets: ["understand", "apply", "analyze"],
      x: 12,
      y: 46,
    },
  ],
  conceptEdges: [
    { id: "bel-edge-ethics-law", source: "bel-ethical-frameworks", target: "bel-business-law-foundations", strength: 0.82 },
    { id: "bel-edge-ethics-employment", source: "bel-ethical-frameworks", target: "bel-employment-discrimination", strength: 0.88 },
    { id: "bel-edge-ethics-ftc", source: "bel-ethical-frameworks", target: "bel-ftc-advertising", strength: 0.86 },
    { id: "bel-edge-ethics-csr", source: "bel-ethical-frameworks", target: "bel-csr-esg", strength: 0.86 },
    { id: "bel-edge-ethics-ai-marketing", source: "bel-ethical-frameworks", target: "bel-ai-marketing", strength: 0.8 },
    { id: "bel-edge-ethics-ai-governance", source: "bel-ethical-frameworks", target: "bel-ai-governance", strength: 0.82 },
    { id: "bel-edge-law-employment", source: "bel-business-law-foundations", target: "bel-employment-discrimination", strength: 0.72 },
    { id: "bel-edge-law-osha", source: "bel-business-law-foundations", target: "bel-osha-rights", strength: 0.7 },
    { id: "bel-edge-law-ftc", source: "bel-business-law-foundations", target: "bel-ftc-advertising", strength: 0.76 },
    { id: "bel-edge-ftc-ai-marketing", source: "bel-ftc-advertising", target: "bel-ai-marketing", strength: 0.68 },
    { id: "bel-edge-ai-marketing-ai-governance", source: "bel-ai-marketing", target: "bel-ai-governance", strength: 0.84 },
    { id: "bel-edge-csr-ai-governance", source: "bel-csr-esg", target: "bel-ai-governance", strength: 0.54 },
  ],
  cases: [
    {
      id: "bel-case-employment-vignettes",
      title: "Employment Vignettes",
      summary:
        "A cluster of discrimination scenarios around pregnancy, disability, age, and national origin that rewards statutory spotting and evidence-based analysis.",
      ethicalDilemma:
        "Whether employers can defend decisions as neutral business judgments when the facts also point to protected-status bias, accommodation failure, or pretext.",
      sourceId: "bel-employment-vignettes",
      relatedConceptIds: [
        "bel-business-law-foundations",
        "bel-employment-discrimination",
      ],
    },
    {
      id: "bel-case-danone",
      title: "Danone",
      summary:
        "A multinational tries to scale B Corp certification and stake a claim to balancing profit with social progress.",
      ethicalDilemma:
        "Whether large-scale CSR and certification can remain substantive rather than becoming mostly reputational value.",
      sourceId: "bel-danone",
      relatedConceptIds: ["bel-ethical-frameworks", "bel-csr-esg"],
    },
    {
      id: "bel-case-etsy",
      title: "Etsy",
      summary:
        "A values-driven company faces backlash for adopting an Irish tax structure that may lower its effective tax burden.",
      ethicalDilemma:
        "Whether a company that markets authenticity and social purpose can justify aggressive tax strategy as ordinary fiduciary behavior.",
      sourceId: "bel-etsy",
      relatedConceptIds: ["bel-ethical-frameworks", "bel-csr-esg"],
    },
    {
      id: "bel-case-fairphone",
      title: "Fairphone",
      summary:
        "An ethical smartphone maker tries to scale impact through sustainability, repairability, and fair sourcing while remaining commercially viable.",
      ethicalDilemma:
        "How much compromise is acceptable when scaling a mission-driven company in a market dominated by performance and price competition.",
      sourceId: "bel-fairphone",
      relatedConceptIds: ["bel-ethical-frameworks", "bel-csr-esg"],
    },
    {
      id: "bel-case-mastercard",
      title: "Mastercard",
      summary:
        "A payments company operationalizes AI governance through privacy-by-design, data responsibility, and organizational review.",
      ethicalDilemma:
        "How to use AI aggressively enough to compete while still preserving consumer trust, minimizing data collection, and respecting governance commitments.",
      sourceId: "bel-mastercard",
      relatedConceptIds: [
        "bel-business-law-foundations",
        "bel-ai-governance",
      ],
    },
    {
      id: "bel-case-clueless",
      title: "The Clueless",
      summary:
        "An AI agency uses a virtual influencer to drive engagement and must confront manipulation, transparency, and authenticity concerns.",
      ethicalDilemma:
        "Whether AI-generated persuasion crosses from efficient marketing into manipulative design that undermines consumer autonomy and trust.",
      sourceId: "bel-clueless",
      relatedConceptIds: [
        "bel-ftc-advertising",
        "bel-ai-marketing",
        "bel-ai-governance",
      ],
    },
  ],
  misconceptions: [
    {
      id: "bel-misconception-puffery",
      conceptId: "bel-ftc-advertising",
      misconception: "Any exaggerated ad language counts as puffery.",
      correction:
        "Only broad subjective claims are puffery; objective and measurable claims still require substantiation and can be deceptive.",
    },
    {
      id: "bel-misconception-esg",
      conceptId: "bel-csr-esg",
      misconception: "An ESG score is a definitive moral verdict on a company.",
      correction:
        "ESG ratings vary by methodology and should be interpreted as contested measurements, not unquestionable ethical truth.",
    },
    {
      id: "bel-misconception-title-vii",
      conceptId: "bel-employment-discrimination",
      misconception: "Discrimination cases only matter if there is direct evidence or an explicit slur.",
      correction:
        "Circumstantial evidence, comparative treatment, accommodation patterns, and suspicious post-layoff hiring can all support a discrimination claim.",
    },
    {
      id: "bel-misconception-ai-bias",
      conceptId: "bel-ai-governance",
      misconception: "AI bias only comes from bad data.",
      correction:
        "Bias can arise from training data, feature weighting, developer choices, deployment context, and feedback loops.",
    },
    {
      id: "bel-misconception-anthropomorphism",
      conceptId: "bel-ai-marketing",
      misconception: "Anthropomorphism is just cosmetic design, so it has no ethical importance.",
      correction:
        "Human-like design changes trust, attachment, and vulnerability, which is exactly why it matters in marketing ethics.",
    },
  ],
  questionArchetypes: [
    {
      id: "bel-archetype-ftc-mcq",
      label: "FTC claim classification multiple choice",
      format: "multiple_choice",
      description:
        "Classify whether a claim is subjective, objective, puffery, deceptive, or unfair, then explain why evidence or due care matters.",
      conceptIds: ["bel-ftc-advertising", "bel-ethical-frameworks"],
      sourceId: "bel-practice-questions",
    },
    {
      id: "bel-archetype-employment-mcq",
      label: "Employment statute spotting multiple choice",
      format: "multiple_choice",
      description:
        "Match a vignette to the right federal employment statutes and identify what factual pattern makes the claim legally significant.",
      conceptIds: [
        "bel-business-law-foundations",
        "bel-employment-discrimination",
      ],
      sourceId: "bel-practice-questions",
    },
    {
      id: "bel-archetype-short-answer-frameworks",
      label: "Short answer ethical framework application",
      format: "short_answer",
      description:
        "Explain a concept or case by naming at least two frameworks and showing how each evaluates the decision differently.",
      conceptIds: ["bel-ethical-frameworks", "bel-csr-esg", "bel-ai-marketing"],
      sourceId: "bel-practice-questions",
    },
    {
      id: "bel-archetype-ai-marketing",
      label: "AI marketing ethics and autonomy",
      format: "short_answer",
      description:
        "Explain why anthropomorphism, manipulation, or hyper-personalization matters ethically in AI-driven persuasion.",
      conceptIds: ["bel-ai-marketing", "bel-ai-governance"],
      sourceId: "bel-practice-questions",
    },
    {
      id: "bel-archetype-mini-case",
      label: "Mini-case due care analysis",
      format: "mini_case",
      description:
        "Distinguish puffery from deception, then evaluate whether the company met its ethical obligations to consumers from a due-care perspective.",
      conceptIds: ["bel-ftc-advertising", "bel-ethical-frameworks"],
      sourceId: "bel-practice-questions",
    },
  ],
  tutorProfile: {
    answerStyle: [
      "Anchor every explanation in the active course materials and exam framing.",
      "Prefer side-by-side reasoning: legal rule, ethical framework, then judgment.",
      "Keep explanations concrete and case-linked instead of generic.",
    ],
    boundaries: [
      "Stay course-only by default for exam prep.",
      "If the requested fact is not in the course brain, say it is outside the current course materials instead of guessing.",
      "Do not replace case analysis with generic corporate ethics commentary.",
    ],
    emphasis: [
      "Help the student classify the problem type before answering.",
      "Push the student to compare frameworks, not just name them.",
      "Treat confusion as a sign to slow down and show how the concept appears in a course-style scenario.",
    ],
  },
};
