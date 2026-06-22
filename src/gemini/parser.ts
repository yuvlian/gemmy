import { SuggestedAnswer } from '../shared/types';
import { ANSWERS_MARKER } from '../shared/constants';
import { logger } from '../shared/utils';

/**
 * gemini response parser
 * parses json first, then fallback to regex
 */
export function parseResponse(text: string): SuggestedAnswer[] {
  if (!text) return [];

  const markerIndex = text.lastIndexOf(ANSWERS_MARKER);
  if (markerIndex === -1) {
    logger.warn('Answers marker not found in response. Attempting regex extract on whole text.');
  }

  let jsonPart = markerIndex !== -1
    ? text.substring(markerIndex + ANSWERS_MARKER.length).trim()
    : text.trim();

  jsonPart = jsonPart.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  try {
    const parsed = JSON.parse(jsonPart);
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) => {
        const obj = item as Record<string, unknown>;
        return {
          questionId: typeof obj.questionId === 'string' ? obj.questionId : '',
          answers: Array.isArray(obj.answers) ? obj.answers.map(String) : [String(obj.answers ?? '')]
        };
      }).filter(item => item.questionId);
    }
  } catch (err) {
    logger.warn('Direct JSON parse failed, trying regex fallback:', err);
  }

  const answers: SuggestedAnswer[] = [];
  const objectRegex = /\{\s*"questionId"\s*:\s*"([^"]+)"\s*,\s*"answers"\s*:\s*\[\s*([^\]]*)\s*\]\s*\}/g;

  let match;
  while ((match = objectRegex.exec(jsonPart)) !== null) {
    const questionId = match[1];
    const rawAnswers = match[2];

    const answersList: string[] = [];
    const stringRegex = /"([^"]+)"/g;
    let strMatch;
    while ((strMatch = stringRegex.exec(rawAnswers)) !== null) {
      answersList.push(strMatch[1]);
    }

    if (questionId) {
      answers.push({
        questionId,
        answers: answersList
      });
    }
  }

  return answers;
}
