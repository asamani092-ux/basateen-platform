import { PREVIEW_TODAY } from "./dev-preview-fixtures";

export type PreviewQuestion = {
  id: number;
  question_type: "mcq" | "true_false";
  prompt_ar: string;
  points: number;
  correct_answer: string;
  options_json: string;
  sort_order: number;
};

let quizSeq = 1;
let questionSeq = 10;

const quizzes: Array<Record<string, unknown>> = [
  {
    id: 1,
    title_ar: "اختبار معرفي — معاينة برامج",
    access_code: "Ramadan2026",
    status: "published",
    total_points: 4,
    question_count: 3,
    attempts_count: 1,
    created_at: PREVIEW_TODAY(),
  },
];

const questionsByQuiz: Record<number, PreviewQuestion[]> = {
  1: [
    {
      id: 10,
      question_type: "mcq",
      prompt_ar: "كم عدد أركان الإسلام؟",
      points: 1,
      correct_answer: "5",
      options_json: '["3","4","5","6"]',
      sort_order: 0,
    },
    {
      id: 11,
      question_type: "true_false",
      prompt_ar: "القرآن كلام الله",
      points: 1,
      correct_answer: "true",
      options_json: '["صح","خطأ"]',
      sort_order: 1,
    },
    {
      id: 12,
      question_type: "true_false",
      prompt_ar: "أكبر سورة البقرة",
      points: 2,
      correct_answer: "true",
      options_json: '["صح","خطأ"]',
      sort_order: 2,
    },
  ],
};

const attempts: Record<string, { token: string; submitted_at: string | null; score_percent: number | null; answers_json: string | null }> = {
  "1:1": { token: "preview-quiz-student-1", submitted_at: null, score_percent: null, answers_json: null },
  "1:4": { token: "preview-quiz-student-4", submitted_at: PREVIEW_TODAY(), score_percent: 88, answers_json: "{}" },
};

const vaultItems: Array<Record<string, unknown>> = [
  {
    id: 1,
    title_ar: "حقيبة البرامج — معاينة",
    description_ar: "روابط خارجية",
    external_url: "https://drive.google.com",
    file_kind: "drive",
    program_year: 2026,
    created_at: PREVIEW_TODAY(),
  },
];

export const progPreviewStore = {
  listQuizzes() {
    return quizzes.map((q) => ({
      ...q,
      question_count: (questionsByQuiz[Number(q.id)] ?? []).length,
    }));
  },

  createQuiz(title_ar: string, access_code: string | null) {
    const id = ++quizSeq;
    quizzes.unshift({
      id,
      title_ar,
      access_code,
      status: "draft",
      total_points: 0,
      question_count: 0,
      attempts_count: 0,
      created_at: PREVIEW_TODAY(),
    });
    questionsByQuiz[id] = [];
    return id;
  },

  getQuiz(id: number) {
    return quizzes.find((q) => q.id === id);
  },

  getQuestions(id: number) {
    return questionsByQuiz[id] ?? [];
  },

  saveQuestions(id: number, list: PreviewQuestion[]) {
    questionsByQuiz[id] = list;
    const total = list.reduce((s, q) => s + q.points, 0);
    const q = quizzes.find((x) => x.id === id);
    if (q) {
      q.total_points = total;
      q.question_count = list.length;
    }
    return total;
  },

  publishQuiz(id: number) {
    const q = quizzes.find((x) => x.id === id);
    if (q) q.status = "published";
    return {
      public_path: `/quiz/${id}`,
      access_code: q?.access_code ?? null,
      student_links: [
        { student_id: 1, full_name_ar: "أحمد محمد العتيبي", token: "preview-quiz-student-1", path: `/quiz/${id}?token=preview-quiz-student-1`, phone: "0501111001" },
        { student_id: 4, full_name_ar: "سلمان ناصر الحربي", token: "preview-quiz-student-4", path: `/quiz/${id}?token=preview-quiz-student-4`, phone: "0501111004" },
      ],
    };
  },

  getLinks(id: number) {
    const q = quizzes.find((x) => x.id === id);
    return {
      title_ar: String(q?.title_ar ?? ""),
      public_path: `/quiz/${id}`,
      access_code: q?.access_code ?? null,
      items: [
        { student_id: 1, full_name_ar: "أحمد محمد العتيبي", attempt_token: "preview-quiz-student-1", path: `/quiz/${id}?token=preview-quiz-student-1`, phone: "0501111001", submitted: false },
        { student_id: 4, full_name_ar: "سلمان ناصر الحربي", attempt_token: "preview-quiz-student-4", path: `/quiz/${id}?token=preview-quiz-student-4`, phone: "0501111004", submitted: true },
      ],
    };
  },

  gate(quizId: number, identifier: string, code: string) {
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz) return null;
    if (quiz.access_code && code !== quiz.access_code) return { error: "invalid_code" as const };
    const sid = identifier.includes("050") ? 1 : 1;
    const key = `${quizId}:${sid}`;
    if (!attempts[key]) {
      attempts[key] = { token: `preview-gate-${sid}`, submitted_at: null, score_percent: null, answers_json: null };
    }
    if (attempts[key].submitted_at) return { error: "submitted" as const };
    return { token: attempts[key].token, student_id: sid, full_name_ar: "أحمد محمد العتيبي" };
  },

  take(quizId: number, token: string) {
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz || quiz.status === "draft") return null;
    const entry = Object.entries(attempts).find(([, v]) => v.token === token);
    if (!entry) return null;
    const sid = Number(entry[0].split(":")[1]);
    if (entry[1].submitted_at) {
      return { already_submitted: true, score_percent: entry[1].score_percent, full_name_ar: "طالب معاينة" };
    }
    const qs = questionsByQuiz[quizId] ?? [];
    return {
      quiz,
      student: { id: sid, full_name_ar: "أحمد محمد العتيبي" },
      questions: qs.map((q) => ({
        id: q.id,
        question_type: q.question_type,
        prompt_ar: q.prompt_ar,
        points: q.points,
        options: JSON.parse(q.options_json) as string[],
      })),
    };
  },

  submit(quizId: number, token: string, answers: Record<string, string>) {
    const entry = Object.entries(attempts).find(([, v]) => v.token === token);
    if (!entry) return null;
    if (entry[1].submitted_at) return { error: "submitted" as const };
    const qs = questionsByQuiz[quizId] ?? [];
    let earned = 0;
    let total = 0;
    for (const q of qs) {
      total += q.points;
      const given = (answers[String(q.id)] ?? "").trim().toLowerCase();
      const correct = q.correct_answer.toLowerCase();
      const normGiven = given === "صح" ? "true" : given === "خطأ" ? "false" : given;
      if (normGiven === correct) earned += q.points;
    }
    const score = total > 0 ? Math.round((earned / total) * 1000) / 10 : 0;
    entry[1].submitted_at = PREVIEW_TODAY();
    entry[1].score_percent = score;
    entry[1].answers_json = JSON.stringify(answers);
    const q = quizzes.find((x) => x.id === quizId);
    if (q) q.attempts_count = Number(q.attempts_count ?? 0) + 1;
    return { score_percent: score };
  },

  listVault(q: string) {
    if (!q.trim()) return vaultItems;
    return vaultItems.filter((v) => String(v.title_ar).includes(q));
  },

  addVault(row: Record<string, unknown>) {
    vaultItems.unshift({ id: vaultItems.length + 1, created_at: PREVIEW_TODAY(), ...row });
  },
};
