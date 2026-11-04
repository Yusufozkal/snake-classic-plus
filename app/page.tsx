'use client';
import { useEffect, useRef } from 'react';

export default function Home() {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const game = () => {
      const api = (frame.current?.contentWindow as any)?.snakeSite;
      if (!api) throw new Error('Oyun henüz hazır değil.');
      return api;
    };
    const tools = [
      {name:'get_game_state',title:'Oyun durumunu oku',description:'Read current score, map, difficulty and paused state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:(input:unknown)=>{
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
        return game().getState();
      }},
      {name:'set_game_paused',title:'Oyunu duraklat veya devam ettir',description:'Pause or resume an already started game. Does not start or restart games.',inputSchema:{type:'object',properties:{paused:{type:'boolean'}},required:['paused'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input:unknown)=>{
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof (input as any).paused !== 'boolean') throw new Error('Expected only a paused boolean.');
        return game().setPaused((input as any).paused);
      }},
    ];
    for (const tool of tools) {
      try { Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  return <main className="game-shell"><iframe ref={frame} src="/game.html" title="Snake Classic+ yılan oyunu" allow="autoplay; fullscreen" /></main>;
}
