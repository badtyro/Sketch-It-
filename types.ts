
export enum GamePhase {
  HOME = 'HOME',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export enum PlayingSubPhase {
  GETTING_PROMPTS = 'GETTING_PROMPTS',
  PRE_TURN = 'PRE_TURN',
  CHOOSE_PROMPT = 'CHOOSE_PROMPT',
  DRAWING = 'DRAWING',
  CONFIRM_SCORE = 'CONFIRM_SCORE',
  POST_TURN = 'POST_TURN',
  ROUND_LEADERBOARD = 'ROUND_LEADERBOARD'
}

export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface Prompt {
  word: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'custom';
}

export interface WordSet {
  id: string;
  name: string;
  easy: string[];
  medium: string[];
  hard: string[];
}

export interface GameState {
  phase: GamePhase;
  subPhase: PlayingSubPhase | null;
  players: Player[];
  currentPlayerIndex: number;
  currentPrompt: Prompt | null;
  promptChoices: Prompt[];
  timer: number;
  rounds: number;
  maxRounds: number;
  wordSource: 'ai' | 'custom';
  history: {
    playerName: string;
    word: string;
    wasCorrect: boolean;
    winners: string[];
  }[];
}
