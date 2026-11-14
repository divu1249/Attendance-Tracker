export interface ProblemSolution {
  has_solution: boolean;
  given_parameters: Array<{ label: string; value_latex: string }>;
  key_formulas: Array<{ name: string; latex: string }>;
  steps: Array<{
    step_number: number;
    title: string;
    explanation: string;
    equation_latex?: string;
  }>;
  final_answer_latex: string;
}

export interface StudyInfographicNode {
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose';
}

export interface StudyInfographicMetric {
  label: string;
  value_display: string;
  percentage: number;
  note: string;
}

export interface StudyInfographic {
  type: 'flowchart' | 'layered_architecture' | 'comparison_bars' | 'svg_diagram';
  caption: string;
  nodes?: StudyInfographicNode[];
  metrics?: StudyInfographicMetric[];
  svg_markup?: string;
}

export interface StudyReference {
  title: string;
  url: string;
  domain: string;
}

export interface RichStudyResponse {
  title: string;
  subject_tag: string;
  core_intuition: string;
  explanation_markdown: string;
  problem_solution?: ProblemSolution;
  infographic?: StudyInfographic;
  key_takeaways: string[];
  exam_tips: string[];
  references?: StudyReference[];
}
