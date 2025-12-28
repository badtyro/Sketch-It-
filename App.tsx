
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GamePhase, PlayingSubPhase, Player, Prompt, GameState, WordSet } from './types';
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
  // Persistence Loading
  const loadWordSets = (): WordSet[] => {
    const saved = localStorage.getItem('sketchit_wordsets_v2');
    if (saved) return JSON.parse(saved);
    return [{
      id: 'default',
      name: 'Classic Pack',
      easy: ['Cat', 'Sun', 'House', 'Apple', 'Pizza'],
      medium: ['Robot', 'Skateboard', 'Bicycle', 'Galaxy'],
      hard: ['Dinosaur', 'Internet', 'Gravity', 'Library']
    }];
  };

  const [gameState, setGameState] = useState<GameState>({
    phase: GamePhase.HOME,
    subPhase: null,
    players: [],
    currentPlayerIndex: 0,
    currentPrompt: null,
    promptChoices: [],
    timer: DEFAULT_TIME,
    rounds: 1,
    maxRounds: MAX_ROUNDS,
    wordSource: (localStorage.getItem('sketchit_wordsource') as 'ai' | 'custom') || 'ai',
    history: []
  });

  const [newPlayerName, setNewPlayerName] = useState('');
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([]);
  const [selectedGuesserIds, setSelectedGuesserIds] = useState<Set<string>>(new Set());
  const [brushColor, setBrushColor] = useState(COLORS[0].value);
  const [brushWidth, setBrushWidth] = useState(BRUSH_SIZES[1].value);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [wordSets, setWordSets] = useState<WordSet[]>(loadWordSets());
  const [selectedSetId, setSelectedSetId] = useState<string>(
    localStorage.getItem('sketchit_selected_set_id') || 'default'
  );

  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  // Sync to Storage
  useEffect(() => {
    localStorage.setItem('sketchit_wordsets_v2', JSON.stringify(wordSets));
  }, [wordSets]);

  useEffect(() => {
    localStorage.setItem('sketchit_selected_set_id', selectedSetId);
  }, [selectedSetId]);

  useEffect(() => {
    localStorage.setItem('sketchit_wordsource', gameState.wordSource);
  }, [gameState.wordSource]);

  const activeSet = useMemo(() => {
    return wordSets.find(s => s.id === selectedSetId) || wordSets[0] || { id: '', name: '', easy: [], medium: [], hard: [] };
  }, [wordSets, selectedSetId]);

  // Immutable Bank Updates
  const handleUpdateActiveWords = (difficulty: 'easy' | 'medium' | 'hard', text: string) => {
    const words = text.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
    setWordSets(prev => prev.map(s => s.id === selectedSetId ? { ...s, [difficulty]: words } : s));
  };

  const handleUpdateActiveName = (name: string) => {
    setWordSets(prev => prev.map(s => s.id === selectedSetId ? { ...s, name } : s));
  };

  const handleCreateSet = useCallback(() => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newSet: WordSet = {
      id: newId,
      name: `Custom Bank ${wordSets.length + 1}`,
      easy: [],
      medium: [],
      hard: []
    };
    setWordSets(prev => [...prev, newSet]);
    setSelectedSetId(newId);
  }, [wordSets.length]);

  const handleDeleteSet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (wordSets.length <= 1) return;
    setWordSets(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (selectedSetId === id) setSelectedSetId(filtered[0]?.id || '');
      return filtered;
    });
  };

  // Game Logic
  const startMatch = async () => {
    if (gameState.players.length < 2) return;
    
    if (gameState.wordSource === 'ai') {
      setGameState(prev => ({ ...prev, phase: GamePhase.PLAYING, subPhase: PlayingSubPhase.GETTING_PROMPTS }));
      const prompts = await generatePrompts(60);
      setAllPrompts(prompts);
      setupTurn(0, 1, prompts);
    } else {
      const customPrompts: Prompt[] = [
        ...activeSet.easy.map(w => ({ word: w, category: 'Easy', difficulty: 'easy' as const })),
        ...activeSet.medium.map(w => ({ word: w, category: 'Medium', difficulty: 'medium' as const })),
        ...activeSet.hard.map(w => ({ word: w, category: 'Hard', difficulty: 'hard' as const })),
      ];

      if (customPrompts.length < 3) {
        alert("This bank needs more words! Categorize them into Easy, Medium, and Hard in settings.");
        setIsSettingsOpen(true);
        return;
      }
      setAllPrompts(customPrompts);
      setupTurn(0, 1, customPrompts);
    }
  };

  const setupTurn = (playerIdx: number, roundNum: number, pool = allPrompts) => {
    let choices: Prompt[] = [];
    const available = [...pool];

    if (gameState.wordSource === 'ai' || pool.length > 3) {
      const easy = available.filter(p => p.difficulty === 'easy' || p.difficulty === 'custom');
      const med = available.filter(p => p.difficulty === 'medium');
      const hard = available.filter(p => p.difficulty === 'hard');
      const rnd = (arr: Prompt[]) => arr[Math.floor(Math.random() * arr.length)];
      
      choices = [
        rnd(easy.length ? easy : available),
        rnd(med.length ? med : available),
        rnd(hard.length ? hard : available)
      ];
    } else {
      choices = available.slice(0, 3);
    }

    setGameState(prev => ({
      ...prev,
      phase: GamePhase.PLAYING,
      subPhase: PlayingSubPhase.PRE_TURN,
      currentPlayerIndex: playerIdx,
      currentPrompt: null,
      promptChoices: choices,
      timer: DEFAULT_TIME,
      rounds: roundNum
    }));
  };

  const selectPrompt = (prompt: Prompt) => {
    setGameState(prev => ({ ...prev, currentPrompt: prompt, subPhase: PlayingSubPhase.DRAWING }));
  };

  useEffect(() => {
    if (gameState.subPhase === PlayingSubPhase.DRAWING && gameState.timer > 0) {
      timerInterval.current = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) {
            clearInterval(timerInterval.current!);
            const entry = {
              playerName: prev.players[prev.currentPlayerIndex].name,
              word: prev.currentPrompt?.word || '',
              wasCorrect: false,
              winners: []
            };
            return { ...prev, timer: 0, history: [...prev.history, entry], subPhase: PlayingSubPhase.POST_TURN };
          }
          return { ...prev, timer: prev.timer - 1 };
        });
      }, 1000);
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current);
    }
    return () => { if (timerInterval.current) clearInterval(timerInterval.current); };
  }, [gameState.subPhase]);

  const confirmSolved = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setSelectedGuesserIds(new Set());
    setGameState(prev => ({ ...prev, subPhase: PlayingSubPhase.CONFIRM_SCORE }));
  };

  const skipTurn = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setGameState(prev => {
      const entry = {
        playerName: prev.players[prev.currentPlayerIndex].name,
        word: prev.currentPrompt?.word || '',
        wasCorrect: false,
        winners: []
      };
      return {
        ...prev,
        history: [...prev.history, entry],
        subPhase: PlayingSubPhase.POST_TURN
      };
    });
  };

  const submitScore = () => {
    const isSpeedBonus = gameState.timer >= SPEED_BONUS_THRESHOLD;
    const diffMap = { easy: 1, medium: 2, hard: 3, custom: 2 };
    const base = diffMap[gameState.currentPrompt?.difficulty || 'easy'];

    setGameState(prev => {
      const nextPlayers = prev.players.map(p => {
        const isDrawer = p.id === prev.players[prev.currentPlayerIndex].id;
        const guessed = selectedGuesserIds.has(p.id);
        let bonus = 0;
        if (isDrawer && selectedGuesserIds.size > 0) bonus += base;
        if (guessed) bonus += base + (isSpeedBonus ? 1 : 0);
        return { ...p, score: p.score + bonus };
      });

      const winners = prev.players.filter(p => selectedGuesserIds.has(p.id)).map(p => p.name);
      const entry = {
        playerName: prev.players[prev.currentPlayerIndex].name,
        word: prev.currentPrompt?.word || '',
        wasCorrect: selectedGuesserIds.size > 0,
        winners
      };

      return {
        ...prev,
        players: nextPlayers,
        history: [...prev.history, entry],
        subPhase: PlayingSubPhase.POST_TURN
      };
    });
  };

  const nextTurn = () => {
    const nextIdx = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    if (nextIdx === 0) {
      setGameState(prev => ({ ...prev, subPhase: PlayingSubPhase.ROUND_LEADERBOARD }));
    } else {
      setupTurn(nextIdx, gameState.rounds);
    }
  };

  const nextRound = () => {
    if (gameState.rounds >= gameState.maxRounds) {
      setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER, subPhase: null }));
    } else {
      setupTurn(0, gameState.rounds + 1);
    }
  };

  const endEarly = () => {
    setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER, subPhase: null }));
  };

  const restartMatch = () => {
    setGameState(prev => ({
      ...prev,
      phase: GamePhase.HOME,
      subPhase: null,
      players: prev.players.map(p => ({ ...p, score: 0 })),
      currentPlayerIndex: 0,
      currentPrompt: null,
      history: [],
      timer: DEFAULT_TIME,
      rounds: 1
    }));
  };

  const exitToHome = () => {
    setGameState({
      phase: GamePhase.HOME,
      subPhase: null,
      players: [],
      currentPlayerIndex: 0,
      currentPrompt: null,
      promptChoices: [],
      timer: DEFAULT_TIME,
      rounds: 1,
      maxRounds: MAX_ROUNDS,
      wordSource: gameState.wordSource,
      history: []
    });
  };

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const player: Player = { id: Math.random().toString(36).substr(2, 9), name: newPlayerName.trim(), score: 0 };
    setGameState(prev => ({ ...prev, players: [...prev.players, player] }));
    setNewPlayerName('');
  };

  const removePlayer = (id: string) => {
    setGameState(prev => ({ ...prev, players: prev.players.filter(p => p.id !== id) }));
  };

  // Rendering
  const renderHome = () => (
    <div className="flex flex-col items-center justify-center p-6 h-full max-w-md mx-auto space-y-10 animate-in fade-in zoom-in">
      <div className="absolute top-6 right-6">
        <button onClick={() => setIsSettingsOpen(true)} className="w-12 h-12 rounded-full bg-white text-indigo-600 shadow-lg hover:scale-110 active:scale-95 transition-all flex items-center justify-center">
          <i className="fa-solid fa-gear text-xl"></i>
        </button>
      </div>
      <div className="text-center">
        <h1 className="text-7xl font-extrabold text-indigo-600 italic">Sketch it!</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">The ultimate party game</p>
      </div>
      <div className="w-full bg-white p-8 rounded-[3rem] shadow-xl border border-indigo-50 space-y-4">
        <div className="flex gap-2">
          <input 
            type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            placeholder="Add player..." className="flex-1 px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-400 outline-none font-bold"
          />
          <button onClick={addPlayer} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl shadow-lg active:scale-95"><i className="fa-solid fa-plus"></i></button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {gameState.players.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <span className="font-bold text-indigo-900">{p.name}</span>
              <button onClick={() => removePlayer(p.id)} className="text-slate-300 hover:text-rose-500"><i className="fa-solid fa-circle-xmark"></i></button>
            </div>
          ))}
          {gameState.players.length === 0 && <p className="text-center text-slate-300 italic py-4">Add 2+ players!</p>}
        </div>
      </div>
      <button 
        disabled={gameState.players.length < 2} onClick={startMatch}
        className={`w-full py-6 rounded-[2.5rem] font-black text-2xl shadow-2xl transition-all transform hover:scale-[1.02] active:scale-[0.95] ${gameState.players.length < 2 ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white shadow-indigo-200'}`}
      >
        START MATCH
      </button>
    </div>
  );

  const renderPlaying = () => {
    switch(gameState.subPhase) {
      case PlayingSubPhase.GETTING_PROMPTS:
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-10 p-6 animate-in fade-in">
             <div className="relative">
                <div className="w-40 h-40 border-[16px] border-indigo-100 rounded-full"></div>
                <div className="w-40 h-40 border-[16px] border-indigo-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
             </div>
             <p className="text-4xl font-black text-indigo-900 italic animate-pulse">Summoning Prompts...</p>
          </div>
        );
      case PlayingSubPhase.PRE_TURN:
        return (
          <div className="flex flex-col items-center justify-center p-8 h-full space-y-10 animate-in slide-in-from-bottom-8">
            <div className="bg-white p-12 rounded-[4rem] shadow-2xl text-center space-y-8 w-full max-w-sm border-b-[14px] border-indigo-100">
              <div className="w-24 h-24 bg-indigo-600 text-white rounded-full flex items-center justify-center text-4xl mx-auto shadow-xl ring-8 ring-indigo-50">
                <i className="fa-solid fa-user-check"></i>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-widest font-black text-[10px] mb-2">Next artist</p>
                <h2 className="text-5xl font-black text-slate-800 leading-tight italic">{gameState.players[gameState.currentPlayerIndex].name}</h2>
              </div>
              <button onClick={() => setGameState(prev => ({ ...prev, subPhase: PlayingSubPhase.CHOOSE_PROMPT }))} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-indigo-100 active:scale-95">READY</button>
            </div>
            <button onClick={endEarly} className="px-8 py-3 bg-white text-rose-500 rounded-full font-black uppercase text-[10px] border border-rose-100">End Early</button>
          </div>
        );
      case PlayingSubPhase.CHOOSE_PROMPT:
        return (
          <div className="flex flex-col items-center justify-center p-8 h-full space-y-10 animate-in fade-in">
            <div className="text-center space-y-3">
              <h2 className="text-4xl font-black text-indigo-900 italic">Select Word</h2>
              <p className="text-slate-500 font-bold">Only <span className="text-indigo-600 underline">{gameState.players[gameState.currentPlayerIndex].name}</span> look!</p>
            </div>
            <div className="grid gap-4 w-full max-w-sm">
              {gameState.promptChoices.map((p, i) => (
                <button 
                  key={i} onClick={() => selectPrompt(p)}
                  className="p-7 bg-white border-4 border-transparent rounded-[2.5rem] shadow-xl hover:border-indigo-400 hover:scale-105 transition-all text-left flex items-center justify-between"
                >
                  <div className="shrink min-w-0 pr-4">
                    <span className="text-2xl font-black text-slate-800 block truncate mb-1">{p.word}</span>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{p.category}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-black px-4 py-2 rounded-full text-white uppercase ${p.difficulty === 'easy' ? 'bg-emerald-500' : p.difficulty === 'medium' ? 'bg-amber-500' : p.difficulty === 'hard' ? 'bg-rose-500' : 'bg-indigo-600'}`}>{p.difficulty}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case PlayingSubPhase.DRAWING:
        const word = gameState.currentPrompt?.word || "";
        const isLastTen = gameState.timer <= 10;
        const revealLen = gameState.timer <= 58;
        const reveal1 = gameState.timer <= 50;
        const reveal2 = gameState.timer <= 35;
        const reveal3 = gameState.timer <= 20;

        return (
          <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <header className="p-4 bg-white border-b-2 border-slate-100 flex items-center justify-between shadow-sm z-20">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg transition-all duration-300 ${isLastTen ? 'bg-rose-500 scale-150 animate-timer-critical z-50 ring-[10px] ring-rose-100' : gameState.timer <= 30 ? 'bg-amber-500 animate-timer-warning' : 'bg-indigo-600'}`}>
                  {gameState.timer}
                </div>
                <span className="font-black text-slate-800 hidden sm:block">{gameState.players[gameState.currentPlayerIndex].name}</span>
              </div>
              <div className="flex-1 flex justify-center px-4">
                {revealLen && (
                  <div className="flex items-end mb-1 scale-90 sm:scale-100 transition-all">
                    {word.split('').map((char, i) => {
                      const isRevealed = (reveal1 && i === 0) || (reveal2 && i === Math.floor(word.length / 2)) || (reveal3 && i === word.length - 1);
                      return char === ' ' ? <span key={i} className="mx-2"></span> : <span key={i} className={`w-6 h-8 flex items-center justify-center border-b-4 border-indigo-200 mx-0.5 font-black text-2xl ${isRevealed ? 'text-indigo-600' : 'text-transparent'}`}>{isRevealed ? char.toUpperCase() : '_'}</span>;
                    })}
                  </div>
                )}
              </div>
              <button onClick={confirmSolved} className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black shadow-lg ring-4 ring-emerald-50 active:scale-95 transition-all">SOLVED!</button>
            </header>
            <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
              <div className="bg-white border-r-2 border-slate-100 p-4 flex flex-row sm:flex-col items-center justify-center gap-6 z-10 shadow-inner">
                 <div className="flex flex-row sm:flex-col gap-3">
                    {COLORS.map(c => <button key={c.value} onClick={() => setBrushColor(c.value)} className={`w-10 h-10 rounded-full border-4 shadow-sm transition-all ${brushColor === c.value ? 'border-indigo-400 scale-125' : 'border-transparent'}`} style={{ backgroundColor: c.value }} />)}
                 </div>
                 <div className="w-px h-8 sm:w-8 sm:h-px bg-slate-100" />
                 <div className="flex flex-row sm:flex-col gap-3">
                    {BRUSH_SIZES.map(s => <button key={s.value} onClick={() => setBrushWidth(s.value)} className={`flex items-center justify-center rounded-xl transition-all ${brushWidth === s.value ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400'}`} style={{ width: 42, height: 42 }}><div className="rounded-full bg-current" style={{ width: s.value * 0.8, height: s.value * 0.8 }} /></button>)}
                 </div>
                 <div className="flex-1" />
                 <button onClick={() => canvasRef.current?.clear()} className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shadow-sm"><i className="fa-solid fa-eraser text-xl"></i></button>
              </div>
              <main className="flex-1 relative p-4"><DrawingCanvas ref={canvasRef} color={brushColor} lineWidth={brushWidth} isActive={true} /></main>
            </div>
            <footer className="px-6 py-4 bg-white border-t-2 border-slate-100 flex items-center justify-between z-20">
               <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-300 uppercase italic">Secret:</span>
                  <span className="font-black text-slate-800 blur-md hover:blur-none transition-all px-3 py-1 bg-slate-50 rounded-lg">{word}</span>
               </div>
               <div className="flex gap-2">
                 <button onClick={skipTurn} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full font-black text-[10px] uppercase border border-indigo-100 hover:bg-indigo-100 transition-all">Skip Turn</button>
                 <button onClick={endEarly} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-full font-black text-[10px] uppercase border border-rose-100 hover:bg-rose-100 transition-all">Abort</button>
               </div>
            </footer>
          </div>
        );
      case PlayingSubPhase.CONFIRM_SCORE:
        return (
          <div className="flex flex-col items-center justify-center p-8 h-full space-y-8 animate-in zoom-in">
            <div className="bg-white p-12 rounded-[4rem] shadow-2xl text-center w-full max-w-md space-y-8 border-b-[16px] border-slate-100">
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-slate-800 italic">Who solved it?</h2>
                <p className="text-slate-500 font-bold">Select all players who shouted it!</p>
              </div>
              <div className="grid gap-4">
                {gameState.players.filter((_, idx) => idx !== gameState.currentPlayerIndex).map(p => (
                  <button 
                    key={p.id} onClick={() => { const next = new Set(selectedGuesserIds); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); setSelectedGuesserIds(next); }}
                    className={`p-6 rounded-[2.25rem] font-black text-xl flex justify-between items-center transition-all ${selectedGuesserIds.has(p.id) ? 'bg-indigo-600 text-white shadow-xl scale-[1.05] ring-8 ring-indigo-50' : 'bg-slate-50 text-slate-600 border-2 border-slate-100'}`}
                  >
                    <span>{p.name}</span>
                    <i className={`fa-solid ${selectedGuesserIds.has(p.id) ? 'fa-check-circle' : 'fa-circle-plus opacity-10'}`}></i>
                  </button>
                ))}
              </div>
              <div className="pt-4 flex gap-4">
                <button onClick={() => setGameState(prev => ({ ...prev, subPhase: PlayingSubPhase.DRAWING }))} className="flex-1 py-5 bg-slate-50 text-slate-400 rounded-3xl font-black uppercase text-[10px] tracking-widest">Back</button>
                <button onClick={submitScore} className="flex-[2] py-5 bg-emerald-500 text-white rounded-3xl font-black shadow-2xl uppercase text-[10px] tracking-widest ring-4 ring-emerald-50">Submit</button>
              </div>
            </div>
          </div>
        );
      case PlayingSubPhase.POST_TURN:
        const last = gameState.history[gameState.history.length - 1];
        return (
          <div className="flex flex-col items-center justify-center p-8 h-full space-y-8 animate-in zoom-in">
             <div className="bg-white p-14 rounded-[4rem] shadow-2xl text-center w-full max-w-sm space-y-10 border-b-[20px] border-indigo-50">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl mx-auto shadow-xl ring-8 ${last?.wasCorrect ? 'bg-emerald-500 text-white ring-emerald-50' : 'bg-rose-500 text-white ring-rose-50'}`}>
                  <i className={`fa-solid ${last?.wasCorrect ? 'fa-medal' : 'fa-ghost'}`}></i>
                </div>
                <div>
                  <h2 className="text-4xl font-black text-slate-800 italic leading-tight">{last?.wasCorrect ? 'Great Job!' : 'Better luck next time!'}</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-6">The word was</p>
                  <p className="text-4xl font-black text-indigo-600 italic tracking-tighter">"{gameState.currentPrompt?.word}"</p>
                </div>
                <button onClick={nextTurn} className="w-full py-6 bg-indigo-600 text-white rounded-[2.25rem] font-black text-2xl shadow-2xl active:scale-95 transition-all">CONTINUE</button>
             </div>
          </div>
        );
      case PlayingSubPhase.ROUND_LEADERBOARD:
        const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
        return (
          <div className="flex flex-col items-center justify-center p-6 h-full space-y-10 animate-in slide-in-from-right-12 w-full">
            <h1 className="text-4xl font-black text-indigo-900 italic">Leaderboard (Round {gameState.rounds})</h1>
            <div className="w-full max-w-md bg-white rounded-[4rem] shadow-2xl overflow-hidden border-b-[16px] border-indigo-100 p-10 space-y-5">
                {sorted.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.25rem]">
                    <div className="flex items-center gap-4">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${idx === 0 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>{idx + 1}</span>
                      <span className="font-black text-slate-800 text-xl">{p.name}</span>
                    </div>
                    <span className="font-black text-indigo-600 text-2xl">{p.score} <span className="text-[10px] text-indigo-300">PTS</span></span>
                  </div>
                ))}
                <div className="pt-6">
                  <button onClick={nextRound} className="w-full py-6 bg-indigo-600 text-white rounded-[2.25rem] font-black text-2xl shadow-xl active:scale-95 transition-all">
                    {gameState.rounds >= gameState.maxRounds ? 'FINISH MATCH' : 'NEXT ROUND'}
                  </button>
                </div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  const renderGameOver = () => {
    const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-indigo-50 p-4 animate-in slide-in-from-top-12 duration-700">
        <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-[0_32px_64px_-16px_rgba(79,70,229,0.3)] flex flex-col h-full max-h-[92vh] border-b-[20px] border-indigo-600 transition-all">
          {/* Card Header */}
          <div className="shrink-0 p-8 text-center bg-white rounded-t-[3.5rem]">
            <div className="text-7xl mb-2 drop-shadow-xl animate-bounce">🏆</div>
            <h1 className="text-4xl font-black text-indigo-900 italic tracking-tighter">Final Results!</h1>
            <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.3em] mt-1">The match has concluded</p>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8 scrollbar-hide min-h-0">
            <div className="space-y-4">
              {sorted.map((p, idx) => (
                <div key={p.id} className={`flex items-center justify-between p-5 rounded-[2rem] border-2 transition-all ${idx === 0 ? 'bg-indigo-50 border-yellow-400 shadow-md ring-4 ring-yellow-50' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center gap-4">
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${idx === 0 ? 'bg-yellow-400 text-white rotate-6' : 'bg-white text-slate-300'}`}>
                       {idx + 1}
                     </div>
                     <span className="font-black text-slate-800 text-lg">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-indigo-600 text-2xl leading-none">{p.score}</span>
                    <p className="text-[9px] font-black text-indigo-300 uppercase leading-none">PTS</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-indigo-50/40 p-5 rounded-[2rem] border border-indigo-100">
               <h3 className="text-center font-black text-indigo-300 text-[9px] uppercase tracking-[0.4em] mb-4">Match Highlights</h3>
               <div className="space-y-2">
                  {gameState.history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] p-3.5 bg-white rounded-xl shadow-sm border border-indigo-50/50">
                      <span className="text-slate-600 font-bold max-w-[70%]">
                        <span className="text-indigo-400 italic font-black mr-1">#{i+1}</span> {h.playerName}: <span className="text-indigo-900 font-black">"{h.word}"</span>
                      </span>
                      <span className={`font-black px-2 py-0.5 rounded-md text-[8px] uppercase tracking-tighter ${h.wasCorrect ? 'text-emerald-600 bg-emerald-50' : 'text-rose-400 bg-rose-50'}`}>
                        {h.wasCorrect ? 'SOLVED' : 'FAILED'}
                      </span>
                    </div>
                  ))}
                  {gameState.history.length === 0 && <p className="text-center text-slate-300 italic text-xs py-2">No data yet.</p>}
               </div>
            </div>
          </div>

          {/* Fixed Action Area at Bottom of Card */}
          <div className="shrink-0 p-6 bg-slate-50/80 rounded-b-[3.5rem] border-t border-slate-100">
            <div className="space-y-3">
               <button 
                 onClick={restartMatch} 
                 className="w-full min-h-[60px] bg-indigo-600 text-white rounded-[1.75rem] font-black text-xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center uppercase tracking-widest text-base"
               >
                 RESTART MATCH
               </button>
               <button 
                 onClick={exitToHome} 
                 className="w-full min-h-[52px] bg-white text-slate-400 rounded-[1.75rem] font-black text-[11px] border-2 border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all uppercase tracking-widest flex items-center justify-center"
               >
                 EXIT TO HOME
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-indigo-900/80 backdrop-blur-xl animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        <header className="p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div>
            <h2 className="text-3xl font-black text-indigo-900 italic">Settings</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Word Banks & Modes</p>
          </div>
          <button onClick={() => setIsSettingsOpen(false)} className="w-12 h-12 rounded-full bg-slate-50 text-slate-300 hover:text-indigo-600 flex items-center justify-center transition-all"><i className="fa-solid fa-xmark text-2xl"></i></button>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-10 scrollbar-hide">
          <section className="space-y-4">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Word Mode</label>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setGameState(prev => ({ ...prev, wordSource: 'ai' }))} className={`py-4 rounded-3xl font-black transition-all flex flex-col items-center gap-2 ${gameState.wordSource === 'ai' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-slate-50 text-slate-400 border-2'}`}><i className="fa-solid fa-wand-sparkles text-xl"></i><span className="text-sm">AI PROMPTS</span></button>
              <button onClick={() => setGameState(prev => ({ ...prev, wordSource: 'custom' }))} className={`py-4 rounded-3xl font-black transition-all flex flex-col items-center gap-2 ${gameState.wordSource === 'custom' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-slate-50 text-slate-400 border-2'}`}><i className="fa-solid fa-keyboard text-xl"></i><span className="text-sm">CUSTOM PACK</span></button>
            </div>
          </section>
          <section className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Saved Packs</label>
              <button onClick={handleCreateSet} className="bg-indigo-600 text-white font-black text-[10px] uppercase px-4 py-2 rounded-xl shadow-lg">NEW PACK</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {wordSets.map(s => (
                <div key={s.id} onClick={() => setSelectedSetId(s.id)} className={`p-4 rounded-[1.5rem] border-2 cursor-pointer transition-all ${selectedSetId === s.id ? 'bg-indigo-50 border-indigo-500 shadow-md ring-2 ring-indigo-50' : 'bg-white border-slate-100'}`}>
                  <div className="flex justify-between items-start">
                    <div className="pr-8 overflow-hidden"><p className={`font-black text-base truncate ${selectedSetId === s.id ? 'text-indigo-900' : 'text-slate-700'}`}>{s.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase">{s.easy.length + s.medium.length + s.hard.length} words</p></div>
                    {selectedSetId !== s.id && <button onClick={(e) => handleDeleteSet(s.id, e)} className="text-slate-200 hover:text-rose-500"><i className="fa-solid fa-trash-can text-sm"></i></button>}
                  </div>
                </div>
              ))}
            </div>
          </section>
          {activeSet.id && (
            <section className="space-y-6 bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100">
              <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Pack Name</label><input type="text" value={activeSet.name} onChange={(e) => handleUpdateActiveName(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-indigo-900 focus:border-indigo-400 outline-none transition-all" /></div>
              <div className="grid grid-cols-1 gap-4">
                {(['easy', 'medium', 'hard'] as const).map(diff => (
                   <div key={diff} className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{diff.toUpperCase()} WORDS</label><textarea value={activeSet[diff].join(', ')} onChange={(e) => handleUpdateActiveWords(diff, e.target.value)} className="w-full h-24 bg-white border-2 border-slate-200 rounded-xl p-4 text-sm font-bold focus:border-indigo-400 outline-none transition-all resize-none" placeholder="Comma separated list..." /></div>
                ))}
              </div>
            </section>
          )}
        </div>
        <footer className="p-8 border-t border-slate-100 bg-white"><button onClick={() => setIsSettingsOpen(false)} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-indigo-100">SAVE</button></footer>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-indigo-50 flex flex-col font-sans select-none overflow-hidden text-slate-900">
      {isSettingsOpen && renderSettings()}
      {gameState.phase === GamePhase.HOME && renderHome()}
      {gameState.phase === GamePhase.PLAYING && renderPlaying()}
      {gameState.phase === GamePhase.GAME_OVER && renderGameOver()}
    </div>
  );
};

export default App;
