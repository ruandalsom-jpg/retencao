'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, LogOut, Palette } from 'lucide-react'
import { AlternarTema } from './tema'

export function fotoValida(valor) {
  return typeof valor==='string' && valor.length<=3000 && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(valor)?valor:''
}
export function Avatar({foto,nome,grande=false}) {
  return <span className={'avatar-perfil'+(grande?' grande':'')}>
    {fotoValida(foto)?<img src={foto} alt=""/>:<span aria-hidden="true">{(nome||'Usuário').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()}</span>}
  </span>
}

async function prepararFoto(arquivo) {
  if(!['image/jpeg','image/png','image/webp'].includes(arquivo.type))throw Error('Escolha uma imagem JPG, PNG ou WebP.')
  if(arquivo.size>5*1024*1024)throw Error('A imagem deve ter até 5 MB.')
  const url=URL.createObjectURL(arquivo)
  try{
    const img=new Image()
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Não foi possível ler esta imagem.'));img.src=url})
    if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('Escolha uma imagem de até 40 megapixels.')
    const canvas=document.createElement('canvas')
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a foto neste navegador.')
    const lado=Math.min(img.naturalWidth,img.naturalHeight)
    // Auth metadata is included in the session token; keep the thumbnail under 3 KB.
    for(const tamanho of [128,96,64]){
      canvas.width=tamanho;canvas.height=tamanho
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,tamanho,tamanho)
      ctx.drawImage(img,(img.naturalWidth-lado)/2,(img.naturalHeight-lado)/2,lado,lado,0,0,tamanho,tamanho)
      for(const qualidade of [.72,.5,.35]){
        const foto=canvas.toDataURL('image/jpeg',qualidade)
        if(fotoValida(foto))return foto
      }
    }
    throw Error('Escolha uma imagem mais simples para a foto.')
  }finally{URL.revokeObjectURL(url)}
}

export function PerfilUsuario({db,usuario,perfil}) {
  const original=fotoValida(usuario?.user_metadata?.foto_perfil)
  const [foto,setFoto]=useState(original),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(''),[aviso,setAviso]=useState('')
  const entrada=useRef(null),ativo=useRef(true),trava=useRef(false)
  useEffect(()=>{ativo.current=true;return()=>{ativo.current=false}},[])
  useEffect(()=>{setFoto(original)},[original])
  async function escolher(evento){
    const arquivo=evento.target.files?.[0];evento.target.value=''
    if(!arquivo||trava.current)return
    trava.current=true;setOcupado(true);setErro('');setAviso('')
    try{const nova=await prepararFoto(arquivo);if(ativo.current)setFoto(nova)}catch(e){if(ativo.current)setErro(e.message)}finally{trava.current=false;if(ativo.current)setOcupado(false)}
  }
  async function salvar(){
    if(trava.current)return
    trava.current=true;setOcupado(true);setErro('');setAviso('')
    try{
      const {error}=await db.auth.updateUser({data:{foto_perfil:foto||null}})
      if(error)throw error
      if(ativo.current)setAviso(foto?'Foto salva no seu perfil.':'Foto removida do seu perfil.')
    }catch(e){if(ativo.current)setErro('Não foi possível salvar a foto. '+e.message)}finally{trava.current=false;if(ativo.current)setOcupado(false)}
  }
  async function sair(){
    if(trava.current)return
    trava.current=true;setOcupado(true);setErro('')
    try{const {error}=await db.auth.signOut({scope:'local'});if(error)throw error}catch{if(ativo.current)setErro('Não foi possível sair. Tente novamente.')}finally{trava.current=false;if(ativo.current)setOcupado(false)}
  }
  return <div className="perfil-pagina">
    {erro&&<p role="alert" className="erro">{erro}</p>}{aviso&&<p role="status" className="aviso">{aviso}</p>}
    <section className="panel"><div className="perfil-identidade"><Avatar foto={foto} nome={perfil?.nome} grande/><div><h2>{perfil?.nome||usuario?.user_metadata?.nome||'Meu perfil'}</h2><p>{usuario?.email}</p><span className="badge">{perfil?.papel==='supervisor'?'Supervisor':perfil?'Colaborador':'Aguardando aprovação'}</span></div></div>
      <h3><Camera size={19} aria-hidden="true"/> Foto do perfil</h3><p>A foto aparece no seu menu e no acesso ao perfil. JPG, PNG ou WebP, até 5 MB. O enquadramento é centralizado.</p>
      <input className="sr-only" ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" onChange={escolher} aria-label="Escolher foto de perfil" disabled={ocupado}/>
      <div className="toolbar"><button disabled={ocupado} onClick={()=>entrada.current?.click()}>Escolher foto</button><button disabled={ocupado||!foto} onClick={()=>{setFoto('');setAviso('')}}>Remover foto</button><button className="primary" disabled={ocupado||foto===original} onClick={salvar}>{ocupado?'Aguarde…':'Salvar foto'}</button>{foto!==original&&<button disabled={ocupado} onClick={()=>{setFoto(original);setErro('')}}>Cancelar alteração</button>}</div>
    </section>
    <section className="panel"><h2><Palette size={19} aria-hidden="true"/> Aparência</h2><p>Escolha o tema para este navegador. A preferência vale para todas as telas, inclusive o login.</p><AlternarTema/></section>
    <section className="panel"><h2><LogOut size={19} aria-hidden="true"/> Sessão</h2><p>Encerre o acesso à sua conta neste navegador.</p><button disabled={ocupado} onClick={sair}>Sair da conta</button></section>
  </div>
}
