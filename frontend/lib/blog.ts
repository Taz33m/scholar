export interface BlogPrinciple {
  title: string;
  body: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  publishedAt: string;
  readTimeMinutes: number;
  authorName: string;
  tags: string[];
  intro: string[];
  principles: BlogPrinciple[];
  practiceTakeaways: string[];
  closing: string;
}

const blogDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const blogPosts: BlogPost[] = [
  {
    slug: "tutoring-that-decenters-the-teacher",
    title: "Tutoring That Decenters the Teacher",
    description:
      "Project-based learning, flipped classrooms, and strong tutoring all share one goal: helping students think for themselves.",
    excerpt:
      "The best tutoring does not perform expertise at a student. It creates the conditions for the student to notice, question, connect, and arrive at understanding for themselves.",
    publishedAt: "2026-04-12",
    readTimeMinutes: 4,
    authorName: "Apple Scholar",
    tags: [
      "Tutoring",
      "Project-based learning",
      "Flipped classroom",
      "Learning design",
    ],
    intro: [
      "One of the reasons I am so passionate about project-based learning and flipped-classroom pedagogy is that it decenters the teacher.",
      "We are often told that the instructor, professor, or person standing at the front of the room has the answers, and that our role is simply to listen, absorb, and accept what is being said.",
      "But I think that instills the wrong message, especially in young people.",
      "What matters far more is helping each person learn from the world around them, and then develop the discernment to think critically and make judgments for themselves.",
      "To follow their curiosity wherever it leads. To question what they are hearing instead of treating authority as the endpoint.",
      "In tutoring, this shows up when the tutor stops acting like the source of truth and starts acting like a guide.",
    ],
    principles: [
      {
        title: "The tutor asks more than they tell",
        body: "Instead of immediately giving the answer, they ask the student what they notice, what they think is confusing, what they have already tried, and what seems most likely.",
      },
      {
        title: "The student does the intellectual heavy lifting",
        body: "The tutor may structure the task, break it down, model a strategy once, or give feedback, but the student is the one making meaning, testing ideas, and arriving at conclusions.",
      },
      {
        title: "The tutor treats confusion as productive",
        body: "Rather than rescuing the student too quickly, they let them sit with uncertainty long enough to build real problem-solving muscles.",
      },
      {
        title: "The tutor builds transfer, not dependence",
        body: "A weak tutoring model says, 'Here is how to do this problem.' A strong one says, 'Here is how to think through problems like this on your own next time.'",
      },
      {
        title: "The tutor validates the student as a thinker",
        body: "That means taking their interpretations seriously, inviting disagreement, and helping them refine their reasoning instead of just correcting them.",
      },
      {
        title: "The tutor uses the student's world as material for learning",
        body: "Their interests, examples, experiences, and questions become part of the lesson, which makes learning feel discovered rather than delivered.",
      },
    ],
    practiceTakeaways: [
      "helping someone notice",
      "helping someone question",
      "helping someone connect",
      "helping someone trust their own thinking",
    ],
    closing:
      "Tutoring shows this philosophy when the tutor is not performing expertise at the student, but designing conditions in which the student can think, inquire, and arrive at understanding for themselves.",
  },
];

export function getAllBlogPosts() {
  return [...blogPosts].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug) ?? null;
}

export function formatBlogDate(value: string) {
  return blogDateFormatter.format(new Date(`${value}T00:00:00Z`));
}
