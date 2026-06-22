import { Quiz, Question, Choice, InputField, MediaItem } from '../shared/types';

function cleanText(text: string): string {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

function extractMedia(element: Element): MediaItem[] {
  const media: MediaItem[] = [];
  element.querySelectorAll('img, video, audio, iframe').forEach((el: Element) => {
    const tagName = el.tagName.toLowerCase();
    let url = el.getAttribute('src');
    if (!url && tagName === 'video') {
      const source = el.querySelector('source');
      if (source) url = source.getAttribute('src');
    }
    if (url) {
      let type: 'image' | 'video' | 'audio' = 'image';
      if (tagName === 'video' || tagName === 'iframe') {
        type = 'video';
      } else if (tagName === 'audio') {
        type = 'audio';
      }
      media.push({ type, url });
    }
  });
  return media;
}

export function parseQuizDOM(): Quiz {
  // get quiz title
  let title = '';
  const headerH1 = document.querySelector('.page-header-headings h1');
  if (headerH1) {
    title = cleanText(headerH1.textContent || '');
  }
  if (!title) {
    const mainH2 = document.querySelector('#region-main h2');
    if (mainH2) title = cleanText(mainH2.textContent || '');
  }
  if (!title) {
    title = cleanText(document.title.split('|')[0].split('_')[0]);
  }
  if (!title) {
    title = 'Quiz';
  }

  // get quiz id
  let quizId = '';
  const form = document.querySelector('form#responseform');
  if (form) {
    const action = form.getAttribute('action') || '';
    const cmidMatch = action.match(/[?&]cmid=(\d+)/);
    if (cmidMatch) {
      quizId = `quiz-${cmidMatch[1]}`;
    } else {
      const attemptMatch = action.match(/[?&]attempt=(\d+)/);
      if (attemptMatch) {
        quizId = `quiz-attempt-${attemptMatch[1]}`;
      }
    }
  }
  if (!quizId) {
    quizId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'quiz';
  }

  const questions: Question[] = [];
  document.querySelectorAll('.que').forEach((queEl, index) => {
    const id = queEl.getAttribute('id') || `q-${index + 1}`;

    // check if multiple choice
    const hasChoices = queEl.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]').length > 0;
    const kind = hasChoices ? 'choice' : 'input';

    // get question text and media
    const qtextEl = queEl.querySelector('.qtext, .formulation');
    let text = '';
    let media: MediaItem[] = [];
    if (qtextEl) {
      const qtextClone = qtextEl.cloneNode(true) as HTMLElement;
      qtextClone.querySelectorAll('.subquestion').forEach(el => el.remove());
      qtextClone.querySelectorAll('.accesshide').forEach(el => el.remove());
      qtextClone.querySelectorAll('img, video, audio, iframe, source').forEach(el => el.remove());
      text = cleanText(qtextClone.textContent || '');
      media = extractMedia(qtextEl);
    }

    const question: Question = { id, kind, content: { text, media } };

    if (kind === 'choice') {
      const hasCheckbox = queEl.querySelectorAll('.answer input[type="checkbox"]').length > 0;
      question.selectionMode = hasCheckbox ? 'multiple' : 'single';

      const choices: Choice[] = [];
      const choiceEls = Array.from(queEl.querySelectorAll('.answer > div, .answer .r0, .answer .r1')).filter(el => {
        return el.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0;
      });

      choiceEls.forEach((choiceEl) => {
        const inputEl = choiceEl.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement;
        if (!inputEl) return;

        let choiceId = '';
        const answernumberEl = choiceEl.querySelector('.answernumber');
        if (answernumberEl) {
          choiceId = answernumberEl.textContent?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim() || '';
        }
        if (!choiceId) {
          choiceId = inputEl.value || '';
        }
        choiceId = choiceId.trim();

        let choiceText = '';
        let choiceMedia: MediaItem[] = [];

        let labelEl = null;
        const labelledBy = inputEl.getAttribute('aria-labelledby');
        if (labelledBy) {
          labelEl = queEl.querySelector(`[id="${labelledBy}"]`);
        }
        if (!labelEl) {
          const inputId = inputEl.getAttribute('id');
          if (inputId) {
            labelEl = queEl.querySelector(`label[for="${inputId}"]`);
          }
        }

        if (labelEl) {
          const labelClone = labelEl.cloneNode(true) as HTMLElement;
          labelClone.querySelectorAll('.answernumber').forEach(el => el.remove());
          labelClone.querySelectorAll('img, video, audio, iframe, source').forEach(el => el.remove());
          choiceText = cleanText(labelClone.textContent || '');
          choiceMedia = extractMedia(labelEl);
        } else {
          const choiceClone = choiceEl.cloneNode(true) as HTMLElement;
          choiceClone.querySelectorAll('input').forEach(el => el.remove());
          choiceClone.querySelectorAll('.answernumber').forEach(el => el.remove());
          choiceClone.querySelectorAll('img, video, audio, iframe, source').forEach(el => el.remove());
          choiceText = cleanText(choiceClone.textContent || '');
          choiceMedia = extractMedia(choiceEl as Element);
        }

        choices.push({
          id: choiceId,
          content: {
            text: choiceText,
            media: choiceMedia
          }
        });
      });

      question.choices = choices;

    } else {
      const fields: InputField[] = [];
      const fieldEls = queEl.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], textarea, select');

      fieldEls.forEach((fieldEl: Element) => {
        const inputEl = fieldEl as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const fieldId = inputEl.getAttribute('name') || inputEl.getAttribute('id') || 'answer';

        let labelText = '';

        // try label[for="id"] first
        const inputId = inputEl.getAttribute('id');
        if (inputId) {
          const labelByFor = queEl.querySelector(`label[for="${inputId}"]`);
          if (labelByFor) {
            const labelClone = labelByFor.cloneNode(true) as HTMLElement;
            labelClone.querySelectorAll('input, textarea, select, .visually-hidden, .answer').forEach(el => el.remove());
            labelText = cleanText(labelClone.textContent || '').replace(/:$/, '').trim();
          }
        }

        // fallback: closest label parent
        if (!labelText) {
          const labelEl = inputEl.closest('label');
          if (labelEl) {
            const labelClone = labelEl.cloneNode(true) as HTMLElement;
            labelClone.querySelectorAll('input, textarea, select, .visually-hidden, .answer').forEach(el => el.remove());
            labelText = cleanText(labelClone.textContent || '').replace(/:$/, '').trim();
          }
        }

        // fallback: parent subquestion span text (strip input elements)
        if (!labelText) {
          const subqSpan = inputEl.closest('.subquestion');
          if (subqSpan) {
            const spanClone = subqSpan.cloneNode(true) as HTMLElement;
            spanClone.querySelectorAll('input, textarea, select').forEach(el => el.remove());
            labelText = cleanText(spanClone.textContent || '').replace(/:$/, '').trim();
          }
        }

        if (!labelText) {
          labelText = 'Answer';
        }

        let inputType = 'text';
        const tagName = inputEl.tagName.toLowerCase();
        if (tagName === 'textarea') {
          inputType = 'textarea';
        } else if (tagName === 'select') {
          inputType = 'select';
        } else {
          inputType = inputEl.getAttribute('type') || 'text';
        }

        const required = inputEl.hasAttribute('required') || ('required' in inputEl && inputEl.required === true);

        fields.push({
          id: fieldId,
          label: labelText,
          inputType,
          required
        });
      });

      question.fields = fields;
    }

    questions.push(question);
  });

  return {
    id: quizId,
    title,
    questions
  };
}
