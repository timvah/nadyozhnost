// ==========================================================
//  TestMaster3000 — Static Web Player (no file upload)
//  Test data is loaded from test_data.js as window.TEST_DATA
// ==========================================================

// --- State ---
let testData = null;
let questions = [];
let currentIndex = 0;
let userAnswers = {};          // questionIndex -> selectedAnswerId
let testOrder = [];            // indexes of questions in current session
let answerShuffleMap = {};     // questionIndex -> [shuffled answer indexes]

// --- DOM refs ---
const welcomeScreen = document.getElementById('welcome-screen');
const testScreen = document.getElementById('test-screen');
const resultScreen = document.getElementById('result-screen');

const testTitleDisplay = document.getElementById('test-title-display');
const metaCount = document.getElementById('meta-count');
const btnStart = document.getElementById('btn-start');

const progressText = document.getElementById('progress-text');
const progressBarFill = document.getElementById('progress-bar-fill');
const questionText = document.getElementById('question-text');
const questionImages = document.getElementById('question-images');
const answersContainer = document.getElementById('answers-container');
const feedbackBanner = document.getElementById('feedback-banner');

const btnPrev = document.getElementById('btn-prev');
const btnSubmit = document.getElementById('btn-submit');
const btnNext = document.getElementById('btn-next');
const btnToWelcome = document.getElementById('btn-to-welcome');

const scorePercentage = document.getElementById('score-percentage');
const scoreEmoji = document.getElementById('score-emoji');
const scoreDetails = document.getElementById('score-details');
const gradeText = document.getElementById('grade-text');
const ringFill = document.getElementById('ring-fill');
const errorsSection = document.getElementById('errors-section');
const errorsTableBody = document.querySelector('#errors-table tbody');
const btnRetryErrors = document.getElementById('btn-retry-errors');
const btnRestart = document.getElementById('btn-restart');

// ==========================================================
//  HELPERS
// ==========================================================
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderMarkdownWithMath(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Protect math formulas ($$...$$ and $...$) from marked.js markdown parsing
    const mathPlaceholders = [];
    
    // Replace display math ($$...$$) first
    let protectedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
        const id = `@@MATHDISP${mathPlaceholders.length}@@`;
        mathPlaceholders.push({ id, formula: match });
        return id;
    });
    
    // Replace inline math ($...$)
    protectedText = protectedText.replace(/\$([^\$\n]+?)\$/g, (match) => {
        const id = `@@MATHINL${mathPlaceholders.length}@@`;
        mathPlaceholders.push({ id, formula: match });
        return id;
    });
    
    // Parse Markdown
    let html = marked.parse(protectedText);
    
    // Restore math formulas untouched
    for (const item of mathPlaceholders) {
        html = html.replace(item.id, item.formula);
    }
    
    return html;
}

function renderMarkdownWithMathInline(text) {
    let html = renderMarkdownWithMath(text);
    if (html.startsWith('<p>') && html.endsWith('</p>\n')) {
        html = html.substring(3, html.length - 5);
    } else if (html.startsWith('<p>') && html.endsWith('</p>')) {
        html = html.substring(3, html.length - 4);
    }
    return html;
}

// ==========================================================
//  LOAD TEST DATA FROM JSON FILE
// ==========================================================
function parseMarkdownTest(mdText) {
    const lines = mdText.split('\n');
    let title = 'Тест';
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('# ')) {
            title = lines[i].trim().slice(2).trim();
            break;
        }
    }

    const questionSections = mdText.split('\n## ');
    const parsedQuestions = [];

    for (let i = 1; i < questionSections.length; i++) {
        const section = questionSections[i];
        const sectionLines = section.split('\n');
        if (sectionLines.length === 0) continue;

        let questionTextLines = [];
        const questionImages = [];
        const answers = [];
        let currentAnswer = null;
        let isParsingQuestion = true;

        const firstLine = sectionLines[0].trim();
        const firstLineClean = firstLine.replace(/^\d+\s*[.)]\s*/, '').trim();
        if (firstLineClean) {
            questionTextLines.push(firstLineClean);
        }

        for (let j = 1; j < sectionLines.length; j++) {
            const line = sectionLines[j];
            const stripped = line.trim();
            if (!stripped) continue;

            const ansMatch = stripped.match(/^\s*-\s*\[([ xX])\]\s*(.*)/);
            const bulletMatch = stripped.match(/^\s*-\s+(?!\[)(.*)/);
            const imgMatch = stripped.match(/^!\[.*?\]\((.*?)\)/);

            if (ansMatch) {
                isParsingQuestion = false;
                const isCorrect = ansMatch[1].toLowerCase() === 'x';
                const ansText = ansMatch[2].trim();
                currentAnswer = {
                    id: 'ans-' + Math.random().toString(36).substr(2, 9),
                    text: ansText,
                    is_correct: isCorrect,
                    images: []
                };
                answers.push(currentAnswer);
            } else if (bulletMatch) {
                isParsingQuestion = false;
                const ansText = bulletMatch[1].trim();
                const isCorrect = (answers.length === 0);
                currentAnswer = {
                    id: 'ans-' + Math.random().toString(36).substr(2, 9),
                    text: ansText,
                    is_correct: isCorrect,
                    images: []
                };
                answers.push(currentAnswer);
            } else if (imgMatch) {
                const imgPath = imgMatch[1].trim();
                if (isParsingQuestion) {
                    questionImages.push(imgPath);
                } else if (currentAnswer) {
                    currentAnswer.images.push(imgPath);
                }
            } else {
                if (isParsingQuestion) {
                    questionTextLines.push(line);
                } else if (currentAnswer) {
                    currentAnswer.text += '\n' + line;
                }
            }
        }

        const qText = questionTextLines.join('\n').trim();
        if (qText || questionImages.length > 0) {
            parsedQuestions.push({
                id: 'q-' + Math.random().toString(36).substr(2, 9),
                question_text: qText,
                question_images: questionImages,
                answers: answers
            });
        }
    }

    return {
        title: title,
        questions: parsedQuestions
    };
}

