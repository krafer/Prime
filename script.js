"use strict";

(() => {
  const ROUND_SECONDS = 60;
  const TILE_COUNT = 16;
  const STORAGE_KEY = "primeHuntBestScores";
  const LEVELS = {
    easy: { label: "Easy", min: 20, max: 90 },
    medium: { label: "Medium", min: 100, max: 999 },
    hard: { label: "Hard", min: 1000, max: 9999 }
  };

  const elements = {
    menu: document.querySelector("#menu-screen"),
    game: document.querySelector("#game-screen"),
    results: document.querySelector("#results-screen"),
    play: document.querySelector("#play-button"),
    instructions: document.querySelector("#instructions-button"),
    dialog: document.querySelector("#instructions-dialog"),
    closeInstructions: document.querySelector("#close-instructions"),
    gotIt: document.querySelector("#got-it-button"),
    difficultyButtons: [...document.querySelectorAll(".difficulty-option")],
    bestScore: document.querySelector("#best-score"),
    bestDifficulty: document.querySelector(".best-difficulty"),
    storageNote: document.querySelector("#storage-note"),
    grid: document.querySelector("#number-grid"),
    roundNumber: document.querySelector("#round-number"),
    difficultyLabel: document.querySelector("#difficulty-label"),
    totalScore: document.querySelector("#total-score"),
    timer: document.querySelector("#timer"),
    timerChip: document.querySelector(".timer-chip"),
    selectionCount: document.querySelector("#selection-count"),
    roundMessage: document.querySelector("#round-message"),
    submit: document.querySelector("#submit-button"),
    pause: document.querySelector("#pause-button"),
    restart: document.querySelector("#restart-button"),
    quit: document.querySelector("#quit-button"),
    pauseOverlay: document.querySelector("#pause-overlay"),
    resume: document.querySelector("#resume-button"),
    pauseMenu: document.querySelector("#pause-menu-button"),
    resultsMessage: document.querySelector("#results-message"),
    roundScore: document.querySelector("#round-score"),
    resultsTotal: document.querySelector("#results-total"),
    correctCount: document.querySelector("#correct-count"),
    incorrectCount: document.querySelector("#incorrect-count"),
    missedCount: document.querySelector("#missed-count"),
    primeAnswers: document.querySelector("#prime-answers"),
    scoreBreakdown: document.querySelector("#score-breakdown"),
    bonusReveal: document.querySelector("#bonus-reveal"),
    secretResult: document.querySelector("#secret-result"),
    completionResult: document.querySelector("#completion-result"),
    bonusCard: document.querySelector(".bonus-card"),
    nextRound: document.querySelector("#next-round-button"),
    playAgain: document.querySelector("#play-again-button"),
    mainMenu: document.querySelector("#main-menu-button")
  };

  const state = {
    difficulty: "easy",
    score: 0,
    round: 0,
    numbers: [],
    secretPrime: null,
    selected: new Set(),
    secondsLeft: ROUND_SECONDS,
    timerId: null,
    submitted: false,
    paused: false,
    scoresByDifficulty: {},
    storageAvailable: true
  };

  function isPrime(number) {
    if (!Number.isInteger(number) || number < 2) return false;
    if (number === 2) return true;
    if (number % 2 === 0) return false;
    for (let divisor = 3; divisor * divisor <= number; divisor += 2) {
      if (number % divisor === 0) return false;
    }
    return true;
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function makeRoundNumbers(level) {
    const primes = [];
    const nonPrimes = [];
    for (let number = level.min; number <= level.max; number += 1) {
      (isPrime(number) ? primes : nonPrimes).push(number);
    }

    const primeCount = randomInteger(5, 8);
    const selection = [
      ...shuffle(primes).slice(0, primeCount),
      ...shuffle(nonPrimes).slice(0, TILE_COUNT - primeCount)
    ];
    return shuffle(selection);
  }

  function showScreen(screen) {
    elements.menu.hidden = screen !== "menu";
    elements.game.hidden = screen !== "game";
    elements.results.hidden = screen !== "results";
  }

  function formatScore(score) {
    return score.toLocaleString("en-US");
  }

  function setDifficulty(difficulty) {
    if (!Object.hasOwn(LEVELS, difficulty)) return;
    state.difficulty = difficulty;
    for (const button of elements.difficultyButtons) {
      const selected = button.dataset.difficulty === difficulty;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    elements.bestDifficulty.textContent = `· ${LEVELS[difficulty].label.toUpperCase()}`;
    elements.bestScore.textContent = formatScore(state.scoresByDifficulty[difficulty] || 0);
  }

  function loadBestScores() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === null) return;
      const parsed = JSON.parse(saved);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Saved best scores have an invalid format.");
      }
      for (const key of Object.keys(LEVELS)) {
        const score = parsed[key];
        state.scoresByDifficulty[key] = Number.isSafeInteger(score) && score >= 0 ? score : 0;
      }
    } catch (error) {
      state.storageAvailable = false;
      elements.storageNote.textContent = "Best scores could not be loaded or saved in this browser.";
      console.error("Unable to load saved best scores.", error);
    }
  }

  function saveBestScore() {
    if (!state.storageAvailable) return;
    const previousBest = state.scoresByDifficulty[state.difficulty] || 0;
    if (state.score <= previousBest) return;
    state.scoresByDifficulty[state.difficulty] = state.score;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scoresByDifficulty));
      elements.bestScore.textContent = formatScore(state.score);
    } catch (error) {
      state.storageAvailable = false;
      elements.storageNote.textContent = "Best score could not be saved in this browser.";
      console.error("Unable to save best score.", error);
    }
  }

  function updateScoreDisplays() {
    elements.totalScore.textContent = formatScore(state.score);
    elements.resultsTotal.textContent = formatScore(state.score);
  }

  function updateTimerDisplay() {
    elements.timer.textContent = String(state.secondsLeft).padStart(2, "0");
    elements.timerChip.classList.toggle("is-urgent", state.secondsLeft <= 10);
  }

  function startTimer(reset = true) {
    stopTimer();
    if (reset) {
      state.secondsLeft = ROUND_SECONDS;
      updateTimerDisplay();
    }
    state.timerId = window.setInterval(() => {
      if (state.paused || state.submitted) return;
      state.secondsLeft -= 1;
      updateTimerDisplay();
      if (state.secondsLeft <= 0) submitRound(true);
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateSelectionCount() {
    const count = state.selected.size;
    elements.selectionCount.textContent = `${count} SELECTED`;
    elements.grid.setAttribute("aria-label", `Number tiles, ${count} selected`);
  }

  function createBoard() {
    elements.grid.replaceChildren();
    for (const number of state.numbers) {
      const tile = document.createElement("button");
      tile.className = "number-tile";
      tile.type = "button";
      tile.textContent = String(number);
      tile.dataset.number = String(number);
      tile.setAttribute("aria-pressed", "false");
      tile.setAttribute("aria-label", `Number ${number}`);
      tile.addEventListener("click", () => toggleSelection(number, tile));
      elements.grid.append(tile);
    }
  }

  function toggleSelection(number, tile) {
    if (state.submitted || state.paused) return;
    if (state.selected.has(number)) {
      state.selected.delete(number);
      tile.classList.remove("is-selected");
      tile.setAttribute("aria-pressed", "false");
    } else {
      state.selected.add(number);
      tile.classList.add("is-selected");
      tile.setAttribute("aria-pressed", "true");
    }
    updateSelectionCount();
  }

  function beginRound() {
    stopTimer();
    state.round += 1;
    state.numbers = makeRoundNumbers(LEVELS[state.difficulty]);
    state.secretPrime = shuffle(state.numbers.filter(isPrime))[0];
    state.selected = new Set();
    state.submitted = false;
    state.paused = false;
    state.secondsLeft = ROUND_SECONDS;
    elements.pauseOverlay.hidden = true;
    elements.roundNumber.textContent = String(state.round).padStart(2, "0");
    elements.difficultyLabel.textContent = LEVELS[state.difficulty].label.toUpperCase();
    elements.roundMessage.textContent = "Take your time. You have 60 seconds.";
    elements.roundMessage.classList.remove("is-celebration");
    elements.submit.disabled = false;
    createBoard();
    updateSelectionCount();
    updateScoreDisplays();
    showScreen("game");
    startTimer();
  }

  function renderResults(result) {
    const allFound = result.missed === 0;
    const rawRoundScore = (result.correct * 100) - (result.incorrect * 50) +
      (result.foundSecret ? 250 : 0) + (allFound ? 200 : 0);
    const previousScore = state.score;
    state.score = Math.max(0, state.score + rawRoundScore);
    const appliedScore = state.score - previousScore;
    updateScoreDisplays();
    saveBestScore();

    elements.roundScore.textContent = `${appliedScore >= 0 ? "+" : ""}${formatScore(appliedScore)}`;
    elements.correctCount.textContent = String(result.correct);
    elements.incorrectCount.textContent = String(result.incorrect);
    elements.missedCount.textContent = String(result.missed);
    elements.primeAnswers.replaceChildren();
    for (const prime of result.primes) {
      const pill = document.createElement("span");
      pill.className = "prime-pill";
      pill.textContent = String(prime);
      elements.primeAnswers.append(pill);
    }
    const secretPoints = result.foundSecret ? 250 : 0;
    const completionPoints = allFound ? 200 : 0;
    elements.scoreBreakdown.textContent =
      `${result.correct} correct × 100 − ${result.incorrect} wrong × 50 + ` +
      `${result.missed} missed × 0 + ` +
      `${secretPoints} secret bonus + ${completionPoints} completion bonus = ` +
      `${rawRoundScore} calculated points${appliedScore !== rawRoundScore ? `; ${appliedScore} points applied after the zero-score floor` : ""}.`;
    elements.bonusReveal.textContent = result.foundSecret
      ? `Secret prime ${state.secretPrime} found! +250 bonus points.`
      : `The secret bonus prime was ${state.secretPrime}. Select it next time to earn 250 bonus points.`;
    elements.secretResult.textContent = result.foundSecret
      ? "Secret prime discovered! +250 points."
      : "Secret prime missed — no bonus this round.";
    elements.completionResult.textContent = allFound
      ? "Every prime found. Completion bonus: +200 points."
      : "Find every prime to earn the +200 completion bonus.";
    elements.resultsMessage.textContent = result.timedOut
      ? "Time's up! Here's how your number hunt went."
      : allFound
        ? "Every prime found! Nice work."
        : "Here's how your number hunt went. Every round is a chance to beat your best.";
    elements.bonusCard.classList.remove("is-celebrating");
    if (result.foundSecret || allFound) {
      void elements.bonusCard.offsetWidth;
      elements.bonusCard.classList.add("is-celebrating");
    }
    elements.playAgain.textContent = "PLAY AGAIN";
    showScreen("results");
    elements.nextRound.focus();
  }

  function submitRound(timedOut = false) {
    if (state.submitted || state.paused) return;
    state.submitted = true;
    stopTimer();
    const primes = state.numbers.filter(isPrime);
    const primeSet = new Set(primes);
    const correct = [...state.selected].filter((number) => primeSet.has(number));
    const incorrect = [...state.selected].filter((number) => !primeSet.has(number));
    const missed = primes.filter((number) => !state.selected.has(number));
    const foundSecret = state.selected.has(state.secretPrime);

    for (const tile of elements.grid.querySelectorAll(".number-tile")) {
      const number = Number(tile.dataset.number);
      tile.disabled = true;
      tile.classList.remove("is-selected");
      if (primeSet.has(number)) tile.classList.add("is-correct");
      if (!primeSet.has(number) && state.selected.has(number)) tile.classList.add("is-incorrect");
      if (primeSet.has(number) && !state.selected.has(number)) tile.classList.add("is-missed");
      if (number === state.secretPrime) tile.classList.add("is-secret");
    }
    elements.submit.disabled = true;
    elements.roundMessage.textContent = timedOut
      ? "Time is up — your selections have been submitted."
      : `You found ${correct.length} of ${primes.length} primes.`;
    if (missed.length === 0) {
      elements.roundMessage.textContent = "Every prime found!";
      elements.roundMessage.classList.add("is-celebration");
    }
    renderResults({ primes, correct: correct.length, incorrect: incorrect.length, missed: missed.length, foundSecret, timedOut });
  }

  function returnToMenu() {
    stopTimer();
    state.paused = false;
    elements.pauseOverlay.hidden = true;
    showScreen("menu");
    setDifficulty(state.difficulty);
  }

  function pauseRound() {
    if (state.submitted || state.paused) return;
    state.paused = true;
    stopTimer();
    elements.pauseOverlay.hidden = false;
    elements.resume.focus();
  }

  elements.play.addEventListener("click", beginRound);
  elements.difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => setDifficulty(button.dataset.difficulty));
  });
  elements.instructions.addEventListener("click", () => elements.dialog.showModal());
  elements.closeInstructions.addEventListener("click", () => elements.dialog.close());
  elements.gotIt.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
  elements.submit.addEventListener("click", () => submitRound());
  elements.pause.addEventListener("click", pauseRound);
  elements.resume.addEventListener("click", () => {
    state.paused = false;
    elements.pauseOverlay.hidden = true;
    startTimer(false);
    elements.pause.focus();
  });
  elements.restart.addEventListener("click", () => {
    if (!window.confirm("Restart the game and reset your current score?")) return;
    state.score = 0;
    state.round = 0;
    updateScoreDisplays();
    beginRound();
  });
  elements.quit.addEventListener("click", () => {
    if (window.confirm("Leave this round and return to the main menu? Your current round will not be scored.")) returnToMenu();
  });
  elements.pauseMenu.addEventListener("click", () => {
    if (window.confirm("Leave this round and return to the main menu? Your current round will not be scored.")) returnToMenu();
  });
  elements.nextRound.addEventListener("click", beginRound);
  elements.playAgain.addEventListener("click", beginRound);
  elements.mainMenu.addEventListener("click", returnToMenu);

  loadBestScores();
  setDifficulty(state.difficulty);
  updateScoreDisplays();
})();
