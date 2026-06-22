/**
 * apply highlights on mcq answer
 */
export function applyChoiceOverlays(questionId: string, selectedLetters: string[]) {
  const queEl = document.getElementById(questionId);
  if (!queEl) return;

  const choiceEls = Array.from(queEl.querySelectorAll('.answer > div, .answer .r0, .answer .r1')).filter((el) => {
    return el.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0;
  });

  choiceEls.forEach((choiceEl, index) => {
    const letter = String.fromCharCode(65 + index);
    if (selectedLetters.includes(letter)) {
      const inputEl = choiceEl.querySelector('input');
      let textContainer: HTMLElement | null = null;
      if (inputEl) {
        const labelledBy = inputEl.getAttribute('aria-labelledby');
        if (labelledBy) {
          textContainer = queEl.querySelector(`[id="${labelledBy}"]`) as HTMLElement;
        }
        if (!textContainer) {
          const inputId = inputEl.getAttribute('id');
          if (inputId) {
            textContainer = queEl.querySelector(`label[for="${inputId}"]`) as HTMLElement;
          }
        }
      }
      if (!textContainer) {
        textContainer = choiceEl as HTMLElement;
      }

      textContainer.classList.add('ge-mm-y-selected-choice');
      textContainer.style.fontStyle = 'italic';
      textContainer.style.color = '#29692cff';
    }
  });
}

/**
 * for text inputs, put answer in placeholder text
 */
export function applyInputTooltips(
  questionId: string,
  fieldAnswers: { fieldId: string; answer: string }[]
) {
  const queEl = document.getElementById(questionId);
  if (!queEl) return;

  if (!document.getElementById('ge-mm-y-placeholder-style')) {
    const style = document.createElement('style');
    style.id = 'ge-mm-y-placeholder-style';
    style.textContent = `
      .ge-mm-y-placeholder::placeholder {
        color: rgba(0, 0, 0, 0.2);
      }
    `;
    document.head.appendChild(style);
  }

  fieldAnswers.forEach(({ fieldId, answer }, idx) => {
    if (!answer) return;

    let input = queEl.querySelector<HTMLElement>(
      `[name="${fieldId}"], [id="${fieldId}"]`
    );

    if (!input) {
      const allInputs = queEl.querySelectorAll<HTMLElement>(
        'input[type="text"], input[type="email"], input[type="number"], textarea'
      );
      input = allInputs[idx] || allInputs[0] || null;
    }

    if (input) {
      (input as HTMLInputElement).placeholder = answer;
      input.classList.add('ge-mm-y-placeholder');
    }
  });
}

export function clearOverlays() {
  document.querySelectorAll('.ge-mm-y-selected-choice').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.classList.remove('ge-mm-y-selected-choice');
    htmlEl.style.fontStyle = '';
    htmlEl.style.fontWeight = '';
    htmlEl.style.color = '';
  });

  document.querySelectorAll('[data-ge-mm-y-answer]').forEach((el) => {
    const input = el as HTMLInputElement;
    input.title = '';
    input.placeholder = '';
    input.style.boxShadow = '';
    input.style.borderColor = '';
    input.style.outline = '';
    delete input.dataset.quizSolverAnswer;
  });

  const existingOverlay = document.getElementById('ge-mm-y-text-suggestions-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const spinnerStyle = document.getElementById('ge-mm-y-spinner-style');
  if (spinnerStyle) {
    spinnerStyle.remove();
  }
}