const TEST_JSON_FILE = 'nadya.json';

(async function loadTestData() {
    try {
        let data = window.TEST_DATA;
        if (!data) {
            const resp = await fetch(TEST_JSON_FILE);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            
            if (TEST_JSON_FILE.toLowerCase().endsWith('.md')) {
                const text = await resp.text();
                data = parseMarkdownTest(text);
            } else {
                data = await resp.json();
            }
        }

        testData = data;
        questions = data.questions || [];

        const title = data.title || data.name || 'Тест';
        testTitleDisplay.textContent = title;
        metaCount.textContent = `${questions.length} вопросов`;

        // Range selector generation
        const rangeSelectorContainer = document.getElementById('range-selector-container');
        const rangeSelect = document.getElementById('range-select');

        if (questions.length > 50) {
            rangeSelect.innerHTML = '';

            // Add 'all' option
            const allOpt = document.createElement('option');
            allOpt.value = 'all';
            allOpt.textContent = `Все вопросы (1 - ${questions.length})`;
            rangeSelect.appendChild(allOpt);

            // Add 50-question blocks
            const RANGE_SIZE = 50;
            for (let i = 0; i < questions.length; i += RANGE_SIZE) {
                const start = i;
                const end = Math.min(i + RANGE_SIZE - 1, questions.length - 1);
                const opt = document.createElement('option');
                opt.value = `${start}-${end}`;
                opt.textContent = `Вопросы ${start + 1} – ${end + 1}`;
                rangeSelect.appendChild(opt);
            }

            rangeSelectorContainer.style.display = 'flex';
        } else {
            rangeSelectorContainer.style.display = 'none';
        }
    } catch (err) {
        testTitleDisplay.textContent = 'Ошибка загрузки теста';
        btnStart.disabled = true;
        btnStart.style.opacity = '0.4';
        console.error('Failed to load test:', err);
    }
})();

// ==========================================================
//  START
// ==========================================================
btnStart.addEventListener('click', () => {
    if (!testData) return;
    initTest(testData);
});

// ==========================================================
//  UTILS
// ==========================================================
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ==========================================================
//  INIT TEST
// ==========================================================
function initTest(data, onlyErrors = false) {
    testData = data;

    if (onlyErrors) {
        const errorIndexes = [];
        testOrder.forEach(idx => {
            const q = questions[idx];
            const answerId = userAnswers[idx];
            const correct = q.answers.find(a => a.is_correct);
            if (!correct || correct.id !== answerId) errorIndexes.push(idx);
        });
        testOrder = shuffleArray(errorIndexes);
    } else {
        // Apply range selection if enabled
        const rangeSelect = document.getElementById('range-select');
        if (rangeSelect && rangeSelect.value !== 'all' && data.questions.length > 50) {
            const [startIdx, endIdx] = rangeSelect.value.split('-').map(Number);
            questions = data.questions.slice(startIdx, endIdx + 1);
        } else {
            questions = data.questions;
        }
        testOrder = shuffleArray(Array.from({ length: questions.length }, (_, i) => i));
    }

    currentIndex = 0;
    userAnswers = {};
    answerShuffleMap = {};

    testOrder.forEach(qIdx => {
        const q = questions[qIdx];
        answerShuffleMap[qIdx] = shuffleArray(Array.from({ length: q.answers.length }, (_, i) => i));
    });

    showScreen(testScreen);
    renderQuestion();
}

