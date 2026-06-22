export interface MediaItem {
  type: 'image' | 'video' | 'audio';
  url: string;
  loaded?: boolean;
}

export interface Choice {
  id: string;
  content: {
    text: string;
    media?: MediaItem[];
  };
}

export interface InputField {
  id: string;
  label: string;
  inputType: string;
  required?: boolean;
}

export interface Question {
  id: string;
  kind: 'choice' | 'input';
  selectionMode?: 'single' | 'multiple';
  content: {
    text: string;
    media?: MediaItem[];
  };
  choices?: Choice[];
  fields?: InputField[];
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
}

export interface SuggestedAnswer {
  questionId: string;
  answers: string[];
}

// extension message schemas
export interface SolveQuizMessage {
  action: 'solveQuiz';
  quiz: Quiz;
}

export interface SolutionReadyMessage {
  action: 'solutionReady';
  responseText: string;
}

export interface GetStatusMessage {
  action: 'getStatus';
}

export interface GeminiInputMessage {
  action: 'inputPrompt';
  promptText: string;
  files: {
    questionId: string;
    name: string;
    type: string;
    base64: string;
  }[];
}
