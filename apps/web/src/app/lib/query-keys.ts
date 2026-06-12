export const queryKeys = {
  evaluationCriteria: ["evaluation_criteria"] as const,
  eduDept: {
    filterScopes: ["edu-dept", "filter-scopes"] as const,
    myStudents: (params: {
      date: string;
      trackId: number | null;
      circleId: number | null;
      isSupervisor: boolean;
    }) => ["edu-dept", "my-students", params] as const,
    myStudentsAll: ["edu-dept", "my-students"] as const,
    teacherCompetitions: ["edu-dept", "teacher-competitions"] as const,
    teacherCompetitionDetail: (id: number) =>
      ["edu-dept", "teacher-competition", id] as const,
  },
} as const;