// ==========================================================
//  SCREEN SWITCHING
// ==========================================================
function showScreen(screen) {
    [welcomeScreen, testScreen, resultScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

// ==========================================================
//  RENDER QUESTION
// ==========================================================
function renderQuestion() {
    const qIndex = testOrder[currentIndex];
    const question = questions[qIndex];

    answersContainer.innerHTML = '';
    questionImages.innerHTML = '';
    feedbackBanner.style.display = 'none';
    feedbackBanner.className = 'feedback-bar';
    btnSubmit.style.display = 'flex';
    btnNext.style.display = 'none';

    // Progress
    progressText.textContent = `${currentIndex + 1} / ${testOrder.length}`;
    progressBarFill.style.width = `${((currentIndex + 1) / testOrder.length) * 100}%`;

    // Question text
    questionText.innerHTML = renderMarkdownWithMath(question.question_text);

    // Question images
    if (question.question_images && question.question_images.length > 0) {
        question.question_images.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.alt = 'Изображение к вопросу';
            questionImages.appendChild(img);
        });
    }

    // Answers
    const hasAnswered = userAnswers[qIndex] !== undefined;
    const shuffled = answerShuffleMap[qIndex];

    shuffled.forEach(ansIdx => {
        const answer = question.answers[ansIdx];
        const card = document.createElement('div');
        card.className = 'answer-card';
        card.tabIndex = 0;
        card.dataset.answerId = answer.id;

        let imagesHtml = '';
        if (answer.images && answer.images.length > 0) {
            imagesHtml = '<div class="answer-images">';
            answer.images.forEach(src => {
                imagesHtml += `<img src="${src}" alt="Вариант ответа">`;
            });
            imagesHtml += '</div>';
        }

        let parsedAnsText = renderMarkdownWithMathInline(answer.text);

        card.innerHTML = `
            <div class="answer-content">
                <div class="custom-radio"><div class="custom-radio-inner"></div></div>
                <div class="answer-text-label">${parsedAnsText}</div>
            </div>
            ${imagesHtml}
        `;

        if (!hasAnswered) {
            card.addEventListener('click', () => selectAnswer(card, answer.id));
        } else {
            card.classList.add('disabled');
        }

        answersContainer.appendChild(card);
    });

    // Render math formulas
    if (window.renderMathInElement) {
        renderMathInElement(questionText, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false,
            strict: false
        });
        renderMathInElement(answersContainer, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false,
            strict: false
        });
    }

    // Back button
    btnPrev.disabled = currentIndex === 0;

    if (hasAnswered) {
        highlightAnswers(userAnswers[qIndex], question);
    } else {
        btnSubmit.disabled = true;
    }

    testScreen.focus();
}

// ==========================================================
//  SELECT ANSWER
// ==========================================================
function selectAnswer(cardEl, answerId) {
    answersContainer.querySelectorAll('.answer-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');

    const qIndex = testOrder[currentIndex];
    userAnswers[qIndex] = answerId;
    btnSubmit.disabled = false;
}

// ==========================================================
//  SUBMIT ANSWER
// ==========================================================
function submitAnswer() {
    const qIndex = testOrder[currentIndex];
    const question = questions[qIndex];
    const selectedId = userAnswers[qIndex];
    if (!selectedId) return;
    highlightAnswers(selectedId, question);
}

// ==========================================================
//  HIGHLIGHT ANSWERS
// ==========================================================
function highlightAnswers(selectedId, question) {
    const cards = answersContainer.querySelectorAll('.answer-card');
    const correct = question.answers.find(a => a.is_correct);
    const isCorrect = correct && correct.id === selectedId;

    cards.forEach(card => {
        card.classList.add('disabled');
        card.style.pointerEvents = 'none';
        const aid = card.dataset.answerId;
        if (aid === correct.id) card.classList.add('correct');
        else if (aid === selectedId && !isCorrect) card.classList.add('wrong');
    });

    feedbackBanner.style.display = 'block';
    if (isCorrect) {
        feedbackBanner.innerHTML = '✅ Правильно!';
        feedbackBanner.className = 'feedback-bar correct';
    } else {
        const txt = correct ? renderMarkdownWithMathInline(correct.text) : '?';
        feedbackBanner.innerHTML = `❌ Неправильно<br>Верный ответ: ${txt}`;
        feedbackBanner.className = 'feedback-bar wrong';
        
        if (window.renderMathInElement) {
            renderMathInElement(feedbackBanner, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false}
                ],
                throwOnError: false,
                strict: false
            });
        }
    }

    btnSubmit.style.display = 'none';
    btnNext.style.display = 'flex';
}

// ==========================================================
//  NAVIGATION
// ==========================================================
function nextQuestion() {
    if (currentIndex < testOrder.length - 1) { currentIndex++; renderQuestion(); }
    else finishTest();
}

