
export enum GamePhase {
  LOBBY = 'LOBBY',
  GETTING_PROMPTS = 'GETTING_PROMPTS',
  PRE_TURN = 'PRE_TURN',
  CHOOSE_PROMPT = 'CHOOSE_PROMPT',
  DRAWING = 'DRAWING',
  CONFIRM_SCORE = 'CONFIRM_SCORE',
  POST_TURN = 'POST_TURN',
  ROUND_LEADERBOARD = 'ROUND_LEADERBOARD',
  GAME_OVER = 'GAME_OVER'
}

export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface Prompt {
  word: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  currentPrompt: Prompt | null;
  promptChoices: Prompt[];
  phase: GamePhase;
  timer: number;
  rounds: number;
  maxRounds: number;
  history: {
    playerName: string;
    word: string;
    wasCorrect: boolean;
    winners: string[];
  }[];
}
