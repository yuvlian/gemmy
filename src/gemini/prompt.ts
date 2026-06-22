import { Quiz } from '../shared/types';
import { ANSWERS_MARKER } from '../shared/constants';

/*
Example built prompt:
  You are solving a quiz.

  Quiz Title: Math 101

  Please solve the following questions:

  --- Question 1 (ID: q-001) ---
  What is 2 + 2?
  Choices:
  A. 3
  B. 4
  C. 5
  D. 6

  --- Question 2 (ID: q-002) ---
  Is the Earth round? (Select all that apply)
  A. Yes
  B. No
  Fields:
  Field 1: Your reasoning

  Provide your normal reasoning and explanation.

  At the very end of your response, append:

  ===ANSWERS===
  [
    {
      "questionId": "q-001",
      "answers": ["B"]
    }
  ]

  Rules:
  - This section must be valid JSON.
  - This section must be the LAST thing in the response.
  - For single-choice questions return one letter (e.g. ["A"]).
  - For multi-select questions return multiple letters (e.g. ["A", "C"]).
  - Use letters only (A, B, C, D, E, etc) mapping to the choice ordering index.
  - Do not use choice text in the answers array.
  - For text-input questions return strings in the answers array in the same order as the fields (e.g. ["answer1"] or ["answer1", "answer2"]).
  - Include every questionId.

Example expected gemini response:
  This is a great quiz! Here are the answers:

  --- Reasoning and Explanation ---
  For question 1, I recognized that "2 + 2" is a basic arithmetic problem. The correct answer is 4, which corresponds to choice B.

  For question 2, I applied my knowledge that the Earth is an oblate spheroid, meaning it is roughly spherical but slightly flattened at the poles and bulging at the equator. Therefore, the statement "the Earth is round" is accurate. While technically not a perfect sphere, in the context of a multiple-choice question, "Yes" is the correct answer. If "Oblate spheroid" were an option, I would select that, but given "Yes" and "No," "Yes" is the most appropriate choice.

  ===ANSWERS===
  [
    {
      "questionId": "q-001",
      "answers": ["B"]
    },
    {
      "questionId": "q-002",
      "answers": ["A"]
    }
  ]
*/
export function buildPrompt(quiz: Quiz, fileUploadSuccess: Record<string, boolean>): string {
  let prompt = `You are solving a quiz.\n`;
  prompt += `Quiz Title: ${quiz.title}\n`;
  prompt += `Please solve the following questions:\n\n`;

  quiz.questions.forEach((q, idx) => {
    const qNum = idx + 1;
    prompt += `--- Question ${qNum} (ID: ${q.id}) ---\n`;
    prompt += `${q.content.text}\n`;

    if (q.content.media && q.content.media.length > 0) {
      q.content.media.forEach((media) => {
        const fileName = decodeURIComponent(media.url.split(/[/\\]/).pop() || 'media');
        const fileKey = `${q.id}-${fileName}`;
        const wasUploaded = !!fileUploadSuccess[fileKey];
        if (wasUploaded) {
          prompt += `[Attached media: ${fileName}]\n`;
        } else {
          prompt += `[Media referenced but could not be loaded: ${fileName}]\n`;
        }
      });
    }

    if (q.choices && q.choices.length > 0) {
      prompt += `Choices:\n`;
      q.choices.forEach((choice, choiceIdx) => {
        const letter = String.fromCharCode(65 + choiceIdx);
        prompt += `  ${letter}. ${choice.content.text}\n`;
      });
    }

    if (q.fields && q.fields.length > 0) {
      prompt += `Fields:\n`;
      q.fields.forEach((field, fieldIdx) => {
        prompt += `  Field ${fieldIdx + 1}: ${field.label}\n`;
      });
    }

    prompt += `\n`;
  });

  prompt += `Provide your normal reasoning and explanation.\n`;
  prompt += `At the very end of your response, append:\n\n`;
  prompt += `${ANSWERS_MARKER}\n`;
  prompt += `[\n`;
  prompt += `  {\n`;
  prompt += `    "questionId": "question-124-1",\n`;
  prompt += `    "answers": ["A"]\n`;
  prompt += `  }\n`;
  prompt += `]\n\n`;
  prompt += `Rules:\n`;
  prompt += `- This section must be valid JSON.\n`;
  prompt += `- This section must be the LAST thing in the response.\n`;
  prompt += `- For single-choice questions return one letter (e.g. ["A"]).\n`;
  prompt += `- For multi-select questions return multiple letters (e.g. ["A", "C"]).\n`;
  prompt += `- Use letters only (A, B, C, D, E, etc) mapping to the choice ordering index.\n`;
  prompt += `- Do not use choice text in the answers array.\n`;
  prompt += `- For text-input questions return strings in the answers array in the same order as the fields (e.g. ["answer1"] or ["answer1", "answer2"]).\n`;
  prompt += `- Include every questionId.\n`;

  return prompt;
}
