// Runs the computer player off the main thread so the board stays responsive
importScripts('rules.js', 'ai.js');

self.addEventListener('message', (event) => {
  const { id, board, color, rules, level } = event.data;
  const move = GomokuAI.chooseMove(board, color, { rules, level });
  self.postMessage({ id, move });
});