function prevQuestion() {
    if (currentIndex > 0) { currentIndex--; renderQuestion(); }
}

// ==========================================================
//  FINISH TEST
// ==========================================================
function finishTest() {
    showScreen(resultScreen);

    let correctCount = 0;
    const errors = [];

    testOrder.forEach(qIdx => {
        const q = questions[qIdx];
        const aid = userAnswers[qIdx];
        const correct = q.answers.find(a => a.is_correct);
        if (correct && correct.id === aid) correctCount++;
        else errors.push({
            questionText: q.question_text,
            userAnswer: q.answers.find(a => a.id === aid)?.text || 'Нет ответа',
            correctAnswer: correct ? correct.text : '?'
        });
    });

    const pct = Math.round((correctCount / testOrder.length) * 100);
    const wrongCount = testOrder.length - correctCount;

    // Score ring animation
    const circumference = 2 * Math.PI * 52;  // r=52
    const offset = circumference - (circumference * pct / 100);
    ringFill.style.strokeDashoffset = offset;

    // Pick color & emoji
    let emoji = '🏆', grade = 'Отлично! Так держать! 🎉', color = 'var(--green)';
    if (pct < 40) { emoji = '📖'; grade = 'Нужно больше учить! 📖'; color = 'var(--red)'; }
    else if (pct < 60) { emoji = '💪'; grade = 'Удовлетворительно. Повтори материал 💪'; color = 'var(--amber)'; }
    else if (pct < 75) { emoji = '📚'; grade = 'Хорошо! Ещё немного подучить 📚'; color = 'var(--amber)'; }
    else if (pct < 90) { emoji = '👍'; grade = 'Отлично! Почти идеально 👍'; color = 'var(--green)'; }

    scorePercentage.textContent = `${pct}%`;
    scoreEmoji.textContent = emoji;
    scoreDetails.textContent = `Правильно: ${correctCount} из ${testOrder.length} · Ошибок: ${wrongCount}`;
    gradeText.textContent = grade;
    gradeText.style.color = color;
    ringFill.style.stroke = color;

    // Errors table
    errorsTableBody.innerHTML = '';
    if (errors.length > 0) {
        errors.forEach(e => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${renderMarkdownWithMath(e.questionText)}</td><td>${renderMarkdownWithMathInline(e.userAnswer)}</td><td>${renderMarkdownWithMathInline(e.correctAnswer)}</td>`;
            if (window.renderMathInElement) {
                renderMathInElement(row, {
                    delimiters: [
                        {left: "$$", right: "$$", display: true},
                        {left: "$", right: "$", display: false}
                    ],
                    throwOnError: false,
                    strict: false
                });
            }
            errorsTableBody.appendChild(row);
        });
        errorsSection.style.display = 'block';
        btnRetryErrors.style.display = 'flex';
    } else {
        errorsSection.style.display = 'none';
        btnRetryErrors.style.display = 'none';
    }
}

// ==========================================================
//  BUTTON LISTENERS
// ==========================================================
btnSubmit.addEventListener('click', submitAnswer);
btnNext.addEventListener('click', nextQuestion);
btnPrev.addEventListener('click', prevQuestion);

btnToWelcome.addEventListener('click', () => {
    if (confirm('Прервать тест? Прогресс будет потерян.')) showScreen(welcomeScreen);
});

btnRestart.addEventListener('click', () => initTest(testData));
btnRetryErrors.addEventListener('click', () => initTest(testData, true));

// ==========================================================
//  KEYBOARD SHORTCUTS
// ==========================================================
document.addEventListener('keydown', (e) => {
    if (!testScreen.classList.contains('active')) return;

    const key = e.key;
    const qIndex = testOrder[currentIndex];
    const hasAnswered = userAnswers[qIndex] !== undefined;

    if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        if (!hasAnswered) { if (userAnswers[qIndex]) submitAnswer(); }
        else nextQuestion();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        if (hasAnswered) return;

        const cards = Array.from(answersContainer.querySelectorAll('.answer-card'));
        if (!cards.length) return;

        const sel = cards.findIndex(c => c.classList.contains('selected'));
        let target;
        if (sel === -1) target = key === 'ArrowDown' ? 0 : cards.length - 1;
        else target = key === 'ArrowDown' ? (sel + 1) % cards.length : (sel - 1 + cards.length) % cards.length;

        selectAnswer(cards[target], cards[target].dataset.answerId);
        cards[target].focus();
    } else if (key === 'ArrowLeft') {
        if (currentIndex > 0) prevQuestion();
    } else if (key === 'ArrowRight') {
        if (hasAnswered) nextQuestion();
    }
});
