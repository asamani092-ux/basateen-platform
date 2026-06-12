export const queryKeys = {
  evaluationCriteria: ["evaluation_criteria"] as const,
  eduDept: {
    filterScopes: ["edu-dept", "filter-scopes"] as const,
    myStudents: (params: {
      date: string;
      trackId: number | null;
      circleId: number | null;
      isSupervisor: boolean;
      isTrackSupervisor?: boolean;
    }) => ["edu-dept", "my-students", params] as const,
    myStudentsAll: ["edu-dept", "my-students"] as const,
    teacherCompetitions: ["edu-dept", "teacher-competitions"] as const,
    teacherCompetitionDetail: (id: number) =>
      ["edu-dept", "teacher-competition", id] as const,
    teacherBootstrap: (date: string) =>
      ["edu-dept", "teacher-bootstrap", date] as const,
    teacherBootstrapAll: ["edu-dept", "teacher-bootstrap"] as const,
  },
} as const;
