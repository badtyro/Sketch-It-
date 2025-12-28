
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GamePhase, Player, Prompt, GameState } from './types';
import { generatePrompts } from './services/gemini';
import DrawingCanvas, { DrawingCanvasHandle } from './components/DrawingCanvas';

const DEFAULT_TIME = 60;
const MAX_ROUNDS = 5;
const SPEED_BONUS_THRESHOLD = 30;

const COLORS = [
  { name: 'Black', value: '#0f172a' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#f59e0b' },
];

const BRUSH_SIZES = [
  { name: 'Thin', value: 3 },
  { name: 'Medium', value: 7 },
  { name: 'Thick', value: 14 },
];

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentPlayerIndex: 0,
    currentPrompt: null,
    promptChoices: [],
    phase: GamePhase.LOBBY,
    timer: DEFAULT_TIME,
    rounds: 1,
    maxRounds: MAX_ROUNDS,
    history: []
  });

  const [newPlayerName, setNewPlayerName] = useState('');
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([]);
  const [selectedGuesserIds, setSelectedGuesserIds] = useState<Set<string>>(new Set());
  const [brushColor, setBrushColor] = useState(COLORS[0].value);
  const [brushWidth, setBrushWidth] = useState(BRUSH_SIZES[1].value);
  
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  const playSound = (type: 'tick' | 'success' | 'fail' | 'start' | 'bonus') => {
    console.log(`Sound effect: ${type}`);
  };

  const startGame = async () => {
    if (gameState.players.length < 2) return;
    setGameState(prev => ({ ...prev, phase: GamePhase.GETTING_PROMPTS }));
    const prompts = await generatePrompts(100);
    setAllPrompts(prompts);
    startTurnSetup(0, 1, prompts);
  };

  const startTurnSetup = (playerIdx: number, roundNum: number, promptsList = allPrompts) => {
    const easy = promptsList.filter(p => p.difficulty === 'easy');
    const medium = promptsList.filter(p => p.difficulty === 'medium');
    const hard = promptsList.filter(p => p.difficulty === 'hard');

    const getRandom = (arr: Prompt[]) => arr[Math.floor(Math.random() * arr.length)];
    
    const choices: Prompt[] = [
      getRandom(easy.length > 0 ? easy : promptsList),
      getRandom(medium.length > 0 ? medium : promptsList),
      getRandom(hard.length > 0 ? hard : promptsList)
    ];

    setGameState(prev => ({
      ...prev,
      phase: GamePhase.PRE_TURN,
      currentPlayerIndex: playerIdx,
      currentPrompt: null,
      promptChoices: choices,
      timer: DEFAULT_TIME,
      rounds: roundNum
    }));
  };

  const choosePrompt = (prompt: Prompt) => {
    setGameState(prev => ({ 
      ...prev, 
      currentPrompt: prompt, 
      phase: GamePhase.DRAWING 
    }));
    playSound('start');
  };

  useEffect(() => {
    if (gameState.phase === GamePhase.DRAWING && gameState.timer > 0) {
      timerInterval.current = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) {
            if (timerInterval.current) clearInterval(timerInterval.current);
            playSound('fail');
            return { ...prev, timer: 0, phase: GamePhase.POST_TURN };
          }
          if (prev.timer <= 5) playSound('tick');
          return { ...prev, timer: prev.timer - 1 };
        });
      }, 1000);
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current);
    }
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [gameState.phase]);

  const enterScoringPhase = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setSelectedGuesserIds(new Set());
    setGameState(prev => ({ ...prev, phase: GamePhase.CONFIRM_SCORE }));
  };

  const finalizeScore = () => {
    playSound('success');
    const isSpeedBonus = gameState.timer >= SPEED_BONUS_THRESHOLD;
    if (isSpeedBonus && selectedGuesserIds.size > 0) playSound('bonus');

    const difficultyPointsMap = {
      easy: 1,
      medium: 2,
      hard: 3
    };
    const basePoints = difficultyPointsMap[gameState.currentPrompt?.difficulty || 'easy'];

    setGameState(prev => {
      const updatedPlayers = prev.players.map(p => {
        const isDrawer = p.id === prev.players[prev.currentPlayerIndex].id;
        const isSelectedGuesser = selectedGuesserIds.has(p.id);
        
        let scoreIncrease = 0;
        if (isDrawer && selectedGuesserIds.size > 0) {
          scoreIncrease += basePoints;
        }
        if (isSelectedGuesser) {
          scoreIncrease += basePoints;
          if (isSpeedBonus) scoreIncrease += 1;
        }
        
        return { ...p, score: p.score + scoreIncrease };
      });

      const winnersNames = prev.players
        .filter(p => selectedGuesserIds.has(p.id))
        .map(p => p.name);

      const newHistory = [...prev.history, {
        playerName: prev.players[prev.currentPlayerIndex].name,
        word: prev.currentPrompt?.word || '',
        wasCorrect: selectedGuesserIds.size > 0,
        winners: winnersNames
      }];

      return { 
        ...prev, 
        players: updatedPlayers, 
        history: newHistory, 
        phase: GamePhase.POST_TURN 
      };
    });
  };

  const handleNextTurn = () => {
    const nextPlayerIdx = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    
    // Check if round ended
    if (nextPlayerIdx === 0) {
      setGameState(prev => ({ ...prev, phase: GamePhase.ROUND_LEADERBOARD }));
    } else {
      startTurnSetup(nextPlayerIdx, gameState.rounds);
    }
  };

  const proceedFromRoundLeaderboard = () => {
    const nextRound = gameState.rounds + 1;
    if (nextRound > gameState.maxRounds) {
      setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER }));
    } else {
      startTurnSetup(0, nextRound);
    }
  };

  const endGameEarly = useCallback(() => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER }));
  }, []);

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const player: Player = {
      id: Math.random().toString(36).substr(2, 9),
      name: newPlayerName.trim(),
      score: 0
    };
    setGameState(prev => ({ ...prev, players: [...prev.players, player] }));
    setNewPlayerName('');
  };

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center p-6 h-full max-w-md mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="text-center">
        <h1 className="text-7xl font-extrabold text-indigo-600 mb-2 drop-shadow-sm italic">Sketch it!</h1>
        <p className="text-slate-500 font-medium">The social drawing game for friends.</p>
      </div>
      <div className="w-full space-y-4">
        <div className="bg-white p-5 rounded-3xl shadow-xl border border-indigo-100">
          <label className="block text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">Players</label>
          <div className="flex gap-2 mb-4">
            <input 
              type="text" value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              placeholder="Guest Name"
              className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 focus:outline-none transition-all"
            />
            <button onClick={addPlayer} className="px-5 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95">
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {gameState.players.map(player => (
              <div key={player.id} className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 group animate-in slide-in-from-left-4">
                <span className="font-bold text-slate-700">{player.name}</span>
                <button onClick={() => setGameState(prev => ({ ...prev, players: prev.players.filter(p => p.id !== player.id) }))} className="text-slate-300 hover:text-red-500 transition-colors">
                  <i className="fa-solid fa-circle-xmark"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <button 
        disabled={gameState.players.length < 2}
        onClick={startGame}
        className={`w-full py-5 rounded-3xl font-black text-2xl shadow-2xl transition-all transform hover:scale-[1.02] active:scale-[0.95] ${
          gameState.players.length < 2 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
        }`}
      >
        START GAME
      </button>
      <div className="text-center text-slate-400 font-bold text-sm">Pass the phone to play!</div>
    </div>
  );

  const renderPreTurn = () => (
    <div className="flex flex-col items-center justify-center p-8 h-full space-y-8 animate-in slide-in-from-bottom-8 duration-500 overflow-y-auto">
      <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-6 w-full max-w-sm border-b-[12px] border-indigo-100">
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-full flex items-center justify-center text-4xl mx-auto mb-4 shadow-xl">
          <i className="fa-solid fa-handshake"></i>
        </div>
        <div>
          <p className="text-slate-400 uppercase tracking-widest font-black text-xs mb-1">Pass the device to</p>
          <h2 className="text-5xl font-black text-slate-800">{gameState.players[gameState.currentPlayerIndex].name}</h2>
        </div>
        <button 
          onClick={() => setGameState(prev => ({ ...prev, phase: GamePhase.CHOOSE_PROMPT }))}
          className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
        >
          READY
        </button>
      </div>
      <button 
        onClick={endGameEarly} 
        className="px-6 py-2 bg-rose-50 text-rose-500 rounded-full font-black uppercase tracking-widest text-xs hover:bg-rose-100 transition-all shadow-sm active:scale-95"
      >
        End Game Early
      </button>
    </div>
  );

  const renderChoosePrompt = () => (
    <div className="flex flex-col items-center justify-center p-8 h-full space-y-8 animate-in fade-in duration-300 overflow-y-auto">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-black text-indigo-900 italic">Choose Your Challenge</h2>
        <p className="text-slate-500 font-bold">Only you should see this screen!</p>
      </div>
      <div className="grid gap-6 w-full max-w-sm">
        {gameState.promptChoices.map((p, i) => (
          <button 
            key={i} 
            onClick={() => choosePrompt(p)}
            className="p-6 bg-white border-4 border-white rounded-[2rem] shadow-xl hover:border-indigo-400 hover:scale-105 transition-all text-left group"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-2xl font-black text-slate-800">{p.word}</span>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-sm ${
                p.difficulty === 'easy' ? 'bg-emerald-400 text-white' : 
                p.difficulty === 'medium' ? 'bg-amber-400 text-white' : 'bg-rose-500 text-white'
              }`}>{p.difficulty}</span>
            </div>
            <p className="text-xs text-slate-400 font-black uppercase tracking-widest">{p.category}</p>
          </button>
        ))}
      </div>
      <button 
        onClick={endGameEarly} 
        className="px-6 py-2 bg-rose-50 text-rose-500 rounded-full font-black uppercase tracking-widest text-xs hover:bg-rose-100 transition-all shadow-sm active:scale-95"
      >
        End Game Early
      </button>
    </div>
  );

  const renderDrawing = () => {
    const word = gameState.currentPrompt?.word || "";
    const difficulty = gameState.currentPrompt?.difficulty || 'easy';
    
    // Difficulty-based hint triggers
    let lengthTrigger = 30; // Easy length hint at 30s
    let letter1Trigger = 20;
    let letter2Trigger = 10;
    let letter3Trigger = -1; // No third letter for easy

    if (difficulty === 'medium') {
      lengthTrigger = 45; // Medium length hint at 45s
      letter1Trigger = 35;
      letter2Trigger = 15;
    } else if (difficulty === 'hard') {
      lengthTrigger = 60; // Hard length hint immediately
      letter1Trigger = 45;
      letter2Trigger = 30;
      letter3Trigger = 15;
    }

    const hintDisplay = word.split('').map((char, i) => {
      if (char === ' ') return <span key={i} className="mx-2"></span>;
      
      const isRevealed = 
        (gameState.timer < letter1Trigger && i === 0) ||
        (gameState.timer < letter2Trigger && i === Math.floor(word.length / 2)) ||
        (gameState.timer < letter3Trigger && i === word.length - 1);

      return (
        <span key={i} className={`w-6 h-8 flex items-center justify-center border-b-4 border-indigo-200 mx-0.5 font-black text-2xl transition-all ${isRevealed ? 'text-indigo-600' : 'text-transparent'}`}>
          {isRevealed ? char.toUpperCase() : '_'}
        </span>
      );
    });

    const timerClass = gameState.timer <= 10 
      ? 'bg-rose-500 animate-timer-critical' 
      : gameState.timer <= 30 
        ? 'bg-amber-500 animate-timer-warning' 
        : 'bg-indigo-600';

    const showLengthHint = gameState.timer <= lengthTrigger;

    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
        <header className="p-4 bg-white border-b-2 border-slate-100 flex items-center justify-between shadow-sm z-20">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-100 transition-all ${timerClass}`}>
              {gameState.timer}
            </div>
            <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-400 uppercase leading-none">Drawing</span>
               <span className="text-lg font-black text-slate-800 leading-none">{gameState.players[gameState.currentPlayerIndex].name}</span>
            </div>
          </div>
          
          <div className="flex-1 flex justify-center px-4">
            {showLengthHint && (
              <div className="flex items-end mb-1 scale-90 sm:scale-100">
                {hintDisplay}
              </div>
            )}
          </div>

          <button onClick={enterScoringPhase} className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black hover:bg-emerald-600 transition-all shadow-xl active:scale-95 flex items-center gap-2">
            <i className="fa-solid fa-check-double"></i>
            <span className="hidden sm:inline">CORRECT!</span>
          </button>
        </header>

        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
          <div className="bg-white border-r-2 border-slate-100 p-4 flex flex-row sm:flex-col items-center justify-center gap-4 z-10 shadow-inner">
             <div className="flex flex-row sm:flex-col gap-2">
                {COLORS.map(c => (
                  <button 
                    key={c.value} 
                    onClick={() => setBrushColor(c.value)}
                    className={`w-10 h-10 rounded-full border-4 transition-all shadow-sm ${brushColor === c.value ? 'border-indigo-400 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
             </div>
             <div className="w-px h-8 sm:w-8 sm:h-px bg-slate-100" />
             <div className="flex flex-row sm:flex-col gap-3">
                {BRUSH_SIZES.map(s => (
                  <button 
                    key={s.value} 
                    onClick={() => setBrushWidth(s.value)}
                    className={`flex items-center justify-center rounded-xl transition-all ${brushWidth === s.value ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    style={{ width: 40, height: 40 }}
                  >
                    <div className="rounded-full bg-current" style={{ width: s.value * 0.8, height: s.value * 0.8 }} />
                  </button>
                ))}
             </div>
             <div className="flex-1" />
             <button 
                onClick={() => canvasRef.current?.clear()}
                className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-all shadow-sm"
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
          </div>

          <main className="flex-1 relative p-4 bg-slate-100/50">
            <DrawingCanvas ref={canvasRef} color={brushColor} lineWidth={brushWidth} isActive={true} />
          </main>
        </div>

        <footer className="px-6 py-3 bg-white border-t-2 border-slate-100 flex items-center justify-between z-20">
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-300 uppercase italic">Secret Word:</span>
              <span className="font-black text-slate-800 blur-sm hover:blur-none transition-all cursor-help bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{word}</span>
           </div>
           <div className="flex items-center gap-6">
              <button 
                type="button"
                onClick={endGameEarly} 
                className="relative z-30 px-3 py-1 bg-rose-50 text-rose-500 rounded-full font-black text-[10px] hover:bg-rose-100 transition-all shadow-sm active:scale-95 uppercase tracking-widest"
              >
                End Game Early
              </button>
              <button onClick={() => setGameState(prev => ({ ...prev, phase: GamePhase.POST_TURN }))} className="text-rose-400 font-black text-xs hover:text-rose-600 transition-colors uppercase tracking-widest">Surrender Turn</button>
           </div>
        </footer>
      </div>
    );
  };

  const renderConfirmScore = () => {
    const isSpeedBonus = gameState.timer >= SPEED_BONUS_THRESHOLD;
    const otherPlayers = gameState.players.filter((_, idx) => idx !== gameState.currentPlayerIndex);

    return (
      <div className="flex flex-col items-center justify-center p-8 h-full space-y-6 animate-in zoom-in duration-300 overflow-y-auto">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center w-full max-w-md space-y-6 border-b-[12px] border-slate-100">
          <div>
            <h2 className="text-4xl font-black text-slate-800 italic">Who Guessed It?</h2>
            <p className="text-slate-500 font-bold mt-2">Tap everyone who was correct!</p>
          </div>

          {isSpeedBonus && (
            <div className="bg-amber-400 text-white p-3 rounded-2xl text-xs font-black flex items-center justify-center gap-3 shadow-lg shadow-amber-100 animate-bounce">
              <i className="fa-solid fa-bolt-lightning text-lg"></i> SPEED BONUS ACTIVE! (+1 pt extra)
            </div>
          )}

          <div className="grid gap-3">
            {otherPlayers.map(p => (
              <button 
                key={p.id}
                onClick={() => {
                  const next = new Set(selectedGuesserIds);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  setSelectedGuesserIds(next);
                }}
                className={`p-5 rounded-3xl font-black text-lg flex justify-between items-center transition-all ${
                  selectedGuesserIds.has(p.id) ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'bg-slate-50 text-slate-700 border-2 border-slate-100 hover:border-indigo-200'
                }`}
              >
                <span>{p.name}</span>
                <i className={`fa-solid ${selectedGuesserIds.has(p.id) ? 'fa-check-circle' : 'fa-circle-plus opacity-20'}`}></i>
              </button>
            ))}
          </div>

          <div className="pt-4 flex gap-4">
            <button onClick={() => setGameState(prev => ({ ...prev, phase: GamePhase.DRAWING }))} className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-3xl font-black">CANCEL</button>
            <button onClick={finalizeScore} className="flex-[2] py-4 bg-emerald-500 text-white rounded-3xl font-black shadow-xl shadow-emerald-100 active:scale-95">SUBMIT SCORE</button>
          </div>
        </div>
      </div>
    );
  };

  const renderPostTurn = () => {
    const lastHistory = gameState.history[gameState.history.length - 1];
    return (
      <div className="flex flex-col items-center justify-center p-8 h-full space-y-6 animate-in zoom-in duration-300 overflow-y-auto">
         <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl text-center w-full max-w-sm space-y-8 border-b-[14px] border-slate-100">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl mx-auto shadow-xl ${lastHistory?.wasCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
              <i className={`fa-solid ${lastHistory?.wasCorrect ? 'fa-medal' : 'fa-hourglass-end'}`}></i>
            </div>
            <div>
              <h2 className="text-4xl font-black text-slate-800 italic">{lastHistory?.wasCorrect ? 'Point Awarded!' : 'Unlucky!'}</h2>
              <p className="text-slate-400 font-black uppercase tracking-widest mt-2">The word was</p>
              <p className="text-3xl font-black text-indigo-600">{gameState.currentPrompt?.word}</p>
            </div>
            {lastHistory?.wasCorrect && (
              <div className="bg-indigo-50 p-4 rounded-3xl">
                <p className="text-xs font-black text-indigo-400 uppercase mb-2">Winners</p>
                <div className="flex flex-wrap justify-center gap-2">
                   {lastHistory.winners.map(name => <span key={name} className="bg-white px-3 py-1 rounded-full text-indigo-700 font-bold text-sm shadow-sm">{name}</span>)}
                </div>
              </div>
            )}
            <button onClick={handleNextTurn} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95">
              NEXT
            </button>
         </div>
      </div>
    );
  };

  const renderRoundLeaderboard = () => {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full space-y-8 animate-in slide-in-from-right-12 duration-500 overflow-y-auto">
        <div className="text-center space-y-2">
          <div className="text-5xl">📊</div>
          <h1 className="text-4xl font-black text-indigo-900 italic">Round {gameState.rounds} Leaderboard</h1>
        </div>
        
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden border-b-[12px] border-indigo-100">
          <div className="p-8 space-y-3">
            {sortedPlayers.map((player, idx) => (
              <div key={player.id} className="flex items-center justify-between p-4 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">{idx + 1}</span>
                  <span className="font-bold text-slate-700">{player.name}</span>
                </div>
                <span className="font-black text-indigo-600">{player.score} pts</span>
              </div>
            ))}
          </div>
          <div className="bg-indigo-600 p-6">
            <button onClick={proceedFromRoundLeaderboard} className="w-full py-5 bg-white text-indigo-600 rounded-3xl font-black text-xl active:scale-95">
              {gameState.rounds >= gameState.maxRounds ? 'VIEW FINAL RESULTS' : 'START NEXT ROUND'}
            </button>
          </div>
        </div>
        <button 
          onClick={endGameEarly} 
          className="px-6 py-2 bg-rose-50 text-rose-500 rounded-full font-black uppercase tracking-widest text-xs hover:bg-rose-100 transition-all shadow-sm active:scale-95"
        >
          End Game Early
        </button>
      </div>
    );
  };

  const renderGameOver = () => {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full space-y-8 animate-in slide-in-from-top-12 duration-700 overflow-y-auto">
        <div className="text-center space-y-2">
          <div className="text-7xl animate-bounce">👑</div>
          <h1 className="text-5xl font-black text-slate-800 italic drop-shadow-sm">Final Results</h1>
        </div>
        
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden border-b-[16px] border-indigo-100">
          <div className="p-8 space-y-4">
            {sortedPlayers.map((player, idx) => (
              <div key={player.id} className={`flex items-center justify-between p-5 rounded-3xl border-2 transition-all ${idx === 0 ? 'bg-yellow-50 border-yellow-200 scale-105 shadow-lg shadow-yellow-100/50' : 'bg-slate-50 border-slate-100 opacity-90'}`}>
                <div className="flex items-center gap-5">
                   <span className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg ${idx === 0 ? 'bg-yellow-400 text-white shadow-md' : idx === 1 ? 'bg-slate-300 text-slate-600' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-white text-slate-400'}`}>
                     {idx + 1}
                   </span>
                   <span className="font-black text-slate-800 text-xl">{player.name}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-black text-indigo-600 text-2xl leading-none">{player.score}</span>
                  <span className="text-[10px] font-black text-indigo-300 uppercase leading-none">points</span>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-indigo-600 p-6">
            <button onClick={() => window.location.reload()} className="w-full py-5 bg-white text-indigo-600 rounded-3xl font-black text-xl hover:bg-slate-50 transition-all shadow-xl active:scale-95">
              NEW GAME
            </button>
          </div>
        </div>

        <div className="w-full max-w-md bg-white/40 backdrop-blur-sm p-4 rounded-3xl">
           <h3 className="text-center font-black text-slate-400 text-xs uppercase tracking-widest mb-4">Match Recap</h3>
           <div className="max-h-32 overflow-y-auto px-2 space-y-3">
              {gameState.history.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 bg-white/60 rounded-xl">
                  <span className="text-slate-600 font-bold"><span className="text-indigo-400 italic">#{i+1}</span> {h.playerName} drew <span className="text-slate-900 font-black">{h.word}</span></span>
                  <span className={h.wasCorrect ? 'text-emerald-500 font-black' : 'text-rose-400 font-black'}>{h.wasCorrect ? 'SOLVED' : 'FAILED'}</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-indigo-50 flex flex-col font-sans select-none overflow-hidden text-slate-900">
      {gameState.phase === GamePhase.LOBBY && renderLobby()}
      {gameState.phase === GamePhase.GETTING_PROMPTS && (
        <div className="flex flex-col items-center justify-center h-full space-y-8">
           <div className="relative">
              <div className="w-24 h-24 border-8 border-indigo-100 rounded-full"></div>
              <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
           </div>
           <p className="text-2xl font-black text-indigo-900 italic animate-pulse">Sharpening the pencils...</p>
        </div>
      )}
      {gameState.phase === GamePhase.PRE_TURN && renderPreTurn()}
      {gameState.phase === GamePhase.CHOOSE_PROMPT && renderChoosePrompt()}
      {gameState.phase === GamePhase.DRAWING && renderDrawing()}
      {gameState.phase === GamePhase.CONFIRM_SCORE && renderConfirmScore()}
      {gameState.phase === GamePhase.POST_TURN && renderPostTurn()}
      {gameState.phase === GamePhase.ROUND_LEADERBOARD && renderRoundLeaderboard()}
      {gameState.phase === GamePhase.GAME_OVER && renderGameOver()}
    </div>
  );
};

export default App;
