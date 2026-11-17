'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ContextoTema=createContext(null)
export function TemaProvider({children}) {
  const [tema,setTema]=useState('claro')
  useEffect(()=>{
    setTema(document.documentElement.dataset.tema || 'claro')
    const sincronizar=e=>{
      if(e.key==='retencao-tema') aplicar(e.newValue==='escuro'?'escuro':'claro')
    }
    window.addEventListener('storage',sincronizar)
    return ()=>window.removeEventListener('storage',sincronizar)
  },[])
  function aplicar(valor) {
    setTema(valor)
    document.documentElement.dataset.tema=valor
  }
  function alternar() {
    const novo=tema==='claro'?'escuro':'claro'
    aplicar(novo)
    try {localStorage.setItem('retencao-tema',novo)} catch {}
  }
  return <ContextoTema.Provider value={{tema,alternar}}>{children}</ContextoTema.Provider>
}

export function AlternarTema() {
  const {tema,alternar}=useContext(ContextoTema)
  return <button type="button" className="alternar-tema" onClick={alternar}
    aria-label={'Ativar tema '+(tema==='claro'?'escuro':'claro')} aria-pressed={tema==='escuro'}>
    <span aria-hidden="true">{tema==='claro'?'☾':'☀'}</span> {tema==='claro'?'Escuro':'Claro'}
  </button>
}
